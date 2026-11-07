/**
 * Hold the data interfaces to their last release: `task check:compat:registry`,
 * which `contracts:breaking` runs (docs/adr/0043 §7).
 *
 * `check:compat` replays released documents, which guards what a document
 * family accepts. A registry or an interface schema has no documents to
 * replay: what a consumer relies on is its members, the keys of a registry and
 * the members of a list (EC-0031 names that comparison for a `gated` data
 * interface). So for each family version in the working tree this compares its
 * `registry/`, `interfaces/` and `protocols/` files with the same files at the
 * family version's newest tagged release, and fails on a member that is gone
 * or changed:
 *
 * - **Requirements.** Every released ID survives, with the same anchor.
 * - **Diagnostics.** Every released code survives, and its phases and
 *   severities never shrink.
 * - **Vocabulary.** Each list keeps every released entry, in its released
 *   position: a list grows only at its end. A scope's phases never shrink, and
 *   an assigned namespace stays assigned.
 * - **Terms.** Every released record survives, and claims every identifier it
 *   claimed.
 * - **Protocols.** Every released protocol and category survives, each
 *   released capability survives, each released member is unchanged, a new
 *   member is never required, and a category's conventions never change.
 * - **Interface schemas.** Every released subschema with properties keeps them,
 *   `required` never grows, an enum keeps every released value, and no
 *   `type`, `pattern`, bound, `const` or `additionalProperties` narrows. The
 *   validation result's enums are frozen outright: a consumer switches on its
 *   status and severity, so a new value is a break.
 *
 * A release older than a part's floor (`PART_SINCE` in the layout) carries
 * none of it, so there is nothing to compare: the 2.0.0 tags pass here. A
 * family version with no tagged release has made no promise yet.
 *
 * Every released byte is read from git at the tag, offline. `check:published`
 * proves those trees are what the ledger recorded, and the archive copies
 * them verbatim, so they are the bytes the release delivered.
 *
 * NON-NORMATIVE, like everything under tools/.
 */
import { existsSync, readFileSync } from 'node:fs'
import { listTreeFiles, readBlobAtRef } from '../lib/git.ts'
import {
  DIAGNOSTICS_REGISTRY_FILE,
  discoverFamilies,
  Failures,
  type Family,
  type FamilyPart,
  failCli,
  familyPaths,
  hasPart,
  inRepo,
  isObject,
  type Json,
  LayoutError,
  REPO_ROOT,
  REQUIREMENTS_REGISTRY_FILE,
  releaseDirPaths,
  requireTreeAtRef,
  TERMS_REGISTRY_FILE,
  VALIDATION_RESULT_SCHEMA_FILE,
  VOCABULARY_REGISTRY_FILE,
  walkObjects,
} from '../lib/layout.ts'
import { type RecordedRelease, readLedger, taggedEntries } from './ledger.ts'
import { compareVersions } from './releases.ts'

type Obj = { [k: string]: Json }

function asObject(value: Json | undefined): Obj {
  return isObject(value) ? value : {}
}

function asList(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : []
}

function strings(value: Json | undefined): string[] {
  return asList(value).filter((v): v is string => typeof v === 'string')
}

/** Entries of `list` keyed by the string at `key`. */
function byKey(list: Json | undefined, key: string): Map<string, Obj> {
  const out = new Map<string, Obj>()
  for (const item of asList(list)) {
    const id = asObject(item)[key]
    if (typeof id === 'string') out.set(id, asObject(item))
  }
  return out
}

function missing(released: readonly string[], current: readonly string[]): string[] {
  const held = new Set(current)
  return released.filter((value) => !held.has(value))
}

/** `requirements.json`: every released ID survives, with the same anchor. */
export function compareRequirements(released: Json, current: Json): string[] {
  const now = byKey(asObject(current).requirements, 'id')
  const problems: string[] = []
  for (const [id, was] of byKey(asObject(released).requirements, 'id')) {
    const is = now.get(id)
    if (is === undefined) problems.push(`requirement ${id} was removed`)
    else if (is.anchor !== was.anchor) {
      problems.push(`requirement ${id} moved from #${String(was.anchor)} to #${String(is.anchor)}`)
    }
  }
  return problems
}

/** `diagnostics.json`: every released code survives; its phases and severities never shrink. */
export function compareDiagnostics(released: Json, current: Json): string[] {
  const now = byKey(asObject(current).diagnostics, 'code')
  const problems: string[] = []
  for (const [code, was] of byKey(asObject(released).diagnostics, 'code')) {
    const is = now.get(code)
    if (is === undefined) {
      problems.push(`diagnostic ${code} was removed`)
      continue
    }
    for (const member of ['phases', 'severities'] as const) {
      const lost = missing(strings(was[member]), strings(is[member]))
      if (lost.length > 0) problems.push(`diagnostic ${code} lost ${member} ${lost.join(', ')}`)
    }
  }
  return problems
}

/** A list that grows only at its end: the released list is a prefix of the current one. */
function comparePrefix(
  what: string,
  released: readonly string[],
  current: readonly string[],
): string[] {
  for (const [i, value] of released.entries()) {
    if (current[i] !== value) {
      return [
        `${what}: released order ${released.join(', ')} is not a prefix of ${current.join(', ')}. ` +
          'A list grows only at its end.',
      ]
    }
  }
  return []
}

/** `vocabulary.json`: each list grows only at its end; scopes and namespaces never narrow. */
export function compareVocabulary(released: Json, current: Json): string[] {
  const was = asObject(released)
  const is = asObject(current)
  const problems: string[] = []
  for (const list of ['phases', 'statuses', 'severities', 'stages'] as const) {
    problems.push(...comparePrefix(list, strings(was[list]), strings(is[list])))
  }
  const names = (value: Json | undefined) =>
    asList(value).map((item) => String(asObject(item).name))
  problems.push(...comparePrefix('scopes', names(was.scopes), names(is.scopes)))
  problems.push(...comparePrefix('namespaces', names(was.namespaces), names(is.namespaces)))
  const scopes = byKey(is.scopes, 'name')
  for (const [name, scope] of byKey(was.scopes, 'name')) {
    const lost = missing(strings(scope.phases), strings(scopes.get(name)?.phases))
    if (lost.length > 0) problems.push(`scope ${name} lost phases ${lost.join(', ')}`)
  }
  const namespaces = byKey(is.namespaces, 'name')
  for (const [name, namespace] of byKey(was.namespaces, 'name')) {
    if (namespace.assigned === true && namespaces.get(name)?.assigned !== true) {
      problems.push(`namespace ${name} was assigned and is no longer`)
    }
  }
  return problems
}

/** `terms.json`: every released record survives and claims every identifier it claimed. */
export function compareTerms(released: Json, current: Json): string[] {
  const now = byKey(asObject(current).terms, 'id')
  const problems: string[] = []
  for (const [id, was] of byKey(asObject(released).terms, 'id')) {
    const is = now.get(id)
    if (is === undefined) {
      problems.push(`term ${id} was removed. Deprecate it instead.`)
      continue
    }
    const claims = asObject(is.identifiers)
    for (const [kind, values] of Object.entries(asObject(was.identifiers))) {
      const lost = missing(strings(values), strings(claims[kind]))
      if (lost.length > 0) problems.push(`term ${id} no longer claims ${kind} ${lost.join(', ')}`)
    }
  }
  return problems
}

/**
 * `categories.json`: every released category survives, and its conventions,
 * the names its protocols give their credential and locator, are unchanged.
 */
function compareCategories(released: Json, current: Json): string[] {
  const now = byKey(asObject(current).categories, 'id')
  const problems: string[] = []
  const lost: string[] = []
  for (const [id, was] of byKey(asObject(released).categories, 'id')) {
    const is = now.get(id)
    if (is === undefined) {
      lost.push(id)
      continue
    }
    if (was.conventions === undefined) continue
    if (is.conventions === undefined) problems.push(`category ${id} lost its conventions`)
    else if (JSON.stringify(is.conventions) !== JSON.stringify(was.conventions)) {
      problems.push(`category ${id} changed its conventions`)
    }
  }
  return lost.length > 0 ? [`categories ${lost.join(', ')} were removed`, ...problems] : problems
}

/**
 * One protocol record: every released capability and member survives, each
 * member unchanged, and a new member is never required. The category list,
 * which has no `members`, is compared by `compareCategories`.
 */
export function compareProtocol(released: Json, current: Json): string[] {
  const was = asObject(released)
  const is = asObject(current)
  if (was.members === undefined) return compareCategories(released, current)
  const problems: string[] = []
  const id = String(was.id)
  if (is.id !== was.id) problems.push(`protocol ${id} is now ${String(is.id)}`)
  if (is.category !== was.category) problems.push(`protocol ${id} changed category`)
  const lostCapabilities = missing(strings(was.capabilities), strings(is.capabilities))
  if (lostCapabilities.length > 0) {
    problems.push(`protocol ${id} lost capabilities ${lostCapabilities.join(', ')}`)
  }
  const before = byKey(was.members, 'name')
  const after = byKey(is.members, 'name')
  for (const [name, member] of before) {
    const now = after.get(name)
    if (now === undefined) problems.push(`protocol ${id} member ${name} was removed`)
    else if (JSON.stringify(now) !== JSON.stringify(member)) {
      problems.push(`protocol ${id} member ${name} changed`)
    }
  }
  for (const [name, member] of after) {
    if (!before.has(name) && member.presence === 'required') {
      problems.push(`protocol ${id} adds member ${name} as required. A new member is optional.`)
    }
  }
  return problems
}

/** The node at a JSON Pointer, or undefined. */
function atPointer(root: Json, pointer: string): Json | undefined {
  let node: Json | undefined = root
  for (const raw of pointer.split('/').slice(1)) {
    const token = raw.replace(/~1/g, '/').replace(/~0/g, '~')
    if (Array.isArray(node)) node = node[Number(token)]
    else if (isObject(node)) node = node[token]
    else return undefined
  }
  return node
}

/** The keywords whose larger value narrows what a schema accepts. */
const LOWER_BOUNDS = ['minLength', 'minimum', 'minItems', 'minProperties'] as const
/** The keywords whose smaller value narrows what a schema accepts. */
const UPPER_BOUNDS = ['maxLength', 'maximum', 'maxItems'] as const

function typesOf(value: Json | undefined): string[] | undefined {
  if (typeof value === 'string') return [value]
  return Array.isArray(value) ? strings(value) : undefined
}

/**
 * The narrowing changes to one subschema's own constraints: a `type` that
 * drops a type or appears, a `pattern` that changes or appears, a bound that
 * tightens or appears, a `const` that changes or appears, an `enum` that
 * appears, and `additionalProperties` that becomes `false`.
 */
function narrowedConstraints(where: string, node: Obj, now: Obj): string[] {
  const problems: string[] = []
  const before = typesOf(node.type)
  const after = typesOf(now.type)
  if (after !== undefined) {
    if (before === undefined) problems.push(`${where} gained type ${after.join(', ')}`)
    else {
      const lost = missing(before, after)
      if (lost.length > 0) problems.push(`${where} type lost ${lost.join(', ')}`)
    }
  }
  if (now.pattern !== undefined && now.pattern !== node.pattern) {
    problems.push(
      node.pattern === undefined ? `${where} gained a pattern` : `${where} pattern changed`,
    )
  }
  for (const key of LOWER_BOUNDS) {
    const is = now[key]
    if (typeof is !== 'number') continue
    const was = node[key]
    if (typeof was !== 'number') problems.push(`${where} gained ${key} ${is}`)
    else if (is > was) problems.push(`${where} ${key} rose from ${was} to ${is}`)
  }
  for (const key of UPPER_BOUNDS) {
    const is = now[key]
    if (typeof is !== 'number') continue
    const was = node[key]
    if (typeof was !== 'number') problems.push(`${where} gained ${key} ${is}`)
    else if (is < was) problems.push(`${where} ${key} fell from ${was} to ${is}`)
  }
  if (now.const !== undefined && node.const === undefined) problems.push(`${where} gained a const`)
  if (Array.isArray(now.enum) && node.enum === undefined) problems.push(`${where} gained an enum`)
  if (now.additionalProperties === false && node.additionalProperties !== false) {
    problems.push(`${where} closed additionalProperties`)
  }
  return problems
}

/**
 * An interface schema: released properties survive, `required` never grows,
 * enums keep every value and, with `frozenEnums`, gain none, and no keyword
 * narrows what a subschema accepts (`narrowedConstraints`). Adding a property
 * or an enum value is the change that stays allowed.
 */
export function compareInterfaceSchema(
  released: Json,
  current: Json,
  frozenEnums = false,
): string[] {
  const problems: string[] = []
  for (const { node, pointer } of walkObjects(released)) {
    const where = pointer === '' ? '<root>' : pointer
    const now = atPointer(current, pointer)
    if (isObject(node.properties) || Array.isArray(node.enum) || node.const !== undefined) {
      if (!isObject(now)) {
        problems.push(`${where} was removed`)
        continue
      }
    }
    if (!isObject(now)) continue
    if (isObject(node.properties)) {
      const lost = missing(Object.keys(node.properties), Object.keys(asObject(now.properties)))
      if (lost.length > 0) problems.push(`${where} lost properties ${lost.join(', ')}`)
      const added = missing(strings(now.required), strings(node.required))
      if (added.length > 0) problems.push(`${where} now requires ${added.join(', ')}`)
    }
    if (Array.isArray(node.enum)) {
      const before = node.enum.map((v) => JSON.stringify(v))
      const after = asList(now.enum).map((v) => JSON.stringify(v))
      const lost = missing(before, after)
      if (lost.length > 0) problems.push(`${where} enum lost ${lost.join(', ')}`)
      const gained = missing(after, before)
      if (frozenEnums && gained.length > 0) {
        problems.push(
          `${where} enum gained ${gained.join(', ')}, and this schema's enums are frozen`,
        )
      }
    }
    if (node.const !== undefined && JSON.stringify(now.const) !== JSON.stringify(node.const)) {
      problems.push(`${where} const changed`)
    }
    problems.push(...narrowedConstraints(where, node, now))
  }
  return problems
}

/** Compare one released file with the working tree's copy, by what the file is. */
export function compareFile(
  part: FamilyPart,
  relPath: string,
  released: Json,
  current: Json,
): string[] {
  const name = relPath.split('/').pop() ?? relPath
  if (part === 'registry') {
    if (name === REQUIREMENTS_REGISTRY_FILE) return compareRequirements(released, current)
    if (name === DIAGNOSTICS_REGISTRY_FILE) return compareDiagnostics(released, current)
    if (name === VOCABULARY_REGISTRY_FILE) return compareVocabulary(released, current)
    if (name === TERMS_REGISTRY_FILE) return compareTerms(released, current)
    return []
  }
  if (part === 'protocols') return compareProtocol(released, current)
  if (name.endsWith('.schema.json')) {
    return compareInterfaceSchema(released, current, name === VALIDATION_RESULT_SCHEMA_FILE)
  }
  return []
}

const COMPARED_PARTS = ['registry', 'interfaces', 'protocols'] as const

/** The newest tagged release of each family major, keyed `<family>/<major>`. */
function newestReleases(repoRoot: string): Map<string, RecordedRelease> {
  const newest = new Map<string, RecordedRelease>()
  for (const recorded of taggedEntries(repoRoot, readLedger(repoRoot))) {
    const key = `${recorded.release.family}/${recorded.release.major}`
    const held = newest.get(key)
    if (held === undefined || compareVersions(recorded.release.version, held.release.version) > 0) {
      newest.set(key, recorded)
    }
  }
  return newest
}

function parse(bytes: Buffer | string, where: string): Json {
  try {
    return JSON.parse(bytes.toString()) as Json
  } catch (error) {
    throw new LayoutError(`${where} is not JSON: ${(error as Error).message}`)
  }
}

/** Compare one family version's data parts with its newest release. Returns the files compared. */
export function compareFamily(
  repoRoot: string,
  family: Family,
  recorded: RecordedRelease,
  failures: Failures,
): number {
  const { release, entry } = recorded
  const released = releaseDirPaths(entry.path)
  const working = releaseDirPaths(familyPaths(family.name, family.major).dir)
  let compared = 0
  for (const part of COMPARED_PARTS) {
    if (!hasPart(release.family, release.major, part)) continue
    const files = hasPart(release.family, release.major, part, release.version)
      ? requireTreeAtRef(repoRoot, release.tag, released[part], `${release.tag} ${part}`)
      : listTreeFiles(repoRoot, release.tag, released[part])
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      const rel = file.slice(released[part].length + 1)
      const bytes = readBlobAtRef(repoRoot, release.tag, file)
      if (bytes === null)
        throw new LayoutError(`${release.tag}: listed ${file} but could not read it`)
      const now = inRepo(repoRoot, `${working[part]}/${rel}`)
      const label = `${working[part]}/${rel}`
      if (!existsSync(now)) {
        failures.add(`${label}: ${release.tag} delivered it, and the working tree removed it`)
        continue
      }
      compared += 1
      for (const problem of compareFile(
        part,
        rel,
        parse(bytes, `${release.tag}:${file}`),
        parse(readFileSync(now), label),
      )) {
        failures.add(`${label}: ${problem}, since ${release.tag}`)
      }
    }
  }
  return compared
}

/** Compare every family version in the working tree with its newest release. */
export function compareRegistries(
  repoRoot: string,
  failures: Failures,
): { compared: number; releases: number } {
  const newest = newestReleases(repoRoot)
  let compared = 0
  let releases = 0
  for (const family of discoverFamilies(repoRoot)) {
    const recorded = newest.get(`${family.name}/${family.major}`)
    if (recorded === undefined) {
      console.log(`  · ${family.name}/${family.major}: no release yet, so nothing is promised`)
      continue
    }
    const count = compareFamily(repoRoot, family, recorded, failures)
    if (count === 0) {
      console.log(
        `  · ${recorded.release.tag}: carries no registry or interface, nothing to compare`,
      )
      continue
    }
    console.log(`  ✓ ${recorded.release.tag}: ${count} file(s) compared`)
    compared += count
    releases += 1
  }
  return { compared, releases }
}

function main(): void {
  const failures = new Failures()
  let result: { compared: number; releases: number }
  try {
    result = compareRegistries(REPO_ROOT, failures)
  } catch (error) {
    if (error instanceof LayoutError) failCli(error)
    throw error
  }
  failures.report(
    result.releases === 0
      ? 'No release carries a registry or interface yet: the data interfaces start at 2.1.0.'
      : `Compared ${result.compared} file(s) from ${result.releases} release(s); nothing a consumer relies on changed.`,
  )
}

if (import.meta.main) main()
