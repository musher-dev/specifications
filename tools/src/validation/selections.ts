/**
 * Blueprint parameter origins and connection selections (blueprint §5.2, §5.3).
 * An offline adapter over supplied acquisition evidence: production acquisition,
 * provisioning and credential issuance are downstream. NON-NORMATIVE.
 */
import { isObject, type Json } from '../lib/layout.ts'
import { scanReferences } from '../lib/references.ts'
import {
  CONNECTION_PROTOCOL_MEMBERS,
  CONNECTION_URL_MEMBER,
  type ConnectionProtocol,
  composeConnectionURL,
  isConnectionInput,
  LLM_CONNECTION_PROTOCOLS,
} from './connections.ts'
import type { Diagnostic } from './document.ts'
import { boundedValue } from './values.ts'

export type ConnectionCapability = 'STREAMING' | 'TOOL_CALLS'
const CAPABILITIES: readonly string[] = ['STREAMING', 'TOOL_CALLS']
/**
 * Blueprint §5.3: the member a selection's credential supplies to each view of
 * its protocol. Every other member of the protocol is carried by the view.
 */
export const CREDENTIAL_MEMBER: Readonly<Record<ConnectionProtocol, string>> = {
  OPENAI_CHAT_COMPLETIONS: 'apiKey',
  ANTHROPIC_MESSAGES: 'apiKey',
  POSTGRES: 'password',
  REDIS: 'password',
  S3: 'secretAccessKey',
}
/**
 * Blueprint §5.3: the protocols whose credential may be absent. A `REDIS`
 * server that requires no authentication has no credential, and its view then
 * carries no `username`.
 */
const CREDENTIAL_OPTIONAL: ReadonlySet<ConnectionProtocol> = new Set(['REDIS'])
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
  const path = '/spec/parameters/' + token(name) + '/from'
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
        path = '/spec/nodes/' + token(node) + '/bindings/' + token(name)
      // An undeclared parameter is ERR_UNKNOWN_PARAMETER, and nothing more.
      if (typeof parameter === 'string' && !Object.hasOwn(parameters, parameter)) continue
      const connection =
        typeof parameter === 'string' &&
        parameterOrigin(parameters[parameter])?.namespace === 'connections'
      if (isConnectionInput(inputs[name]) !== connection)
        out.push(
          diagnostic(
            'ERR_INVALID_CONNECTION_BINDING',
            typeof parameter === 'string' ? path + '/parameter' : path,
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
/** One member value of the type, range and value set its protocol fixes (component §6.4). */
function memberValueValid(p: ConnectionProtocol, name: string, value: Json | undefined): boolean {
  const contract = CONNECTION_PROTOCOL_MEMBERS[p][name]!
  if (contract.type === 'boolean') return typeof value === 'boolean'
  if (contract.type === 'integer')
    return name === 'port'
      ? Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 65535
      : Number.isSafeInteger(value) && Number(value) >= 0
  if (typeof value !== 'string' || !value) return false
  if (contract.values && !contract.values.includes(value)) return false
  return name !== 'host' || validHost(value)
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
  if (!Object.hasOwn(CONNECTION_PROTOCOL_MEMBERS, protocol) || !isObject(view as Json))
    return 'invalid'
  const p = protocol as ConnectionProtocol,
    v = record(view),
    members = CONNECTION_PROTOCOL_MEMBERS[p],
    carried = Object.keys(members).filter(
      (m) => m !== CREDENTIAL_MEMBER[p] && members[m]!.derived !== true,
    )
  if (Object.keys(v).some((k) => k !== 'capabilities' && !carried.includes(k))) return 'invalid'
  for (const m of carried)
    if (Object.hasOwn(v, m) && !memberValueValid(p, m, v[m])) return 'invalid'
  if (LLM_CONNECTION_PROTOCOLS.has(p)) {
    const caps = v.capabilities
    if (
      !Array.isArray(caps) ||
      !caps.every((c) => CAPABILITIES.includes(String(c))) ||
      new Set(caps).size !== caps.length
    )
      return 'invalid'
  } else if (Object.hasOwn(v, 'capabilities')) return 'invalid'
  // Every HTTP protocol's URL member is HTTPS and one of the credential's permitted base URLs.
  const base = CONNECTION_URL_MEMBER[p]
  if (base && Object.hasOwn(v, base)) {
    const permitted = credential?.permittedBaseURLs
    if (
      !absoluteURL(v[base], ['https:']) ||
      !Array.isArray(permitted) ||
      !permitted.includes(v[base]!)
    )
      return 'invalid'
  }
  // A REDIS server without authentication has no user to name.
  if (!credential && Object.hasOwn(v, 'username')) return 'invalid'
  const credentialMissing = !credential && !CREDENTIAL_OPTIONAL.has(p)
  if (credentialMissing || carried.some((m) => members[m]!.required && !Object.hasOwn(v, m)))
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
  if (!boundedValue(value as Json)) return 'invalid'
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
    const path = '/spec/parameters/' + token(parameter)
    const acquired =
      context?.parameters && Object.hasOwn(context.parameters, parameter)
        ? context.parameters[parameter]
        : undefined
    if (!acquired || acquired.status === 'NOT_ACQUIRED') {
      deferred.push({ rule: 'BP-CONNECTION-002', path, missing: 'connection:' + parameter })
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
  for (const [node, n] of Object.entries(record(at(blueprint, 'spec', 'nodes')))) {
    for (const [name, input] of Object.entries(inputsOf(components.get(node)))) {
      if (!isConnectionInput(input)) continue
      const path = '/spec/nodes/' + token(node) + '/bindings/' + token(name)
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
      for (const [m, contract] of Object.entries(CONNECTION_PROTOCOL_MEMBERS[protocol]))
        if (Object.hasOwn(carried, m)) members[m] = carried[m]!
        else if (contract.default !== undefined) members[m] = contract.default
      if (selection.credential) members[CREDENTIAL_MEMBER[protocol]] = selection.credential.value
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
