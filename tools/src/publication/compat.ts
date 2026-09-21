/** Historical acceptance, effective values and observable behavior under pinned context. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { runBehaviorCases } from '../conformance/behavior.ts'
import {
  type CaseIndexEntry,
  type CaseMetadata,
  loadContext,
  runCase,
} from '../conformance/conformance.ts'
import { listTreeFiles, readBlobAtRef } from '../lib/git.ts'
import {
  discoverFamilies,
  Failures,
  type Family,
  failCli,
  hasPart,
  isObject,
  type Json,
  LayoutError,
  REPO_ROOT,
  releaseDirPaths,
  requireTreeAtRef,
} from '../lib/layout.ts'
import { parseDocumentBytes } from '../validation/document.ts'
import { compileFamily } from '../validation/validator.ts'
import { type RecordedRelease, readLedger, taggedEntries } from './ledger.ts'

/**
 * Documents a release asserted were valid: its examples, and every conformance
 * case it declared `expected: "pass"`.
 *
 * Both are required at the tag. Reading an empty set there would replay nothing
 * and report the release as not having regressed, which is the one answer this
 * gate must never give by accident.
 */
function partFiles(
  repoRoot: string,
  { release, entry }: RecordedRelease,
  part: 'examples' | 'conformance',
): string[] {
  const path = releaseDirPaths(entry.path)[part]
  return hasPart(release.family, release.major, part)
    ? requireTreeAtRef(repoRoot, release.tag, path, `${release.family}/${release.major} ${part}`)
    : listTreeFiles(repoRoot, release.tag, path)
}

/**
 * Released cases a later release deliberately stopped rejecting, and why.
 *
 * This gate replays a release's rejections as well as its acceptances, because
 * a rejection pins observable meaning too. That is the right default and it is
 * stricter than the guarantee it enforces: core v1 §3 forbids validation
 * becoming *stricter* within a major, and says nothing against a relaxation. So
 * a release that deliberately stops rejecting a document has to say so here,
 * keyed `<tag>:<case id>`, in a diff a reviewer sees. It takes the same shape,
 * and for the same reason, as `UNPINNED` and `UNCOVERED` in the conformance
 * runner.
 *
 * An entry moves one historical verdict from `fail` to `pass` and nothing else.
 * The released document is still replayed, byte for byte, through today's
 * pipeline; only the verdict it is measured against moves. An entry whose
 * historical case did not reject is refused, because a `pass` to `fail` waiver
 * would hide the one thing this gate exists to catch. An entry whose case still
 * rejects is refused as well, by `runCase` reporting a pass that failed, so a
 * relaxation cannot outlive the release that needed it.
 */
const RELAXED: ReadonlyMap<string, string> = new Map([
  [
    'component/v1.0.0:structural-093-metadata-without-a-description',
    'component v1.1.0 makes metadata.description structurally optional and requires it of a ' +
      'published component instead (COMP-DESC-003), so a document this case rejected is now ' +
      'one an author may still be writing',
  ],
  [
    'blueprint/v1.0.0:structural-050-missing-metadata-description',
    'blueprint v1.1.0 makes metadata.description structurally optional and requires it of a ' +
      'published blueprint instead (BP-ID-005), for the reason above',
  ],
  [
    'blueprint/v1.0.0:structural-013-empty-component-graph',
    'blueprint v1.2.0 lets spec.components be empty and requires a node of a published ' +
      'blueprint instead (BP-GRAPH-001), so a blueprint can be stored before its first node ' +
      'is chosen',
  ],
  [
    'blueprint/v1.1.0:structural-013-empty-component-graph',
    'blueprint v1.2.0 lets spec.components be empty (BP-GRAPH-001), for the reason above',
  ],
])

/**
 * Apply a declared relaxation to the reconstructed case, in the scratch corpus.
 *
 * Rewriting the historical `metadata.json` is the whole of it: the document,
 * its tree and every other fixture file stay as the tag wrote them.
 */
function relax(scratch: string, tag: string, caseDir: string, metadata: CaseMetadata): void {
  if (!RELAXED.has(tag + ':' + metadata.id)) return
  if (metadata.expected !== 'fail')
    throw new LayoutError(
      tag +
        ' relaxes ' +
        metadata.id +
        ', which it did not reject. A relaxation only ' +
        'moves a verdict from fail to pass',
    )
  const dir = join(scratch, caseDir)
  writeFileSync(
    join(dir, 'metadata.json'),
    JSON.stringify({ ...metadata, expected: 'pass' }, null, 2) + '\n',
  )
  const diagnostics = join(dir, 'diagnostics.json')
  if (existsSync(diagnostics)) rmSync(diagnostics)
}

/** Missing or malformed historical evidence cannot silently become zero checks. */
function requiredBlob(repoRoot: string, tag: string, path: string): Buffer {
  const bytes = readBlobAtRef(repoRoot, tag, path)
  if (bytes === null) throw new LayoutError(tag + ' is missing historical evidence ' + path)
  return bytes
}

/**
 * Reconstruct the release's own corpus, including item trees and binary parser
 * subjects. Evaluate it with candidate semantics and schemas. Never execute
 * historical tooling, and never substitute today's fixture contents.
 */
export function replayRelease(
  repoRoot: string,
  family: Family,
  recorded: RecordedRelease,
  failures: Failures,
): number {
  const { release, entry } = recorded
  const scratch = mkdtempSync(join(tmpdir(), 'musher-compat-'))
  let count = 0
  try {
    const corpusPath = releaseDirPaths(entry.path).conformance
    for (const path of partFiles(repoRoot, recorded, 'conformance')) {
      const rel = relative(corpusPath, path)
      if (rel === '..' || rel.startsWith('../') || isAbsolute(rel))
        throw new LayoutError('historical fixture escapes corpus')
      const target = join(scratch, rel)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, requiredBlob(repoRoot, release.tag, path))
    }
    const index = JSON.parse(
      requiredBlob(repoRoot, release.tag, corpusPath + '/cases.json').toString('utf8'),
    ) as Json
    if (!isObject(index) || !Array.isArray(index.cases))
      throw new LayoutError(release.tag + ' has an invalid conformance index')
    const context = loadContext(repoRoot, failures)
    const candidate = { ...family, conformanceDir: scratch }
    for (const raw of index.cases) {
      if (
        !isObject(raw) ||
        typeof raw.path !== 'string' ||
        typeof raw.id !== 'string' ||
        typeof raw.phase !== 'string'
      )
        throw new LayoutError(release.tag + ' has an invalid case entry')
      if (raw.path.split('/').some((p) => p === '..') || isAbsolute(raw.path))
        throw new LayoutError('historical case escapes corpus')
      const metadata = JSON.parse(
        readFileSync(join(scratch, raw.path, 'metadata.json'), 'utf8'),
      ) as CaseMetadata
      relax(scratch, release.tag, raw.path, metadata)
      // Rejections also pin observable meaning; replay all implemented cases.
      const outcome = runCase(
        context,
        candidate,
        raw as unknown as CaseIndexEntry,
        failures,
        new Set(),
        new Set(),
        () => {},
      )
      if (outcome === 'skipped')
        failures.add(release.tag + ' historical obligation cannot be checked: ' + metadata.id)
      else count++
    }
    const behavior = runBehaviorCases(candidate, () => {})
    count += behavior.ran
    for (const failure of behavior.failures)
      failures.add(release.tag + ' behavioural regression: ' + failure)
    if (family.role !== 'core') {
      const validate = compileFamily(family)
      for (const path of partFiles(repoRoot, recorded, 'examples')) {
        if (!/\.ya?ml$/.test(path)) continue
        const parsed = parseDocumentBytes(requiredBlob(repoRoot, release.tag, path))
        count++
        if ('errors' in parsed)
          failures.add(release.tag + ' accepted ' + path + ', but the candidate parser rejects it')
        else if (!validate(parsed.value))
          failures.add(release.tag + ' accepted ' + path + ', but the candidate schema rejects it')
      }
    }
    return count
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

/**
 * Replay every release against the working tree's schemas.
 *
 * Core's historical parser corpus is replayed as well. Context-dependent
 * observations come from the release's case trees and supplied context.
 */
export function replayAll(
  repoRoot: string,
  failures: Failures,
): { replayed: number; checked: number } {
  const families = new Map(discoverFamilies(repoRoot).map((f) => [`${f.name}/${f.major}`, f]))

  let replayed = 0
  let checked = 0

  for (const recorded of taggedEntries(repoRoot, readLedger(repoRoot))) {
    const { release } = recorded
    const family = families.get(`${release.family}/${release.major}`)
    if (family === undefined) {
      // A retired family still has published versions, but no current schema to
      // replay them against. Say so rather than counting it as clean.
      console.log(`  · ${release.tag}: no ${release.family}/${release.major} in the working tree`)
      continue
    }
    const count = replayRelease(repoRoot, family, recorded, failures)
    console.log(`  ✓ ${release.tag}: ${count} document(s) replayed`)
    replayed += count
    checked += 1
  }

  return { replayed, checked }
}

function main(): void {
  const failures = new Failures()
  let result: { replayed: number; checked: number }
  try {
    result = replayAll(REPO_ROOT, failures)
  } catch (error) {
    // A release whose tag lacks a path the layout names: one line, not a trace.
    if (error instanceof LayoutError) failCli(error)
    throw error
  }
  const { replayed, checked } = result

  failures.report(
    checked === 0
      ? 'No releases to replay yet — the compatibility guarantee starts at the first tag.'
      : `Replayed ${replayed} document(s) from ${checked} release(s); none regressed.`,
  )
}

if (import.meta.main) main()
