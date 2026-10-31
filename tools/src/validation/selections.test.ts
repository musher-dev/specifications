// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the `${{ }}` placeholder grammar is the data under test, not a template literal
import { describe, expect, test } from 'bun:test'
import { isObject, type Json } from '../lib/layout.ts'
import { isConnectionInput } from './connections.ts'
import {
  type ConnectionAcquisition,
  type ConnectionSelection,
  connectionBindingDiagnostics,
  parameterOrigin,
  parameterOriginDiagnostics,
  resolveConnections,
  selectConnection,
} from './selections.ts'

/** `T` with its members writable, so that a test can replace or remove one. */
type Writable<T> = { -readonly [K in keyof T]: T[K] }
type NodeFixture = { componentRef: string; bindings: Record<string, Json> }
/** The blueprint fixture, typed for the edits a test makes to a copy of it. */
type BlueprintFixture = {
  spec: {
    parameters: Record<string, Json>
    nodes: Record<string, NodeFixture> & { app: NodeFixture }
  }
}

/** An input of the fixture component, or a member of a resolved value. */
function at(value: Json | undefined, key: string): Json | undefined {
  const object: Json | undefined = value === component ? component.spec.contract.inputs : value
  return isObject(object) ? object[key] : undefined
}

/** An external node standing for one connection (component §6.4). */
const component = {
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
const blueprint: BlueprintFixture = {
  spec: {
    parameters: {
      primary: { from: '${{ connections.llm.default }}' },
      region: { default: 'eu' },
    },
    nodes: {
      app: {
        componentRef: 'acme/app',
        bindings: { llm: { parameter: 'primary' }, region: { parameter: 'region' } },
      },
    },
  },
}
const components = new Map([['app', component]])
/** A fresh selection, typed as written so that a test can edit any member of it. */
const selection = (parameter = 'primary') =>
  ({
    identity: 'connection-1',
    version: '1',
    deployment: 'deploy-1',
    parameter,
    request: { from: '${{ connections.llm.default }}', identity: 'default-policy', version: '3' },
    selectionKind: 'MANAGED',
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
  }) satisfies ConnectionSelection
const run = (s: ConnectionSelection = selection()) =>
  resolveConnections(blueprint, components, {
    deployment: 'deploy-1',
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
    const b = structuredClone(blueprint)
    b.spec.nodes.app.bindings.llm = { value: 'x' }
    expect(connectionBindingDiagnostics(b, components)).toMatchObject([
      { code: 'ERR_INVALID_CONNECTION_BINDING', path: '/spec/nodes/app/bindings/llm' },
    ])
    b.spec.nodes.app.bindings.llm = { parameter: 'region' }
    expect(connectionBindingDiagnostics(b, components)).toMatchObject([
      {
        code: 'ERR_INVALID_CONNECTION_BINDING',
        path: '/spec/nodes/app/bindings/llm/parameter',
      },
    ])
    b.spec.nodes.app.bindings = { region: { parameter: 'primary' } }
    expect(connectionBindingDiagnostics(b, components)).toMatchObject([
      {
        code: 'ERR_INVALID_CONNECTION_BINDING',
        path: '/spec/nodes/app/bindings/region/parameter',
      },
    ])
    // An undeclared parameter is ERR_UNKNOWN_PARAMETER alone.
    b.spec.nodes.app.bindings = { llm: { parameter: 'missing' } }
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
        deployment: 'deploy-1',
        parameters: { primary: { status } },
      })
      expect(r.diagnostics[0]?.code).toBe(code)
      expect(r.inputs).toEqual({})
    }
  })
  test('rejects missing capability and wrong protocol without any projection', () => {
    const s = selection()
    s.views.OPENAI_CHAT_COMPLETIONS.capabilities = []
    expect(run(s).diagnostics[0]?.code).toBe('ERR_CONNECTION_INCOMPATIBLE')
    const wrong: Writable<ConnectionSelection> = selection()
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
    s.views.OPENAI_CHAT_COMPLETIONS.baseURL = 'https://arbitrary.example/v1'
    expect(run(s).diagnostics[0]?.code).toBe('ERR_INVALID_RESOLUTION_CONTEXT')
    expect(JSON.stringify(run(s))).not.toContain('synthetic-only')
  })
  test('partial replacement, wrong deployment or parameter and unpersisted selections fail', () => {
    for (const field of ['credential', 'views', 'request'] as const) {
      const s: Partial<Writable<ConnectionSelection>> = selection()
      delete s[field]
      expect(run(s as ConnectionSelection).inputs).toEqual({})
    }
    expect(run({ ...selection(), deployment: 'clone' }).inputs).toEqual({})
    expect(run(selection('other')).inputs).toEqual({})
    const r = resolveConnections(blueprint, components, {
      deployment: 'deploy-1',
      parameters: {
        primary: {
          status: 'SELECTED',
          persisted: false,
          selection: selection(),
        } as unknown as ConnectionAcquisition,
      },
    })
    expect(r.diagnostics[0]?.code).toBe('ERR_INVALID_RESOLUTION_CONTEXT')
  })
  test('two connection parameters with the same protocol remain independent and one failure withholds all values', () => {
    const b = structuredClone(blueprint)
    b.spec.parameters.second = { from: '${{ connections.llm.secondary }}' }
    b.spec.nodes.worker = {
      componentRef: 'acme/app',
      bindings: { llm: { parameter: 'second' } },
    }
    const cs = new Map([...components, ['worker', component]] as [string, Json][])
    const second = selection('second')
    second.identity = 'connection-2'
    second.credential.identity = 'credential-2'
    second.request.from = '${{ connections.llm.secondary }}'
    second.views.OPENAI_CHAT_COMPLETIONS.model = 'model-b'
    const context = {
      deployment: 'deploy-1',
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
    const c = structuredClone(component)
    c.spec.contract.inputs.llm.connection.protocol = 'ANTHROPIC_MESSAGES'
    const s = selection()
    s.credential.permittedBaseURLs.push('https://gateway.example/anthropic')
    Object.assign(s.views, {
      ANTHROPIC_MESSAGES: {
        baseURL: 'https://gateway.example/anthropic',
        model: 'model-a',
        capabilities: ['STREAMING'],
      },
    })
    const r = resolveConnections(blueprint, new Map([['app', c]]), {
      deployment: 'deploy-1',
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
      'deploy-1',
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
      'deploy-1',
      'primary',
      0,
      () => selection(),
      () => true,
    ).status,
  ).toBe('SELECTED')
  expect(
    selectConnection(
      store,
      'deploy-1',
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
      'deploy-1',
      'primary',
      0,
      () => {
        throw new Error('interrupted')
      },
      () => true,
    ),
  ).toThrow('interrupted')
})

test('the selection answers the request the parameter made', () => {
  const original = selection()
  const wrong = {
    ...original,
    request: { ...original.request, from: '${{ connections.llm.other }}' },
  }
  expect(run(wrong).diagnostics[0]?.code).toBe('ERR_INVALID_RESOLUTION_CONTEXT')
  expect(run(wrong).inputs).toEqual({})
})

test('a managed credential cannot be reused under another connection parameter', () => {
  const b = structuredClone(blueprint)
  b.spec.parameters.second = { from: '${{ connections.llm.default }}' }
  b.spec.nodes.worker = {
    componentRef: 'acme/app',
    bindings: { llm: { parameter: 'second' } },
  }
  const result = resolveConnections(b as Json, new Map([...components, ['worker', component]]), {
    deployment: 'deploy-1',
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
    selectionKind: 'USER',
    costOwner: 'deployer',
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
  const b = structuredClone(blueprint)
  b.spec.parameters.region = { from: '${{ variables.cloud.region }}' }
  b.spec.nodes.app.bindings.llm = { parameter: 'region' }
  expect(connectionBindingDiagnostics(b as Json, components)).toContainEqual(
    expect.objectContaining({
      code: 'ERR_INVALID_CONNECTION_BINDING',
      path: '/spec/nodes/app/bindings/llm/parameter',
    }),
  )
})

test('a parameter origin is one whole variables, connections or deployment placeholder', () => {
  expect(parameterOrigin({ from: '${{ variables.cloud.region }}' })).toEqual({
    namespace: 'variables',
    key: 'cloud.region',
    from: '${{ variables.cloud.region }}',
  })
  expect(parameterOrigin({ from: '${{ connections.llm.default }}' })?.namespace).toBe('connections')
  for (const [from, code] of [
    ['https://${{ variables.cloud.host }}', 'ERR_INVALID_PARAMETER_ORIGIN'],
    ['${{ variables.a }}${{ variables.b }}', 'ERR_INVALID_PARAMETER_ORIGIN'],
    ['${{ config.cloud.region }}', 'ERR_UNKNOWN_PLACEHOLDER_NAMESPACE'],
    ['${{ self.endpoints.web.publicURL }}', 'ERR_NAMESPACE_NOT_PERMITTED'],
    ['${{ variables', 'ERR_MALFORMED_PLACEHOLDER'],
  ] as const) {
    expect(parameterOrigin({ from })).toBeUndefined()
    expect(parameterOriginDiagnostics('p', { from })).toEqual([
      expect.objectContaining({ code, path: '/spec/parameters/p/from' }),
    ])
  }
})

describe('connections for any protocol', () => {
  const postgres: Json = {
    spec: {
      type: 'EXTERNAL',
      contract: {
        inputs: { postgres: { description: 'Database', connection: { protocol: 'POSTGRES' } } },
      },
    },
  }
  const b: Json = {
    spec: {
      parameters: { db: { from: '${{ connections.postgres.default }}' } },
      nodes: {
        db: { componentRef: './postgres.yaml', bindings: { postgres: { parameter: 'db' } } },
      },
    },
  }
  const view = {
    host: 'db.synthetic.invalid',
    port: 5432,
    database: 'app',
    username: 'app',
    sslMode: 'require',
  }
  const pg = (overrides: Record<string, unknown> = {}): ConnectionSelection =>
    ({
      identity: 'connection-pg',
      version: '1',
      deployment: 'deploy-1',
      parameter: 'db',
      request: { from: '${{ connections.postgres.default }}', identity: 'policy', version: '1' },
      selectionKind: 'MANAGED',
      provisioning: 'PROVISIONED',
      costOwner: 'org-1',
      credential: { identity: 'credential-pg', rotation: 0, value: 'synthetic-only' },
      views: { POSTGRES: view },
      ...overrides,
    }) as ConnectionSelection
  const resolve = (s: ConnectionSelection) =>
    resolveConnections(b, new Map([['db', postgres]]), {
      deployment: 'deploy-1',
      parameters: { db: { status: 'SELECTED', persisted: true, selection: s } },
    })
  test('a POSTGRES view carries its members, the credential supplies the password and url is composed', () => {
    const r = resolve(pg())
    expect(r.diagnostics).toEqual([])
    expect(r.inputs['db:in:postgres']?.value).toEqual({
      ...view,
      password: 'synthetic-only',
      url: 'postgresql://app:synthetic-only@db.synthetic.invalid:5432/app?sslmode=require',
    })
  })
  test('the composed url percent-encodes userinfo and the database, and brackets IPv6', () => {
    const r = resolve(
      pg({
        views: {
          POSTGRES: {
            ...view,
            host: '2001:DB8::1',
            username: "app user@x'",
            database: 'my db',
            sslMode: 'verify-full',
          },
        },
        credential: { identity: 'credential-pg', rotation: 0, value: 'p@ss:w/rd' },
      }),
    )
    expect(r.diagnostics).toEqual([])
    expect(at(r.inputs['db:in:postgres']?.value, 'url')).toBe(
      'postgresql://app%20user%40x%27:p%40ss%3Aw%2Frd@[2001:db8::1]:5432/my%20db?sslmode=verify-full',
    )
  })
  test('a view never carries the derived url, and sslMode takes only PostgreSQL sslmode values', () => {
    const url = 'postgresql://app:synthetic-only@db.synthetic.invalid:5432/app?sslmode=require'
    for (const POSTGRES of [
      { ...view, url },
      { ...view, sslMode: 'strict' },
      { ...view, host: 'db.synthetic.invalid:5432' },
    ])
      expect(resolve(pg({ views: { POSTGRES } })).diagnostics[0]?.code).toBe(
        'ERR_INVALID_RESOLUTION_CONTEXT',
      )
  })
  test('a USER selection missing a member is incompatible, a managed one is malformed', () => {
    const { database: _database, ...partial } = view
    const user: Writable<ConnectionSelection> = pg({
      selectionKind: 'USER',
      views: { POSTGRES: partial },
    })
    delete user.provisioning
    expect(resolve(user).diagnostics[0]?.code).toBe('ERR_CONNECTION_INCOMPATIBLE')
    expect(resolve(pg({ views: { POSTGRES: partial } })).diagnostics[0]?.code).toBe(
      'ERR_INVALID_RESOLUTION_CONTEXT',
    )
  })
  test('provisioning is carried only by a MANAGED selection', () => {
    expect(resolve(pg({ selectionKind: 'USER' })).diagnostics[0]?.code).toBe(
      'ERR_INVALID_RESOLUTION_CONTEXT',
    )
  })
  describe('REDIS', () => {
    const redis: Json = {
      spec: {
        type: 'EXTERNAL',
        contract: { inputs: { postgres: { description: 'x', connection: { protocol: 'REDIS' } } } },
      },
    }
    const cache = { host: 'Cache.Synthetic.Invalid', port: 6380, tls: true }
    const run = (s: ConnectionSelection) =>
      resolveConnections(b, new Map([['db', redis]]), {
        deployment: 'deploy-1',
        parameters: { db: { status: 'SELECTED', persisted: true, selection: s } },
      })
    test('a server without authentication has no credential and takes database 0', () => {
      const s: Writable<ConnectionSelection> = pg({ views: { REDIS: cache } })
      delete s.credential
      const r = run(s)
      expect(r.diagnostics).toEqual([])
      expect(r.inputs['db:in:postgres']?.value).toEqual({
        ...cache,
        database: 0,
        url: 'rediss://cache.synthetic.invalid:6380/0',
      })
    })
    test('a password without a username authenticates the default user', () => {
      const r = run(pg({ views: { REDIS: { ...cache, tls: false, database: 2 } } }))
      expect(at(r.inputs['db:in:postgres']?.value, 'url')).toBe(
        'redis://:synthetic-only@cache.synthetic.invalid:6380/2',
      )
      const named = run(pg({ views: { REDIS: { ...cache, username: 'app' } } }))
      expect(at(named.inputs['db:in:postgres']?.value, 'url')).toBe(
        'rediss://app:synthetic-only@cache.synthetic.invalid:6380/0',
      )
    })
    test('a username without a credential, a missing tls or a negative database is malformed', () => {
      const s: Writable<ConnectionSelection> = pg({
        views: { REDIS: { ...cache, username: 'app' } },
      })
      delete s.credential
      expect(run(s).diagnostics[0]?.code).toBe('ERR_INVALID_RESOLUTION_CONTEXT')
      const { tls: _tls, ...noTLS } = cache
      expect(run(pg({ views: { REDIS: noTLS } })).diagnostics[0]?.code).toBe(
        'ERR_INVALID_RESOLUTION_CONTEXT',
      )
      expect(run(pg({ views: { REDIS: { ...cache, database: -1 } } })).diagnostics[0]?.code).toBe(
        'ERR_INVALID_RESOLUTION_CONTEXT',
      )
    })
  })
  test('capabilities and members of another protocol are malformed on a POSTGRES view', () => {
    expect(
      resolve(pg({ views: { POSTGRES: { ...view, capabilities: [] } } })).diagnostics[0]?.code,
    ).toBe('ERR_INVALID_RESOLUTION_CONTEXT')
    expect(resolve(pg({ views: { POSTGRES: { ...view, model: 'x' } } })).diagnostics[0]?.code).toBe(
      'ERR_INVALID_RESOLUTION_CONTEXT',
    )
  })
  test('an S3 endpointURL is held to the HTTPS and permittedBaseURLs rules', () => {
    const s3 = {
      endpointURL: 'https://s3.synthetic.invalid',
      region: 'eu-west-1',
      bucket: 'assets',
      accessKeyID: 'AKIDSYNTHETIC',
    }
    const component: Json = {
      spec: {
        type: 'EXTERNAL',
        contract: { inputs: { postgres: { description: 'x', connection: { protocol: 'S3' } } } },
      },
    }
    const run = (endpointURL: string, permitted: string[]) =>
      resolveConnections(b, new Map([['db', component]]), {
        deployment: 'deploy-1',
        parameters: {
          db: {
            status: 'SELECTED',
            persisted: true,
            selection: pg({
              views: { S3: { ...s3, endpointURL } },
              credential: {
                identity: 'c',
                rotation: 0,
                value: 'secret',
                permittedBaseURLs: permitted,
              },
            }),
          },
        },
      })
    const ok = run('https://s3.synthetic.invalid', ['https://s3.synthetic.invalid'])
    expect(ok.diagnostics).toEqual([])
    expect(at(ok.inputs['db:in:postgres']?.value, 'pathStyle')).toBe(false)
    expect(
      run('http://s3.synthetic.invalid', ['http://s3.synthetic.invalid']).diagnostics[0]?.code,
    ).toBe('ERR_INVALID_RESOLUTION_CONTEXT')
    expect(run('https://s3.synthetic.invalid', []).diagnostics[0]?.code).toBe(
      'ERR_INVALID_RESOLUTION_CONTEXT',
    )
  })
})
