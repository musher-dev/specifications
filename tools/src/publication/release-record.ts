/**
 * The release record a family's archive carries as `release.json`, in the
 * shape musher-dev/engineering-conventions defines (EC-0031,
 * `release-record.schema.json`; docs/adr/0037, docs/adr/0043).
 *
 * It lists every interface `.repo/outputs.toml` says the family's bundle output
 * delivers, each with every archive member that holds it and that member's
 * SHA-256, so a repository that vendors the archive can prove its copy offline
 * (DEPS-05). A kind family's schema is one member, the bundle; a registry is
 * one member per file. Core's archive carries a record from the release that
 * first delivers an interface. The declarations are read at the tag being
 * staged, like every other byte of a release.
 *
 * This repository's own record, with the dependency closure, sits beside it as
 * `specification.json` (docs/adr/0023 §6).
 *
 * NON-NORMATIVE, like everything under tools/.
 */
import { readBlobAtRef } from '../lib/git.ts'
import { type Json, OUTPUTS_DECLARATION_FILE, REPOSITORY_DECLARATION_FILE } from '../lib/layout.ts'

/** One `[[interfaces]]` entry, as far as the release record needs it. */
export interface DeclaredInterface {
  readonly id: string
  readonly format: string
  readonly compatibility: string
  readonly deliveredBy: string
  /** Repo-relative files, directories ending in `/`, or globs, as EC-0030 defines them. */
  readonly definitions: readonly string[]
}

export interface Declarations {
  /** The repository's name, from `.repo/repository.toml`. */
  readonly repository: string
  readonly interfaces: readonly DeclaredInterface[]
}

/** The bundle output that delivers a family's release archive, as `.repo/outputs.toml` names it. */
export function releaseOutputId(family: string): string {
  return `${family}-release`
}

function readToml(repoRoot: string, ref: string, path: string): Record<string, unknown> {
  const bytes = readBlobAtRef(repoRoot, ref, path)
  if (bytes === null) throw new Error(`${ref}: ${path} is missing`)
  try {
    return Bun.TOML.parse(bytes.toString('utf8')) as Record<string, unknown>
  } catch (error) {
    throw new Error(`${ref}: ${path} is not valid TOML: ${(error as Error).message}`)
  }
}

function text(value: unknown, where: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${where} is not a string`)
  return value
}

function definitionList(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${where} is not a list`)
  return value.map((entry, i) => text(entry, `${where} ${i + 1}`))
}

/** The repository name and every declared interface, read at `ref`. */
export function readDeclarations(repoRoot: string, ref: string): Declarations {
  const repository = text(
    readToml(repoRoot, ref, REPOSITORY_DECLARATION_FILE).name,
    `${ref}: ${REPOSITORY_DECLARATION_FILE} name`,
  )
  const outputs = readToml(repoRoot, ref, OUTPUTS_DECLARATION_FILE)
  const entries = outputs.interfaces ?? []
  if (!Array.isArray(entries)) {
    throw new Error(`${ref}: ${OUTPUTS_DECLARATION_FILE} interfaces is not an array of tables`)
  }
  const interfaces = entries.map((entry: Record<string, unknown>, index) => {
    const where = `${ref}: ${OUTPUTS_DECLARATION_FILE} interface ${index + 1}`
    return {
      id: text(entry.id, `${where} id`),
      format: text(entry.format, `${where} format`),
      compatibility: text(entry.compatibility, `${where} compatibility`),
      deliveredBy: text(entry.delivered_by, `${where} delivered_by`),
      definitions: definitionList(entry.definitions, `${where} definitions`),
    }
  })
  return { repository, interfaces }
}

/** The interfaces a family's bundle output delivers, in declaration order. */
export function deliveredInterfaces(
  declarations: Declarations,
  family: string,
): DeclaredInterface[] {
  const output = releaseOutputId(family)
  return declarations.interfaces.filter((i) => i.deliveredBy === output)
}

/**
 * Whether a repo-relative file is one a definitions entry names: the file
 * itself, a file under a directory entry ending in `/`, or a match of a glob in
 * which `*` stays within one path segment, `**` crosses them, and `**` before
 * a `/` matches zero or more whole directories, none included, so a file
 * directly under the glob's base matches as well as one nested below it
 * (EC-0030).
 */
export function matchesDefinition(definition: string, file: string): boolean {
  if (definition.endsWith('/')) return file.startsWith(definition)
  if (!definition.includes('*')) return file === definition
  const segment = (part: string) =>
    part
      .split('*')
      .map((piece) => piece.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]*')
  const pattern = definition
    .split('**/')
    .map((part) => part.split('**').map(segment).join('.*'))
    .join('(?:.*/)?')
  return new RegExp(`^${pattern}$`).test(file)
}

/** One archive member of an interface. */
export interface RecordFile {
  readonly path: string
  readonly sha256: string
}

export interface ReleaseRecordInput {
  readonly declarations: Declarations
  readonly family: string
  readonly version: string
  readonly tag: string
  readonly commit: string
  /**
   * The archive members that deliver one interface, relative to the archive's
   * root. An interface that resolves to none is refused: the record would
   * promise a file the archive does not hold.
   */
  readonly filesOf: (declared: DeclaredInterface) => readonly RecordFile[]
}

/**
 * The record for one family release. Throws when the declarations name no
 * interface the family's bundle delivers, or when one resolves to no file:
 * either would ship a record the conventions' schema rejects (`interfaces` and
 * each `files` have `minItems: 1`).
 */
export function releaseRecord(input: ReleaseRecordInput): Json {
  const output = releaseOutputId(input.family)
  const delivered = deliveredInterfaces(input.declarations, input.family)
  if (delivered.length === 0) {
    throw new Error(
      `${input.tag}: ${OUTPUTS_DECLARATION_FILE} declares no interface delivered by "${output}"`,
    )
  }
  return {
    schema_version: 1,
    repository: input.declarations.repository,
    output,
    version: input.version,
    tag: input.tag,
    commit: input.commit,
    interfaces: delivered.map((i) => {
      const files = [...input.filesOf(i)].sort((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
      )
      if (files.length === 0) {
        throw new Error(
          `${input.tag}: interface "${i.id}" matches no file the archive carries ` +
            `(definitions: ${i.definitions.join(', ')})`,
        )
      }
      return {
        id: i.id,
        format: i.format,
        compatibility: i.compatibility,
        files: files.map((f) => ({ path: f.path, sha256: f.sha256 })),
      }
    }),
  }
}
