/** Offline adapter for atomic connection selections. Production acquisition is downstream. */
import { isObject, type Json } from '../lib/layout.ts'
import { scanReferences } from '../lib/references.ts'
import type { Diagnostic } from './document.ts'
import { boundedValue } from './values.ts'

export type ConnectionProtocol = 'OPENAI_CHAT_COMPLETIONS' | 'ANTHROPIC_MESSAGES'
export type ConnectionCapability = 'STREAMING' | 'TOOL_CALLS'
export interface ConnectionSelection {
  readonly identity: string
  readonly version: string
  readonly installation: string
  readonly parameter: string
  readonly source: {
    readonly reference: string
    readonly identity: string
    readonly version: string
  }
  readonly kind: 'MANAGED' | 'USER'
  readonly costOwner: string
  readonly credential: {
    readonly identity: string
    readonly rotation: number
    readonly value: string
    readonly permittedBaseURLs: readonly string[]
  }
  readonly views: Partial<
    Record<
      ConnectionProtocol,
      {
        readonly baseURL: string
        readonly model: string
        readonly capabilities: readonly ConnectionCapability[]
      }
    >
  >
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
    readonly installation: string
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
const protocols = ['OPENAI_CHAT_COMPLETIONS', 'ANTHROPIC_MESSAGES']
const capabilities = ['STREAMING', 'TOOL_CALLS']
function diagnostic(code: string, path: string, resolution = false): Diagnostic {
  return {
    code,
    path,
    message: code,
    phase: resolution ? 'resolution' : 'semantic',
    ...(resolution ? { stage: 'connections' } : {}),
  }
}
/** The members a connection input holds, fixed by its protocol (component §6.4). */
export const CONNECTION_MEMBERS = ['baseURL', 'apiKey', 'model'] as const
export type ConnectionMember = (typeof CONNECTION_MEMBERS)[number]
/** Component §6.1: the key present says an input is a connection input. */
export const isConnectionInput = (input: Json | undefined): boolean =>
  Object.hasOwn(record(input), 'connection')
/** The value contract of one connection member: a string, and only the credential is secret. */
export const connectionMemberContract = (member: string): Record<string, Json> => ({
  schema: { type: 'string' },
  sensitive: member === 'apiKey',
})
const inputsOf = (component: Json | undefined) =>
  record(at(component, 'spec', 'contract', 'inputs'))
/** The namespaces a parameter's `from` admits (blueprint BP-REF-001). */
export const PARAMETER_SOURCE_NAMESPACES = ['variables', 'connections'] as const
export type ParameterSourceNamespace = (typeof PARAMETER_SOURCE_NAMESPACES)[number]
/**
 * BP-REF-001: a parameter's `from` is one whole reference, and its namespace
 * says what it names. Undefined when the parameter has no `from` or the
 * reference is not one whole admitted reference.
 */
export function parameterSource(
  parameter: Json | undefined,
): { namespace: ParameterSourceNamespace; key: string; reference: string } | undefined {
  const from = at(parameter, 'from')
  if (typeof from !== 'string') return
  const scan = scanReferences(from, PARAMETER_SOURCE_NAMESPACES)
  const [reference] = scan.references
  if (scan.failures.length || scan.references.length !== 1 || reference?.raw !== from) return
  return {
    namespace: reference.namespace as ParameterSourceNamespace,
    key: reference.path.join('.'),
    reference: from,
  }
}
export function parameterSourceDiagnostics(
  name: string,
  parameter: Json | undefined,
): Diagnostic[] {
  const from = at(parameter, 'from')
  if (typeof from !== 'string') return []
  const path = '/spec/parameters/' + token(name) + '/from'
  const scan = scanReferences(from, PARAMETER_SOURCE_NAMESPACES)
  // Core's codes (CORE-REF-001..003) name what is wrong with a reference itself.
  if (scan.failures.length)
    return scan.failures.map((failure) =>
      diagnostic(
        failure.kind === 'malformed'
          ? 'ERR_MALFORMED_REFERENCE'
          : failure.kind === 'unknown-namespace'
            ? 'ERR_UNKNOWN_REFERENCE_NAMESPACE'
            : 'ERR_REFERENCE_NOT_IN_SCOPE',
        path,
      ),
    )
  return parameterSource(parameter) ? [] : [diagnostic('ERR_INVALID_PARAMETER_SOURCE', path)]
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
  for (const [node, n] of Object.entries(record(at(blueprint, 'spec', 'components')))) {
    const inputs = inputsOf(components.get(node))
    for (const [name, binding] of Object.entries(record(at(n, 'bindings')))) {
      if (!Object.hasOwn(inputs, name)) continue
      const parameter = at(binding, 'parameter'),
        path = '/spec/components/' + token(node) + '/bindings/' + token(name)
      // An undeclared parameter is ERR_UNKNOWN_PARAMETER, and nothing more.
      if (typeof parameter === 'string' && !Object.hasOwn(parameters, parameter)) continue
      const connection =
        typeof parameter === 'string' &&
        parameterSource(parameters[parameter])?.namespace === 'connections'
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
function validSelection(
  value: unknown,
  installation: string,
  parameter: string,
): value is ConnectionSelection {
  if (!boundedValue(value as Json)) return false
  const s = record(value),
    credential = record(s.credential),
    views = record(s.views)
  const text = (v: unknown) => typeof v === 'string' && v.length > 0
  if (
    !text(s.identity) ||
    !text(s.version) ||
    s.installation !== installation ||
    s.parameter !== parameter ||
    !text(at(s.source, 'reference')) ||
    !text(at(s.source, 'identity')) ||
    !text(at(s.source, 'version')) ||
    !text(s.costOwner) ||
    !['MANAGED', 'USER'].includes(String(s.kind)) ||
    !text(credential.identity) ||
    !text(credential.value) ||
    !Number.isSafeInteger(credential.rotation) ||
    Number(credential.rotation) < 0 ||
    !Array.isArray(credential.permittedBaseURLs) ||
    !Object.keys(views).length
  )
    return false
  return Object.entries(views).every(([protocol, view]) => {
    const v = record(view)
    if (
      !protocols.includes(protocol) ||
      !text(v.baseURL) ||
      !text(v.model) ||
      !Array.isArray(v.capabilities) ||
      !v.capabilities.every((c) => capabilities.includes(String(c))) ||
      new Set(v.capabilities).size !== v.capabilities.length ||
      !(credential.permittedBaseURLs as Json[]).includes(v.baseURL!)
    )
      return false
    try {
      const url = new URL(String(v.baseURL))
      return url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.search
    } catch {
      return false
    }
  })
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
  const sources = Object.fromEntries(
    Object.entries(record(at(blueprint, 'spec', 'parameters'))).flatMap(([name, p]) => {
      const source = parameterSource(p)
      return source?.namespace === 'connections' ? [[name, source.reference]] : []
    }),
  )
  for (const parameter of Object.keys(record(context?.parameters)))
    if (!Object.hasOwn(sources, parameter))
      diagnostics.push(diagnostic('ERR_INVALID_RESOLUTION_CONTEXT', '/spec', true))
  for (const parameter of Object.keys(sources)) {
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
      const codes = {
        NOT_FOUND: 'ERR_CONNECTION_NOT_FOUND',
        DENIED: 'ERR_CONNECTION_DENIED',
        INCOMPATIBLE: 'ERR_CONNECTION_INCOMPATIBLE',
      }
      diagnostics.push(
        diagnostic(codes[acquired.status] ?? 'ERR_INVALID_RESOLUTION_CONTEXT', path, true),
      )
    } else if (
      !context?.installation ||
      acquired.persisted !== true ||
      !validSelection(acquired.selection, context.installation, parameter) ||
      acquired.selection.source.reference !== sources[parameter]
    ) {
      diagnostics.push(diagnostic('ERR_INVALID_RESOLUTION_CONTEXT', path, true))
    } else {
      const conflicting = [...selections.values()].some(
        (previous) =>
          previous.credential.identity === acquired.selection.credential.identity &&
          (previous.kind === 'MANAGED' || acquired.selection.kind === 'MANAGED'),
      )
      if (conflicting) diagnostics.push(diagnostic('ERR_INVALID_RESOLUTION_CONTEXT', path, true))
      else selections.set(parameter, acquired.selection)
    }
  }
  for (const [node, n] of Object.entries(record(at(blueprint, 'spec', 'components')))) {
    for (const [name, input] of Object.entries(inputsOf(components.get(node)))) {
      if (!isConnectionInput(input)) continue
      const path = '/spec/components/' + token(node) + '/bindings/' + token(name)
      const selection = selections.get(String(at(n, 'bindings', name, 'parameter')))
      if (!selection) continue
      const view =
        selection.views[String(at(input, 'connection', 'protocol')) as ConnectionProtocol]
      const required = at(input, 'connection', 'capabilities') ?? []
      if (
        !view ||
        !Array.isArray(required) ||
        required.some((c) => !view.capabilities.includes(c as ConnectionCapability))
      ) {
        diagnostics.push(diagnostic('ERR_CONNECTION_INCOMPATIBLE', path, true))
        continue
      }
      // One value, read a member at a time by the outputs that forward it (component §6.2).
      inputs[`${node}:in:${name}`] = {
        value: { baseURL: view.baseURL, apiKey: selection.credential.value, model: view.model },
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
  installation: string,
  parameter: string,
  generation: number,
  acquire: (idempotencyKey: string) => ConnectionSelection,
  authorized: (selection: ConnectionSelection) => boolean,
): ConnectionAcquisition {
  if (!installation || !parameter || !Number.isSafeInteger(generation) || generation < 0)
    throw new Error('invalid connection operation identity')
  const key = JSON.stringify([installation, parameter, generation])
  const denied = new Error('connection denied')
  let selection: ConnectionSelection
  try {
    selection = store.getOrCreate(key, () => {
      const selected = acquire(key)
      if (!validSelection(selected, installation, parameter))
        throw new Error('invalid connection selection')
      if (!authorized(selected)) throw denied
      return selected
    })
  } catch (error) {
    if (error === denied) return { status: 'DENIED' }
    throw error
  }
  if (!validSelection(selection, installation, parameter))
    throw new Error('invalid persisted connection')
  // Reuse of immutable state is never permission to bypass current revocation.
  if (!authorized(selection)) return { status: 'DENIED' }
  return { status: 'SELECTED', persisted: true, selection }
}
