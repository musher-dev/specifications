/**
 * Generate each family version's registry projections: `task docs`.
 *
 * A consumer that needs a requirement ID, a diagnostic code, a phase or a term
 * record should not have to parse Markdown for it (docs/adr/0043). So each
 * family version's `registry/` holds the facts its `spec.md` states, as JSON:
 *
 * - `requirements.json`: the family's own requirement IDs, each with the
 *   fragment that locates it and the section that states it.
 * - `diagnostics.json`: every code a document of the family may report, which
 *   is the conformance runner's reach: core's codes, those of each normative
 *   dependency its §2 lists, and its own, each with the phases and the
 *   severities its table declares and the family that declares it.
 * - core only, `vocabulary.json`: the ordered phases, the scopes with their
 *   phases, the result statuses, the severities, the resolution stages and the
 *   reserved namespaces.
 * - core only, `terms.json`: every term record, projected from
 *   `docs/terminology.yaml`.
 *
 * spec.md stays normative. Each file is a projection committed beside it, so a
 * release carries the bytes a consumer verifies, and `task check:docs`
 * regenerates every one in memory and fails when a committed copy differs.
 * Each file is valid against its schema in core's `interfaces/registry/`,
 * which `registry.test.ts` holds every generated file to.
 *
 * Output is deterministic: document order for requirements and rows, and
 * nothing reads the clock.
 *
 * NON-NORMATIVE, like everything under tools/.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { readBindings } from '../lib/bindings.ts'
import {
  CORE_FAMILY,
  DIAGNOSTICS_REGISTRY_FILE,
  discoverFamilies,
  type Family,
  familyPaths,
  inRepo,
  type Json,
  REPO_ROOT,
  REQUIREMENTS_REGISTRY_FILE,
  relativeToRepo,
  TERMINOLOGY_CORE_MAJOR,
  TERMS_REGISTRY_FILE,
  VOCABULARY_REGISTRY_FILE,
} from '../lib/layout.ts'
import { readOutline } from '../lib/outline.ts'
import { readTerminologySource } from '../policy/terms.ts'

/** The phases a registry may assign a code, in core v2 §6's order. */
const PHASE_ORDER = ['parser', 'structural', 'semantic', 'admission', 'resolution'] as const

/**
 * The severities a diagnostic carries, the failing one first. Core v2 §7 names
 * them, as docs/adr/0044 decides; neither has a table to project, so they are
 * spelled here once.
 */
export const SEVERITIES = ['ERROR', 'WARNING'] as const
type Severity = (typeof SEVERITIES)[number]

/** A row of a `| Code | Phase | Meaning |` table. The conformance runner reads the same shape. */
const DIAGNOSTIC_ROW = /^\|\s*`(ERR_[A-Z0-9_]+)`\s*\|\s*((?:`[a-z]+`(?:\s*,\s*)?)+)\s*\|/
/** A row of a `| Code | Requirement | Meaning |` table under a heading naming warnings. */
const WARNING_ROW = /^\|\s*`(WARN_[A-Z0-9_]+)`\s*\|([^|]*)\|/
const REQUIREMENT_IN_CELL = /\b([A-Z]{2,6}-[A-Z0-9]{2,12}-\d{3})\b/
const HEADING = /^#{1,6}\s+(.*)$/

/** One code as one spec.md's tables declare it. */
interface DeclaredCode {
  readonly code: string
  readonly phases: readonly string[]
  readonly severities: readonly Severity[]
  readonly requirement?: string
}

function inPhaseOrder(phases: Iterable<string>): string[] {
  const set = new Set(phases)
  return PHASE_ORDER.filter((phase) => set.has(phase))
}

/** Every code one spec.md declares, in document order. */
export function declaredCodes(markdown: string): DeclaredCode[] {
  const byCode = new Map<
    string,
    { phases: Set<string>; severities: Set<Severity>; requirement?: string }
  >()
  const entry = (code: string) => {
    let held = byCode.get(code)
    if (held === undefined) {
      held = { phases: new Set(), severities: new Set() }
      byCode.set(code, held)
    }
    return held
  }
  let inWarnings = false
  for (const line of markdown.split('\n')) {
    const heading = HEADING.exec(line)
    if (heading !== null) {
      inWarnings = /\bWarnings\b/.test(heading[1] ?? '')
      continue
    }
    const row = DIAGNOSTIC_ROW.exec(line)
    if (row?.[1] !== undefined && row[2] !== undefined) {
      const held = entry(row[1])
      held.severities.add('ERROR')
      for (const match of row[2].matchAll(/`([a-z]+)`/g)) {
        if ((PHASE_ORDER as readonly string[]).includes(match[1] ?? ''))
          held.phases.add(match[1] as string)
      }
      continue
    }
    if (!inWarnings) continue
    const warning = WARNING_ROW.exec(line)
    if (warning?.[1] === undefined) continue
    const held = entry(warning[1])
    held.severities.add('WARNING')
    const requirement = REQUIREMENT_IN_CELL.exec(warning[2] ?? '')?.[1]
    if (requirement !== undefined) held.requirement = requirement
  }
  return [...byCode].map(([code, held]) => ({
    code,
    phases: inPhaseOrder(held.phases),
    severities: SEVERITIES.filter((severity) => held.severities.has(severity)),
    ...(held.requirement === undefined ? {} : { requirement: held.requirement }),
  }))
}

/** Serialization for a registry file: key order as built, two-space indent, a final newline. */
export function registryJson(value: Json): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function readSpec(family: Family): string {
  if (!existsSync(family.specPath)) {
    throw new Error(`${relativeToRepo(family.specPath)} does not exist`)
  }
  return readFileSync(family.specPath, 'utf8')
}

/** `requirements.json`: the family version's own requirement IDs, in document order. */
export function buildRequirements(family: Family): Json {
  const outline = readOutline(readSpec(family))
  return {
    family: family.name,
    major: family.major,
    requirements: [...outline.requirements].map(([id, section]) => ({
      id,
      anchor: id,
      section,
    })),
  }
}

/**
 * The family versions whose codes a family's documents may report, in the
 * order their codes are listed: core, the other dependencies in §2's order,
 * then the family itself. Core reaches only itself.
 */
function reachOf(family: Family, families: readonly Family[]): Family[] {
  if (family.name === CORE_FAMILY) return [family]
  const bindings = readBindings(family)
  if (bindings === null) {
    throw new Error(
      `${relativeToRepo(family.specPath)} declares no normative dependencies, so its ` +
        'diagnostic registry cannot be resolved',
    )
  }
  const dependencies = bindings.dependencies.map((dependency) => {
    const found = families.find((f) => f.name === dependency.family && f.major === dependency.line)
    if (found === undefined) {
      throw new Error(
        `${relativeToRepo(family.specPath)} depends on ${dependency.family} ${dependency.line}, ` +
          'which is not a family version in this tree',
      )
    }
    return found
  })
  return [
    ...dependencies.filter((d) => d.name === CORE_FAMILY),
    ...dependencies.filter((d) => d.name !== CORE_FAMILY),
    family,
  ]
}

/** `diagnostics.json`: every code the family's documents may report. */
export function buildDiagnostics(family: Family, families: readonly Family[]): Json {
  const seen = new Set<string>()
  const diagnostics: Json[] = []
  for (const declarer of reachOf(family, families)) {
    for (const declared of declaredCodes(readSpec(declarer))) {
      // The first declarer wins, as in the conformance runner. A family that
      // declares a core code again is a check:conformance failure already.
      if (seen.has(declared.code)) continue
      seen.add(declared.code)
      diagnostics.push({
        code: declared.code,
        phases: [...declared.phases],
        severities: [...declared.severities],
        declaredBy: declarer.name,
        ...(declared.requirement === undefined ? {} : { requirement: declared.requirement }),
      })
    }
  }
  return { family: family.name, major: family.major, diagnostics }
}

/**
 * The rows of the first table whose header row's first cell is `header`, as
 * cells with their outer pipes removed.
 */
function tableRows(markdown: string, header: string): string[][] {
  const lines = markdown.split('\n')
  const start = lines.findIndex((line) => new RegExp(`^\\|\\s*${header}\\s*\\|`).test(line.trim()))
  if (start === -1) throw new Error(`core spec.md has no table headed "${header}"`)
  const rows: string[][] = []
  for (const line of lines.slice(start + 2)) {
    if (!line.trim().startsWith('|')) break
    rows.push(
      line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cell.trim()),
    )
  }
  return rows
}

function ticked(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1] as string)
}

function firstTicked(cell: string | undefined, table: string): string {
  const value = ticked(cell ?? '')[0]
  if (value === undefined) throw new Error(`core spec.md: a ${table} row names no value`)
  return value
}

/** `vocabulary.json`: core's ordered lists, from core's spec.md. */
export function buildVocabulary(core: Family): Json {
  const markdown = readSpec(core)
  const phases = tableRows(markdown, 'Phase').map((row) => firstTicked(row[0], 'phase'))
  let above: string[] = []
  const scopes = tableRows(markdown, 'Scope').map((row) => {
    const cell = row[2] ?? ''
    // "the above, and `admission`": the previous scope's phases, and these.
    const named = ticked(cell)
    const scopePhases = inPhaseOrder(/\bthe above\b/.test(cell) ? [...above, ...named] : named)
    above = scopePhases
    return { name: firstTicked(row[0], 'scope'), phases: scopePhases }
  })
  const status = /\ba status \(([^)]*)\)/.exec(markdown.replace(/\s+/g, ' '))
  if (status?.[1] === undefined) {
    throw new Error(
      'core spec.md §6.1 no longer says "a status (`VALID`, ...)". Teach ' +
        'tools/src/render/registry.ts where the statuses are listed.',
    )
  }
  const stages = tableRows(markdown, 'Stage').map((row) => firstTicked(row[0], 'stage'))
  const namespaces = tableRows(markdown, 'Namespace').map((row) => ({
    name: firstTicked(row[0], 'namespace'),
    assigned: !/^Unassigned\b/.test(row[2] ?? ''),
  }))
  return {
    family: CORE_FAMILY,
    major: core.major,
    phases,
    scopes,
    statuses: ticked(status[1]),
    severities: [...SEVERITIES],
    stages,
    namespaces,
  }
}

/** `terms.json`: the term records as `docs/terminology.yaml` holds them. */
export function buildTerms(repoRoot: string): Json {
  return readTerminologySource(repoRoot) as Json
}

/** Every registry file, repo-relative, with a builder for the bytes it should hold. */
export function registryOutputs(repoRoot: string = REPO_ROOT): [string, () => string][] {
  const families = discoverFamilies(repoRoot)
  const outputs: [string, () => string][] = []
  for (const family of families) {
    const dir = familyPaths(family.name, family.major).registry
    outputs.push([
      `${dir}/${REQUIREMENTS_REGISTRY_FILE}`,
      () => registryJson(buildRequirements(family)),
    ])
    outputs.push([
      `${dir}/${DIAGNOSTICS_REGISTRY_FILE}`,
      () => registryJson(buildDiagnostics(family, families)),
    ])
    if (family.name !== CORE_FAMILY) continue
    outputs.push([
      `${dir}/${VOCABULARY_REGISTRY_FILE}`,
      () => registryJson(buildVocabulary(family)),
    ])
    if (family.major === TERMINOLOGY_CORE_MAJOR) {
      outputs.push([`${dir}/${TERMS_REGISTRY_FILE}`, () => registryJson(buildTerms(repoRoot))])
    }
  }
  return outputs
}

function main(): void {
  for (const [path, build] of registryOutputs()) {
    const absolute = inRepo(REPO_ROOT, path)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, build())
    console.log(`Wrote ${path}`)
  }
}

if (import.meta.main) main()
