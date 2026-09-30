/**
 * The release record a kind family's archive carries as `release.json`, in the
 * shape musher-dev/engineering-conventions defines (EC-0031,
 * `release-record.schema.json`; docs/adr/0037).
 *
 * It lists every interface `.repo/outputs.toml` says the family's bundle output
 * delivers, each with the archive member that holds it and that member's
 * SHA-256, so a repository that vendors the archive can prove its copy offline
 * (DEPS-05). The declarations are read at the tag being staged, like every
 * other byte of a release.
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
    }
  })
  return { repository, interfaces }
}

export interface ReleaseRecordInput {
  readonly declarations: Declarations
  readonly family: string
  readonly version: string
  readonly tag: string
  readonly commit: string
  /** The archive member each interface is delivered as, relative to the archive's root. */
  readonly file: { readonly path: string; readonly sha256: string }
}

/**
 * The record for one kind family release. Throws when the declarations name no
 * interface the family's bundle delivers: an archive without one would ship a
 * record the conventions' schema rejects (`interfaces` has `minItems: 1`).
 */
export function releaseRecord(input: ReleaseRecordInput): Json {
  const output = releaseOutputId(input.family)
  const delivered = input.declarations.interfaces.filter((i) => i.deliveredBy === output)
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
    interfaces: delivered.map((i) => ({
      id: i.id,
      format: i.format,
      compatibility: i.compatibility,
      files: [{ path: input.file.path, sha256: input.file.sha256 }],
    })),
  }
}
