/**
 * Pure resolution adapter over supplied context. No network, workload execution,
 * persistence backend or production credential generator is provided here.
 */
import { createHash } from 'node:crypto'
import { canonicalJson, discoverKinds, type Family, type Json } from '../lib/layout.ts'
import { scanReferences } from '../lib/references.ts'
import { familyBundle } from '../schema/bundle.ts'
import { strictAjv } from '../schema/lint.ts'
import { type Diagnostic, parseDocumentBytes } from './document.ts'
import { at, record, type SemanticContext, semanticReport, token } from './semantic.ts'
import { compileFamily } from './validator.ts'
import { boundedValue, encodeEnvironment, valueFits } from './values.ts'

export interface ResolvedValue {
  readonly value: Json
  readonly sensitive: boolean
  readonly identity?: string
  readonly version?: string
}
export interface InstallationContext extends SemanticContext {
  readonly parameters?: Readonly<Record<string, ResolvedValue>>
  /** Exact dotted config paths, already authorized by the acquisition boundary. */
  readonly configuration?: Readonly<
    Record<string, ResolvedValue & { identity: string; version: string; authorized: boolean }>
  >
  readonly addresses?: Readonly<
    Record<string, Readonly<Record<string, Readonly<Record<string, Json>>>>>
  >
  readonly credentials?: Readonly<Record<string, ResolvedValue>>
}
export interface InstallationResult {
  readonly status: 'VALID' | 'INVALID' | 'INCOMPLETE'
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
      diagnostics: [
        { code: 'ERR_INVALID_VALUE', path: '', message: 'invalid blueprint structure' },
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
  const result = (): InstallationResult => ({
    status: diagnostics.length ? 'INVALID' : deferred.length ? 'INCOMPLETE' : 'VALID',
    diagnostics,
    deferred,
    inputs: diagnostics.length || deferred.length ? {} : inputs,
    outputs: diagnostics.length || deferred.length ? {} : outputs,
    environment: diagnostics.length || deferred.length ? {} : environment,
  })
  if (diagnostics.length || deferred.length) return result()
  const nodes = record(at(document, 'spec', 'components')),
    parameters = record(at(document, 'spec', 'parameters'))
  const parameterSensitivity = new Set<string>()
  for (const [node, n] of Object.entries(nodes))
    for (const [name, b] of Object.entries(record(at(n, 'bindings'))))
      if (
        at(b, 'type') === 'PARAMETER' &&
        at(report.components.get(node), 'spec', 'contract', 'inputs', name, 'sensitive') === true
      )
        parameterSensitivity.add(String(at(b, 'parameter')))
  const active = new Set<string>(),
    done = new Set<string>()
  const fail = (code: string, path: string) => diagnostics.push({ code, path, message: code })
  const missing = (path: string, what: string) =>
    deferred.push({ rule: 'BP-RESOLVE-001', path, missing: what })
  function endpoint(
    node: string,
    name: string,
    property: string,
    path: string,
  ): ResolvedValue | undefined {
    const addressNode =
      context.addresses && Object.hasOwn(context.addresses, node)
        ? context.addresses[node]
        : undefined
    const address = addressNode && Object.hasOwn(addressNode, name) ? addressNode[name] : undefined
    const value = address && Object.hasOwn(address, property) ? address[property] : undefined
    if (value === undefined) {
      missing(path, `address:${node}:${name}:${property}`)
      return
    }
    return { value, sensitive: false }
  }
  function output(node: string, name: string): ResolvedValue | undefined {
    const id = `${node}:out:${name}`,
      path = `/spec/components/${token(node)}/outputs/${token(name)}`
    if (done.has(id)) return outputs[id]
    if (active.has(id)) {
      fail('ERR_VALUE_CYCLE', path)
      return
    }
    active.add(id)
    const definition = record(at(report.components.get(node), 'spec', 'contract', 'outputs', name)),
      s = record(definition.source)
    let value: ResolvedValue | undefined
    if (s.type === 'LITERAL') value = { value: s.value!, sensitive: false }
    if (s.type === 'INPUT') {
      value = input(node, String(s.input))
      if (!value && !diagnostics.length && !deferred.length)
        fail('ERR_UNSATISFIED_REQUIRED_INPUT', path)
    }
    if (s.type === 'ENDPOINT') value = endpoint(node, String(s.endpoint), String(s.property), path)
    if (s.type === 'TEMPLATE') {
      const text = String(s.template),
        scan = scanReferences(text, ['self'])
      let atIndex = 0,
        rendered = '',
        complete = true
      for (const ref of scan.references) {
        rendered += text.slice(atIndex, ref.offset).replaceAll('$${{', '${{')
        const part = endpoint(node, ref.path[1]!, ref.path[0]!, path)
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
    active.delete(id)
    done.add(id)
    return outputs[id]
  }
  function input(node: string, name: string): ResolvedValue | undefined {
    const id = `${node}:in:${name}`,
      path = `/spec/components/${token(node)}/bindings/${token(name)}`
    if (done.has(id)) return inputs[id]
    if (active.has(id)) {
      fail('ERR_VALUE_CYCLE', path)
      return
    }
    active.add(id)
    const definition = record(at(report.components.get(node), 'spec', 'contract', 'inputs', name)),
      s = record(at(nodes[node], 'bindings', name))
    let value: ResolvedValue | undefined
    if (!s.type) {
      if (Object.hasOwn(definition, 'default'))
        value = { value: definition.default!, sensitive: false }
      else if (definition.required !== false) fail('ERR_UNSATISFIED_REQUIRED_INPUT', path)
    } else if (s.type === 'LITERAL') value = { value: s.value!, sensitive: false }
    else if (s.type === 'OUTPUT') value = output(String(s.node), String(s.output))
    else if (s.type === 'PARAMETER') {
      const key = String(s.parameter),
        p = record(parameters[key])
      if (p.generator) {
        if (
          (context.parameters && Object.hasOwn(context.parameters, key)
            ? context.parameters[key]
            : undefined) !== undefined
        )
          fail('ERR_GENERATED_OVERRIDE', path)
        else {
          value =
            context.credentials && Object.hasOwn(context.credentials, key)
              ? context.credentials[key]
              : undefined
          if (value) value = { ...value, sensitive: true }
          else missing(path, `credential:${key}`)
        }
      } else {
        value =
          context.parameters && Object.hasOwn(context.parameters, key)
            ? context.parameters[key]
            : undefined
        if (!value && Object.hasOwn(p, 'default')) value = { value: p.default!, sensitive: false }
        if (!value) fail('ERR_MISSING_PARAMETER_VALUE', path)
      }
    } else if (s.type === 'CONFIG_REF') {
      const ref = scanReferences(String(s.source), ['config']).references[0]
      const key = ref?.path.join('.') ?? '',
        config =
          context.configuration && Object.hasOwn(context.configuration, key)
            ? context.configuration[key]
            : undefined
      if (!config) missing(path, `config:${key}`)
      else if (config.authorized !== true) fail('ERR_CONFIG_NOT_AUTHORIZED', path)
      else if (!config.identity || !config.version) fail('ERR_INVALID_RESOLUTION_CONTEXT', path)
      else
        value = {
          value: config.value,
          sensitive: config.sensitive,
          identity: config.identity,
          version: config.version,
        }
    }
    if (value) {
      value = {
        ...value,
        sensitive:
          value.sensitive ||
          definition.sensitive === true ||
          (s.type === 'PARAMETER' && parameterSensitivity.has(String(s.parameter))),
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
          fail('ERR_ENV_ENCODING', `/spec/components/${token(node)}/bindings/${token(name)}`)
        }
      }
    }
    for (const constant of Array.isArray(
      at(report.components.get(node), 'spec', 'workload', 'envVars'),
    )
      ? (at(report.components.get(node), 'spec', 'workload', 'envVars') as Json[])
      : []) {
      const key = String(at(constant, 'key')),
        value = at(constant, 'value', 'value')!
      try {
        environment[node]![key] = { value: encodeEnvironment(value), sensitive: false }
      } catch {
        fail('ERR_ENV_ENCODING', `/spec/components/${token(node)}`)
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
  readonly configuration: Readonly<Record<string, { identity: string; version: string }>>
}
/** A generated record contains identities, never resolved input/output values. */
export function resolutionRecord(
  blueprint: Uint8Array,
  specifications: Record<string, string>,
  components: ResolutionRecord['components'],
  configuration: ResolutionRecord['configuration'],
  credentials: ResolutionRecord['credentials'] = {},
): ResolutionRecord {
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
  if (Object.values(configuration).some((v) => !v.identity || !v.version))
    throw new Error('unresolved configuration')
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
    blueprintDigest: createHash('sha256').update(blueprint).digest('hex'),
    specifications: { ...specifications },
    components: projected,
    configuration: Object.fromEntries(
      Object.entries(configuration).map(([name, c]) => [
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
  const family = discoverKinds().find((f) => f.name === 'blueprint')!
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
