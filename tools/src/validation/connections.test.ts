import { describe, expect, test } from 'bun:test'
import type { Json } from '../lib/layout.ts'
import {
  type ConnectionSelection,
  connectionBindingDiagnostics,
  connectionRequirementDiagnostics,
  resolveConnections,
  selectConnection,
} from './connections.ts'

const input = (sensitive = false) => ({
  description: 'Connection input',
  schema: { type: 'string' },
  sensitive,
})
const component: Json = {
  spec: {
    contract: {
      inputs: { url: input(), key: input(true), model: input() },
      connectionRequirements: {
        llm: {
          protocol: 'OPENAI_CHAT_COMPLETIONS',
          capabilities: ['STREAMING'],
          inputs: { baseUrl: 'url', apiKey: 'key', model: 'model' },
        },
      },
    },
  },
}
const blueprint: Json = {
  spec: {
    connectionSources: { primary: { source: '${{ config.llm.default }}' } },
    components: {
      app: { componentRef: 'acme/app', connectionBindings: { llm: { source: 'primary' } } },
    },
  },
}
const components = new Map([['app', component]])
const selection = (slot = 'primary'): ConnectionSelection => ({
  identity: 'connection-1',
  version: '1',
  installation: 'install-1',
  slot,
  source: { reference: '${{ config.llm.default }}', identity: 'default-policy', version: '3' },
  kind: 'MANAGED',
  costOwner: 'org-1',
  credential: {
    identity: 'credential-1',
    rotation: 0,
    value: 'synthetic-only',
    permittedBaseUrls: ['https://gateway.example/openai/v1'],
  },
  views: {
    OPENAI_CHAT_COMPLETIONS: {
      baseUrl: 'https://gateway.example/openai/v1',
      model: 'model-a',
      capabilities: ['STREAMING', 'TOOL_CALLS'],
    },
  },
})
const run = (s = selection()) =>
  resolveConnections(blueprint, components, {
    installation: 'install-1',
    slots: { primary: { status: 'SELECTED', persisted: true, selection: s } },
  })
describe('atomic named connections', () => {
  test('validates explicit ownership and projects one immutable selection', () => {
    expect(connectionRequirementDiagnostics(component)).toEqual([])
    expect(connectionBindingDiagnostics(blueprint, components)).toEqual([])
    const r = run()
    expect(r.diagnostics).toEqual([])
    expect(r.deferred).toEqual([])
    expect(r.inputs['app:in:key']).toEqual({
      value: 'synthetic-only',
      sensitive: true,
      identity: 'connection-1',
      version: '1',
    })
  })
  test('rejects group collisions, missing requirements and independent member defaults', () => {
    const c = structuredClone(component) as any
    c.spec.contract.inputs.key.default = 'secret'
    expect(connectionRequirementDiagnostics(c)[0]?.code).toBe('ERR_INVALID_CONNECTION_REQUIREMENT')
    const b = structuredClone(blueprint) as any
    b.spec.components.app.bindings = { key: { type: 'LITERAL', value: 'x' } }
    expect(connectionBindingDiagnostics(b, components)[0]?.code).toBe(
      'ERR_INVALID_CONNECTION_BINDING',
    )
    delete b.spec.components.app.bindings
    delete b.spec.components.app.connectionBindings
    expect(connectionBindingDiagnostics(b, components).length).toBeGreaterThan(0)
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
        slots: { primary: { status } },
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
        baseUrl: 'https://gateway.example/openai/v1',
        model: 'model-a',
        capabilities: ['STREAMING'],
      },
    }
    expect(run(wrong).inputs).toEqual({})
  })
  test('a destination change cannot keep a scoped managed credential', () => {
    const s = selection()
    ;(s.views.OPENAI_CHAT_COMPLETIONS as any).baseUrl = 'https://arbitrary.example/v1'
    expect(run(s).diagnostics[0]?.code).toBe('ERR_INVALID_RESOLUTION_CONTEXT')
    expect(JSON.stringify(run(s))).not.toContain('synthetic-only')
  })
  test('partial replacement, wrong installation/slot and unpersisted selections fail', () => {
    for (const field of ['credential', 'views', 'source']) {
      const s = selection() as any
      delete s[field]
      expect(run(s).inputs).toEqual({})
    }
    expect(run({ ...selection(), installation: 'clone' }).inputs).toEqual({})
    expect(run(selection('other')).inputs).toEqual({})
    const r = resolveConnections(blueprint, components, {
      installation: 'install-1',
      slots: { primary: { status: 'SELECTED', persisted: false, selection: selection() } as any },
    })
    expect(r.diagnostics[0]?.code).toBe('ERR_INVALID_RESOLUTION_CONTEXT')
  })
  test('two slots with the same protocol remain independent and one failure withholds all values', () => {
    const b = structuredClone(blueprint) as any
    b.spec.connectionSources.second = { source: '${{ config.llm.secondary }}' }
    b.spec.components.worker = {
      componentRef: 'acme/app',
      connectionBindings: { llm: { source: 'second' } },
    }
    const cs = new Map([...components, ['worker', component]] as [string, Json][])
    const second = selection('second')
    ;(second as any).identity = 'connection-2'
    ;(second as any).credential.identity = 'credential-2'
    ;(second as any).source.reference = '${{ config.llm.secondary }}'
    ;(second.views.OPENAI_CHAT_COMPLETIONS as any).model = 'model-b'
    const context = {
      installation: 'install-1',
      slots: {
        primary: { status: 'SELECTED', persisted: true, selection: selection() },
        second: { status: 'SELECTED', persisted: true, selection: second },
      },
    } as const
    const r = resolveConnections(b, cs, context)
    expect(r.inputs['app:in:model']?.value).toBe('model-a')
    expect(r.inputs['worker:in:model']?.value).toBe('model-b')
    expect(
      resolveConnections(b, cs, {
        ...context,
        slots: { ...context.slots, second: { status: 'DENIED' } },
      }).inputs,
    ).toEqual({})
  })
  test('both protocol views can project from one explicitly shared connection', () => {
    const c = structuredClone(component) as any
    c.spec.contract.connectionRequirements.llm.protocol = 'ANTHROPIC_MESSAGES'
    const s = selection() as any
    s.credential.permittedBaseUrls.push('https://gateway.example/anthropic')
    s.views.ANTHROPIC_MESSAGES = {
      baseUrl: 'https://gateway.example/anthropic',
      model: 'model-a',
      capabilities: ['STREAMING'],
    }
    const r = resolveConnections(blueprint, new Map([['app', c]]), {
      installation: 'install-1',
      slots: { primary: { status: 'SELECTED', persisted: true, selection: s } },
    })
    expect(r.inputs['app:in:url']?.value).toBe('https://gateway.example/anthropic')
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

test('selected source provenance must match the requested slot source', () => {
  const original = selection()
  const wrong = {
    ...original,
    source: { ...original.source, reference: '${{ config.llm.other }}' },
  }
  expect(run(wrong).diagnostics[0]?.code).toBe('ERR_INVALID_RESOLUTION_CONTEXT')
  expect(run(wrong).inputs).toEqual({})
})

test('a managed credential cannot be reused under another named slot', () => {
  const b = structuredClone(blueprint) as Record<string, any>
  b.spec.connectionSources.second = { source: '${{ config.llm.default }}' }
  b.spec.components.worker = {
    componentRef: 'acme/app',
    connectionBindings: { llm: { source: 'second' } },
  }
  const result = resolveConnections(b as Json, new Map([...components, ['worker', component]]), {
    installation: 'install-1',
    slots: {
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
      permittedBaseUrls: ['https://provider.example/v1'],
    },
    views: {
      OPENAI_CHAT_COMPLETIONS: {
        baseUrl: 'https://provider.example/v1',
        model: 'user-model',
        capabilities: ['STREAMING'],
      },
    },
  }
  const result = run(replacement)
  expect(result.diagnostics).toEqual([])
  expect(result.inputs['app:in:url']?.value).toBe('https://provider.example/v1')
  expect(result.inputs['app:in:key']?.value).toBe('synthetic-user-key')
  expect(result.inputs['app:in:model']?.value).toBe('user-model')
})
