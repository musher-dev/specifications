import { afterEach, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverKinds, type Json } from '../lib/layout.ts'
import { MAX_DEPTH, parseDocument, parseDocumentBytes } from './document.ts'
import {
  credential,
  inspectValue,
  type ResolvedValue,
  resolutionRecord,
  resolveInstallation,
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
    validateDocument(blueprintFamily, JSON.stringify(d), { profile: 'structural' }).status,
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
test('resolution records project identities without secret plaintext', () => {
  const components = {
    web: {
      source: 'IMAGE' as const,
      compute: { identity: 'general.standard.small', version: '1' },
      identity: 'component',
      revision: 1,
      digest: 'a'.repeat(64),
      imageDigest: 'sha256:' + 'b'.repeat(64),
      volumes: {},
      exposure: {},
    },
  }
  const configuration = { llm: { identity: 'config', version: '1', value: 'synthetic-secret' } }
  const record = resolutionRecord(
    Buffer.from('blueprint'),
    { core: '1.0.0', component: '1.0.0', blueprint: '1.0.0' },
    components,
    configuration,
  )
  expect(JSON.stringify(record)).not.toContain('synthetic-secret')
})

test('deep concrete syntax is rejected before recursive composition, without misreporting UTF-8', () => {
  const source = '['.repeat(10000) + '0' + ']'.repeat(10000)
  expect(parseDocument(source)).toMatchObject({ errors: [{ code: 'ERR_DEPTH_EXCEEDED' }] })
  expect(parseDocumentBytes(Buffer.from(source))).toMatchObject({
    errors: [{ code: 'ERR_DEPTH_EXCEEDED' }],
  })
})
