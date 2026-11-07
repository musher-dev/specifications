/**
 * Component's connection protocol registry (docs/adr/0045): one record per
 * protocol in `specifications/component/<major>/protocols/<protocol>.json`,
 * plus `categories.json`, each held to core's `registry/protocol` schema.
 *
 * Read by the validator, which takes every member fact from here, and by
 * `render/protocols.ts`, which generates the schema enums, the spec.md tables
 * and blueprint's connection-evidence schema from it.
 *
 * NON-NORMATIVE, like everything under tools/. The records are normative.
 */
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { strictAjv } from '../schema/lint.ts'
import {
  CORE_FAMILY,
  discoverKinds,
  type Family,
  familyPaths,
  inRepo,
  type Json,
  PROTOCOL_CATEGORIES_FILE,
  PROTOCOL_SCHEMA_FILE,
  protocolFiles,
  REPO_ROOT,
  readJson,
} from './layout.ts'

export type MemberRole = 'credential' | 'secret' | 'locator' | 'parameter' | 'derived'
export type MemberPresence = 'required' | 'optional' | 'derived'

export interface ProtocolMember {
  readonly name: string
  readonly role: MemberRole
  readonly presence: MemberPresence
  readonly default?: Json
  readonly sensitive: boolean
  /** A JSON Schema fragment whose `type` is the member's logical type. */
  readonly schema: { readonly type: 'string' | 'integer' | 'boolean'; readonly [k: string]: Json }
  readonly description: string
}

export interface ProtocolRecord {
  readonly id: string
  readonly title: string
  readonly category: string
  readonly description: string
  readonly status: 'stable' | 'deprecated'
  readonly introduced: string
  readonly references: readonly { readonly title: string; readonly url: string }[]
  readonly capabilities: readonly string[]
  readonly members: readonly ProtocolMember[]
}

export interface ProtocolCategory {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly conventions: Readonly<Partial<Record<MemberRole, string>>>
  readonly protocols: readonly string[]
}

export interface ProtocolRegistry {
  /** The component family version whose registry this is. */
  readonly major: string
  readonly categories: readonly ProtocolCategory[]
  /** Every protocol, in category order and then in its category's order. */
  readonly protocols: readonly ProtocolRecord[]
}

/** The record file name for a protocol: lower case, each underscore a hyphen. */
export const protocolFileName = (id: string): string =>
  `${id.toLowerCase().replaceAll('_', '-')}.json`

/** The component family version that carries a protocol registry: the latest one. */
export function registryFamily(repoRoot: string = REPO_ROOT): Family | undefined {
  return discoverKinds(repoRoot)
    .filter(
      (f) =>
        f.name === 'component' &&
        existsSync(inRepo(repoRoot, familyPaths(f.name, f.major).protocols)),
    )
    .at(-1)
}

const pointer = (errors: { instancePath: string; message?: string }[] | null | undefined) =>
  (errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim()).join('; ')

/**
 * Read and check the registry of one component family version. Throws when a
 * record or the categories file breaks core's schema, when a file name
 * disagrees with its record, when a category and a record disagree about
 * membership, or when a protocol breaks its category's naming conventions.
 */
export function loadProtocolRegistry(
  repoRoot: string = REPO_ROOT,
  major: string | undefined = registryFamily(repoRoot)?.major,
): ProtocolRegistry {
  if (major === undefined)
    throw new Error('no component family version carries a protocol registry')
  const dir = inRepo(repoRoot, familyPaths('component', major).protocols)
  const schemaPath = join(
    inRepo(repoRoot, familyPaths(CORE_FAMILY, major).interfaces),
    PROTOCOL_SCHEMA_FILE,
  )
  const schema = readJson(schemaPath) as { $id: string }
  const ajv = strictAjv()
  ajv.addSchema(schema)
  const validRecord = ajv.compile({ $ref: schema.$id })
  const validCategories = ajv.compile({ $ref: `${schema.$id}#/$defs/ProtocolCategories` })

  const categoriesFile = readJson(join(dir, PROTOCOL_CATEGORIES_FILE))
  if (!validCategories(categoriesFile))
    throw new Error(`${PROTOCOL_CATEGORIES_FILE}: ${pointer(validCategories.errors)}`)
  const { categories } = categoriesFile as unknown as { categories: ProtocolCategory[] }

  const records = new Map<string, ProtocolRecord>()
  const family = discoverKinds(repoRoot).find((f) => f.name === 'component' && f.major === major)
  if (!family) throw new Error(`no component family version ${major}`)
  for (const path of protocolFiles(family)) {
    const file = basename(path)
    if (file === PROTOCOL_CATEGORIES_FILE) continue
    const value = readJson(path)
    if (!validRecord(value)) throw new Error(`${file}: ${pointer(validRecord.errors)}`)
    const record = value as unknown as ProtocolRecord
    if (protocolFileName(record.id) !== file)
      throw new Error(`${file}: a ${record.id} record belongs in ${protocolFileName(record.id)}`)
    checkRecord(record, file)
    records.set(record.id, record)
  }

  const protocols: ProtocolRecord[] = []
  for (const category of categories) {
    for (const id of category.protocols) {
      const record = records.get(id)
      if (!record) throw new Error(`${PROTOCOL_CATEGORIES_FILE}: ${id} has no record`)
      if (record.category !== category.id)
        throw new Error(
          `${protocolFileName(id)}: listed under ${category.id}, not ${record.category}`,
        )
      for (const member of record.members) {
        const convention = category.conventions[member.role]
        if (convention !== undefined && convention !== member.name)
          throw new Error(
            `${protocolFileName(id)}: the ${category.id} ${member.role} member is named ${convention}, not ${member.name}`,
          )
      }
      protocols.push(record)
    }
  }
  for (const id of records.keys())
    if (!protocols.some((p) => p.id === id))
      throw new Error(
        `${protocolFileName(id)}: no category in ${PROTOCOL_CATEGORIES_FILE} lists ${id}`,
      )
  return { major, categories, protocols }
}

/** The rules core's schema cannot state about one record. */
function checkRecord(record: ProtocolRecord, file: string): void {
  const names = record.members.map((m) => m.name)
  if (new Set(names).size !== names.length) throw new Error(`${file}: a member name repeats`)
  for (const role of ['credential', 'locator'] as const)
    if (record.members.filter((m) => m.role === role).length > 1)
      throw new Error(`${file}: more than one ${role} member`)
  if (!record.members.some((m) => m.role === 'credential'))
    throw new Error(`${file}: no credential member`)
  const ajv = strictAjv()
  for (const member of record.members) {
    if (!['string', 'integer', 'boolean'].includes(String(member.schema.type)))
      throw new Error(`${file}: ${member.name} has no string, integer or boolean type`)
    const valid = ajv.compile(member.schema as object)
    if (member.default !== undefined && !valid(member.default))
      throw new Error(`${file}: the default of ${member.name} breaks its own schema`)
    if (member.role === 'secret' && member.presence !== 'required')
      throw new Error(`${file}: the secret member ${member.name} is not required`)
  }
}

/** Whether a protocol is HTTP-based: it has a locator, its HTTPS URL. */
export const locatorOf = (record: ProtocolRecord): ProtocolMember | undefined =>
  record.members.find((m) => m.role === 'locator')

/** The member a selection's `credential.value` supplies. */
export const credentialOf = (record: ProtocolRecord): ProtocolMember => {
  const credential = record.members.find((m) => m.role === 'credential')
  if (!credential) throw new Error(`${record.id} has no credential member`)
  return credential
}

/** The members a selection's `credential.secrets` holds. */
export const secretsOf = (record: ProtocolRecord): ProtocolMember[] =>
  record.members.filter((m) => m.role === 'secret')

/** The members a view carries: every one except the credential, secret and derived members. */
export const viewMembersOf = (record: ProtocolRecord): ProtocolMember[] =>
  record.members.filter((m) => m.role === 'locator' || m.role === 'parameter')
