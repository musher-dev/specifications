/** Offline adapter for atomic connection selections. Production acquisition is downstream. */
import { isObject, type Json } from '../lib/layout.ts'
import { scanReferences } from '../lib/references.ts'
import type { Diagnostic } from './document.ts'
import { boundedValue, valueFits } from './values.ts'

export type ConnectionProtocol = 'OPENAI_CHAT_COMPLETIONS' | 'ANTHROPIC_MESSAGES'
export type ConnectionCapability = 'STREAMING' | 'TOOL_CALLS'
export interface ConnectionSelection {
  readonly identity: string
  readonly version: string
  readonly installation: string
  readonly slot: string
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
    readonly permittedBaseUrls: readonly string[]
  }
  readonly views: Partial<
    Record<
      ConnectionProtocol,
      {
        readonly baseUrl: string
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
    readonly slots: Readonly<Record<string, ConnectionAcquisition>>
  }
}
const record = (v: unknown): Record<string, Json> =>
  isObject(v as Json) ? (v as Record<string, Json>) : {}
function at(v: unknown, ...path: string[]): Json | undefined {
  for (const p of path) v = record(v)[p]
  return v as Json | undefined
}
const token = (v: string) => v.replaceAll('~', '~0').replaceAll('/', '~1')
const requirements = (c: Json | undefined) =>
  record(at(c, 'spec', 'contract', 'connectionRequirements'))
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
export function connectionOwnedInputs(component: Json | undefined): Set<string> {
  return new Set(
    Object.values(requirements(component)).flatMap((r) =>
      Object.values(record(at(r, 'inputs'))).map(String),
    ),
  )
}
export function connectionRequirementDiagnostics(component: Json): Diagnostic[] {
  const out: Diagnostic[] = [],
    seen = new Set<string>()
  for (const [name, requirement] of Object.entries(requirements(component))) {
    const path = '/spec/contract/connectionRequirements/' + token(name)
    for (const [role, key] of Object.entries(record(at(requirement, 'inputs')))) {
      const input = at(component, 'spec', 'contract', 'inputs', String(key))
      if (
        !input ||
        seen.has(String(key)) ||
        at(input, 'schema', 'type') !== 'string' ||
        at(input, 'default') !== undefined ||
        at(input, 'required') === false ||
        (role === 'apiKey' && at(input, 'sensitive') !== true)
      )
        out.push(diagnostic('ERR_INVALID_CONNECTION_REQUIREMENT', path + '/inputs/' + token(role)))
      seen.add(String(key))
    }
  }
  return out
}
export function connectionBindingDiagnostics(
  blueprint: Json,
  components: ReadonlyMap<string, Json>,
): Diagnostic[] {
  const out: Diagnostic[] = [],
    sources = record(at(blueprint, 'spec', 'connectionSources'))
  const used = new Set<string>()
  for (const [slot, source] of Object.entries(sources)) {
    const scan = scanReferences(String(at(source, 'source')), ['config'])
    if (
      scan.failures.length ||
      scan.references.length !== 1 ||
      scan.references[0]?.raw !== at(source, 'source')
    )
      out.push(
        diagnostic(
          'ERR_INVALID_CONFIG_REFERENCE',
          '/spec/connectionSources/' + token(slot) + '/source',
        ),
      )
  }
  for (const [node, n] of Object.entries(record(at(blueprint, 'spec', 'components')))) {
    const component = components.get(node),
      componentRequirements = requirements(component)
    const base = '/spec/components/' + token(node),
      bindings = record(at(n, 'connectionBindings'))
    for (const [name, binding] of Object.entries(bindings)) {
      const slot = String(at(binding, 'source'))
      used.add(slot)
      if (
        (component && !Object.hasOwn(componentRequirements, name)) ||
        !Object.hasOwn(sources, slot)
      )
        out.push(
          diagnostic('ERR_INVALID_CONNECTION_BINDING', base + '/connectionBindings/' + token(name)),
        )
    }
    if (!component) continue
    for (const name of Object.keys(componentRequirements))
      if (!Object.hasOwn(bindings, name))
        out.push(diagnostic('ERR_INVALID_CONNECTION_BINDING', base + '/componentRef'))
    for (const key of connectionOwnedInputs(component))
      if (Object.hasOwn(record(at(n, 'bindings')), key))
        out.push(diagnostic('ERR_INVALID_CONNECTION_BINDING', base + '/bindings/' + token(key)))
  }
  for (const slot of Object.keys(sources))
    if (!used.has(slot))
      out.push(
        diagnostic('ERR_INVALID_CONNECTION_BINDING', '/spec/connectionSources/' + token(slot)),
      )
  return out
}
function validSelection(
  value: unknown,
  installation: string,
  slot: string,
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
    s.slot !== slot ||
    !text(at(s.source, 'reference')) ||
    !text(at(s.source, 'identity')) ||
    !text(at(s.source, 'version')) ||
    !text(s.costOwner) ||
    !['MANAGED', 'USER'].includes(String(s.kind)) ||
    !text(credential.identity) ||
    !text(credential.value) ||
    !Number.isSafeInteger(credential.rotation) ||
    Number(credential.rotation) < 0 ||
    !Array.isArray(credential.permittedBaseUrls) ||
    !Object.keys(views).length
  )
    return false
  return Object.entries(views).every(([protocol, view]) => {
    const v = record(view)
    if (
      !protocols.includes(protocol) ||
      !text(v.baseUrl) ||
      !text(v.model) ||
      !Array.isArray(v.capabilities) ||
      !v.capabilities.every((c) => capabilities.includes(String(c))) ||
      new Set(v.capabilities).size !== v.capabilities.length ||
      !(credential.permittedBaseUrls as Json[]).includes(v.baseUrl!)
    )
      return false
    try {
      const url = new URL(String(v.baseUrl))
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
  const sources = record(at(blueprint, 'spec', 'connectionSources'))
  for (const slot of Object.keys(record(context?.slots)))
    if (!Object.hasOwn(sources, slot))
      diagnostics.push(diagnostic('ERR_INVALID_RESOLUTION_CONTEXT', '/spec', true))
  for (const slot of Object.keys(sources)) {
    const path = '/spec/connectionSources/' + token(slot)
    const acquired =
      context?.slots && Object.hasOwn(context.slots, slot) ? context.slots[slot] : undefined
    if (!acquired || acquired.status === 'NOT_ACQUIRED') {
      deferred.push({ rule: 'BP-CONNECTION-002', path, missing: 'connection:' + slot })
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
      !validSelection(acquired.selection, context.installation, slot) ||
      acquired.selection.source.reference !== at(sources[slot], 'source')
    ) {
      diagnostics.push(diagnostic('ERR_INVALID_RESOLUTION_CONTEXT', path, true))
    } else {
      const conflicting = [...selections.values()].some(
        (previous) =>
          previous.credential.identity === acquired.selection.credential.identity &&
          (previous.kind === 'MANAGED' || acquired.selection.kind === 'MANAGED'),
      )
      if (conflicting) diagnostics.push(diagnostic('ERR_INVALID_RESOLUTION_CONTEXT', path, true))
      else selections.set(slot, acquired.selection)
    }
  }
  for (const [node, n] of Object.entries(record(at(blueprint, 'spec', 'components')))) {
    const component = components.get(node)
    for (const [name, requirement] of Object.entries(requirements(component))) {
      const path = '/spec/components/' + token(node) + '/connectionBindings/' + token(name)
      const slot = String(at(n, 'connectionBindings', name, 'source')),
        selection = selections.get(slot)
      if (!selection) continue
      const view = selection.views[String(at(requirement, 'protocol')) as ConnectionProtocol]
      const required = at(requirement, 'capabilities') ?? []
      if (
        !view ||
        !Array.isArray(required) ||
        required.some((c) => !view.capabilities.includes(c as ConnectionCapability))
      ) {
        diagnostics.push(diagnostic('ERR_CONNECTION_INCOMPATIBLE', path, true))
        continue
      }
      const values = {
        baseUrl: view.baseUrl,
        model: view.model,
        apiKey: selection.credential.value,
      }
      for (const [role, key] of Object.entries(record(at(requirement, 'inputs')))) {
        const input = at(component, 'spec', 'contract', 'inputs', String(key)),
          value = values[role as keyof typeof values]
        if (value === undefined || !valueFits(at(input, 'schema')!, value)) {
          diagnostics.push({
            ...diagnostic('ERR_VALUE_CONSTRAINT', path, true),
            related: [
              {
                artifact: String(at(n, 'componentRef')),
                path: '/spec/contract/inputs/' + token(String(key)),
              },
            ],
          })
        } else
          inputs[`${node}:in:${key}`] = {
            value,
            sensitive: role === 'apiKey' || at(input, 'sensitive') === true,
            identity: selection.identity,
            version: selection.version,
          }
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
  slot: string,
  generation: number,
  acquire: (idempotencyKey: string) => ConnectionSelection,
  authorized: (selection: ConnectionSelection) => boolean,
): ConnectionAcquisition {
  if (!installation || !slot || !Number.isSafeInteger(generation) || generation < 0)
    throw new Error('invalid connection operation identity')
  const key = JSON.stringify([installation, slot, generation])
  const denied = new Error('connection denied')
  let selection: ConnectionSelection
  try {
    selection = store.getOrCreate(key, () => {
      const selected = acquire(key)
      if (!validSelection(selected, installation, slot))
        throw new Error('invalid connection selection')
      if (!authorized(selected)) throw denied
      return selected
    })
  } catch (error) {
    if (error === denied) return { status: 'DENIED' }
    throw error
  }
  if (!validSelection(selection, installation, slot))
    throw new Error('invalid persisted connection')
  // Reuse of immutable state is never permission to bypass current revocation.
  if (!authorized(selection)) return { status: 'DENIED' }
  return { status: 'SELECTED', persisted: true, selection }
}
