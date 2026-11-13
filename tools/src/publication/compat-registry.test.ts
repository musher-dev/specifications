/**
 * `check:compat:registry`: each rule's failure, and that a release older than
 * the registries has nothing to compare.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { CORE_FAMILY, Failures, familyPaths, type Json, registrySchemaDir } from '../lib/layout.ts'
import { FixtureRepo } from '../testing/fixture.ts'
import { Pipeline } from '../testing/pipeline.ts'
import {
  checkNewProtocol,
  compareDiagnostics,
  compareInterfaceSchema,
  compareProtocol,
  compareRegistries,
  compareRequirements,
  compareTerms,
  compareVocabulary,
} from './compat-registry.ts'

let repo: FixtureRepo | null = null

afterEach(() => {
  repo?.cleanup()
  repo = null
})

describe('the comparisons', () => {
  test('a removed requirement, or one whose anchor moved, fails', () => {
    const released = {
      requirements: [
        { id: 'CORE-ENV-001', anchor: 'CORE-ENV-001', section: 'envelope' },
        { id: 'CORE-ENV-002', anchor: 'CORE-ENV-002', section: 'envelope' },
      ],
    }
    expect(compareRequirements(released, released)).toEqual([])
    expect(
      compareRequirements(released, {
        requirements: [
          { id: 'CORE-ENV-001', anchor: 'CORE-ENV-001', section: 'scope' },
          { id: 'CORE-ENV-003', anchor: 'CORE-ENV-003', section: 'scope' },
        ],
      }),
    ).toEqual(['requirement CORE-ENV-002 was removed'])
    expect(
      compareRequirements(released, {
        requirements: [
          { id: 'CORE-ENV-001', anchor: 'elsewhere', section: 'envelope' },
          { id: 'CORE-ENV-002', anchor: 'CORE-ENV-002', section: 'envelope' },
        ],
      }),
    ).toEqual(['requirement CORE-ENV-001 moved from #CORE-ENV-001 to #elsewhere'])
  })

  test('a removed code, or one whose phases shrink, fails; one that gains a phase passes', () => {
    const code = (phases: string[]) => ({
      diagnostics: [{ code: 'ERR_A', phases, severities: ['ERROR'], declaredBy: 'core' }],
    })
    expect(compareDiagnostics(code(['parser']), code(['parser', 'semantic']))).toEqual([])
    expect(compareDiagnostics(code(['parser', 'semantic']), code(['parser']))).toEqual([
      'diagnostic ERR_A lost phases semantic',
    ])
    expect(compareDiagnostics(code(['parser']), { diagnostics: [] })).toEqual([
      'diagnostic ERR_A was removed',
    ])
  })

  test('a vocabulary list grows only at its end', () => {
    const vocabulary = (stages: string[], assigned = false): Json => ({
      phases: ['parser'],
      scopes: [{ name: 'parser', phases: ['parser'] }],
      statuses: ['VALID'],
      severities: ['ERROR'],
      stages,
      namespaces: [{ name: 'nodes', assigned }],
    })
    expect(compareVocabulary(vocabulary(['a', 'b']), vocabulary(['a', 'b', 'c']))).toEqual([])
    expect(compareVocabulary(vocabulary(['a', 'b']), vocabulary(['b', 'a']))[0]).toContain(
      'stages: released order a, b is not a prefix of b, a',
    )
    expect(compareVocabulary(vocabulary(['a'], false), vocabulary(['a'], true))).toEqual([])
    expect(compareVocabulary(vocabulary(['a'], true), vocabulary(['a'], false))).toEqual([
      'namespace nodes was assigned and is no longer',
    ])
  })

  test('a removed term, or one that drops a claim, fails', () => {
    const terms = (fields: string[]) => ({
      terms: [{ id: 'core.envelope', identifiers: { fields } }],
    })
    expect(compareTerms(terms(['kind']), terms(['kind', 'spec']))).toEqual([])
    expect(compareTerms(terms(['kind', 'spec']), terms(['kind']))).toEqual([
      'term core.envelope no longer claims fields spec',
    ])
    expect(compareTerms(terms(['kind']), { terms: [] })).toEqual([
      'term core.envelope was removed. Deprecate it instead.',
    ])
  })

  test('a protocol keeps its members, and a new one is optional', () => {
    const member = { name: 'botToken', role: 'credential', presence: 'required' }
    const released = { id: 'TELEGRAM_BOT', category: 'MESSAGING', members: [member] }
    expect(
      compareProtocol(released, {
        ...released,
        members: [member, { name: 'region', role: 'parameter', presence: 'optional' }],
      }),
    ).toEqual([])
    expect(
      compareProtocol(released, {
        ...released,
        members: [member, { name: 'region', role: 'parameter', presence: 'required' }],
      }),
    ).toEqual(['protocol TELEGRAM_BOT adds member region as required. A new member is optional.'])
    expect(
      compareProtocol(released, { ...released, members: [{ ...member, role: 'secret' }] }),
    ).toEqual(['protocol TELEGRAM_BOT member botToken changed'])
    expect(compareProtocol(released, { ...released, members: [] })).toEqual([
      'protocol TELEGRAM_BOT member botToken was removed',
    ])
    expect(
      compareProtocol({ categories: [{ id: 'CACHE' }, { id: 'DATABASE' }] }, { categories: [] }),
    ).toEqual(['categories CACHE, DATABASE were removed'])
  })

  test('a released protocol keeps its introduced version', () => {
    const released = { id: 'POSTGRES', category: 'DATABASE', introduced: '2.0.0', members: [] }
    expect(compareProtocol(released, released)).toEqual([])
    expect(compareProtocol(released, { ...released, introduced: '2.1.0' })).toEqual([
      'protocol POSTGRES changed introduced from 2.0.0 to 2.1.0',
    ])
  })

  test('a protocol the release lacks is introduced after it', () => {
    const record = (introduced?: string): Json => ({
      id: 'OPENAI_EMBEDDINGS',
      category: 'LANGUAGE_MODEL',
      ...(introduced === undefined ? {} : { introduced }),
      members: [],
    })
    expect(checkNewProtocol(record('2.3.0'), '2.2.0')).toEqual([])
    expect(checkNewProtocol(record('3.0.0'), '2.2.0')).toEqual([])
    expect(checkNewProtocol(record('2.2.0'), '2.2.0')).toEqual([
      'protocol OPENAI_EMBEDDINGS says introduced 2.2.0, but 2.2.0 is released without it. ' +
        'A new protocol is introduced after 2.2.0.',
    ])
    expect(checkNewProtocol(record('2.1.0'), '2.2.0')).toHaveLength(1)
    expect(checkNewProtocol(record(), '2.2.0')).toEqual([
      'protocol OPENAI_EMBEDDINGS has no introduced version',
    ])
    // The category list carries no introduced version.
    expect(checkNewProtocol({ categories: [] }, '2.2.0')).toEqual([])
  })

  test('a protocol keeps its capabilities', () => {
    const released = {
      id: 'OPENAI_CHAT_COMPLETIONS',
      category: 'LANGUAGE_MODEL',
      capabilities: ['STREAMING', 'TOOL_CALLS'],
      members: [],
    }
    expect(
      compareProtocol(released, { ...released, capabilities: ['STREAMING', 'TOOL_CALLS', 'X'] }),
    ).toEqual([])
    expect(compareProtocol(released, { ...released, capabilities: ['STREAMING'] })).toEqual([
      'protocol OPENAI_CHAT_COMPLETIONS lost capabilities TOOL_CALLS',
    ])
    const { capabilities: _capabilities, ...withoutCapabilities } = released
    expect(compareProtocol(released, withoutCapabilities)).toEqual([
      'protocol OPENAI_CHAT_COMPLETIONS lost capabilities STREAMING, TOOL_CALLS',
    ])
  })

  test("a category's conventions never change or disappear", () => {
    const categories = (conventions?: Json): Json => ({
      categories: [
        {
          id: 'MESSAGING',
          protocols: ['TELEGRAM_BOT'],
          ...(conventions === undefined ? {} : { conventions }),
        },
      ],
    })
    const released = categories({ locator: 'baseURL', credential: 'botToken' })
    expect(compareProtocol(released, released)).toEqual([])
    expect(
      compareProtocol(released, categories({ locator: 'baseURL', credential: 'token' })),
    ).toEqual(['category MESSAGING changed its conventions'])
    expect(compareProtocol(released, categories())).toEqual([
      'category MESSAGING lost its conventions',
    ])
    expect(compareProtocol(categories(), released)).toEqual([])
  })

  test('an interface schema adds optional members only, and a frozen enum gains nothing', () => {
    const schema = (extra: Json = {}, severities = ['ERROR', 'WARNING']): Json => ({
      type: 'object',
      required: ['status'],
      properties: {
        status: { enum: ['VALID', 'INVALID'] },
        severity: { enum: severities },
        ...(extra as object),
      },
    })
    expect(compareInterfaceSchema(schema(), schema({ note: { type: 'string' } }))).toEqual([])
    expect(
      compareInterfaceSchema(schema(), {
        ...(schema() as object),
        required: ['status', 'severity'],
      }),
    ).toEqual(['<root> now requires severity'])
    expect(compareInterfaceSchema(schema(), schema({}, ['ERROR']))).toEqual([
      '/properties/severity enum lost "WARNING"',
    ])
    expect(compareInterfaceSchema(schema(), schema({}, ['ERROR', 'WARNING', 'INFO']))).toEqual([])
    expect(
      compareInterfaceSchema(schema(), schema({}, ['ERROR', 'WARNING', 'INFO']), true),
    ).toEqual(['/properties/severity enum gained "INFO", and this schema\'s enums are frozen'])
  })

  test('an interface schema fails every narrowing keyword, and passes every widening one', () => {
    const base: Json = {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[a-z]+$' },
        count: { type: 'integer', minimum: 0, maximum: 10 },
        list: { type: 'array', minItems: 1, maxItems: 4 },
        map: { type: 'object', minProperties: 1 },
        kind: { const: 'A' },
        free: { type: ['string', 'null'] },
      },
    }
    const props = (overrides: Record<string, Json>): Json => ({
      ...(base as object),
      properties: { ...((base as { properties: object }).properties as object), ...overrides },
    })
    expect(compareInterfaceSchema(base, base)).toEqual([])
    // Widening, and adding a property, passes.
    expect(
      compareInterfaceSchema(
        base,
        props({
          name: { type: 'string', maxLength: 128 },
          count: { type: ['integer', 'null'], minimum: -1 },
          list: { type: 'array' },
          map: { type: 'object' },
          free: {},
          added: { type: 'string', pattern: 'x' },
        }),
      ),
    ).toEqual([])
    expect(
      compareInterfaceSchema(
        base,
        props({
          name: { type: 'string', minLength: 2, maxLength: 32, pattern: '^[a-z]*$' },
          count: { type: 'number', minimum: 1, maximum: 9 },
          list: { type: 'array', minItems: 2, maxItems: 3 },
          map: { type: 'object', minProperties: 2, additionalProperties: false },
          kind: { const: 'B' },
          free: { type: 'string', enum: ['a'] },
        }),
      ),
    ).toEqual([
      '/properties/name pattern changed',
      '/properties/name minLength rose from 1 to 2',
      '/properties/name maxLength fell from 64 to 32',
      '/properties/count type lost integer',
      '/properties/count minimum rose from 0 to 1',
      '/properties/count maximum fell from 10 to 9',
      '/properties/list minItems rose from 1 to 2',
      '/properties/list maxItems fell from 4 to 3',
      '/properties/map minProperties rose from 1 to 2',
      '/properties/map closed additionalProperties',
      '/properties/kind const changed',
      '/properties/free type lost null',
      '/properties/free gained an enum',
    ])
    // A constraint that appears where there was none narrows too.
    expect(
      compareInterfaceSchema(
        { type: 'object', properties: { a: {} } },
        { type: 'object', properties: { a: { type: 'string', pattern: 'x', const: 'x' } } },
      ),
    ).toEqual([
      '/properties/a gained type string',
      '/properties/a gained a pattern',
      '/properties/a gained a const',
    ])
  })
})

describe('compareRegistries', () => {
  const CORE2 = familyPaths(CORE_FAMILY, 'v2')
  const requirements = (ids: string[]) =>
    `${JSON.stringify({
      family: 'core',
      major: 'v2',
      requirements: ids.map((id) => ({ id, anchor: id, section: 'envelope' })),
    })}\n`

  function release(fx: FixtureRepo, version: string): void {
    const p = new Pipeline(fx)
    fx.writeCoreSkeleton('v2')
    fx.setManifestVersion(CORE2.manifestKey, version)
    fx.commit(`feat(core): core ${version}`)
    p.recordAndTag(`${CORE_FAMILY}/v${version}`)
  }

  test('a release before the registries has nothing to compare', () => {
    const fx = new FixtureRepo()
    repo = fx
    release(fx, '2.0.0')
    fx.writeFile(`${CORE2.registry}/requirements.json`, requirements(['CORE-ENV-001']))
    const failures = new Failures()
    expect(compareRegistries(fx.root, failures)).toEqual({ compared: 0, releases: 0 })
    expect(failures.messages).toEqual([])
  })

  test('fails a working tree that removes a released requirement or a released file', () => {
    const fx = new FixtureRepo()
    repo = fx
    fx.writeFile(
      `${CORE2.registry}/requirements.json`,
      requirements(['CORE-ENV-001', 'CORE-ENV-002']),
    )
    fx.writeFile(`${CORE2.registry}/terms.json`, '{"terms":[]}\n')
    fx.writeFile(`${registrySchemaDir('v2')}/terms.schema.json`, '{"type":"object"}\n')
    release(fx, '2.1.0')

    const clean = new Failures()
    expect(compareRegistries(fx.root, clean)).toEqual({ compared: 3, releases: 1 })
    expect(clean.messages).toEqual([])

    fx.writeFile(`${CORE2.registry}/requirements.json`, requirements(['CORE-ENV-001']))
    fx.remove(`${CORE2.registry}/terms.json`)
    const failures = new Failures()
    compareRegistries(fx.root, failures)
    expect(failures.messages).toEqual([
      `${CORE2.registry}/requirements.json: requirement CORE-ENV-002 was removed, since core/v2.1.0`,
      `${CORE2.registry}/terms.json: core/v2.1.0 delivered it, and the working tree removed it`,
    ])
  })
})
