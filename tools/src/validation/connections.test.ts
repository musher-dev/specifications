import { describe, expect, test } from 'bun:test'
import type { Json } from '../lib/layout.ts'
import {
  type ConnectionSelection,
  connectionBindingDiagnostics,
  isConnectionInput,
  parameterSource,
  parameterSourceDiagnostics,
  resolveConnections,
  selectConnection,
} from './connections.ts'

/** An input of the fixture component, or a member of a resolved value. */
function at(value: Json | undefined, key: string): Json | undefined {
  const inputs = (component as any).spec.contract.inputs
  if (value === component) return inputs[key]
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value[key]
    : undefined
}

/** An external node standing for one connection (component §6.4). */
const component: Json = {
  spec: {
    type: 'EXTERNAL',
    contract: {
      inputs: {
        llm: {
          description: 'Language-model connection',
          connection: { protocol: 'OPENAI_CHAT_COMPLETIONS', capabilities: ['STREAMING'] },
        },
        region: { description: 'Region', schema: { type: 'string' } },
      },
    },
  },
}
const blueprint: Json = {
  spec: {
    parameters: {
      primary: { from: '${{ connections.llm.default }}' },
      region: { default: 'eu' },
    },
    components: {
      app: {
        componentRef: 'acme/app',
        bindings: { llm: { parameter: 'primary' }, region: { parameter: 'region' } },
      },
    },
  },
}
const components = new Map([['app', component]])
const selection = (parameter = 'primary'): ConnectionSelection => ({
  identity: 'connection-1',
  version: '1',
  installation: 'install-1',
  parameter,
  source: { reference: '${{ connections.llm.default }}', identity: 'default-policy', version: '3' },
  kind: 'MANAGED',
  costOwner: 'org-1',
  credential: {
    identity: 'credential-1',
    rotation: 0,
    value: 'synthetic-only',
    permittedBaseURLs: ['https://gateway.example/openai/v1'],
  },
  views: {
    OPENAI_CHAT_COMPLETIONS: {
      baseURL: 'https://gateway.example/openai/v1',
      model: 'model-a',
      capabilities: ['STREAMING', 'TOOL_CALLS'],
    },
  },
})
const run = (s = selection()) =>
  resolveConnections(blueprint, components, {
    installation: 'install-1',
    parameters: { primary: { status: 'SELECTED', persisted: true, selection: s } },
  })
describe('atomic named connections', () => {
  test('binds a connection input to a connection parameter and projects one immutable selection', () => {
    expect(isConnectionInput(at(component, 'llm'))).toBe(true)
    expect(isConnectionInput(at(component, 'region'))).toBe(false)
    expect(connectionBindingDiagnostics(blueprint, components)).toEqual([])
    const r = run()
    expect(r.diagnostics).toEqual([])
    expect(r.deferred).toEqual([])
    expect(r.inputs['app:in:llm']).toEqual({
      value: {
        baseURL: 'https://gateway.example/openai/v1',
        apiKey: 'synthetic-only',
        model: 'model-a',
      },
      sensitive: true,
      identity: 'connection-1',
      version: '1',
    })
  })
  test('a connection and an input must agree in kind', () => {
    const b = structuredClone(blueprint) as any
    b.spec.components.app.bindings.llm = { value: 'x' }
    expect(connectionBindingDiagnostics(b, components)).toMatchObject([
      { code: 'ERR_INVALID_CONNECTION_BINDING', path: '/spec/components/app/bindings/llm' },
    ])
    b.spec.components.app.bindings.llm = { parameter: 'region' }
    expect(connectionBindingDiagnostics(b, components)).toMatchObject([
      {
        code: 'ERR_INVALID_CONNECTION_BINDING',
        path: '/spec/components/app/bindings/llm/parameter',
      },
    ])
    b.spec.components.app.bindings = { region: { parameter: 'primary' } }
    expect(connectionBindingDiagnostics(b, components)).toMatchObject([
      {
        code: 'ERR_INVALID_CONNECTION_BINDING',
        path: '/spec/components/app/bindings/region/parameter',
      },
    ])
    // An undeclared parameter is ERR_UNKNOWN_PARAMETER alone.
    b.spec.components.app.bindings = { llm: { parameter: 'missing' } }
    expect(connectionBindingDiagnostics(b, components)).toEqual([])
  })
  test('distinguishes offline context, authoritative absence, denial and incompatibility', () => {
    expect(resolveConnections(blueprint, components, undefined).deferred).toHaveLength(1)
    for (const [status, code] of [
      ['NOT_FOUND', 'ERR_CONNECTION_NOT_FOUND'],
      ['DENIED', 'ERR_CONNECTION_DENIED'],
      ['INCOMPATIBLE', 'ERR_CONNECTION_INCOMPATIBLE'],
    ] as const) {
      const r = resolveConnections(blueprint, components, {
        installation: 'install-1',
        parameters: { primary: { status } },
      })
      expect(r.diagnostics[0]?.code).toBe(code)
      expect(r.inputs).toEqual({})
    }
  })
  test('rejects missing capability and wrong protocol without any projection', () => {
    const s = selection()
    ;(s.views.OPENAI_CHAT_COMPLETIONS as any).capabilities = []
    expect(run(s).diagnostics[0]?.code).toBe('ERR_CONNECTION_INCOMPATIBLE')
    const wrong = selection() as any
    wrong.views = {
      ANTHROPIC_MESSAGES: {
        baseURL: 'https://gateway.example/openai/v1',
        model: 'model-a',
        capabilities: ['STREAMING'],
      },
    }
    expect(run(wrong).inputs).toEqual({})
  })
  test('a destination change cannot keep a scoped managed credential', () => {
    const s = selection()
    ;(s.views.OPENAI_CHAT_COMPLETIONS as any).baseURL = 'https://arbitrary.example/v1'
    expect(run(s).diagnostics[0]?.code).toBe('ERR_INVALID_RESOLUTION_CONTEXT')
    expect(JSON.stringify(run(s))).not.toContain('synthetic-only')
  })
  test('partial replacement, wrong installation or parameter and unpersisted selections fail', () => {
    for (const field of ['credential', 'views', 'source']) {
      const s = selection() as any
      delete s[field]
      expect(run(s).inputs).toEqual({})
    }
    expect(run({ ...selection(), installation: 'clone' }).inputs).toEqual({})
    expect(run(selection('other')).inputs).toEqual({})
    const r = resolveConnections(blueprint, components, {
      installation: 'install-1',
      parameters: {
        primary: { status: 'SELECTED', persisted: false, selection: selection() } as any,
      },
    })
    expect(r.diagnostics[0]?.code).toBe('ERR_INVALID_RESOLUTION_CONTEXT')
  })
  test('two connection parameters with the same protocol remain independent and one failure withholds all values', () => {
    const b = structuredClone(blueprint) as any
    b.spec.parameters.second = { from: '${{ connections.llm.secondary }}' }
    b.spec.components.worker = {
      componentRef: 'acme/app',
      bindings: { llm: { parameter: 'second' } },
    }
    const cs = new Map([...components, ['worker', component]] as [string, Json][])
    const second = selection('second')
    ;(second as any).identity = 'connection-2'
    ;(second as any).credential.identity = 'credential-2'
    ;(second as any).source.reference = '${{ connections.llm.secondary }}'
    ;(second.views.OPENAI_CHAT_COMPLETIONS as any).model = 'model-b'
    const context = {
      installation: 'install-1',
      parameters: {
        primary: { status: 'SELECTED', persisted: true, selection: selection() },
        second: { status: 'SELECTED', persisted: true, selection: second },
      },
    } as const
    const r = resolveConnections(b, cs, context)
    expect(at(r.inputs['app:in:llm']?.value, 'model')).toBe('model-a')
    expect(at(r.inputs['worker:in:llm']?.value, 'model')).toBe('model-b')
    expect(
      resolveConnections(b, cs, {
        ...context,
        parameters: { ...context.parameters, second: { status: 'DENIED' } },
      }).inputs,
    ).toEqual({})
  })
  test('both protocol views can project from one explicitly shared connection', () => {
    const c = structuredClone(component) as any
    c.spec.contract.inputs.llm.connection.protocol = 'ANTHROPIC_MESSAGES'
    const s = selection() as any
    s.credential.permittedBaseURLs.push('https://gateway.example/anthropic')
    s.views.ANTHROPIC_MESSAGES = {
      baseURL: 'https://gateway.example/anthropic',
      model: 'model-a',
      capabilities: ['STREAMING'],
    }
    const r = resolveConnections(blueprint, new Map([['app', c]]), {
      installation: 'install-1',
      parameters: { primary: { status: 'SELECTED', persisted: true, selection: s } },
    })
    expect(at(r.inputs['app:in:llm']?.value, 'baseURL')).toBe('https://gateway.example/anthropic')
  })
})

test('new and persisted connection denial share the same authoritative outcome', () => {
  const persisted = new Map<string, ConnectionSelection>()
  const store = {
    getOrCreate(key: string, create: () => ConnectionSelection) {
      const existing = persisted.get(key)
      if (existing) return existing
      const value = create()
      persisted.set(key, value)
      return value
    },
  }
  expect(
    selectConnection(
      store,
      'install-1',
      'primary',
      0,
      () => selection(),
      () => false,
    ),
  ).toEqual({ status: 'DENIED' })
  expect(persisted.size).toBe(0)
  expect(
    selectConnection(
      store,
      'install-1',
      'primary',
      0,
      () => selection(),
      () => true,
    ).status,
  ).toBe('SELECTED')
  expect(
    selectConnection(
      store,
      'install-1',
      'primary',
      0,
      () => {
        throw new Error('must reuse')
      },
      () => false,
    ),
  ).toEqual({ status: 'DENIED' })
})

test('acquisition interruptions remain exceptions and never claim denial', () => {
  const store = {
    getOrCreate(_key: string, create: () => ConnectionSelection) {
      return create()
    },
  }
  expect(() =>
    selectConnection(
      store,
      'install-1',
      'primary',
      0,
      () => {
        throw new Error('interrupted')
      },
      () => true,
    ),
  ).toThrow('interrupted')
})

test('selected source provenance must match the requested parameter source', () => {
  const original = selection()
  const wrong = {
    ...original,
    source: { ...original.source, reference: '${{ connections.llm.other }}' },
  }
  expect(run(wrong).diagnostics[0]?.code).toBe('ERR_INVALID_RESOLUTION_CONTEXT')
  expect(run(wrong).inputs).toEqual({})
})

test('a managed credential cannot be reused under another connection parameter', () => {
  const b = structuredClone(blueprint) as Record<string, any>
  b.spec.parameters.second = { from: '${{ connections.llm.default }}' }
  b.spec.components.worker = {
    componentRef: 'acme/app',
    bindings: { llm: { parameter: 'second' } },
  }
  const result = resolveConnections(b as Json, new Map([...components, ['worker', component]]), {
    installation: 'install-1',
    parameters: {
      primary: { status: 'SELECTED', persisted: true, selection: selection() },
      second: { status: 'SELECTED', persisted: true, selection: selection('second') },
    },
  })
  expect(result.diagnostics[0]?.code).toBe('ERR_INVALID_RESOLUTION_CONTEXT')
  expect(result.inputs).toEqual({})
  expect(JSON.stringify(result)).not.toContain('synthetic-only')
})

test('a complete user replacement supplies its own endpoint, credential and model', () => {
  const replacement: ConnectionSelection = {
    ...selection(),
    identity: 'user-connection',
    version: '2',
    kind: 'USER',
    costOwner: 'installer',
    credential: {
      identity: 'user-credential',
      rotation: 0,
      value: 'synthetic-user-key',
      permittedBaseURLs: ['https://provider.example/v1'],
    },
    views: {
      OPENAI_CHAT_COMPLETIONS: {
        baseURL: 'https://provider.example/v1',
        model: 'user-model',
        capabilities: ['STREAMING'],
      },
    },
  }
  const result = run(replacement)
  expect(result.diagnostics).toEqual([])
  expect(result.inputs['app:in:llm']?.value).toEqual({
    baseURL: 'https://provider.example/v1',
    apiKey: 'synthetic-user-key',
    model: 'user-model',
  })
})

test('a variables parameter cannot fill a connection input', () => {
  const b = structuredClone(blueprint) as Record<string, any>
  b.spec.parameters.region = { from: '${{ variables.cloud.region }}' }
  b.spec.components.app.bindings.llm = { parameter: 'region' }
  expect(connectionBindingDiagnostics(b as Json, components)).toContainEqual(
    expect.objectContaining({
      code: 'ERR_INVALID_CONNECTION_BINDING',
      path: '/spec/components/app/bindings/llm/parameter',
    }),
  )
})

test('a parameter source is one whole variables or connections reference', () => {
  expect(parameterSource({ from: '${{ variables.cloud.region }}' })).toEqual({
    namespace: 'variables',
    key: 'cloud.region',
    reference: '${{ variables.cloud.region }}',
  })
  expect(parameterSource({ from: '${{ connections.llm.default }}' })?.namespace).toBe('connections')
  for (const [from, code] of [
    ['https://${{ variables.cloud.host }}', 'ERR_INVALID_PARAMETER_SOURCE'],
    ['${{ variables.a }}${{ variables.b }}', 'ERR_INVALID_PARAMETER_SOURCE'],
    ['${{ config.cloud.region }}', 'ERR_UNKNOWN_REFERENCE_NAMESPACE'],
    ['${{ self.endpoints.web.publicURL }}', 'ERR_REFERENCE_NOT_IN_SCOPE'],
    ['${{ variables', 'ERR_MALFORMED_REFERENCE'],
  ] as const) {
    expect(parameterSource({ from })).toBeUndefined()
    expect(parameterSourceDiagnostics('p', { from })).toEqual([
      expect.objectContaining({ code, path: '/spec/parameters/p/from' }),
    ])
  }
})
