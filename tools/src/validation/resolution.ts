/**
 * Pure resolution adapter over supplied context. No network, workload execution,
 * persistence backend or production credential generator is provided here.
 */
import { createHash } from 'node:crypto'
import { readBindings } from '../lib/bindings.ts'
import {
  canonicalJson,
  discoverFamilies,
  discoverKinds,
  type Family,
  isObject,
  type Json,
} from '../lib/layout.ts'
import { scanReferences } from '../lib/references.ts'
import { familyBundle } from '../schema/bundle.ts'
import { strictAjv } from '../schema/lint.ts'
import { type ConnectionsContext, parameterSource, resolveConnections } from './connections.ts'
import { type Diagnostic, type Phase, parseDocumentBytes } from './document.ts'
import { at, record, type SemanticContext, semanticReport, token } from './semantic.ts'
import { compileFamily } from './validator.ts'
import { boundedValue, encodeEnvironment, valueFits } from './values.ts'

const addressHost = (hostname: string) =>
  hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname
function validHostname(hostname: string): boolean {
  if (typeof hostname !== 'string' || !hostname || /[\s/@?#\\]/.test(hostname)) return false
  try {
    const url = new URL(`http://${addressHost(hostname)}`)
    return !url.port && !url.username && !url.password
  } catch {
    return false
  }
}
export interface ResolvedValue {
  readonly value: Json
  readonly sensitive: boolean
  readonly identity?: string
  readonly version?: string
}
export interface EndpointAllocation {
  readonly identity: string
  readonly version: string
  readonly privateHostname?: string
  readonly public?: {
    readonly hostname: string
    readonly port?: number
    readonly scheme?: string
    readonly path?: string
  }
}
export interface InstallationContext extends SemanticContext {
  readonly connections?: ConnectionsContext['connections']
  readonly parameters?: Readonly<Record<string, ResolvedValue>>
  /**
   * Organization variables keyed by exact dotted path, as the acquisition
   * boundary read them for the environment the installation deploys into.
   */
  readonly variables?: Readonly<
    Record<string, ResolvedValue & { identity: string; version: string; authorized: boolean }>
  >
  readonly allocations?: Readonly<Record<string, Readonly<Record<string, EndpointAllocation>>>>
  readonly credentials?: Readonly<Record<string, ResolvedValue>>
}
export interface InstallationResult {
  /** Describes pre-start value resolution, never current deployment admission. */
  readonly status: 'VALID' | 'INVALID' | 'INCOMPLETE'
  readonly phase: Phase
  readonly diagnostics: Diagnostic[]
  readonly deferred: { rule: string; path: string; missing: string }[]
  /** Private materialization channel. Never serialize to logs or public plans. */
  readonly inputs: Readonly<Record<string, ResolvedValue>>
  readonly outputs: Readonly<Record<string, ResolvedValue>>
  readonly environment: Readonly<Record<string, Readonly<Record<string, ResolvedValue>>>>
}
export function resolveInstallation(
  document: Json,
  context: InstallationContext,
  families: readonly Family[] = discoverKinds(),
): InstallationResult {
  const blueprint = families.find((f) => f.name === 'blueprint'),
    component = families.find((f) => f.name === 'component')
  if (!boundedValue(document) || !blueprint || !component || !compileFamily(blueprint)(document))
    return {
      status: 'INVALID',
      phase: 'structural',
      diagnostics: [
        {
          code: 'ERR_INVALID_VALUE',
          path: '',
          message: 'invalid blueprint structure',
          phase: 'structural',
        },
      ],
      deferred: [],
      inputs: {},
      outputs: {},
      environment: {},
    }
  const report = semanticReport({ name: 'blueprint' }, document, {
    ...context,
    checkComponent: (bytes) => {
      const parsed = parseDocumentBytes(bytes)
      return 'value' in parsed && Boolean(compileFamily(component)(parsed.value))
    },
  })
  const diagnostics = [...report.diagnostics],
    deferred = [...report.deferred]
  const inputs: Record<string, ResolvedValue> = Object.create(null),
    outputs: Record<string, ResolvedValue> = Object.create(null),
    environment: Record<string, Record<string, ResolvedValue>> = Object.create(null)
  let reached: Phase = 'semantic'
  const result = (): InstallationResult => ({
    status: diagnostics.length ? 'INVALID' : deferred.length ? 'INCOMPLETE' : 'VALID',
    phase: reached,
    diagnostics,
    deferred,
    inputs: diagnostics.length || deferred.length ? {} : inputs,
    outputs: diagnostics.length || deferred.length ? {} : outputs,
    environment: diagnostics.length || deferred.length ? {} : environment,
  })
  if (diagnostics.length || deferred.length) return result()
  reached = 'resolution'
  const nodes = record(at(document, 'spec', 'components')),
    parameters = record(at(document, 'spec', 'parameters'))
  const parameterSensitivity = new Set<string>()
  for (const [node, n] of Object.entries(nodes))
    for (const [name, b] of Object.entries(record(at(n, 'bindings'))))
      if (
        typeof at(b, 'parameter') === 'string' &&
        at(report.components.get(node), 'spec', 'contract', 'inputs', name, 'sensitive') === true
      )
        parameterSensitivity.add(String(at(b, 'parameter')))
  const connectionResult = resolveConnections(document, report.components, context.connections)
  diagnostics.push(...connectionResult.diagnostics)
  deferred.push(...connectionResult.deferred)
  const active = new Set<string>(),
    done = new Set<string>()
  const fail = (code: string, path: string, stage: NonNullable<Diagnostic['stage']> = 'values') =>
    diagnostics.push({ code, path, message: code, phase: 'resolution', stage })
  const missing = (path: string, what: string) =>
    deferred.push({ rule: 'BP-RESOLVE-001', path, missing: what })
  for (const name of Object.keys(context.parameters ?? {}))
    if (!Object.hasOwn(parameters, name))
      fail('ERR_UNKNOWN_PARAMETER', '/spec/parameters', 'parameters')
    else if (
      at(parameters[name], 'generator') !== undefined ||
      at(parameters[name], 'from') !== undefined
    )
      // BP-PARAM-004 and BP-PARAM-009: generated values, variables and connections are
      // never submitted. A connection is replaced whole through acquisition instead.
      fail('ERR_PARAMETER_NOT_SUBMITTABLE', '/spec/parameters/' + token(name), 'parameters')
  if (context.allocations !== undefined && !isObject(context.allocations as unknown as Json)) {
    fail('ERR_INVALID_RESOLUTION_CONTEXT', '/spec/components', 'allocation')
    return result()
  }
  // Reject redundant derived fields: allocation has one authority for each fact.
  for (const [node, endpoints] of Object.entries(context.allocations ?? {})) {
    if (!Object.hasOwn(nodes, node) || !isObject(endpoints as unknown as Json)) {
      fail('ERR_INVALID_RESOLUTION_CONTEXT', '/spec/components', 'allocation')
      continue
    }
    for (const [name, allocation] of Object.entries(endpoints)) {
      if (
        !isObject(allocation as unknown as Json) ||
        (allocation.public !== undefined && !isObject(allocation.public as unknown as Json))
      ) {
        fail(
          'ERR_INVALID_RESOLUTION_CONTEXT',
          `/spec/components/${token(node)}/componentRef`,
          'allocation',
        )
        continue
      }
      const declared = at(report.components.get(node), 'spec', 'workload', 'endpoints', name)
      const pub = allocation.public
      if (
        !declared ||
        typeof allocation.identity !== 'string' ||
        !allocation.identity ||
        typeof allocation.version !== 'string' ||
        !allocation.version ||
        Object.keys(allocation).some(
          (key) => !['identity', 'version', 'privateHostname', 'public'].includes(key),
        ) ||
        (allocation.privateHostname !== undefined && !validHostname(allocation.privateHostname)) ||
        (pub &&
          (!validHostname(pub.hostname) ||
            Object.keys(pub).some((key) => !['hostname', 'port', 'scheme', 'path'].includes(key)) ||
            (pub.port !== undefined &&
              (!Number.isInteger(pub.port) || pub.port < 1 || pub.port > 65535)) ||
            (pub.scheme !== undefined && !['http', 'https', 'ws', 'wss'].includes(pub.scheme)) ||
            (pub.path !== undefined &&
              (typeof pub.path !== 'string' ||
                !pub.path.startsWith('/') ||
                /[?#\\\s]/.test(pub.path))) ||
            at(nodes[node], 'exposure', name) !== 'PUBLIC'))
      )
        fail(
          'ERR_INVALID_RESOLUTION_CONTEXT',
          Object.hasOwn(nodes, node)
            ? `/spec/components/${token(node)}/componentRef`
            : '/spec/components',
          'allocation',
        )
    }
  }
  if (diagnostics.length || deferred.length) return result()
  // BP-PARAM-009: a variable is acquired once per parameter, however many
  // bindings name it, and its failures anchor at that parameter's `from`.
  const variables = new Map<string, ResolvedValue>()
  for (const [name, p] of Object.entries(parameters)) {
    const source = parameterSource(p)
    // A submitted value was already rejected with ERR_PARAMETER_NOT_SUBMITTABLE.
    if (source?.namespace !== 'variables' || Object.hasOwn(context.parameters ?? {}, name)) continue
    const path = '/spec/parameters/' + token(name) + '/from',
      variable =
        context.variables && Object.hasOwn(context.variables, source.key)
          ? context.variables[source.key]
          : undefined
    if (!variable) deferred.push({ rule: 'BP-PARAM-009', path, missing: `variable:${source.key}` })
    else if (variable.authorized !== true) fail('ERR_VARIABLE_NOT_AUTHORIZED', path, 'parameters')
    else if (!variable.identity || !variable.version)
      fail('ERR_INVALID_RESOLUTION_CONTEXT', path, 'parameters')
    else
      variables.set(name, {
        value: variable.value,
        sensitive: variable.sensitive,
        identity: variable.identity,
        version: variable.version,
      })
  }
  function endpoint(
    node: string,
    name: string,
    property: string,
    path: string,
  ): ResolvedValue | undefined {
    const allocation = context.allocations?.[node]?.[name]
    const port = at(
      report.components.get(node),
      'spec',
      'workload',
      'endpoints',
      name,
      'targetPort',
    )
    let value: Json | undefined
    if (property === 'privatePort') value = port
    else if (property === 'privateHostname') value = allocation?.privateHostname
    else if (property === 'privateAddress' && allocation?.privateHostname)
      value = `${addressHost(allocation.privateHostname)}:${port}`
    else if (property === 'publicHostname') value = allocation?.public?.hostname
    else if (property === 'publicPort') value = allocation?.public?.port
    else if (property === 'publicAddress' && allocation?.public?.port)
      value = `${addressHost(allocation.public.hostname)}:${allocation.public.port}`
    else if (property === 'publicURL' && allocation?.public?.scheme) {
      const p = allocation.public
      value = `${p.scheme}://${addressHost(p.hostname)}${p.port === undefined ? '' : ':' + p.port}${(p.path ?? '').replace(/\/+$/, '')}`
    }
    if (value === undefined) {
      missing(path, `allocation:${node}:${name}:${property}`)
      return
    }
    return { value, sensitive: false }
  }
  function output(node: string, name: string): ResolvedValue | undefined {
    const id = `${node}:out:${name}`,
      path = `/spec/components/${token(node)}/componentRef`
    const diagnosticStart = diagnostics.length
    if (done.has(id)) return outputs[id]
    if (active.has(id)) {
      fail('ERR_VALUE_CYCLE', path)
      return
    }
    active.add(id)
    const definition = record(at(report.components.get(node), 'spec', 'contract', 'outputs', name)),
      s = record(definition.from)
    let value: ResolvedValue | undefined
    if (Object.hasOwn(s, 'value')) value = { value: s.value!, sensitive: false }
    if (typeof s.input === 'string') {
      value = input(node, String(s.input))
      if (!value && !diagnostics.length && !deferred.length)
        fail('ERR_UNSATISFIED_REQUIRED_INPUT', path)
    }
    if (typeof s.endpoint === 'string') value = endpoint(node, s.endpoint, String(s.property), path)
    if (typeof s.template === 'string') {
      const text = String(s.template),
        scan = scanReferences(text, ['self'])
      let atIndex = 0,
        rendered = '',
        complete = true
      for (const ref of scan.references) {
        rendered += text.slice(atIndex, ref.offset).replaceAll('$${{', '${{')
        // Component §6.2: a self path is `endpoints.<endpoint>.<property>`.
        const part = endpoint(node, ref.path[1]!, ref.path[2]!, path)
        if (!part) {
          complete = false
          break
        }
        rendered += encodeEnvironment(part.value)
        atIndex = ref.offset + ref.raw.length
      }
      if (complete)
        value = {
          value: rendered + text.slice(atIndex).replaceAll('$${{', '${{'),
          sensitive: false,
        }
    }
    if (value && (typeof value.sensitive !== 'boolean' || !boundedValue(value.value))) {
      fail('ERR_INVALID_RESOLUTION_CONTEXT', path)
      value = undefined
    }
    if (value) {
      value = { ...value, sensitive: value.sensitive || definition.sensitive === true }
      if (!valueFits(definition.schema!, value.value)) fail('ERR_VALUE_CONSTRAINT', path)
      else outputs[id] = value
    }
    for (let i = diagnosticStart; i < diagnostics.length; i++) {
      const d = diagnostics[i]!
      if (d.path === path)
        diagnostics[i] = {
          ...d,
          related: [
            {
              artifact: String(at(nodes[node], 'componentRef')),
              path: `/spec/contract/outputs/${token(name)}`,
            },
          ],
        }
    }
    active.delete(id)
    done.add(id)
    return outputs[id]
  }
  function input(node: string, name: string): ResolvedValue | undefined {
    const id = `${node}:in:${name}`,
      path = Object.hasOwn(record(at(nodes[node], 'bindings')), name)
        ? `/spec/components/${token(node)}/bindings/${token(name)}`
        : `/spec/components/${token(node)}/componentRef`
    if (done.has(id)) return inputs[id]
    if (active.has(id)) {
      fail('ERR_VALUE_CYCLE', path)
      return
    }
    active.add(id)
    const definition = record(at(report.components.get(node), 'spec', 'contract', 'inputs', name)),
      s = record(at(nodes[node], 'bindings', name))
    let value: ResolvedValue | undefined = connectionResult.inputs[id]
    if (value) {
      /* The grouped connection owns this input. */
    } else if (!Object.keys(s).length) {
      if (Object.hasOwn(definition, 'default'))
        value = { value: definition.default!, sensitive: false }
      else if (definition.required !== false) fail('ERR_UNSATISFIED_REQUIRED_INPUT', path)
    } else if (Object.hasOwn(s, 'value')) value = { value: s.value!, sensitive: false }
    else if (typeof s.node === 'string') value = output(s.node, String(s.output))
    else if (typeof s.parameter === 'string') {
      const key = s.parameter,
        p = record(parameters[key]),
        source = parameterSource(p),
        submitted =
          context.parameters && Object.hasOwn(context.parameters, key)
            ? context.parameters[key]
            : undefined
      if (p.generator) {
        // A submitted value was already rejected with ERR_PARAMETER_NOT_SUBMITTABLE.
        value =
          context.credentials && Object.hasOwn(context.credentials, key)
            ? context.credentials[key]
            : undefined
        if (value) value = { ...value, sensitive: true }
        else if (submitted === undefined) missing(path, `credential:${key}`)
      } else if (source?.namespace === 'variables') {
        // Reported once for the parameter above; a binding only takes the value.
        value = variables.get(key)
      } else {
        value = submitted
        if (!value && Object.hasOwn(p, 'default')) value = { value: p.default!, sensitive: false }
        if (!value) fail('ERR_MISSING_PARAMETER_VALUE', path)
      }
    }
    if (value && (typeof value.sensitive !== 'boolean' || !boundedValue(value.value))) {
      fail('ERR_INVALID_RESOLUTION_CONTEXT', path)
      value = undefined
    }
    if (value) {
      value = {
        ...value,
        sensitive:
          value.sensitive ||
          definition.sensitive === true ||
          (typeof s.parameter === 'string' && parameterSensitivity.has(s.parameter)),
      }
      if (!valueFits(definition.schema!, value.value)) fail('ERR_VALUE_CONSTRAINT', path)
      else inputs[id] = value
    }
    active.delete(id)
    done.add(id)
    return inputs[id]
  }
  // Dependencies are evaluated first, so forwarding chains never grow the call stack.
  for (const id of report.valueOrder ?? []) {
    const [node, direction, name] = id.split(':') as [string, string, string]
    if (direction === 'in') input(node, name)
    else output(node, name)
  }
  for (const node of Object.keys(nodes).sort()) {
    environment[node] = Object.create(null)
    for (const name of Object.keys(
      record(at(report.components.get(node), 'spec', 'contract', 'inputs')),
    ).sort()) {
      const value = input(node, name),
        target = at(
          report.components.get(node),
          'spec',
          'contract',
          'inputs',
          name,
          'target',
          'envVarKey',
        )
      if (value && typeof target === 'string') {
        try {
          environment[node]![target] = { ...value, value: encodeEnvironment(value.value) }
        } catch {
          fail(
            'ERR_ENV_ENCODING',
            Object.hasOwn(record(at(nodes[node], 'bindings')), name)
              ? `/spec/components/${token(node)}/bindings/${token(name)}`
              : `/spec/components/${token(node)}/componentRef`,
            'environment',
          )
        }
      }
    }
    for (const [key, value] of Object.entries(
      record(at(report.components.get(node), 'spec', 'workload', 'envVars')),
    )) {
      try {
        environment[node]![key] = { value: encodeEnvironment(value), sensitive: false }
      } catch {
        fail('ERR_ENV_ENCODING', `/spec/components/${token(node)}`, 'environment')
      }
    }
    for (const name of Object.keys(
      record(at(report.components.get(node), 'spec', 'contract', 'outputs')),
    ).sort())
      output(node, name)
  }
  return result()
}

/** Safe public view: no plaintext or content hash of a sensitive value. */
export function inspectValue(value: ResolvedValue): Json {
  return value.sensitive
    ? { sensitive: true, redacted: true }
    : { sensitive: false, value: value.value }
}
export interface CredentialStore {
  /** Atomic, durable get-or-create. Must persist before returning to materialization. */
  getOrCreate(key: string, create: () => ResolvedValue): ResolvedValue
}
export function credential(
  store: CredentialStore,
  installation: string,
  parameter: string,
  rotation: number,
  create: () => ResolvedValue,
): ResolvedValue {
  if (!Number.isSafeInteger(rotation) || rotation < 0)
    throw new Error('invalid rotation generation')
  const key = JSON.stringify([installation, parameter, rotation])
  const result = store.getOrCreate(key, () => ({ ...create(), sensitive: true }))
  return { ...result, sensitive: true }
}
export interface ResolutionRecord {
  readonly version: 1
  readonly blueprintDigest: string
  readonly installationSnapshot: { readonly identity: string; readonly version: string }
  readonly specifications: Readonly<Record<string, string>>
  readonly credentials: Readonly<Record<string, { identity: string; rotation: number }>>
  readonly components: Readonly<
    Record<
      string,
      {
        identity: string
        revision: number
        digest: string
        source: 'EXTERNAL' | 'IMAGE' | 'GIT'
        imageDigest?: string
        gitCommit?: string
        compute?: { identity: string; version: string }
        volumes: Json
        exposure: Json
      }
    >
  >
  readonly variables: Readonly<Record<string, { identity: string; version: string }>>
}
/** Private, immutable platform state. Version changes whenever any selected fact changes. */
export interface InstallationSnapshot {
  readonly formatVersion: 1
  readonly identity: string
  readonly version: string
  readonly parameters: NonNullable<InstallationContext['parameters']>
  readonly variables: NonNullable<InstallationContext['variables']>
  readonly credentials: Readonly<
    Record<string, ResolvedValue & { identity: string; rotation: number }>
  >
  readonly allocations: NonNullable<InstallationContext['allocations']>
  readonly connections?: ConnectionsContext['connections']
}
export interface RecordContext extends SemanticContext {
  readonly snapshot: InstallationSnapshot
  /** Exact release dependency manifests acquired with the pinned specifications. */
  readonly specificationDependencies: Readonly<Record<string, Readonly<Record<string, string>>>>
}
/** A generated record contains identities, never resolved input/output values. */
export function resolutionRecord(
  blueprint: Uint8Array,
  specifications: Record<string, string>,
  components: ResolutionRecord['components'],
  variables: ResolutionRecord['variables'],
  credentials: ResolutionRecord['credentials'],
  context: RecordContext,
): ResolutionRecord {
  const parsed = parseDocumentBytes(blueprint)
  const family = discoverKinds().find((f) => f.name === 'blueprint')!
  if ('errors' in parsed || !compileFamily(family)(parsed.value))
    throw new Error('invalid blueprint')
  const snapshot = context?.snapshot
  if (
    !snapshot ||
    snapshot.formatVersion !== 1 ||
    !snapshot.identity ||
    !snapshot.version ||
    !snapshot.parameters ||
    !snapshot.variables ||
    !snapshot.credentials ||
    !snapshot.allocations
  )
    throw new Error('missing immutable installation snapshot')
  const report = semanticReport({ name: 'blueprint' }, parsed.value, context)
  if (report.diagnostics.length || report.deferred.length) throw new Error('unresolved blueprint')
  const nodes = record(at(parsed.value, 'spec', 'components'))
  const equal = (a: unknown, b: unknown) => canonicalJson(a as Json) === canonicalJson(b as Json)
  const sameKeys = (a: object, b: object) => equal(Object.keys(a).sort(), Object.keys(b).sort())
  if (!sameKeys(nodes, components)) throw new Error('component node set mismatch')
  const expectedVariables = new Set<string>(),
    expectedCredentials = new Set<string>()
  for (const [node, authored] of Object.entries(nodes)) {
    const c = components[node]!,
      contract = report.components.get(node)!
    const source = record(at(contract, 'spec', 'workload', 'source'))
    const kind =
      at(contract, 'spec', 'type') === 'EXTERNAL'
        ? 'EXTERNAL'
        : typeof source.image === 'string'
          ? 'IMAGE'
          : 'GIT'
    if (
      c.identity !== at(authored, 'componentRef') ||
      c.revision !== at(contract, 'metadata', 'revision') ||
      c.digest !== report.componentDigests.get(node) ||
      c.source !== kind ||
      !equal(c.volumes, at(authored, 'volumes') ?? {}) ||
      !equal(c.exposure, at(authored, 'exposure') ?? {}) ||
      (kind !== 'EXTERNAL' && c.compute?.identity !== at(authored, 'compute', 'profile'))
    )
      throw new Error('component record disagrees with blueprint')
    if (
      kind === 'IMAGE' &&
      typeof source.image === 'string' &&
      source.image.includes('@sha256:') &&
      c.imageDigest !== source.image.slice(source.image.indexOf('@') + 1)
    )
      throw new Error('image digest mismatch')
    if (
      kind === 'GIT' &&
      typeof at(source, 'git', 'ref', 'commit') === 'string' &&
      c.gitCommit !== at(source, 'git', 'ref', 'commit')
    )
      throw new Error('git commit mismatch')
    for (const endpoint of Object.keys(record(at(contract, 'spec', 'workload', 'endpoints'))))
      if (
        !snapshot.allocations[node]?.[endpoint]?.identity ||
        !snapshot.allocations[node]?.[endpoint]?.version
      )
        throw new Error('missing endpoint allocation snapshot')
    for (const binding of Object.values(record(at(authored, 'bindings')))) {
      const name = at(binding, 'parameter')
      if (typeof name !== 'string') continue
      const parameter = at(parsed.value, 'spec', 'parameters', name),
        source = parameterSource(parameter)
      if (source?.namespace === 'variables') expectedVariables.add(source.key)
      if (at(parameter, 'generator') !== undefined) expectedCredentials.add(name)
    }
  }
  if (
    !equal([...expectedVariables].sort(), Object.keys(variables).sort()) ||
    !equal([...expectedVariables].sort(), Object.keys(snapshot.variables).sort()) ||
    !equal([...expectedCredentials].sort(), Object.keys(credentials).sort()) ||
    !equal([...expectedCredentials].sort(), Object.keys(snapshot.credentials).sort())
  )
    throw new Error('selected source set mismatch')
  for (const [key, selected] of Object.entries(variables))
    if (
      selected.identity !== snapshot.variables[key]?.identity ||
      selected.version !== snapshot.variables[key]?.version
    )
      throw new Error('variable snapshot mismatch')
  for (const [key, selected] of Object.entries(credentials))
    if (
      selected.identity !== snapshot.credentials[key]?.identity ||
      selected.rotation !== snapshot.credentials[key]?.rotation
    )
      throw new Error('credential snapshot mismatch')
  if (
    !context.specificationDependencies ||
    !sameKeys(specifications, context.specificationDependencies)
  )
    throw new Error('missing specification dependency manifests')
  const availableFamilies = discoverFamilies(),
    needed = new Set<string>()
  const visit = (name: string) => {
    if (needed.has(name)) return
    needed.add(name)
    const selected = availableFamilies.find(
      (f) => f.name === name && f.major === 'v' + specifications[name]?.split('.')[0],
    )
    if (!selected) throw new Error('unsupported specification edition')
    const declared = readBindings(selected)?.dependencies ?? []
    const manifest = context.specificationDependencies[name]
    if (!manifest || !equal(Object.keys(manifest).sort(), declared.map((d) => d.family).sort()))
      throw new Error('specification manifest omits normative dependencies')
    for (const dependency of declared) {
      const version = manifest[dependency.family]
      if (
        specifications[dependency.family] !== version ||
        dependency.line !== 'v' + version?.split('.')[0]
      )
        throw new Error('inconsistent specification dependency editions')
      visit(dependency.family)
    }
  }
  visit('blueprint')
  if (!equal([...needed].sort(), Object.keys(specifications).sort()))
    throw new Error('unexpected specification edition')
  if (
    resolveInstallation(parsed.value, {
      ...context,
      ...snapshot,
      connections: snapshot.connections,
    }).status !== 'VALID'
  )
    throw new Error('snapshot cannot reproduce the resolution')
  const digest = /^[0-9a-f]{64}$/
  for (const c of Object.values(components)) {
    if (
      !digest.test(c.digest) ||
      !Number.isSafeInteger(c.revision) ||
      c.revision < 1 ||
      !c.identity
    )
      throw new Error('unresolved component')
    if (c.imageDigest !== undefined && !/^sha256:[0-9a-f]{64}$/.test(c.imageDigest))
      throw new Error('unresolved image')
    if (c.compute && (!c.compute.identity || !c.compute.version))
      throw new Error('unresolved compute')
  }
  if (
    !Object.keys(specifications).length ||
    Object.values(specifications).some((v) => !/^\d+\.\d+\.\d+$/.test(v))
  )
    throw new Error('unresolved specification')
  if (Object.values(variables).some((v) => !v.identity || !v.version))
    throw new Error('unresolved variable')
  // Explicit projection prevents unknown context fields (including plaintext) escaping.
  const projected = Object.fromEntries(
    Object.entries(components).map(([name, c]) => [
      name,
      {
        identity: c.identity,
        revision: c.revision,
        digest: c.digest,
        source: c.source,
        ...(c.imageDigest ? { imageDigest: c.imageDigest } : {}),
        ...(c.gitCommit ? { gitCommit: c.gitCommit } : {}),
        ...(c.compute
          ? { compute: { identity: c.compute.identity, version: c.compute.version } }
          : {}),
        volumes: c.volumes,
        exposure: c.exposure,
      },
    ]),
  )
  const generated: ResolutionRecord = {
    version: 1,
    installationSnapshot: { identity: snapshot.identity, version: snapshot.version },
    blueprintDigest: createHash('sha256').update(blueprint).digest('hex'),
    specifications: { ...specifications },
    components: projected,
    variables: Object.fromEntries(
      Object.entries(variables).map(([name, c]) => [
        name,
        { identity: c.identity, version: c.version },
      ]),
    ),
    credentials: Object.fromEntries(
      Object.entries(credentials).map(([name, c]) => [
        name,
        { identity: c.identity, rotation: c.rotation },
      ]),
    ),
  }
  const schema = JSON.parse(familyBundle(family)!)
  const validate = strictAjv().compile({
    ...schema.$defs.BlueprintResolutionRecord,
    $defs: schema.$defs,
  })
  if (!validate(generated)) throw new Error('incomplete or invalid resolution record')
  return generated
}
export function sameResolution(a: ResolutionRecord, b: ResolutionRecord): boolean {
  return canonicalJson(a as unknown as Json) === canonicalJson(b as unknown as Json)
}
