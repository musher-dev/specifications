import { afterEach, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverKinds, type Json } from '../lib/layout.ts'
import { MAX_DEPTH, parseDocument, parseDocumentBytes } from './document.ts'
import {
  credential,
  type InstallationContext,
  inspectValue,
  type RecordContext,
  type ResolvedValue,
  resolutionRecord,
  resolveInstallation,
  sameResolution,
} from './resolution.ts'
import { validateDocument } from './validator.ts'
import { encodeEnvironment, valueFits } from './values.ts'

const families = discoverKinds()
const componentFamily = families.find((f) => f.name === 'component')!
const blueprintFamily = families.find((f) => f.name === 'blueprint')!
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
const component = (inputs: object = {}, outputs: object = {}) => ({
  specVersion: 'v1',
  kind: 'COMPONENT',
  metadata: { revision: 1 },
  spec: {
    workload: { type: 'WORKER', source: { type: 'IMAGE', ref: 'example/worker:1' } },
    contract: { inputs, outputs },
  },
})
const input = (schema: object = { type: 'string' }, extra: object = {}) => ({
  description: 'A value',
  schema,
  target: { envVarKey: 'VALUE' },
  ...extra,
})
function item(
  components: Record<string, object>,
  bindings: Record<string, object>,
  parameters: object = {},
) {
  const root = mkdtempSync(join(tmpdir(), 'musher-foundation-'))
  roots.push(root)
  const itemRoot = join(root, 'app')
  mkdirSync(itemRoot)
  const nodes = Object.fromEntries(
    Object.entries(components).map(([name, c]) => {
      writeFileSync(join(itemRoot, name + '.yaml'), JSON.stringify(c))
      return [
        name,
        {
          componentRef: './' + name + '.yaml',
          size: 'general.standard.small',
          bindings: bindings[name] ?? {},
        },
      ]
    }),
  )
  const document = {
    specVersion: 'v1',
    kind: 'BLUEPRINT',
    metadata: { slug: 'app', revision: 1 },
    spec: { components: nodes, parameters },
  }
  const documentPath = join(itemRoot, 'blueprint.yaml')
  writeFileSync(documentPath, JSON.stringify(document))
  const context = {
    itemRoot,
    documentPath,
    checkComponent: (bytes: Uint8Array) =>
      validateDocument(componentFamily, bytes).status === 'VALID',
  }
  return { document: document as unknown as Json, context }
}
test('parser rejects complex keys, malformed bytes, unsafe numbers and deep representation', () => {
  for (const source of ['? [a, b]\n: c\n', '? {a: b}\n: c\n'])
    expect(parseDocument(source)).toMatchObject({ errors: [{ code: 'ERR_NON_STRING_KEY' }] })
  expect(parseDocumentBytes(new Uint8Array([0xc3, 0x28]))).toMatchObject({
    errors: [{ code: 'ERR_INVALID_UTF8' }],
  })
  expect(parseDocument('x: 9007199254740993')).toMatchObject({
    errors: [{ code: 'ERR_INVALID_NUMBER' }],
  })
  expect(parseDocument('x: .nan')).toMatchObject({ errors: [{ code: 'ERR_INVALID_NUMBER' }] })
  expect(
    'errors' in parseDocument('['.repeat(MAX_DEPTH + 1) + '0' + ']'.repeat(MAX_DEPTH + 1)),
  ).toBe(true)
  expect(() => parseDocument('x: &a [*a]')).not.toThrow()
})
test('logical values validate without coercion and encode separately', () => {
  const schema = { type: 'integer', minimum: 1, maximum: 65535 }
  expect(valueFits(schema, 5432)).toBe(true)
  expect(valueFits(schema, '5432')).toBe(false)
  expect(valueFits(schema, 65536)).toBe(false)
  expect(
    valueFits({ type: 'array', items: { type: 'string', enum: ['a', 'b'] }, uniqueItems: true }, [
      'a',
      'a',
    ]),
  ).toBe(false)
  expect(encodeEnvironment(['a', 'b'])).toBe('["a","b"]')
  expect(encodeEnvironment(false)).toBe('false')
  expect(() => encodeEnvironment('a\0b')).toThrow()
})
test('definition defaults and secrets are validated', () => {
  const c = component({ value: input({ type: 'number' }, { default: 'banana' }) })
  expect(validateDocument(componentFamily, JSON.stringify(c)).diagnostics).toContainEqual(
    expect.objectContaining({ code: 'ERR_VALUE_CONSTRAINT' }),
  )
  const secret = component({
    value: input({ type: 'string' }, { sensitive: true, default: 'synthetic' }),
  })
  expect(validateDocument(componentFamily, JSON.stringify(secret)).diagnostics).toContainEqual(
    expect.objectContaining({ code: 'ERR_SECRET_LITERAL' }),
  )
})
test('unrelated nodes never inherit existing parameter bindings', () => {
  const c = component({ apiKey: input({ type: 'string' }, { required: false }) })
  const first = item(
    { web: c },
    { web: { apiKey: { type: 'PARAMETER', parameter: 'key' } } },
    { key: {} },
  )
  const result = resolveInstallation(first.document, {
    ...first.context,
    parameters: { key: { value: 'synthetic', sensitive: true } },
  })
  expect(result.status).toBe('VALID')
  const second = item(
    { web: c, other: c },
    { web: { apiKey: { type: 'PARAMETER', parameter: 'key' } } },
    { key: {} },
  )
  const added = resolveInstallation(second.document, {
    ...second.context,
    parameters: { key: { value: 'synthetic', sensitive: true } },
  })
  expect(added.status).toBe('VALID')
  expect(added.inputs['other:in:apiKey']).toBeUndefined()
  expect(added.inputs['web:in:apiKey']).toEqual(result.inputs['web:in:apiKey'])
})
test('configuration source is authorized, typed and sensitive end to end', () => {
  const setup = item(
    { web: component({ url: input() }) },
    { web: { url: { type: 'CONFIG_REF', source: '${{ config.llm.baseUrl }}' } } },
  )
  const config = {
    value: 'https://synthetic.invalid',
    sensitive: true,
    identity: 'config-1',
    version: '7',
    authorized: true,
  }
  const resolved = resolveInstallation(setup.document, {
    ...setup.context,
    configuration: { 'llm.baseUrl': config },
  })
  expect(resolved.status).toBe('VALID')
  expect(resolved.inputs['web:in:url']?.sensitive).toBe(true)
  expect(inspectValue(resolved.inputs['web:in:url']!)).toEqual({ sensitive: true, redacted: true })
  expect(resolveInstallation(setup.document, setup.context).status).toBe('INCOMPLETE')
  expect(
    resolveInstallation(setup.document, {
      ...setup.context,
      configuration: { 'llm.baseUrl': { ...config, authorized: false } },
    }).diagnostics,
  ).toContainEqual(expect.objectContaining({ code: 'ERR_CONFIG_NOT_AUTHORIZED' }))
  expect(
    resolveInstallation(setup.document, {
      ...setup.context,
      configuration: { 'llm.baseUrl': { ...config, value: 123 } },
    }).diagnostics,
  ).toContainEqual(expect.objectContaining({ code: 'ERR_VALUE_CONSTRAINT' }))
})
test('forwarding retains sensitivity and rejects value cycles', () => {
  const c = component(
    { value: input() },
    {
      value: {
        description: 'Forward',
        schema: { type: 'string' },
        source: { type: 'INPUT', input: 'value' },
      },
    },
  )
  const setup = item(
    { web: c, other: c },
    {
      web: { value: { type: 'PARAMETER', parameter: 'key' } },
      other: { value: { type: 'OUTPUT', node: 'web', output: 'value' } },
    },
    { key: {} },
  )
  const result = resolveInstallation(setup.document, {
    ...setup.context,
    parameters: { key: { value: 'synthetic', sensitive: true } },
  })
  expect(result.status).toBe('VALID')
  expect(result.outputs['other:out:value']?.sensitive).toBe(true)
  const cycle = item(
    { web: c, other: c },
    {
      web: { value: { type: 'OUTPUT', node: 'other', output: 'value' } },
      other: { value: { type: 'OUTPUT', node: 'web', output: 'value' } },
    },
  )
  expect(resolveInstallation(cycle.document, cycle.context).diagnostics).toContainEqual(
    expect.objectContaining({ code: 'ERR_VALUE_CYCLE' }),
  )
})
test('published dependencies are incomplete without context and invalid with a bad digest', () => {
  const ref = '12345678-1234-1234-1234-123456789abc'
  const d = {
    specVersion: 'v1',
    kind: 'BLUEPRINT',
    metadata: { slug: 'app', revision: 1 },
    spec: {
      components: { web: { componentRef: ref, revision: 1, size: 'general.standard.small' } },
    },
  }
  expect(validateDocument(blueprintFamily, JSON.stringify(d)).status).toBe('INCOMPLETE')
  expect(
    validateDocument(blueprintFamily, JSON.stringify(d), { validationProfile: 'structural' })
      .status,
  ).toBe('VALID')
  const source = JSON.stringify(component())
  const invalid = validateDocument(blueprintFamily, JSON.stringify(d), {
    contracts: { [ref + '@1']: { source, digest: 'wrong' } },
  })
  expect(invalid.status).toBe('INVALID')
  const root = mkdtempSync(join(tmpdir(), 'musher-foundation-'))
  roots.push(root)
  const itemRoot = join(root, 'app')
  mkdirSync(itemRoot)
  expect(
    validateDocument(blueprintFamily, JSON.stringify(d), {
      itemRoot,
      contracts: {
        [ref + '@1']: { source, digest: createHash('sha256').update(source).digest('hex') },
      },
    }).status,
  ).toBe('VALID')
})
test('credentials persist across retries and rotate only by explicit generation', () => {
  const entries = new Map<string, ResolvedValue>()
  let calls = 0
  const store = {
    getOrCreate(key: string, create: () => ResolvedValue) {
      if (!entries.has(key)) entries.set(key, create())
      return entries.get(key)!
    },
  }
  const create = () => ({ value: 'synthetic-' + ++calls, sensitive: false })
  expect(credential(store, 'install', 'key', 0, create)).toEqual(
    credential(store, 'install', 'key', 0, create),
  )
  expect(calls).toBe(1)
  expect(credential(store, 'install', 'key', 1, create).value).toBe('synthetic-2')
})
function recordSetup() {
  const c = component({ value: input() })
  const setup = item(
    { web: c },
    { web: { value: { type: 'PARAMETER', parameter: 'level' } } },
    { level: { default: 'info' } },
  )
  const components = {
    web: {
      source: 'IMAGE' as const,
      compute: { identity: 'general.standard.small', version: '1' },
      identity: './web.yaml',
      revision: 1,
      digest: createHash('sha256').update(JSON.stringify(c)).digest('hex'),
      imageDigest: 'sha256:' + 'b'.repeat(64),
      volumes: {},
      exposure: {},
    },
  }
  const context: RecordContext = {
    ...setup.context,
    snapshot: {
      formatVersion: 1,
      identity: 'installation-snapshot',
      version: '1',
      parameters: { level: { value: 'debug', sensitive: true } },
      configuration: {},
      credentials: {},
      allocations: {},
    },
    specificationDependencies: {
      core: {},
      component: { core: '1.0.0' },
      blueprint: { core: '1.0.0', component: '1.0.0' },
    },
  }
  const versions = { core: '1.0.0', component: '1.0.0', blueprint: '1.0.0' }
  const bytes = Buffer.from(JSON.stringify(setup.document))
  return { setup, components, context, versions, bytes }
}
test('resolution record pins immutable snapshot without exposing submitted values', () => {
  const { bytes, versions, components, context } = recordSetup()
  const first = resolutionRecord(bytes, versions, components, {}, {}, context)
  expect(first.installationSnapshot).toEqual({ identity: 'installation-snapshot', version: '1' })
  expect(JSON.stringify(first)).not.toContain('debug')
  const second = resolutionRecord(
    bytes,
    versions,
    components,
    {},
    {},
    {
      ...context,
      snapshot: {
        ...context.snapshot,
        version: '2',
        parameters: { level: { value: 'info', sensitive: true } },
      },
    },
  )
  expect(sameResolution(first, second)).toBe(false)
  expect(
    sameResolution(first, resolutionRecord(bytes, versions, components, {}, {}, context)),
  ).toBe(true)
})
test('record rejects arbitrary bytes, mismatched nodes, components and dependency editions', () => {
  const { bytes, versions, components, context } = recordSetup()
  expect(() =>
    resolutionRecord(Buffer.from('blueprint'), versions, components, {}, {}, context),
  ).toThrow()
  expect(() => resolutionRecord(bytes, versions, {}, {}, {}, context)).toThrow()
  for (const mismatch of [
    { identity: 'other' },
    { revision: 2 },
    { digest: 'a'.repeat(64) },
    { source: 'EXTERNAL' as const },
    { exposure: { web: 'PUBLIC' } },
  ])
    expect(() =>
      resolutionRecord(
        bytes,
        versions,
        { web: { ...components.web, ...mismatch } },
        {},
        {},
        context,
      ),
    ).toThrow()
  expect(() =>
    resolutionRecord(bytes, { ...versions, core: '1.1.0' }, components, {}, {}, context),
  ).toThrow()
  expect(() =>
    resolutionRecord(
      bytes,
      versions,
      components,
      {},
      {},
      { ...context, specificationDependencies: { core: {}, component: {}, blueprint: {} } },
    ),
  ).toThrow()
})
test('reference-free templates validate known values and authored secrets', () => {
  const output = {
    description: 'constant template',
    schema: { type: 'string', minLength: 8 },
    sensitive: true,
    source: { type: 'TEMPLATE', template: 'short' },
  }
  const result = validateDocument(componentFamily, JSON.stringify(component({}, { value: output })))
  expect(result.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: 'ERR_VALUE_CONSTRAINT',
        path: '/spec/contract/outputs/value/source/template',
      }),
      expect.objectContaining({
        code: 'ERR_SECRET_LITERAL',
        path: '/spec/contract/outputs/value/source/template',
      }),
    ]),
  )
})
test('unknown submitted parameter keys fail before defaults can hide misspellings', () => {
  const { setup } = recordSetup()
  const result = resolveInstallation(setup.document, {
    ...setup.context,
    parameters: { verbosity: { value: 'debug', sensitive: false } },
  })
  expect(result).toMatchObject({
    status: 'INVALID',
    inputs: {},
    diagnostics: [
      expect.objectContaining({
        code: 'ERR_UNKNOWN_PARAMETER',
        phase: 'resolution',
        stage: 'parameters',
      }),
    ],
  })
})
test('whole-value object and array enum members cannot acquire scalar enum labels', () => {
  for (const [schema, label] of [
    [
      { type: 'object', properties: {}, additionalProperties: false, enum: [{}] },
      '[object Object]',
    ],
    [{ type: 'array', items: { type: 'string' }, enum: [['a']] }, 'a'],
  ] as const) {
    const setup = item(
      { web: component({ value: input(schema) }) },
      { web: { value: { type: 'PARAMETER', parameter: 'p' } } },
      { p: { ui: { label: 'Value', enumLabels: { [label]: 'Invalid label' } } } },
    )
    expect(
      validateDocument(blueprintFamily, JSON.stringify(setup.document), setup.context).diagnostics,
    ).toContainEqual(expect.objectContaining({ code: 'ERR_UNKNOWN_ENUM_MEMBER' }))
  }
})
test('endpoint ports derive from declarations and allocation views cannot disagree', () => {
  const c = component(
    {},
    {
      port: {
        description: 'port',
        schema: { type: 'integer' },
        source: { type: 'ENDPOINT', endpoint: 'web', property: 'privatePort' },
      },
    },
  )
  const service = {
    ...c,
    spec: {
      ...c.spec,
      workload: {
        type: 'SERVICE',
        source: { type: 'IMAGE', ref: 'example/service:1' },
        endpoints: { web: { protocol: 'HTTP', containerPort: 8080 } },
      },
    },
  }
  const setup = item({ web: service }, {})
  expect(resolveInstallation(setup.document, setup.context)).toMatchObject({
    status: 'VALID',
    outputs: { 'web:out:port': { value: 8080 } },
  })
  const invalid = {
    identity: 'allocation',
    version: '1',
    privateHostname: 'web.internal',
    privatePort: 9090,
  }
  expect(
    resolveInstallation(setup.document, {
      ...setup.context,
      allocations: { web: { web: invalid } },
    }),
  ).toMatchObject({
    status: 'INVALID',
    diagnostics: [
      expect.objectContaining({ code: 'ERR_INVALID_RESOLUTION_CONTEXT', stage: 'allocation' }),
    ],
  })
})
test('malformed allocation context returns diagnostics without throwing', () => {
  const { setup } = recordSetup()
  for (const allocations of [
    null,
    [],
    { web: null },
    { web: { web: null } },
    { web: { web: { identity: 'allocation', version: '1', public: null } } },
  ]) {
    expect(
      resolveInstallation(setup.document, {
        ...setup.context,
        allocations: allocations as unknown as InstallationContext['allocations'],
      }).status,
    ).toBe('INVALID')
  }
})

test('dynamic output constraints report actual component location and resolution stage', () => {
  const c = component(
    {},
    {
      hostname: {
        description: 'hostname',
        schema: { type: 'string', minLength: 30 },
        source: { type: 'ENDPOINT', endpoint: 'web', property: 'privateHostname' },
      },
    },
  )
  const service = {
    ...c,
    spec: {
      ...c.spec,
      workload: {
        type: 'SERVICE',
        source: { type: 'IMAGE', ref: 'example/service:1' },
        endpoints: { web: { protocol: 'HTTP', containerPort: 8080 } },
      },
    },
  }
  const setup = item({ web: service }, {})
  expect(
    resolveInstallation(setup.document, {
      ...setup.context,
      allocations: {
        web: { web: { identity: 'allocation', version: '1', privateHostname: 'short.internal' } },
      },
    }).diagnostics,
  ).toContainEqual(
    expect.objectContaining({
      code: 'ERR_VALUE_CONSTRAINT',
      phase: 'resolution',
      stage: 'values',
      path: '/spec/components/web/componentRef',
      related: [{ artifact: './web.yaml', path: '/spec/contract/outputs/hostname' }],
    }),
  )
})

test('deep concrete syntax is rejected before recursive composition, without misreporting UTF-8', () => {
  const source = '['.repeat(10000) + '0' + ']'.repeat(10000)
  expect(parseDocument(source)).toMatchObject({ errors: [{ code: 'ERR_DEPTH_EXCEEDED' }] })
  expect(parseDocumentBytes(Buffer.from(source))).toMatchObject({
    errors: [{ code: 'ERR_DEPTH_EXCEEDED' }],
  })
})
