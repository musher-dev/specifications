/** Exact normative dependencies, derived from the specification's own tables. */
import { existsSync, readFileSync } from 'node:fs'
import { parseBindings } from '../lib/bindings.ts'
import { isAncestor, logRange, readBlobAtRef, tagExists, treeId } from '../lib/git.ts'
import { type Failures, familyPaths, inRepo, releaseDirPaths } from '../lib/layout.ts'
import { classifyCommit, releasableTypes } from './core-gate.ts'
import { type Ledger, type LedgerEntry, ledgerAtRef, readLedger, sameEntry } from './ledger.ts'
import { readManifest, releaseTag, UNRELEASED_VERSION } from './releases.ts'

export type Dependencies = NonNullable<LedgerEntry['requires']>
export interface PinnedDependency {
  readonly tag: string
  readonly entry: LedgerEntry
}

function declarations(repoRoot: string, path: string, failures: Failures, ref?: string) {
  const specPath = releaseDirPaths(path).spec
  const text =
    ref === undefined
      ? existsSync(inRepo(repoRoot, specPath))
        ? readFileSync(inRepo(repoRoot, specPath), 'utf8')
        : null
      : readBlobAtRef(repoRoot, ref, specPath)?.toString('utf8')
  if (text == null) {
    failures.add(`${specPath}: specification is missing`)
    return []
  }
  try {
    const bindings = parseBindings(text)
    if (bindings === null) {
      failures.add(`${specPath}: cites no core line or normative dependencies`)
      return []
    }
    return bindings.dependencies
  } catch (error) {
    failures.add(`${specPath}: ${(error as Error).message}`)
    return []
  }
}

/** Choose direct dependencies once, using the declared major lines. */
export function selectDependencies(
  repoRoot: string,
  path: string,
  failures: Failures,
): Dependencies {
  const manifest = readManifest(repoRoot)
  const selected: Record<string, string> = {}
  for (const dependency of declarations(repoRoot, path, failures)) {
    const version = manifest[familyPaths(dependency.family, dependency.line).manifestKey]
    if (version === undefined || version === UNRELEASED_VERSION) {
      failures.add(`${path}: ${dependency.family} ${dependency.line} has never been released`)
      continue
    }
    selected[dependency.family] = version
  }
  if (selected.core === undefined) failures.add(`${path}: cites no released core line`)
  return selected as Dependencies
}

/** Verify the pinned graph without rebuilding or reclassifying historical artifacts. */
export function dependencyClosure(
  repoRoot: string,
  tag: string,
  requires: Dependencies,
  failures: Failures,
  ledger: Ledger = readLedger(repoRoot),
  targetRef = 'HEAD',
): Map<string, PinnedDependency> {
  const found = new Map<string, PinnedDependency>()
  const active = new Set<string>([tag])
  function visit(family: string, version: string, consumerRef: string): void {
    const dependencyTag = releaseTag(family, version)
    if (active.has(dependencyTag)) {
      failures.add(`${tag}: dependency cycle at ${dependencyTag}`)
      return
    }
    const previous = found.get(family)
    if (previous !== undefined && previous.tag !== dependencyTag) {
      failures.add(`${tag}: conflicting ${family} editions ${previous.tag} and ${dependencyTag}`)
      return
    }
    if (!tagExists(repoRoot, dependencyTag)) {
      failures.add(`${tag}: ${dependencyTag} does not exist; release dependencies first`)
      return
    }
    if (!isAncestor(repoRoot, dependencyTag, consumerRef)) {
      failures.add(`${tag}: ${dependencyTag} is not an ancestor of it (${consumerRef})`)
    }
    if (previous !== undefined) return
    const entry = ledger.releases[dependencyTag]
    if (entry === undefined) {
      failures.add(`${tag}: ${dependencyTag} has no ledger entry`)
      return
    }
    const historical = ledgerAtRef(repoRoot, dependencyTag)
    const own = historical.version === 2 ? historical.releases[dependencyTag] : undefined
    if (
      own === undefined ||
      !sameEntry(own, entry) ||
      treeId(repoRoot, dependencyTag, entry.path) !== entry.tree
    ) {
      failures.add(`${tag}: ${dependencyTag} does not match its immutable ledger and tree`)
      return
    }
    found.set(family, { tag: dependencyTag, entry })
    active.add(dependencyTag)
    for (const [nextFamily, nextVersion] of Object.entries(entry.requires ?? {})) {
      visit(nextFamily, nextVersion, dependencyTag)
    }
    active.delete(dependencyTag)
  }
  for (const [family, version] of Object.entries(requires)) visit(family, version, targetRef)
  return new Map([...found].sort(([a], [b]) => a.localeCompare(b)))
}

/** Pending releases and tag-owned staging check declared lines and changed dependency rules. */
export function assertDependencyContent(
  repoRoot: string,
  tag: string,
  path: string,
  requires: Dependencies,
  failures: Failures,
  warnings: string[],
  ref = 'HEAD',
): void {
  const declared = declarations(repoRoot, path, failures, ref === 'HEAD' ? undefined : ref)
  const names = new Set(declared.map((dependency) => dependency.family))
  for (const dependency of declared) {
    const version = requires[dependency.family]
    if (version === undefined || `v${version.split('.')[0]}` !== dependency.line) {
      failures.add(
        `${tag}: requires.${dependency.family} must select the declared ${dependency.line} line`,
      )
    }
  }
  for (const family of Object.keys(requires)) {
    if (!names.has(family)) failures.add(`${tag}: undeclared dependency ${family}`)
  }
  const closure = dependencyClosure(repoRoot, tag, requires, failures, readLedger(repoRoot), ref)
  const types = releasableTypes(repoRoot)
  for (const [family, dependency] of closure) {
    // Existing core gate retains its more specific diagnostics and warning contract.
    if (family === 'core') continue
    const changes = logRange(repoRoot, dependency.tag, ref, dependency.entry.path)
    const releasable = changes.filter(
      (change) => classifyCommit(change.subject, change.body, types) === 'releasable',
    )
    if (releasable.length > 0)
      failures.add(
        `${tag}: ${family} carries releasable commit(s) since ${dependency.tag}; release it first`,
      )
    else if (changes.length > 0)
      warnings.push(`${tag}: ${family} carries non-releasable commit(s) since ${dependency.tag}`)
  }
}
