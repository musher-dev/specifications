/**
 * Generate what component's connection protocol registry tabulates
 * (docs/adr/0045), so that no table restates it by hand:
 *
 * - in component's schema source, the protocol enum, the capabilities
 *   conditional and the union `ComponentOutputFrom.member` takes;
 * - in component's spec.md, the §6.4 member table and the COMP-OUT-004 type
 *   sentence, and in blueprint's, the §5.3 view table, each between a pair of
 *   `BEGIN GENERATED` and `END GENERATED` comments;
 * - blueprint's connection-evidence schema, the shape of a `connections`
 *   resolution context.
 *
 * `task docs` writes them, and `task check:docs` fails when any is stale.
 *
 * NON-NORMATIVE, like everything under tools/. The records are normative.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  CONNECTION_EVIDENCE_SCHEMA_FILE,
  familyPaths,
  inRepo,
  isObject,
  type Json,
  METASCHEMA,
  REPO_ROOT,
  relativeToRepo,
  SCHEMA_ORIGIN,
} from '../lib/layout.ts'
import {
  credentialOf,
  loadProtocolRegistry,
  type ProtocolMember,
  type ProtocolRecord,
  type ProtocolRegistry,
  protocolFileName,
  registryFamily,
  secretsOf,
  viewMembersOf,
} from '../lib/protocols.ts'

/** The column prose wraps at, as everywhere in spec.md. */
const WRAP = 80

const code = (text: string) => `\`${text}\``

/** "a", "a or b", "a, b or c", or with another conjunction. */
function either(items: readonly string[], conjunction = 'or'): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items.at(-1)}`
}

/** Greedy word wrap at `WRAP` columns. */
function wrap(text: string): string {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > WRAP) {
      lines.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  return lines.join('\n')
}

/** A default as a table cell writes it: in code, as YAML would spell it. */
const literal = (value: Json): string =>
  code(typeof value === 'string' ? value : JSON.stringify(value))

function presenceCell(member: ProtocolMember): string {
  if (member.presence !== 'optional') return member.presence
  return member.default === undefined
    ? 'optional, no default'
    : `optional, default ${literal(member.default)}`
}

/** Two protocols share table rows when they fix the same members alike. */
const sameMembers = (a: ProtocolRecord, b: ProtocolRecord): boolean =>
  JSON.stringify(a.members.map(({ description: _d, ...m }) => m)) ===
  JSON.stringify(b.members.map(({ description: _d, ...m }) => m))

/** Consecutive protocols that fix the same members, as one group each. */
function groups(
  protocols: readonly ProtocolRecord[],
  same: (a: ProtocolRecord, b: ProtocolRecord) => boolean,
): ProtocolRecord[][] {
  const out: ProtocolRecord[][] = []
  for (const protocol of protocols) {
    const last = out.at(-1)
    const first = last?.[0]
    if (last && first && same(first, protocol)) last.push(protocol)
    else out.push([protocol])
  }
  return out
}

const protocolsCell = (group: readonly ProtocolRecord[]) => group.map((p) => code(p.id)).join(', ')

/** Component §6.4: every member of every protocol, sensitive ones in bold. */
export function memberTable(registry: ProtocolRegistry): string {
  const rows = ['| Protocol | Member | Type | Presence |', '|---|---|---|---|']
  for (const group of groups(registry.protocols, sameMembers)) {
    const [first] = group
    if (!first) continue
    first.members.forEach((member, index) => {
      const name = member.sensitive ? `**${code(member.name)}**` : code(member.name)
      rows.push(
        `| ${index === 0 ? protocolsCell(group) : ''} | ${name} | ${member.schema.type} | ${presenceCell(member)} |`.replace(
          '|  |',
          '| |',
        ),
      )
    })
  }
  return rows.join('\n')
}

/**
 * The members of one logical type, each named once, and qualified by its
 * protocols where another protocol gives the same name another type.
 */
function membersOfType(registry: ProtocolRegistry, type: string): string[] {
  const types = new Map<string, Set<string>>()
  for (const p of registry.protocols)
    for (const m of p.members)
      types.set(m.name, (types.get(m.name) ?? new Set()).add(m.schema.type))
  const named: string[] = []
  const seen = new Set<string>()
  for (const p of registry.protocols)
    for (const m of p.members) {
      if (m.schema.type !== type || seen.has(m.name)) continue
      seen.add(m.name)
      const owners = registry.protocols.filter((q) =>
        q.members.some((n) => n.name === m.name && n.schema.type === type),
      )
      named.push(
        types.get(m.name)?.size === 1
          ? code(m.name)
          : `the ${owners.map((q) => code(q.id)).join(' and ')} ${code(m.name)}`,
      )
    }
  return named
}

/** Component COMP-OUT-004: the schema type each forwarded member needs. */
export function typeSentence(registry: ProtocolRegistry): string {
  const integers = membersOfType(registry, 'integer')
  const booleans = membersOfType(registry, 'boolean')
  const parts = [
    integers.length
      ? `A forwarded integer member, ${either(integers)}, needs an integer or number schema;`
      : '',
    booleans.length ? `a boolean member, ${either(booleans)}, a boolean schema;` : '',
    'and every other member a string schema.',
  ].filter(Boolean)
  return wrap(parts.join(' '))
}

/** Blueprint §5.3: what a selection's credential supplies, and what each view carries. */
export function viewTable(registry: ProtocolRegistry): string {
  const rows = [
    '| Protocol | Credential member | View members | Optional view members |',
    '|---|---|---|---|',
  ]
  for (const group of groups(registry.protocols, sameMembers)) {
    const [p] = group
    if (!p) continue
    const credential = credentialOf(p)
    const view = viewMembersOf(p)
    const carried = [
      ...view.filter((m) => m.presence === 'required').map((m) => code(m.name)),
      ...(p.capabilities.length ? [code('capabilities')] : []),
    ]
    const optional = view.filter((m) => m.presence === 'optional').map((m) => code(m.name))
    const secrets = secretsOf(p).map((m) => code(m.name))
    const credentialCell =
      credential.presence === 'optional'
        ? `${code(credential.name)}, when the server requires authentication`
        : secrets.length
          ? `${code(credential.name)}, and ${either(secrets, 'and')} in ${code('secrets')}`
          : code(credential.name)
    rows.push(
      `| ${protocolsCell(group)} | ${credentialCell} | ${carried.join(', ') || 'none'} | ${optional.join(', ') || 'none'} |`,
    )
  }
  return rows.join('\n')
}

// --- The component schema --------------------------------------------------

type JsonObject = { [k: string]: Json }

function child(value: Json | undefined, ...path: (string | number)[]): JsonObject {
  let at: Json | undefined = value
  for (const key of path) {
    at = Array.isArray(at) ? at[key as number] : isObject(at) ? at[key as string] : undefined
  }
  if (!isObject(at)) throw new Error(`component schema has no object at ${path.join('/')}`)
  return at
}

/** Every capability, the same set on every protocol that takes any. */
function capabilitySet(registry: ProtocolRegistry): string[] {
  const sets = registry.protocols
    .filter((p) => p.capabilities.length)
    .map((p) => JSON.stringify(p.capabilities))
  if (new Set(sets).size > 1)
    throw new Error(
      'protocols take different capability sets; the generator has one capabilities enum',
    )
  const [first] = sets
  return first === undefined ? [] : JSON.parse(first)
}

/** The component schema source with its generated enums replaced. */
export function componentSchema(registry: ProtocolRegistry, source: string): string {
  const schema = JSON.parse(source) as JsonObject
  const connection = child(schema, '$defs', 'ComponentConnection')
  child(connection, 'allOf', 0, 'if', 'properties', 'protocol').enum = registry.protocols
    .filter((p) => p.capabilities.length)
    .map((p) => p.id)
  child(connection, 'properties', 'protocol').enum = registry.protocols.map((p) => p.id)
  child(connection, 'properties', 'capabilities', 'items').enum = capabilitySet(registry)
  child(schema, '$defs', 'ComponentOutputFrom', 'properties', 'member').enum = [
    ...new Set(registry.protocols.flatMap((p) => p.members.map((m) => m.name))),
  ]
  return `${JSON.stringify(schema, null, 2)}\n`
}

// --- spec.md blocks --------------------------------------------------------

const begin = (name: string) => `<!-- BEGIN GENERATED ${name}`
const end = (name: string) => `<!-- END GENERATED ${name} -->`

/**
 * Replace the content between one pair of markers. The begin marker's line
 * says where the content comes from; everything up to the end marker is
 * rewritten, with a blank line on each side so the block is its own paragraph
 * or table.
 */
export function replaceBlock(text: string, name: string, content: string, file: string): string {
  const lines = text.split('\n')
  const first = lines.findIndex((l) => l.startsWith(begin(name)))
  const last = lines.indexOf(end(name))
  if (first < 0 || last < first)
    throw new Error(`${file}: no ${begin(name)} ... ${end(name)} block`)
  return [...lines.slice(0, first + 1), '', content, '', ...lines.slice(last)].join('\n')
}

// --- The connection-evidence schema ----------------------------------------

const pascal = (id: string) =>
  id
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
const viewDef = (p: ProtocolRecord) => `${pascal(p.id)}View`

function viewSchema(p: ProtocolRecord): JsonObject {
  const properties: JsonObject = {}
  for (const m of viewMembersOf(p)) properties[m.name] = { ...m.schema, description: m.description }
  if (p.capabilities.length)
    properties.capabilities = {
      type: 'array',
      uniqueItems: true,
      items: { type: 'string', enum: [...p.capabilities] },
      description: 'The capabilities the selected service supports.',
    }
  return {
    type: 'object',
    additionalProperties: false,
    description: `A ${p.id} view: the members a view of the protocol carries (${protocolFileName(p.id)}). It never carries the credential, a secret or a derived member.`,
    ...(p.capabilities.length ? { required: ['capabilities'] } : {}),
    properties,
  }
}

/**
 * A JSON Schema `if`/`then`/`else`, spelled as entries so that no object
 * literal here has a `then` property, which would make it a thenable.
 */
const conditional = (when: JsonObject, then: JsonObject, otherwise?: JsonObject): JsonObject =>
  Object.fromEntries([['if', when], ['then', then], ...(otherwise ? [['else', otherwise]] : [])])

/** `credential.secrets`, when any protocol has a secret member. */
function secretsSchema(registry: ProtocolRegistry): JsonObject {
  const properties: JsonObject = {}
  for (const p of registry.protocols)
    for (const m of secretsOf(p)) properties[m.name] ??= { ...m.schema, description: m.description }
  if (!Object.keys(properties).length) return {}
  return {
    secrets: {
      type: 'object',
      additionalProperties: false,
      minProperties: 1,
      description:
        'The secret members of the views’ protocols, by member: exactly those, and absent when they define none (blueprint §5.3).',
      properties,
    },
  }
}

/** Blueprint's connection-evidence schema, generated from the registry. */
export function evidenceSchema(registry: ProtocolRegistry): string {
  const views: JsonObject = {}
  for (const p of registry.protocols) views[p.id] = { $ref: `#/$defs/${viewDef(p)}` }
  const defs: JsonObject = {
    ConnectionAcquisition: {
      type: 'object',
      additionalProperties: false,
      description:
        'What acquisition reached for one connection parameter: its status, and for a SELECTED one the persisted selection (blueprint §5.3, BP-CONNECTION-002).',
      required: ['status'],
      properties: {
        status: {
          type: 'string',
          enum: ['NOT_ACQUIRED', 'NOT_FOUND', 'DENIED', 'INCOMPATIBLE', 'SELECTED'],
          description: 'The acquisition status, one row of the BP-CONNECTION-002 outcome table.',
        },
        persisted: {
          const: true,
          description: 'The selection and its scoped credential are persisted (BP-CONNECTION-003).',
        },
        selection: { $ref: '#/$defs/ConnectionSelection' },
      },
      ...conditional(
        { properties: { status: { const: 'SELECTED' } }, required: ['status'] },
        {
          properties: { persisted: true, selection: true },
          required: ['persisted', 'selection'],
        },
        { properties: { persisted: false, selection: false } },
      ),
    },
    ConnectionSelection: {
      type: 'object',
      additionalProperties: false,
      description:
        'One immutable, authorized selection for one deployment and connection parameter (blueprint §5.3).',
      required: [
        'identity',
        'version',
        'deployment',
        'parameter',
        'request',
        'selectionKind',
        'costOwner',
        'views',
      ],
      properties: {
        identity: { $ref: '#/$defs/Text', description: 'Identity of the selection.' },
        version: { $ref: '#/$defs/Text', description: 'Version of the selection.' },
        deployment: {
          $ref: '#/$defs/Text',
          description: 'The deployment the selection was acquired for.',
        },
        parameter: {
          $ref: '#/$defs/Text',
          description: 'The connection parameter the selection was acquired for.',
        },
        request: { $ref: '#/$defs/ConnectionRequest' },
        selectionKind: {
          type: 'string',
          enum: ['MANAGED', 'USER'],
          description: 'MANAGED, chosen by the organization, or USER, supplied by the deployer.',
        },
        provisioning: {
          type: 'string',
          enum: ['GRANTED', 'PROVISIONED'],
          description:
            'For a MANAGED selection only: access to a shared service, or a service provisioned for this deployment.',
        },
        costOwner: { $ref: '#/$defs/Text', description: 'Who pays for the selected service.' },
        credential: { $ref: '#/$defs/ConnectionCredential' },
        views: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          description: 'One view per protocol the selected service speaks, keyed by protocol.',
          properties: views,
        },
      },
      ...conditional(
        { properties: { selectionKind: { const: 'USER' } }, required: ['selectionKind'] },
        { properties: { provisioning: false } },
      ),
    },
    ConnectionRequest: {
      type: 'object',
      additionalProperties: false,
      description:
        'The acquisition request the selection answers, not the provider selected: the parameter’s from, and the policy that answered it.',
      required: ['from', 'identity', 'version'],
      properties: {
        from: { $ref: '#/$defs/Text', description: 'The connection parameter’s from.' },
        identity: { $ref: '#/$defs/Text', description: 'Identity of the answering policy.' },
        version: { $ref: '#/$defs/Text', description: 'Version of the answering policy.' },
      },
    },
    ConnectionCredential: {
      type: 'object',
      additionalProperties: false,
      description:
        'The one scoped credential of the selection. Absent only for a server that requires no authentication.',
      required: ['identity', 'rotation', 'value'],
      properties: {
        identity: { $ref: '#/$defs/Text', description: 'Identity of the credential.' },
        rotation: {
          type: 'integer',
          minimum: 0,
          description: 'The credential’s rotation generation.',
        },
        value: {
          $ref: '#/$defs/Text',
          description: `The value of each view's credential member: ${registry.protocols.map((p) => `${credentialOf(p).name} for ${p.id}`).join(', ')}.`,
        },
        ...secretsSchema(registry),
        permittedBaseURLs: {
          type: 'array',
          items: { type: 'string' },
          description:
            'The URLs an HTTP-based view’s input may receive as its locator, a defaulted one included. Required by blueprint §5.3 when a view is of an HTTP-based protocol.',
        },
      },
    },
    ...Object.fromEntries(registry.protocols.map((p) => [viewDef(p), viewSchema(p)])),
    Text: { type: 'string', minLength: 1 },
  }
  const schema: JsonObject = {
    $schema: METASCHEMA,
    $id: `${SCHEMA_ORIGIN}/blueprint/${registry.major}/connection-evidence`,
    title: 'Connection evidence',
    description:
      'The connections resolution context: the acquisition each connection parameter of one deployment reached, keyed by parameter, with each SELECTED acquisition’s persisted selection (blueprint §5.3). Shape only: a context this schema rejects is malformed evidence, ERR_INVALID_RESOLUTION_CONTEXT, and one it accepts must still satisfy BP-CONNECTION-002.',
    $comment:
      'Generated by `task docs` (tools/src/render/protocols.ts) from component’s protocol registry, docs/adr/0045. Do not edit by hand.',
    type: 'object',
    additionalProperties: false,
    required: ['deployment', 'parameters'],
    properties: {
      deployment: { $ref: '#/$defs/Text', description: 'The deployment’s identity.' },
      parameters: {
        type: 'object',
        description: 'Connection parameter name → what acquisition reached for it.',
        additionalProperties: { $ref: '#/$defs/ConnectionAcquisition' },
      },
    },
    $defs: defs,
  }
  return `${JSON.stringify(schema, null, 2)}\n`
}

// --- Outputs ---------------------------------------------------------------

/**
 * Every file generated from the registry, repo-relative, with a builder for
 * its bytes. Empty in a repository with no registry.
 */
export function protocolOutputs(repoRoot: string = REPO_ROOT): [string, () => string][] {
  const family = registryFamily(repoRoot)
  if (!family) return []
  const { major } = family
  let cached: ProtocolRegistry | undefined
  const registry = () => {
    cached ??= loadProtocolRegistry(repoRoot, major)
    return cached
  }
  const component = familyPaths('component', major)
  const blueprint = familyPaths('blueprint', major)
  const read = (path: string) => readFileSync(inRepo(repoRoot, path), 'utf8')
  const schemaPath = `${component.src}/component.schema.json`
  return [
    [schemaPath, () => componentSchema(registry(), read(schemaPath))],
    [
      component.spec,
      () => {
        let text = read(component.spec)
        text = replaceBlock(text, 'protocol-members', memberTable(registry()), component.spec)
        text = replaceBlock(text, 'member-types', typeSentence(registry()), component.spec)
        return text
      },
    ],
    [
      blueprint.spec,
      () =>
        replaceBlock(read(blueprint.spec), 'protocol-views', viewTable(registry()), blueprint.spec),
    ],
    [
      `${blueprint.interfaces}/${CONNECTION_EVIDENCE_SCHEMA_FILE}`,
      () => evidenceSchema(registry()),
    ],
  ]
}

function main(): void {
  for (const [path, build] of protocolOutputs()) {
    const absolute = inRepo(REPO_ROOT, path)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, build(), 'utf8')
    console.log(`  ✓ ${relativeToRepo(absolute)}`)
  }
}

if (import.meta.main) main()
