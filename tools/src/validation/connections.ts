/**
 * Component §6.4: the per-protocol member facts, read from the protocol
 * registry (docs/adr/0045). Blueprint selections live in selections.ts.
 */
import { isObject, type Json } from '../lib/layout.ts'
import {
  loadProtocolRegistry,
  locatorOf,
  type MemberRole,
  type ProtocolRecord,
} from '../lib/protocols.ts'

/** A protocol the registry defines. */
export type ConnectionProtocol = string
/**
 * The contract of one connection member (component §6.4): its logical type,
 * its sensitivity, its role, its value schema, and whether every view carries
 * it. An optional member states its `default`, or has none and may be absent.
 * A `derived` member is never carried by a view: resolution composes it
 * (`composeConnectionURL`).
 */
export interface ConnectionMemberContract {
  readonly type: 'string' | 'integer' | 'boolean'
  readonly sensitive: boolean
  readonly required: boolean
  readonly default?: Json
  readonly derived?: true
  readonly role: MemberRole
  /** The value constraints the registry states, as a JSON Schema fragment. */
  readonly schema: Readonly<Record<string, Json>>
}
/** The registry, in the order component §6.4 lists its protocols. */
export const PROTOCOL_REGISTRY = loadProtocolRegistry()
const contractOf = (member: ProtocolRecord['members'][number]): ConnectionMemberContract => ({
  type: member.schema.type,
  sensitive: member.sensitive,
  required: member.presence !== 'optional',
  ...(member.default === undefined ? {} : { default: member.default }),
  ...(member.presence === 'derived' ? { derived: true as const } : {}),
  role: member.role,
  schema: member.schema,
})
/**
 * Component §6.4 COMP-CONNECTION-002: each protocol fixes its members, their
 * logical types, their sensitivity and whether each is required, optional
 * with a default, optional without one, or derived. The one table every
 * check reads, keyed by protocol and then by member, in registry order.
 */
export const CONNECTION_PROTOCOL_MEMBERS: Readonly<
  Record<ConnectionProtocol, Readonly<Record<string, ConnectionMemberContract>>>
> = Object.fromEntries(
  PROTOCOL_REGISTRY.protocols.map((p) => [
    p.id,
    Object.fromEntries(p.members.map((m) => [m.name, contractOf(m)])),
  ]),
)
/** Every protocol's record, keyed by protocol. */
export const PROTOCOL_RECORDS: Readonly<Record<ConnectionProtocol, ProtocolRecord>> =
  Object.fromEntries(PROTOCOL_REGISTRY.protocols.map((p) => [p.id, p]))
/**
 * Component §6.4: a member is guaranteed when every resolved connection holds
 * it: it is required, derived, or optional with a default. Only a guaranteed
 * member may be forwarded by an output (COMP-OUT-003).
 */
export const guaranteedMember = (contract: ConnectionMemberContract): boolean =>
  contract.required || contract.derived === true || contract.default !== undefined
export const CONNECTION_PROTOCOLS: readonly ConnectionProtocol[] = PROTOCOL_REGISTRY.protocols.map(
  (p) => p.id,
)
/** The protocols that take `capabilities`: those whose record lists any (component §6.4). */
export const LLM_CONNECTION_PROTOCOLS: ReadonlySet<ConnectionProtocol> = new Set(
  PROTOCOL_REGISTRY.protocols.filter((p) => p.capabilities.length > 0).map((p) => p.id),
)
/**
 * The member of an HTTP-based protocol that carries its HTTPS URL: its
 * locator (ADR 0039 §5, docs/adr/0045). Held to blueprint §5.3's HTTPS and
 * `permittedBaseURLs` rules.
 */
export const CONNECTION_URL_MEMBER: Readonly<Partial<Record<ConnectionProtocol, string>>> =
  Object.fromEntries(
    PROTOCOL_REGISTRY.protocols.flatMap((p) => {
      const locator = locatorOf(p)
      return locator ? [[p.id, locator.name]] : []
    }),
  )
/** The HTTP-based protocols: those with a locator. */
export const HTTP_CONNECTION_PROTOCOLS: ReadonlySet<ConnectionProtocol> = new Set(
  Object.keys(CONNECTION_URL_MEMBER),
)
export const isConnectionProtocol = (value: unknown): value is ConnectionProtocol =>
  typeof value === 'string' && Object.hasOwn(CONNECTION_PROTOCOL_MEMBERS, value)
/** The member contract `member` has under `protocol`, or undefined when the protocol defines none. */
export function protocolMember(
  protocol: unknown,
  name: string,
): ConnectionMemberContract | undefined {
  if (!isConnectionProtocol(protocol)) return
  const members = CONNECTION_PROTOCOL_MEMBERS[protocol] ?? {}
  return Object.hasOwn(members, name) ? members[name] : undefined
}
const record = (v: unknown): Record<string, Json> =>
  isObject(v as Json) ? (v as Record<string, Json>) : {}
/** The members a connection input holds, fixed by its protocol (component §6.4). */
export const CONNECTION_MEMBERS: readonly string[] = [
  ...new Set(
    CONNECTION_PROTOCOLS.flatMap((p) => Object.keys(CONNECTION_PROTOCOL_MEMBERS[p] ?? {})),
  ),
]
/** Component §6.1: the key present says an input is a connection input. */
export const isConnectionInput = (input: Json | undefined): boolean =>
  Object.hasOwn(record(input), 'connection')
/**
 * The value contract of one connection member, as `{schema, sensitive}`. With a
 * protocol, the member that protocol fixes; without one, the member under the
 * first protocol that defines it (`database` is a string for `POSTGRES` and an
 * integer for `REDIS`, so pass the protocol when it is known). A name no
 * protocol defines reads as a non-sensitive string; use `protocolMember` to ask
 * whether a protocol defines it (COMP-OUT-004).
 */
export function connectionMemberContract(name: string, protocol?: unknown): Record<string, Json> {
  const contract =
    protocol === undefined
      ? CONNECTION_PROTOCOLS.map((p) => protocolMember(p, name)).find(Boolean)
      : protocolMember(protocol, name)
  return contract
    ? { schema: { type: contract.type }, sensitive: contract.sensitive }
    : { schema: { type: 'string' }, sensitive: false }
}

/**
 * Component §6.4: percent-encode every UTF-8 byte outside RFC 3986's
 * unreserved set, with uppercase hexadecimal digits.
 */
export const percentEncode = (text: string): string =>
  encodeURIComponent(text).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
/** Component §6.4: the host of a composed URL, lowercased, with an IPv6 address bracketed. */
const urlHost = (host: string): string =>
  host.includes(':') ? `[${host.toLowerCase()}]` : host.toLowerCase()
/**
 * Component §6.4: the canonical composition of the derived `url` member of a
 * `POSTGRES` or `REDIS` connection from its other members, the credential's
 * included. Undefined for a protocol with no derived `url`, or members that do
 * not compose (a caller validates them first).
 */
export function composeConnectionURL(
  protocol: ConnectionProtocol,
  members: Readonly<Record<string, Json>>,
): string | undefined {
  const { host, port } = members
  if (typeof host !== 'string' || !Number.isInteger(port)) return
  const server = `${urlHost(host)}:${port}`
  if (protocol === 'POSTGRES') {
    const { username, password, database, sslMode } = members
    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      typeof database !== 'string' ||
      typeof sslMode !== 'string'
    )
      return
    return (
      `postgresql://${percentEncode(username)}:${percentEncode(password)}@${server}` +
      `/${percentEncode(database)}?sslmode=${sslMode}`
    )
  }
  if (protocol === 'REDIS') {
    const { username, password, tls } = members,
      database = members.database ?? 0
    if (typeof tls !== 'boolean' || !Number.isInteger(database)) return
    const user = typeof username === 'string' ? percentEncode(username) : ''
    const userinfo = typeof password === 'string' ? `${user}:${percentEncode(password)}@` : ''
    return `${tls ? 'rediss' : 'redis'}://${userinfo}${server}/${database}`
  }
  return
}
