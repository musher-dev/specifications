/**
 * Hold the document vocabulary to its term records: `task check:terms`.
 *
 * `docs/terminology.yaml` records one concept per context: its definition, its
 * relations to other concepts, the identifiers that spell it, and the words to
 * avoid in its place (docs/adr/0038). A glossary nobody checks drifts from the
 * documents it describes, so this holds the two together in three ways:
 *
 * 1. **Records.** The file matches `docs/terminology.schema.json`; ids are
 *    unique and lead with their context; every relation names a record that
 *    exists; `kind_of` and `part_of` form no cycle; and no definition starts
 *    with its own term, uses it, or begins "is when". These always fail.
 * 2. **Identifier scope.** Every schema property name, enum value, `$defs` key,
 *    diagnostic code, requirement ID prefix, reserved placeholder namespace and
 *    `x-musher-grammar` value in the current major of each family is collected,
 *    and each must be claimed by some record, so the glossary is exhaustive by
 *    construction. One that matches a banned identifier alias of a record in
 *    its context fails as well.
 * 3. **Defined terms.** Every term a `spec.md` bold-defines, in its "Terms"
 *    section or as "A **term** is", has a record whose `source` cites that
 *    section, and every `source` a record gives resolves.
 *
 * Prose scope is Vale's: `task docs` projects the prose-scope aliases into the
 * MusherSpecifications style (`tools/src/render/terminology.ts`).
 *
 * NON-NORMATIVE, like everything under tools/.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import { parse } from 'yaml'
import {
  ADR_DIR,
  CORE_FAMILY,
  discoverFamilies,
  Failures,
  type Family,
  familyPaths,
  inRepo,
  isObject,
  type Json,
  REPO_ROOT,
  readJson,
  sourceModules,
  TERMINOLOGY_FILE,
  TERMINOLOGY_SCHEMA_FILE,
} from '../lib/layout.ts'
import { REQUIREMENT_ID, readOutline } from '../lib/outline.ts'

// -----------------------------------------------------------------------------
// The record shape, as the schema states it.
// -----------------------------------------------------------------------------

export const CONTEXTS = [
  'core',
  'component',
  'blueprint',
  'listing',
  'catalog',
  'deployment',
  'repository',
] as const
export type Context = (typeof CONTEXTS)[number]

export interface Alias {
  readonly text: string
  readonly status: 'banned' | 'discouraged'
  readonly scope: readonly ('prose' | 'identifier')[]
  readonly suggest?: string
  readonly note?: string
}

export const IDENTIFIER_KINDS = [
  'fields',
  'values',
  'codes',
  'requirement_prefixes',
  'namespaces',
  'defs',
  'grammars',
] as const
export type IdentifierKind = (typeof IDENTIFIER_KINDS)[number]

/** Each identifier kind in the singular, as a finding names it. */
const KIND_NAMES: { readonly [kind in IdentifierKind]: string } = {
  fields: 'field',
  values: 'value',
  codes: 'code',
  requirement_prefixes: 'requirement prefix',
  namespaces: 'namespace',
  defs: 'def',
  grammars: 'grammar',
}

export type Identifiers = { readonly [kind in IdentifierKind]?: readonly string[] }

export interface Term {
  readonly id: string
  readonly display_name: string
  readonly context: Context
  readonly definition?: string
  readonly authority?: { readonly repo: string; readonly path: string; readonly anchor?: string }
  readonly shortDefinition?: string
  readonly tags: readonly string[]
  readonly stability: 'stable' | 'provisional'
  readonly status: 'proposed' | 'approved'
  readonly kind_of?: readonly string[]
  readonly part_of?: readonly string[]
  readonly associated?: readonly { readonly relation: string; readonly term: string }[]
  readonly identifiers?: Identifiers
  readonly verbs?: readonly string[]
  readonly example?: string
  readonly confusables?: readonly string[]
  readonly source?: readonly string[]
  readonly aliases?: readonly Alias[]
  readonly deprecated?: { readonly note: string; readonly replaced_by?: string }
}

export interface Terminology {
  readonly schema_version: 1
  readonly description: string
  readonly terms: readonly Term[]
}

/** The parsed records, unvalidated. Throws when the file is absent or is not YAML. */
export function readTerminologySource(repoRoot: string = REPO_ROOT): unknown {
  return parse(readFileSync(inRepo(repoRoot, TERMINOLOGY_FILE), 'utf8'))
}

/** Whether a repository carries term records at all. */
export function hasTerminology(repoRoot: string = REPO_ROOT): boolean {
  return existsSync(inRepo(repoRoot, TERMINOLOGY_FILE))
}

/**
 * The records, validated. Throws with every problem when they are invalid, so
 * a generator never renders a glossary the check would reject.
 */
export function loadTerminology(repoRoot: string = REPO_ROOT): Terminology {
  const source = readTerminologySource(repoRoot)
  const problems = checkRecords(source, readJson(inRepo(repoRoot, TERMINOLOGY_SCHEMA_FILE)))
  if (problems.length > 0) {
    throw new Error(`${TERMINOLOGY_FILE} is invalid: ${problems.join('; ')}`)
  }
  return source as Terminology
}

// -----------------------------------------------------------------------------
// 1. Records.
// -----------------------------------------------------------------------------

/** A phrase as a whole-word, case-insensitive pattern. */
function phrasePattern(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  return new RegExp(`(^|[^A-Za-z0-9_])${escaped}($|[^A-Za-z0-9_])`, 'i')
}

/** "is when", "when …", "where …": a definition that describes an occasion, not a thing. */
const OCCASION = /(^\s*(is\s+)?(when|where)\b)|\bis\s+when\b/i

/** Why a definition fails the genus-and-differentia form, or null. */
export function definitionProblem(term: Pick<Term, 'display_name' | 'definition'>): string | null {
  const definition = term.definition
  if (definition === undefined) return null
  const name = term.display_name.replace(/`/g, '')
  if (definition.trimStart().toLowerCase().startsWith(name.toLowerCase())) {
    return 'starts with its own term; lead with the genus instead'
  }
  if (OCCASION.test(definition)) return 'is an "is when" definition; name the kind of thing it is'
  if (phrasePattern(name).test(definition)) return 'is circular: it uses its own term'
  return null
}

/** The records' relations, as edges for the cycle check. */
function relationTargets(term: Term): { relation: string; target: string }[] {
  return [
    ...(term.kind_of ?? []).map((target) => ({ relation: 'kind_of', target })),
    ...(term.part_of ?? []).map((target) => ({ relation: 'part_of', target })),
    ...(term.associated ?? []).map((a) => ({
      relation: `associated ${a.relation}`,
      target: a.term,
    })),
    ...(term.deprecated?.replaced_by === undefined
      ? []
      : [{ relation: 'deprecated.replaced_by', target: term.deprecated.replaced_by }]),
  ]
}

/** A cycle through one hierarchical relation, as `a -> b -> a`, or null. */
function findCycle(terms: readonly Term[], relation: 'kind_of' | 'part_of'): string | null {
  const edges = new Map(terms.map((t) => [t.id, t[relation] ?? []]))
  const state = new Map<string, 'open' | 'done'>()
  const stack: string[] = []
  const visit = (id: string): string | null => {
    if (state.get(id) === 'done') return null
    if (state.get(id) === 'open') return [...stack.slice(stack.indexOf(id)), id].join(' -> ')
    state.set(id, 'open')
    stack.push(id)
    for (const next of edges.get(id) ?? []) {
      if (!edges.has(next)) continue
      const cycle = visit(next)
      if (cycle !== null) return cycle
    }
    stack.pop()
    state.set(id, 'done')
    return null
  }
  for (const term of terms) {
    const cycle = visit(term.id)
    if (cycle !== null) return cycle
  }
  return null
}

/** The claimed name of a field entry: the last segment of a path that is not `*`. */
export function claimedField(entry: string): string {
  const segments = entry.split('/').filter((s) => s !== '' && s !== '*')
  return segments[segments.length - 1] ?? entry
}

/** Every identifier a record claims, as `kind:name`. */
function claimsOf(term: Term): Set<string> {
  const claims = new Set<string>()
  for (const kind of IDENTIFIER_KINDS) {
    for (const entry of term.identifiers?.[kind] ?? []) {
      claims.add(`${kind}:${kind === 'fields' ? claimedField(entry) : entry}`)
    }
  }
  return claims
}

/**
 * Every problem with the records, in file order. Empty when they are valid.
 *
 * Takes the parsed YAML and the parsed schema rather than paths, so a test can
 * hand it a record without writing a repository.
 */
export function checkRecords(source: unknown, schema: Json): string[] {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    strictTypes: false,
  })
  const validate = ajv.compile(schema as object)
  if (!validate(source)) {
    return (validate.errors ?? []).map(
      (e) =>
        `${e.instancePath || '/'} ${e.message ?? 'is invalid'}${e.params ? ` ${JSON.stringify(e.params)}` : ''}`,
    )
  }
  const terms = (source as Terminology).terms
  const problems: string[] = []
  const ids = new Set<string>()
  const names = new Map<string, string>()
  for (const term of terms) {
    if (ids.has(term.id)) problems.push(`${term.id}: the id is used twice`)
    ids.add(term.id)
    if (!term.id.startsWith(`${term.context}.`)) {
      problems.push(`${term.id}: the id must begin with its context, "${term.context}."`)
    }
    const nameKey = `${term.context}:${term.display_name.toLowerCase()}`
    const previous = names.get(nameKey)
    if (previous !== undefined) {
      problems.push(
        `${term.id}: "${term.display_name}" is already ${previous} in context ${term.context}; one concept per term per context`,
      )
    }
    names.set(nameKey, term.id)
  }

  const displayNames = new Map(
    terms
      .filter((t) => t.deprecated === undefined)
      .map((t) => [t.display_name.toLowerCase(), t.id]),
  )
  const proseAliases = new Map<string, string>()
  for (const term of terms) {
    for (const { relation, target } of relationTargets(term)) {
      if (!ids.has(target))
        problems.push(`${term.id}: ${relation} names ${target}, which no record has`)
      if (target === term.id) problems.push(`${term.id}: ${relation} names the record itself`)
    }
    const definition = definitionProblem(term)
    if (definition !== null) problems.push(`${term.id}: the definition ${definition}`)

    const claims = claimsOf(term)
    for (const alias of term.aliases ?? []) {
      if (alias.scope.includes('prose')) {
        const owner = displayNames.get(alias.text)
        if (owner !== undefined) {
          problems.push(
            `${term.id}: the prose alias "${alias.text}" is the display name of ${owner}; a defined term cannot be a word to avoid`,
          )
        }
        const earlier = proseAliases.get(alias.text)
        if (earlier !== undefined) {
          problems.push(
            `${term.id}: the prose alias "${alias.text}" is also an alias of ${earlier}; Vale can suggest only one replacement`,
          )
        }
        proseAliases.set(alias.text, term.id)
      }
      if (alias.scope.includes('identifier')) {
        for (const claim of claims) {
          if (claim.endsWith(`:${alias.text}`)) {
            problems.push(`${term.id}: "${alias.text}" is both claimed and an identifier alias`)
          }
        }
      }
    }
  }
  for (const relation of ['kind_of', 'part_of'] as const) {
    const cycle = findCycle(terms, relation)
    if (cycle !== null) problems.push(`${relation} forms a cycle: ${cycle}`)
  }
  return problems
}

// -----------------------------------------------------------------------------
// 2. Identifier scope.
// -----------------------------------------------------------------------------

/** One identifier found in a specification, and where. */
export interface FoundIdentifier {
  readonly kind: IdentifierKind
  readonly name: string
  readonly family: string
  /** Repo-relative file, with a JSON Pointer for a schema identifier. */
  readonly where: string
}

/**
 * The family versions checked: each family's highest major. v1 retires from
 * the tree when v2 lands (docs/adr/0038), and a major still in the tree beside
 * a newer one is history, not the vocabulary.
 */
export function currentFamilies(repoRoot: string = REPO_ROOT): Family[] {
  const newest = new Map<string, Family>()
  for (const family of discoverFamilies(repoRoot)) {
    const held = newest.get(family.name)
    if (held === undefined || Number(family.major.slice(1)) > Number(held.major.slice(1))) {
      newest.set(family.name, family)
    }
  }
  return [...newest.values()]
}

const SCHEMA_MAPS = ['properties', '$defs', 'dependentSchemas', 'patternProperties'] as const
const SCHEMA_LISTS = ['allOf', 'anyOf', 'oneOf', 'prefixItems'] as const
const SCHEMA_SINGLE = [
  'items',
  'additionalProperties',
  'not',
  'if',
  'then',
  'else',
  'contains',
  'propertyNames',
  'unevaluatedProperties',
  'unevaluatedItems',
] as const

function pointerToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1')
}

/**
 * Every identifier one schema module spells. Walks only schema positions, so a
 * property *named* `required` is a property, not a keyword.
 */
export function schemaIdentifiers(schema: Json, family: string, file: string): FoundIdentifier[] {
  const found: FoundIdentifier[] = []
  const add = (kind: IdentifierKind, name: string, pointer: string): void => {
    found.push({ kind, name, family, where: `${file}#${pointer}` })
  }
  const walk = (node: Json | undefined, pointer: string): void => {
    if (!isObject(node)) return
    if (isObject(node.properties)) {
      for (const name of Object.keys(node.properties)) {
        add('fields', name, `${pointer}/properties/${pointerToken(name)}`)
      }
    }
    if (isObject(node.$defs)) {
      for (const name of Object.keys(node.$defs))
        add('defs', name, `${pointer}/$defs/${pointerToken(name)}`)
    }
    if (Array.isArray(node.enum)) {
      for (const value of node.enum)
        if (typeof value === 'string') add('values', value, `${pointer}/enum`)
    }
    if (typeof node.const === 'string') add('values', node.const, `${pointer}/const`)
    const grammar = node['x-musher-grammar']
    if (typeof grammar === 'string') add('grammars', grammar, `${pointer}/x-musher-grammar`)

    for (const key of SCHEMA_MAPS) {
      const map = node[key]
      if (isObject(map)) {
        for (const [name, child] of Object.entries(map))
          walk(child, `${pointer}/${key}/${pointerToken(name)}`)
      }
    }
    for (const key of SCHEMA_LISTS) {
      const list = node[key]
      if (!Array.isArray(list)) continue
      for (const [i, child] of list.entries()) walk(child, `${pointer}/${key}/${i}`)
    }
    for (const key of SCHEMA_SINGLE) walk(node[key], `${pointer}/${key}`)
  }
  walk(schema, '')
  return found
}

/** A row of a `| Code | Phase | Meaning |` table, as `check:conformance` reads one. */
const DIAGNOSTIC_ROW = /^\|\s*`(ERR_[A-Z0-9_]+)`\s*\|\s*((?:`[a-z]+`(?:\s*,\s*)?)+)\s*\|/

/** The header of core's reserved-namespace table. */
const NAMESPACE_HEADER = /^\|\s*Namespace\s*\|/
const NAMESPACE_ROW = /^\|\s*`([a-z][a-zA-Z0-9]*)`\s*\|/

/** Every identifier one `spec.md` declares: diagnostic codes, requirement prefixes and, for core, namespaces. */
export function proseIdentifiers(
  markdown: string,
  family: string,
  file: string,
): FoundIdentifier[] {
  const found: FoundIdentifier[] = []
  const lines = markdown.split('\n')
  let inNamespaces = false
  for (const [index, line] of lines.entries()) {
    const where = `${file}:${index + 1}`
    const row = DIAGNOSTIC_ROW.exec(line)
    if (row?.[1] !== undefined) found.push({ kind: 'codes', name: row[1], family, where })
    if (family === CORE_FAMILY) {
      if (NAMESPACE_HEADER.test(line)) inNamespaces = true
      else if (!line.startsWith('|')) inNamespaces = false
      else if (inNamespaces) {
        const namespace = NAMESPACE_ROW.exec(line)
        if (namespace?.[1] !== undefined)
          found.push({ kind: 'namespaces', name: namespace[1], family, where })
      }
    }
  }
  const seen = new Set<string>()
  for (const id of readOutline(markdown).requirements.keys()) {
    const prefix = id.replace(/-\d{3}$/, '')
    if (seen.has(prefix)) continue
    seen.add(prefix)
    found.push({ kind: 'requirement_prefixes', name: prefix, family, where: `${file}#${id}` })
  }
  return found
}

/** Every identifier in the current major of every family: schema sources and `spec.md`. */
export function collectIdentifiers(repoRoot: string = REPO_ROOT): FoundIdentifier[] {
  const found: FoundIdentifier[] = []
  for (const family of currentFamilies(repoRoot)) {
    const paths = familyPaths(family.name, family.major)
    for (const module of sourceModules(family)) {
      const file = `${paths.src}/${module.slice(family.srcDir.length + 1)}`
      found.push(...schemaIdentifiers(readJson(module), family.name, file))
    }
    if (existsSync(family.specPath)) {
      found.push(
        ...proseIdentifiers(readFileSync(family.specPath, 'utf8'), family.name, paths.spec),
      )
    }
  }
  return found
}

/**
 * The families a record's identifier aliases bind. Core's rules, the catalog
 * and the repository reach every family; the rest bind the family they name.
 * Deployment concepts live in blueprint.
 */
export function familiesOf(context: Context): ReadonlySet<string> | 'all' {
  switch (context) {
    case 'core':
    case 'catalog':
    case 'repository':
      return 'all'
    case 'deployment':
      return new Set(['blueprint'])
    default:
      return new Set([context])
  }
}

export interface IdentifierFindings {
  /** An identifier spelled as a banned alias. */
  readonly banned: string[]
  /** An identifier spelled as a discouraged alias: printed, never failed. */
  readonly discouraged: string[]
  /** An identifier no record claims. */
  readonly unclaimed: string[]
}

/**
 * Hold every found identifier to the records.
 *
 * An identifier alias binds the identifier kinds its own record claims, or
 * every kind when the record claims none, and only in the families its context
 * reaches. That is what lets blueprint keep `accessExemptions` while component
 * renames it, and lets the namespace `output` retire while the field `output`
 * stays.
 */
export function checkIdentifiers(
  terms: readonly Term[],
  identifiers: readonly FoundIdentifier[],
): IdentifierFindings {
  const claimed = new Set<string>()
  for (const term of terms) for (const claim of claimsOf(term)) claimed.add(claim)

  const findings: IdentifierFindings = { banned: [], discouraged: [], unclaimed: [] }
  const reported = new Set<string>()
  for (const found of identifiers) {
    const key = `${found.kind}:${found.name}`
    let banned = false
    for (const term of terms) {
      const families = familiesOf(term.context)
      if (families !== 'all' && !families.has(found.family)) continue
      const kinds = IDENTIFIER_KINDS.filter((kind) => (term.identifiers?.[kind]?.length ?? 0) > 0)
      if (kinds.length > 0 && !kinds.includes(found.kind)) continue
      for (const alias of term.aliases ?? []) {
        if (!alias.scope.includes('identifier') || alias.text !== found.name) continue
        const message =
          `${found.where}: ${found.name} is a ${alias.status} alias of ${term.id}; ` +
          `use ${alias.suggest ?? term.display_name}${alias.note ? ` (${alias.note})` : ''}`
        findings[alias.status].push(message)
        if (alias.status === 'banned') banned = true
      }
    }
    // A banned spelling is reported once, as banned: it is unclaimed because it is retired.
    if (!banned && !claimed.has(key) && !reported.has(`${found.family}:${key}`)) {
      reported.add(`${found.family}:${key}`)
      findings.unclaimed.push(
        `${found.where}: no record claims the ${KIND_NAMES[found.kind]} ${found.name}`,
      )
    }
  }
  return findings
}

// -----------------------------------------------------------------------------
// 3. Defined terms and sources.
// -----------------------------------------------------------------------------

/** A term one `spec.md` bold-defines, and the section it is defined in. */
export interface DefinedTerm {
  readonly term: string
  readonly family: string
  readonly major: string
  /** The section number, `6.4`, or '' before the first numbered heading. */
  readonly section: string
  readonly where: string
}

const ANY_HEADING = /^(#{2,4})\s+(.*)$/
const HEADING_ANCHOR = /<a id="[^"]*"><\/a>/g
/** `**term**`, not a requirement ID and not a sentence. */
const BOLD = /\*\*([^*\n]+?)\*\*/g
/** The defining form outside a Terms section: "A **term** is …". */
const DEFINING = /(?:^|[\s(])(?:A|An|The|a|an|the)\s+\*\*([^*\n]+?)\*\*\s+(?:is|are|means)\b/g

/** A bold span as a term: no backticks, no trailing punctuation, single-spaced. */
function asTerm(bold: string): string | null {
  const term = bold
    .replace(/`/g, '')
    .replace(/[.:,;]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (term === '' || REQUIREMENT_ID.test(term)) return null
  // A bold sentence or lead-in ("**Why the phase is admission.**") is not a term.
  if (term.split(' ').length > 5) return null
  return term
}

/**
 * Every term one `spec.md` defines: each bold span in a section titled "Terms",
 * and each "A **term** is" anywhere else.
 */
export function definedTermsIn(
  markdown: string,
  family: string,
  major: string,
  file: string,
): DefinedTerm[] {
  const defined: DefinedTerm[] = []
  let section = ''
  let inTerms = false
  for (const [index, line] of markdown.split('\n').entries()) {
    const heading = ANY_HEADING.exec(line)
    if (heading !== null) {
      const text = (heading[2] ?? '').replace(HEADING_ANCHOR, '').trim()
      const numbered = /^([0-9]+(?:\.[0-9]+)*)\.?\s+(.*)$/.exec(text)
      if (numbered !== null) section = numbered[1] ?? ''
      inTerms = /^terms\b/i.test((numbered?.[2] ?? text).trim())
      continue
    }
    const where = `${file}:${index + 1}`
    const matches = inTerms ? line.matchAll(BOLD) : line.matchAll(DEFINING)
    for (const match of matches) {
      const term = asTerm(match[1] ?? '')
      if (term !== null) defined.push({ term, family, major, section, where })
    }
  }
  return defined
}

/** Every defined term in the current major of every family. */
export function collectDefinedTerms(repoRoot: string = REPO_ROOT): DefinedTerm[] {
  const defined: DefinedTerm[] = []
  for (const family of currentFamilies(repoRoot)) {
    if (!existsSync(family.specPath)) continue
    defined.push(
      ...definedTermsIn(
        readFileSync(family.specPath, 'utf8'),
        family.name,
        family.major,
        familyPaths(family.name, family.major).spec,
      ),
    )
  }
  return defined
}

/**
 * A term as records are matched against it: lower case, singular where it can
 * be, and "<kind> document" as the kind's own record ("listing document" is a
 * listing).
 */
export function termKeys(text: string): string[] {
  const key = text.replace(/`/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
  const keys = new Set([key])
  for (const form of [...keys]) {
    if (form.endsWith(' documents')) keys.add(form.slice(0, -' documents'.length))
    if (form.endsWith(' document')) keys.add(form.slice(0, -' document'.length))
  }
  for (const form of [...keys]) {
    if (form.endsWith('ies')) keys.add(`${form.slice(0, -3)}y`)
    if (form.endsWith('s')) keys.add(form.slice(0, -1))
  }
  return [...keys]
}

/** One message per defined term that has no record, or whose record does not cite the section. */
export function checkDefinedTerms(
  terms: readonly Term[],
  defined: readonly DefinedTerm[],
): string[] {
  const byName = new Map<string, Term[]>()
  for (const term of terms) {
    const key = termKeys(term.display_name)[0] as string
    byName.set(key, [...(byName.get(key) ?? []), term])
  }
  const problems: string[] = []
  for (const d of defined) {
    const records = termKeys(d.term).flatMap((key) => byName.get(key) ?? [])
    if (records.length === 0) {
      problems.push(`${d.where}: "${d.term}" is defined here and has no term record`)
      continue
    }
    if (d.section === '') continue
    const citation = `${d.family} ${d.major} §${d.section}`
    if (!records.some((r) => (r.source ?? []).includes(citation))) {
      problems.push(
        `${d.where}: "${d.term}" is defined in ${citation}, and ${records.map((r) => r.id).join(', ')} does not cite it`,
      )
    }
  }
  return problems
}

const SPEC_SOURCE = /^(core|component|blueprint|listing) (v[0-9]+) §([0-9]+(?:\.[0-9]+)*)$/
const ADR_SOURCE = /^ADR ([0-9]{4})(?: §[0-9]+)?$/

/** One message per `source` entry that does not resolve. */
export function checkSources(terms: readonly Term[], repoRoot: string = REPO_ROOT): string[] {
  const outlines = new Map<string, ReadonlyMap<string, string> | null>()
  const sectionsOf = (name: string, major: string): ReadonlyMap<string, string> | null => {
    const key = `${name}/${major}`
    if (!outlines.has(key)) {
      const path = inRepo(repoRoot, familyPaths(name, major).spec)
      outlines.set(key, existsSync(path) ? readOutline(readFileSync(path, 'utf8')).byNumber : null)
    }
    return outlines.get(key) ?? null
  }
  let adrs: string[] | null = null
  const problems: string[] = []
  for (const term of terms) {
    for (const source of term.source ?? []) {
      const spec = SPEC_SOURCE.exec(source)
      if (spec !== null) {
        const [, name = '', major = '', number = ''] = spec
        const sections = sectionsOf(name, major)
        if (sections === null)
          problems.push(`${term.id}: source "${source}": ${name}/${major} has no spec.md`)
        else if (!sections.has(number))
          problems.push(`${term.id}: source "${source}": no §${number} in ${name}/${major}`)
        continue
      }
      const adr = ADR_SOURCE.exec(source)
      if (adr !== null) {
        if (adrs === null) {
          const dir = inRepo(repoRoot, ADR_DIR)
          adrs = existsSync(dir) ? readdirSync(dir) : []
        }
        if (!adrs.some((file) => file.startsWith(`${adr[1]}-`))) {
          problems.push(`${term.id}: source "${source}": no ADR ${adr[1]} in ${ADR_DIR}`)
        }
        continue
      }
      const path = source.split('#')[0] ?? source
      if (!existsSync(inRepo(repoRoot, path)))
        problems.push(`${term.id}: source "${source}" does not exist`)
    }
  }
  return problems
}

// -----------------------------------------------------------------------------
// The command line.
// -----------------------------------------------------------------------------

export interface TermsReport {
  /** Check 1: always fails. */
  readonly records: string[]
  /** Checks 2 and 3. */
  readonly findings: string[]
  /** Printed, never failed. */
  readonly warnings: string[]
}

export function runTerms(repoRoot: string = REPO_ROOT): TermsReport {
  if (!hasTerminology(repoRoot)) {
    return { records: [`${TERMINOLOGY_FILE} does not exist`], findings: [], warnings: [] }
  }
  let source: unknown
  try {
    source = readTerminologySource(repoRoot)
  } catch (error) {
    return {
      records: [`${TERMINOLOGY_FILE}: ${error instanceof Error ? error.message : String(error)}`],
      findings: [],
      warnings: [],
    }
  }
  const records = checkRecords(source, readJson(inRepo(repoRoot, TERMINOLOGY_SCHEMA_FILE)))
  if (records.length > 0) return { records, findings: [], warnings: [] }

  const terms = (source as Terminology).terms
  const identifiers = checkIdentifiers(terms, collectIdentifiers(repoRoot))
  return {
    records: [],
    findings: [
      ...identifiers.banned,
      ...identifiers.unclaimed,
      ...checkDefinedTerms(terms, collectDefinedTerms(repoRoot)),
      ...checkSources(terms, repoRoot),
    ],
    warnings: identifiers.discouraged,
  }
}

function main(): void {
  const report = runTerms()
  for (const warning of report.warnings) console.warn(`  ! ${warning}`)
  const failures = new Failures()
  for (const problem of report.records) failures.add(problem)
  for (const finding of report.findings) failures.add(finding)
  failures.report(
    `${TERMINOLOGY_FILE} is valid, and every identifier and defined term has a record.`,
  )
}

if (import.meta.main) main()
