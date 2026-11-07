/**
 * Blueprint parameter origins and connection selections (blueprint §5.2, §5.3).
 * An offline adapter over supplied acquisition evidence: production acquisition,
 * provisioning and credential issuance are downstream. NON-NORMATIVE.
 */
import { readFileSync } from 'node:fs'
import {
  CONNECTION_EVIDENCE_SCHEMA_FILE,
  familyPaths,
  inRepo,
  isObject,
  type Json,
  REPO_ROOT,
} from '../lib/layout.ts'
import { credentialOf, locatorOf, secretsOf, viewMembersOf } from '../lib/protocols.ts'
import { scanReferences } from '../lib/references.ts'
import { strictAjv } from '../schema/lint.ts'
import {
  CONNECTION_PROTOCOL_MEMBERS,
  CONNECTION_URL_MEMBER,
  type ConnectionProtocol,
  composeConnectionURL,
  isConnectionInput,
  PROTOCOL_RECORDS,
  PROTOCOL_REGISTRY,
} from './connections.ts'
import type { Diagnostic } from './document.ts'
import { boundedValue } from './values.ts'

export type ConnectionCapability = string
/**
 * Blueprint §5.3: the member a selection's credential supplies to each view of
 * its protocol: the protocol's credential member (docs/adr/0045). Every member
 * a view carries is a locator or a parameter.
 */
export const CREDENTIAL_MEMBER: Readonly<Record<ConnectionProtocol, string>> = Object.fromEntries(
  Object.values(PROTOCOL_RECORDS).map((p) => [p.id, credentialOf(p).name]),
)
/**
 * Blueprint §5.3: the protocols whose credential may be absent, those whose
 * credential member is optional. A `REDIS` server that requires no
 * authentication has no credential, and its view then carries no `username`.
 */
const CREDENTIAL_OPTIONAL: ReadonlySet<ConnectionProtocol> = new Set(
  Object.values(PROTOCOL_RECORDS)
    .filter((p) => credentialOf(p).presence === 'optional')
    .map((p) => p.id),
)
const memberSchemas = strictAjv()
const memberValidators = new Map<string, ReturnType<typeof memberSchemas.compile>>()
/**
 * Blueprint §5.3: evidence the connection-evidence schema rejects is
 * malformed: the whole `connections` context, each acquisition in it, and
 * each selection. The schema is generated from the registry
 * (render/protocols.ts), and `task check:docs` keeps the committed copy
 * current.
 */
const evidence = (() => {
  const schema = JSON.parse(
    readFileSync(
      inRepo(
        REPO_ROOT,
        `${familyPaths('blueprint', PROTOCOL_REGISTRY.major).interfaces}/${CONNECTION_EVIDENCE_SCHEMA_FILE}`,
      ),
      'utf8',
    ),
  ) as { $id: string }
  memberSchemas.addSchema(schema)
  return {
    acquisition: memberSchemas.compile({ $ref: `${schema.$id}#/$defs/ConnectionAcquisition` }),
    selection: memberSchemas.compile({ $ref: `${schema.$id}#/$defs/ConnectionSelection` }),
    context: memberSchemas.compile({ $ref: schema.$id }),
  }
})()
/**
 * One protocol view: the protocol's members other than the credential and the
 * derived `url`, and an LLM view's capabilities.
 */
export type ConnectionView = Readonly<Record<string, Json>> & {
  readonly capabilities?: readonly ConnectionCapability[]
}
export interface ConnectionSelection {
  readonly identity: string
  readonly version: string
  readonly deployment: string
  readonly parameter: string
  /** The acquisition request: the parameter's `from`, and the configuration revision that answered it. */
  readonly request: {
    readonly from: string
    readonly identity: string
    readonly version: string
  }
  readonly selectionKind: 'MANAGED' | 'USER'
  /** For a MANAGED selection: GRANTED access to a shared service, or PROVISIONED for this deployment. */
  readonly provisioning?: 'GRANTED' | 'PROVISIONED'
  readonly costOwner: string
  /** Absent only for a `REDIS` server that requires no authentication. */
  readonly credential?: {
    readonly identity: string
    readonly rotation: number
    readonly value: string
    /** The secret members of its views' protocols, by member (docs/adr/0045). */
    readonly secrets?: Readonly<Record<string, string>>
    readonly permittedBaseURLs?: readonly string[]
  }
  readonly views: Partial<Record<ConnectionProtocol, ConnectionView>>
}
export type ConnectionAcquisition =
  | { readonly status: 'NOT_ACQUIRED' | 'NOT_FOUND' | 'DENIED' | 'INCOMPATIBLE' }
  | {
      readonly status: 'SELECTED'
      readonly persisted: true
      readonly selection: ConnectionSelection
    }
export interface ConnectionsContext {
  readonly connections?: {
    readonly deployment: string
    readonly parameters: Readonly<Record<string, ConnectionAcquisition>>
  }
}
const record = (v: unknown): Record<string, Json> =>
  isObject(v as Json) ? (v as Record<string, Json>) : {}
function at(v: unknown, ...path: string[]): Json | undefined {
  for (const p of path) v = record(v)[p]
  return v as Json | undefined
}
const token = (v: string) => v.replaceAll('~', '~0').replaceAll('/', '~1')
function diagnostic(code: string, path: string, resolution = false): Diagnostic {
  return {
    code,
    path,
    message: code,
    phase: resolution ? 'resolution' : 'semantic',
    ...(resolution ? { stage: 'connections' } : {}),
  }
}
const inputsOf = (component: Json | undefined) =>
  record(at(component, 'spec', 'contract', 'inputs'))

/** The namespaces a parameter's `from` permits (blueprint BP-PLACEHOLDER-001). */
export const PARAMETER_ORIGIN_NAMESPACES = ['variables', 'connections', 'deployment'] as const
/** The paths the `deployment` namespace defines (blueprint BP-PARAM-011). */
export const DEPLOYMENT_FACT_PATHS = ['creator.identity', 'creator.email', 'creator.name']
export type ParameterOriginNamespace = (typeof PARAMETER_ORIGIN_NAMESPACES)[number]
/**
 * BP-PLACEHOLDER-001: a parameter's `from` is one whole placeholder, and its
 * namespace says what it names. Undefined when the parameter has no `from` or
 * it is not one whole permitted placeholder.
 */
export function parameterOrigin(
  parameter: Json | undefined,
): { namespace: ParameterOriginNamespace; key: string; from: string } | undefined {
  const from = at(parameter, 'from')
  if (typeof from !== 'string') return
  const scan = scanReferences(from, PARAMETER_ORIGIN_NAMESPACES)
  const [placeholder] = scan.references
  if (scan.failures.length || scan.references.length !== 1 || placeholder?.raw !== from) return
  return {
    namespace: placeholder.namespace as ParameterOriginNamespace,
    key: placeholder.path.join('.'),
    from,
  }
}
export function parameterOriginDiagnostics(
  name: string,
  parameter: Json | undefined,
): Diagnostic[] {
  const from = at(parameter, 'from')
  if (typeof from !== 'string') return []
  const path = `/spec/parameters/${token(name)}/from`
  const scan = scanReferences(from, PARAMETER_ORIGIN_NAMESPACES)
  // Core's codes (CORE-PLACEHOLDER-001..003) name what is wrong with a placeholder itself.
  if (scan.failures.length)
    return scan.failures.map((failure) =>
      diagnostic(
        failure.kind === 'malformed'
          ? 'ERR_MALFORMED_PLACEHOLDER'
          : failure.kind === 'unknown-namespace'
            ? 'ERR_UNKNOWN_PLACEHOLDER_NAMESPACE'
            : 'ERR_NAMESPACE_NOT_PERMITTED',
        path,
      ),
    )
  const origin = parameterOrigin(parameter)
  if (!origin) return [diagnostic('ERR_INVALID_PARAMETER_ORIGIN', path)]
  // BP-PARAM-011: `deployment` defines exactly the creator's three facts.
  if (origin.namespace === 'deployment' && !DEPLOYMENT_FACT_PATHS.includes(origin.key))
    return [diagnostic('ERR_UNKNOWN_DEPLOYMENT_FACT', path)]
  return []
}
/**
 * BP-CONNECTION-001: a connection input is bound only by a connection parameter,
 * and a connection parameter binds only connection inputs.
 */
export function connectionBindingDiagnostics(
  blueprint: Json,
  components: ReadonlyMap<string, Json>,
): Diagnostic[] {
  const out: Diagnostic[] = [],
    parameters = record(at(blueprint, 'spec', 'parameters'))
  for (const [node, n] of Object.entries(record(at(blueprint, 'spec', 'nodes')))) {
    const inputs = inputsOf(components.get(node))
    for (const [name, binding] of Object.entries(record(at(n, 'bindings')))) {
      if (!Object.hasOwn(inputs, name)) continue
      const parameter = at(binding, 'parameter'),
        path = `/spec/nodes/${token(node)}/bindings/${token(name)}`
      // An undeclared parameter is ERR_UNKNOWN_PARAMETER, and nothing more.
      if (typeof parameter === 'string' && !Object.hasOwn(parameters, parameter)) continue
      const connection =
        typeof parameter === 'string' &&
        parameterOrigin(parameters[parameter])?.namespace === 'connections'
      if (isConnectionInput(inputs[name]) !== connection)
        out.push(
          diagnostic(
            'ERR_INVALID_CONNECTION_BINDING',
            typeof parameter === 'string' ? `${path}/parameter` : path,
          ),
        )
    }
  }
  return out
}
/** An absolute URL of one of `schemes`, without user information, query or fragment. */
function absoluteURL(value: unknown, schemes: readonly string[]): boolean {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return (
      schemes.includes(url.protocol) && !url.username && !url.password && !url.hash && !url.search
    )
  } catch {
    return false
  }
}
/**
 * Component §6.4: a `host` member is a DNS name or IPv4 address, in letters,
 * digits, `-`, `_` and `.`, or an IPv6 address without brackets.
 */
function validHost(host: string): boolean {
  if (host.includes(':')) {
    try {
      return new URL(`http://[${host}]/`).hostname.length > 2
    } catch {
      return false
    }
  }
  return host.length <= 253 && /^[A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_])?$/.test(host)
}
/**
 * One member value of the type, range and value set its protocol fixes
 * (component §6.4): the value schema of its registry record. A `host` is also
 * checked as an address, since the schema's IPv6 alternative is only a shape.
 */
function memberValueValid(p: ConnectionProtocol, name: string, value: Json | undefined): boolean {
  const contract = CONNECTION_PROTOCOL_MEMBERS[p]?.[name]
  if (contract === undefined) throw new Error(`${p} defines no member ${name}`)
  const key = `${p}/${name}`
  let validate = memberValidators.get(key)
  if (!validate) {
    validate = memberSchemas.compile(contract.schema)
    memberValidators.set(key, validate)
  }
  if (!validate(value)) return false
  return name !== 'host' || validHost(String(value))
}
/**
 * BP-CONNECTION-002: one protocol view. It holds the protocol's members other
 * than the credential and the derived `url`, each of the type the protocol
 * fixes; every required one is present, and only a language-model view
 * carries capabilities. `incomplete` is a view missing a required member and
 * otherwise sound; `invalid` is malformed evidence.
 */
function viewProblem(
  protocol: string,
  view: Json | undefined,
  credential: Record<string, Json> | undefined,
): 'invalid' | 'incomplete' | undefined {
  const definition = Object.hasOwn(PROTOCOL_RECORDS, protocol)
    ? PROTOCOL_RECORDS[protocol]
    : undefined
  if (!definition || !isObject(view as Json)) return 'invalid'
  const p = protocol as ConnectionProtocol,
    v = record(view),
    members = viewMembersOf(definition),
    carried = members.map((m) => m.name)
  if (Object.keys(v).some((k) => k !== 'capabilities' && !carried.includes(k))) return 'invalid'
  for (const m of carried)
    if (Object.hasOwn(v, m) && !memberValueValid(p, m, v[m])) return 'invalid'
  if (definition.capabilities.length) {
    const caps = v.capabilities
    if (
      !Array.isArray(caps) ||
      !caps.every((c) => definition.capabilities.includes(String(c))) ||
      new Set(caps).size !== caps.length
    )
      return 'invalid'
  } else if (Object.hasOwn(v, 'capabilities')) return 'invalid'
  // Every HTTP protocol's URL is HTTPS and one of the credential's permitted
  // base URLs: the view's locator, or the default of one it omits.
  const base = CONNECTION_URL_MEMBER[p]
  const fallback = locatorOf(definition)?.default
  if (base && (Object.hasOwn(v, base) || fallback !== undefined)) {
    const url = Object.hasOwn(v, base) ? v[base] : fallback,
      permitted = credential?.permittedBaseURLs
    if (
      typeof url !== 'string' ||
      !absoluteURL(url, ['https:']) ||
      !Array.isArray(permitted) ||
      !permitted.includes(url)
    )
      return 'invalid'
  }
  // A REDIS server without authentication has no user to name.
  if (!credential && Object.hasOwn(v, 'username')) return 'invalid'
  // The credential carries each secret member of the protocol.
  const secrets = record(credential?.secrets)
  for (const secret of secretsOf(definition))
    if (
      Object.hasOwn(secrets, secret.name) &&
      !memberValueValid(p, secret.name, secrets[secret.name])
    )
      return 'invalid'
  const credentialMissing = !credential && !CREDENTIAL_OPTIONAL.has(p)
  if (
    credentialMissing ||
    members.some((m) => m.presence === 'required' && !Object.hasOwn(v, m.name)) ||
    (credential && secretsOf(definition).some((m) => !Object.hasOwn(secrets, m.name)))
  )
    return 'incomplete'
  return undefined
}
/**
 * Why a selection is not acceptable evidence: `incomplete` for a USER selection
 * missing a member of its protocol (ERR_CONNECTION_INCOMPATIBLE, never completed
 * from a managed one), `invalid` for anything else malformed.
 */
export function selectionProblem(
  value: unknown,
  deployment: string,
  parameter: string,
): 'invalid' | 'incomplete' | undefined {
  if (!boundedValue(value as Json) || !evidence.selection(value)) return 'invalid'
  const s = record(value),
    credential = s.credential === undefined ? undefined : record(s.credential),
    views = record(s.views)
  const text = (v: unknown) => typeof v === 'string' && v.length > 0
  if (
    !text(s.identity) ||
    !text(s.version) ||
    s.deployment !== deployment ||
    s.parameter !== parameter ||
    !text(at(s.request, 'from')) ||
    !text(at(s.request, 'identity')) ||
    !text(at(s.request, 'version')) ||
    !text(s.costOwner) ||
    !['MANAGED', 'USER'].includes(String(s.selectionKind)) ||
    (s.provisioning !== undefined &&
      (s.selectionKind !== 'MANAGED' ||
        !['GRANTED', 'PROVISIONED'].includes(String(s.provisioning)))) ||
    (s.credential !== undefined &&
      (!credential ||
        !text(credential.identity) ||
        !text(credential.value) ||
        !Number.isSafeInteger(credential.rotation) ||
        Number(credential.rotation) < 0 ||
        (credential.permittedBaseURLs !== undefined &&
          (!Array.isArray(credential.permittedBaseURLs) ||
            !credential.permittedBaseURLs.every((u) => typeof u === 'string'))))) ||
    !Object.keys(views).length
  )
    return 'invalid'
  // `credential.secrets` holds exactly the secret members of its views' protocols.
  const secretNames = new Set(
    Object.keys(views).flatMap((protocol) => {
      const definition = Object.hasOwn(PROTOCOL_RECORDS, protocol)
        ? PROTOCOL_RECORDS[protocol]
        : undefined
      return definition ? secretsOf(definition).map((m) => m.name) : []
    }),
  )
  if (
    credential?.secrets !== undefined &&
    (!secretNames.size || Object.keys(record(credential.secrets)).some((k) => !secretNames.has(k)))
  )
    return 'invalid'
  const problems = Object.entries(views).map(([protocol, view]) =>
    viewProblem(protocol, view, credential),
  )
  if (problems.includes('invalid')) return 'invalid'
  if (problems.includes('incomplete')) return s.selectionKind === 'USER' ? 'incomplete' : 'invalid'
  return undefined
}
export function validSelection(
  value: unknown,
  deployment: string,
  parameter: string,
): value is ConnectionSelection {
  return selectionProblem(value, deployment, parameter) === undefined
}
export function resolveConnections(
  blueprint: Json,
  components: ReadonlyMap<string, Json>,
  context: ConnectionsContext['connections'],
) {
  const diagnostics: Diagnostic[] = [],
    deferred: { rule: string; path: string; missing: string }[] = []
  const inputs: Record<
    string,
    { value: Json; sensitive: boolean; identity: string; version: string }
  > = Object.create(null)
  const selections = new Map<string, ConnectionSelection>()
  const origins = Object.fromEntries(
    Object.entries(record(at(blueprint, 'spec', 'parameters'))).flatMap(([name, p]) => {
      const origin = parameterOrigin(p)
      return origin?.namespace === 'connections' ? [[name, origin.from]] : []
    }),
  )
  for (const parameter of Object.keys(record(context?.parameters)))
    if (!Object.hasOwn(origins, parameter))
      diagnostics.push(diagnostic('ERR_INVALID_RESOLUTION_CONTEXT', '/spec', true))
  for (const parameter of Object.keys(origins)) {
    const path = `/spec/parameters/${token(parameter)}`
    const acquired =
      context?.parameters && Object.hasOwn(context.parameters, parameter)
        ? context.parameters[parameter]
        : undefined
    if (acquired !== undefined && !evidence.acquisition(acquired)) {
      diagnostics.push(diagnostic('ERR_INVALID_RESOLUTION_CONTEXT', path, true))
      continue
    }
    if (!acquired || acquired.status === 'NOT_ACQUIRED') {
      deferred.push({ rule: 'BP-CONNECTION-002', path, missing: `connection:${parameter}` })
      continue
    }
    if (acquired.status !== 'SELECTED') {
      const codes: Record<string, string> = {
        NOT_FOUND: 'ERR_CONNECTION_NOT_FOUND',
        DENIED: 'ERR_CONNECTION_DENIED',
        INCOMPATIBLE: 'ERR_CONNECTION_INCOMPATIBLE',
      }
      diagnostics.push(
        diagnostic(codes[acquired.status] ?? 'ERR_INVALID_RESOLUTION_CONTEXT', path, true),
      )
    } else if (
      !context?.deployment ||
      acquired.persisted !== true ||
      selectionProblem(acquired.selection, context.deployment, parameter) === 'invalid' ||
      acquired.selection.request.from !== origins[parameter]
    ) {
      diagnostics.push(diagnostic('ERR_INVALID_RESOLUTION_CONTEXT', path, true))
    } else if (selectionProblem(acquired.selection, context.deployment, parameter)) {
      // A USER selection missing a member of its protocol (BP-CONNECTION-003).
      diagnostics.push(diagnostic('ERR_CONNECTION_INCOMPATIBLE', path, true))
    } else {
      const identity = acquired.selection.credential?.identity
      const conflicting = [...selections.values()].some(
        (previous) =>
          identity !== undefined &&
          previous.credential?.identity === identity &&
          (previous.selectionKind === 'MANAGED' || acquired.selection.selectionKind === 'MANAGED'),
      )
      if (conflicting) diagnostics.push(diagnostic('ERR_INVALID_RESOLUTION_CONTEXT', path, true))
      else selections.set(parameter, acquired.selection)
    }
  }
  // The context as a whole, its `deployment` and `parameters` and nothing
  // else, has the evidence schema's shape too. An acquisition it rejects is
  // already reported at its parameter, so only what remains is reported here.
  if (context !== undefined && !diagnostics.length && !evidence.context(context))
    diagnostics.push(diagnostic('ERR_INVALID_RESOLUTION_CONTEXT', '/spec', true))
  for (const [node, n] of Object.entries(record(at(blueprint, 'spec', 'nodes')))) {
    for (const [name, input] of Object.entries(inputsOf(components.get(node)))) {
      if (!isConnectionInput(input)) continue
      const path = `/spec/nodes/${token(node)}/bindings/${token(name)}`
      const selection = selections.get(String(at(n, 'bindings', name, 'parameter')))
      if (!selection) continue
      const protocol = String(at(input, 'connection', 'protocol')) as ConnectionProtocol
      const view = Object.hasOwn(selection.views, protocol) ? selection.views[protocol] : undefined
      const required = at(input, 'connection', 'capabilities') ?? []
      if (
        !view ||
        !Array.isArray(required) ||
        required.some((c) => !(view.capabilities ?? []).includes(c as ConnectionCapability))
      ) {
        diagnostics.push(diagnostic('ERR_CONNECTION_INCOMPATIBLE', path, true))
        continue
      }
      // One value, read a member at a time by the outputs that forward it
      // (component §6.2): the view's members, each absent optional member's
      // default, the credential, and the derived `url` composed from them.
      const { capabilities: _capabilities, ...carried } = view
      const members: Record<string, Json> = {}
      for (const [m, contract] of Object.entries(CONNECTION_PROTOCOL_MEMBERS[protocol] ?? {})) {
        const value = Object.hasOwn(carried, m) ? carried[m] : undefined
        if (value !== undefined) members[m] = value
        else if (contract.default !== undefined) members[m] = contract.default
      }
      const credentialMember = CREDENTIAL_MEMBER[protocol]
      if (selection.credential && credentialMember)
        members[credentialMember] = selection.credential.value
      const definition = PROTOCOL_RECORDS[protocol]
      for (const secret of definition ? secretsOf(definition) : []) {
        const value = selection.credential?.secrets?.[secret.name]
        if (value !== undefined) members[secret.name] = value
      }
      const url = composeConnectionURL(protocol, members)
      if (url !== undefined) members.url = url
      inputs[`${node}:in:${name}`] = {
        value: members as Json,
        sensitive: true,
        identity: selection.identity,
        version: selection.version,
      }
    }
  }
  return { inputs: diagnostics.length || deferred.length ? {} : inputs, diagnostics, deferred }
}

/** The platform implements durable atomic get-or-create and idempotent acquisition. */
export interface ConnectionStore {
  getOrCreate(key: string, create: () => ConnectionSelection): ConnectionSelection
}
export function selectConnection(
  store: ConnectionStore,
  deployment: string,
  parameter: string,
  generation: number,
  acquire: (idempotencyKey: string) => ConnectionSelection,
  authorized: (selection: ConnectionSelection) => boolean,
): ConnectionAcquisition {
  if (!deployment || !parameter || !Number.isSafeInteger(generation) || generation < 0)
    throw new Error('invalid connection operation identity')
  const key = JSON.stringify([deployment, parameter, generation])
  const denied = new Error('connection denied')
  let selection: ConnectionSelection
  try {
    selection = store.getOrCreate(key, () => {
      const selected = acquire(key)
      if (!validSelection(selected, deployment, parameter))
        throw new Error('invalid connection selection')
      if (!authorized(selected)) throw denied
      return selected
    })
  } catch (error) {
    if (error === denied) return { status: 'DENIED' }
    throw error
  }
  if (!validSelection(selection, deployment, parameter))
    throw new Error('invalid persisted connection')
  // Reuse of immutable state is never permission to bypass current revocation.
  if (!authorized(selection)) return { status: 'DENIED' }
  return { status: 'SELECTED', persisted: true, selection }
}
