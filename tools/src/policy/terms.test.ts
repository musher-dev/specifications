/**
 * `check:terms` and the glossary generator: record validity, identifier scope,
 * defined terms, sources, and the generated page and Vale styles.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { stringify } from 'yaml'
import {
  familyPaths,
  inRepo,
  type Json,
  REPO_ROOT,
  readJson,
  TERMINOLOGY_DOC_FILE,
  TERMINOLOGY_FILE,
  TERMINOLOGY_SCHEMA_FILE,
  VALE_DISCOURAGED_FILE,
  VALE_TERMS_FILE,
} from '../lib/layout.ts'
import {
  buildTerminologyDoc,
  buildValeStyle,
  termAnchor,
  terminologyOutputs,
} from '../render/terminology.ts'
import { FixtureRepo } from '../testing/fixture.ts'
import { staleDocs } from './docs.ts'
import {
  checkDefinedTerms,
  checkIdentifiers,
  checkRecords,
  checkSources,
  claimedField,
  collectIdentifiers,
  definedTermsIn,
  definitionProblem,
  type FoundIdentifier,
  proseIdentifiers,
  runTerms,
  schemaIdentifiers,
  type Term,
  termKeys,
} from './terms.ts'

const SCHEMA = readJson(inRepo(REPO_ROOT, TERMINOLOGY_SCHEMA_FILE))

let repo: FixtureRepo | null = null
afterEach(() => {
  repo?.cleanup()
  repo = null
})

/** A valid record, overridable field by field. */
function term(overrides: Partial<Term> & { id: string }): Term {
  const context = overrides.id.split('.')[0] as Term['context']
  return {
    display_name: `${overrides.id.split('.')[1]?.replace(/-/g, ' ') ?? overrides.id} term`,
    context,
    definition: 'A thing of some genus, set apart by a difference.',
    tags: ['test'],
    stability: 'stable',
    status: 'approved',
    ...overrides,
  } as Term
}

function file(terms: Term[]): { schema_version: 1; description: string; terms: Term[] } {
  return { schema_version: 1, description: 'Test records.', terms }
}

describe('checkRecords', () => {
  test('accepts a valid file', () => {
    const terms = [
      term({ id: 'blueprint.node', part_of: ['blueprint.blueprint'] }),
      term({ id: 'blueprint.blueprint', definition: 'The unit of deployment.' }),
    ]
    expect(checkRecords(file(terms), SCHEMA)).toEqual([])
  })

  test('reports a schema violation, such as definition and authority together', () => {
    const both = term({
      id: 'core.thing',
      authority: { repo: 'musher-dev/platform', path: 'docs/x.md' },
    })
    const problems = checkRecords(file([both]), SCHEMA)
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.join('\n')).toContain('oneOf')
  })

  test('rejects a duplicate id and an id outside its context', () => {
    const problems = checkRecords(
      file([
        term({ id: 'core.thing' }),
        term({ id: 'core.thing', display_name: 'other' }),
        term({ id: 'core.other', context: 'listing' }),
      ]),
      SCHEMA,
    )
    expect(problems).toContain('core.thing: the id is used twice')
    expect(problems).toContain('core.other: the id must begin with its context, "listing."')
  })

  test('rejects two records with one display name in one context, and allows a homonym across contexts', () => {
    const same = checkRecords(
      file([
        term({ id: 'core.a', display_name: 'node' }),
        term({ id: 'core.b', display_name: 'node' }),
      ]),
      SCHEMA,
    )
    expect(same.join('\n')).toContain('one concept per term per context')
    const homonym = checkRecords(
      file([
        term({ id: 'core.a', display_name: 'node' }),
        term({ id: 'blueprint.a', display_name: 'node' }),
      ]),
      SCHEMA,
    )
    expect(homonym).toEqual([])
  })

  test('requires every relation to name an existing record', () => {
    const problems = checkRecords(
      file([
        term({
          id: 'core.a',
          kind_of: ['core.missing'],
          associated: [{ relation: 'uses', term: 'core.gone' }],
        }),
      ]),
      SCHEMA,
    )
    expect(problems).toContain('core.a: kind_of names core.missing, which no record has')
    expect(problems).toContain('core.a: associated uses names core.gone, which no record has')
  })

  test('rejects a kind_of cycle', () => {
    const problems = checkRecords(
      file([
        term({ id: 'core.a', kind_of: ['core.b'] }),
        term({ id: 'core.b', kind_of: ['core.a'] }),
      ]),
      SCHEMA,
    )
    expect(problems.some((p) => p.startsWith('kind_of forms a cycle'))).toBe(true)
  })

  test('a prose alias may not be a defined term, nor appear twice', () => {
    const problems = checkRecords(
      file([
        term({ id: 'core.node', display_name: 'node' }),
        term({ id: 'core.a', aliases: [{ text: 'node', status: 'banned', scope: ['prose'] }] }),
        term({ id: 'core.b', aliases: [{ text: 'thing', status: 'banned', scope: ['prose'] }] }),
        term({
          id: 'core.c',
          aliases: [{ text: 'thing', status: 'discouraged', scope: ['prose'] }],
        }),
      ]),
      SCHEMA,
    )
    expect(problems.join('\n')).toContain('is the display name of core.node')
    expect(problems.join('\n')).toContain('is also an alias of core.b')
  })

  test('a prose alias is lower case; an identifier alias may keep its casing', () => {
    expect(
      checkRecords(
        file([
          term({ id: 'core.a', aliases: [{ text: 'Thing', status: 'banned', scope: ['prose'] }] }),
        ]),
        SCHEMA,
      ),
    ).not.toEqual([])
    expect(
      checkRecords(
        file([
          term({
            id: 'core.a',
            aliases: [{ text: 'envVarKey', status: 'banned', scope: ['identifier'] }],
          }),
        ]),
        SCHEMA,
      ),
    ).toEqual([])
  })

  test('an identifier alias may not also be claimed by its record', () => {
    const problems = checkRecords(
      file([
        term({
          id: 'core.a',
          identifiers: { fields: ['nodes'] },
          aliases: [{ text: 'nodes', status: 'banned', scope: ['identifier'] }],
        }),
      ]),
      SCHEMA,
    )
    expect(problems).toEqual(['core.a: "nodes" is both claimed and an identifier alias'])
  })
})

describe('definitionProblem', () => {
  test('passes a genus-and-differentia definition', () => {
    expect(
      definitionProblem({
        display_name: 'node',
        definition: 'A named use of one component inside a blueprint.',
      }),
    ).toBeNull()
  })

  test('rejects a definition that starts with its term, uses it, or is an occasion', () => {
    expect(definitionProblem({ display_name: 'node', definition: 'Node of the graph.' })).toContain(
      'starts with',
    )
    expect(
      definitionProblem({ display_name: 'node', definition: 'A thing a node holds.' }),
    ).toContain('circular')
    expect(
      definitionProblem({ display_name: 'binding', definition: 'It is when a value is wired.' }),
    ).toContain('is when')
    expect(
      definitionProblem({ display_name: 'binding', definition: 'When a value is wired.' }),
    ).toContain('is when')
  })

  test('matches whole words only', () => {
    expect(
      definitionProblem({ display_name: 'node', definition: 'A thing the nodes hold.' }),
    ).toBeNull()
  })
})

describe('identifier collection', () => {
  test('walks schema positions only, so a property named required is a property', () => {
    const schema = {
      $defs: {
        Thing: {
          type: 'object',
          properties: {
            required: { type: 'boolean' },
            mode: { enum: ['OPEN', 'RESTRICTED'] },
            slug: { 'x-musher-grammar': 'dns-label' },
          },
          required: ['mode'],
        },
      },
      properties: { specVersion: { const: 'v2' } },
    } as Json
    const found = schemaIdentifiers(schema, 'component', 'x.schema.json').map(
      (f) => `${f.kind}:${f.name}`,
    )
    expect(found.sort()).toEqual(
      [
        'defs:Thing',
        'fields:required',
        'fields:mode',
        'fields:slug',
        'fields:specVersion',
        'values:OPEN',
        'values:RESTRICTED',
        'values:v2',
        'grammars:dns-label',
      ].sort(),
    )
  })

  test('reads codes, requirement prefixes and, for core, the namespace table', () => {
    const markdown = [
      '## <a id="x"></a>1. X',
      '<a id="CORE-PLACEHOLDER-001"></a>**`CORE-PLACEHOLDER-001`**: rule.',
      '<a id="CORE-PLACEHOLDER-002"></a>rule.',
      '| Namespace | Names |',
      '|---|---|',
      '| `self` | The thing. |',
      '| `nodes` | Another node. |',
      '',
      '| Code | Phase | Meaning |',
      '|---|---|---|',
      '| `ERR_MALFORMED_PLACEHOLDER` | `semantic` | Bad. |',
    ].join('\n')
    const core = proseIdentifiers(markdown, 'core', 'spec.md').map((f) => `${f.kind}:${f.name}`)
    expect(core).toEqual([
      'namespaces:self',
      'namespaces:nodes',
      'codes:ERR_MALFORMED_PLACEHOLDER',
      'requirement_prefixes:CORE-PLACEHOLDER',
    ])
    const family = proseIdentifiers(markdown, 'blueprint', 'spec.md').map((f) => f.kind)
    expect(family).not.toContain('namespaces')
  })

  test('a field claim is the last segment of its path', () => {
    expect(claimedField('/spec/nodes/*')).toBe('nodes')
    expect(claimedField('/spec/nodes/*/bindings')).toBe('bindings')
    expect(claimedField('envVar')).toBe('envVar')
  })
})

describe('checkIdentifiers', () => {
  const found = (kind: FoundIdentifier['kind'], name: string, family: string): FoundIdentifier => ({
    kind,
    name,
    family,
    where: `${family}.schema.json`,
  })

  test('reports an identifier no record claims', () => {
    const findings = checkIdentifiers(
      [term({ id: 'blueprint.node', identifiers: { fields: ['/spec/nodes'] } })],
      [found('fields', 'nodes', 'blueprint'), found('fields', 'orphan', 'blueprint')],
    )
    expect(findings.unclaimed).toEqual(['blueprint.schema.json: no record claims the field orphan'])
  })

  test('a banned alias binds only its own context, so blueprint keeps what component renames', () => {
    const terms = [
      term({
        id: 'component.exemptible-requests',
        identifiers: { fields: ['exemptibleRequests'] },
        aliases: [
          {
            text: 'accessExemptions',
            status: 'banned',
            scope: ['identifier'],
            suggest: 'exemptibleRequests',
          },
        ],
      }),
      term({ id: 'blueprint.access-exemption', identifiers: { fields: ['accessExemptions'] } }),
    ]
    const findings = checkIdentifiers(terms, [
      found('fields', 'accessExemptions', 'component'),
      found('fields', 'accessExemptions', 'blueprint'),
    ])
    expect(findings.banned).toHaveLength(1)
    expect(findings.banned[0]).toStartWith(
      'component.schema.json: accessExemptions is a banned alias of component.exemptible-requests',
    )
    expect(findings.unclaimed).toEqual([])
  })

  test('a banned alias binds only the identifier kinds its record claims', () => {
    const terms = [
      term({
        id: 'core.placeholder-namespace',
        identifiers: { namespaces: ['nodes'] },
        aliases: [{ text: 'output', status: 'banned', scope: ['identifier'] }],
      }),
      term({ id: 'blueprint.node-output-binding', identifiers: { fields: ['output'] } }),
    ]
    const findings = checkIdentifiers(terms, [
      found('fields', 'output', 'blueprint'),
      found('namespaces', 'output', 'core'),
    ])
    expect(findings.banned).toHaveLength(1)
    expect(findings.banned[0]).toContain('core.schema.json: output is a banned alias')
    // Reported as banned, not again as unclaimed.
    expect(findings.unclaimed).toEqual([])
  })

  test('a discouraged identifier alias warns', () => {
    const terms = [
      term({
        id: 'core.a',
        aliases: [{ text: 'old', status: 'discouraged', scope: ['identifier'] }],
      }),
      term({ id: 'core.b', identifiers: { fields: ['old'] } }),
    ]
    const findings = checkIdentifiers(terms, [found('fields', 'old', 'listing')])
    expect(findings.discouraged).toHaveLength(1)
    expect(findings.banned).toEqual([])
  })
})

describe('defined terms', () => {
  const markdown = [
    '## <a id="scope"></a>1. Scope',
    '',
    'A **Listing Document** is the storefront entry.',
    '**Why the phase is admission.** A lead-in, not a term.',
    '',
    '### <a id="terms"></a>1.1 Terms',
    '',
    '- **node**: a named use of a component.',
    '- **`connection input`**: an input filled by a connection.',
    '',
    '## <a id="more"></a>2. More',
    '',
    'The **orphan** is defined nowhere.',
  ].join('\n')

  test('reads a Terms section and the "A **term** is" form, and skips lead-ins', () => {
    const defined = definedTermsIn(markdown, 'blueprint', 'v2', 'spec.md').map(
      (d) => `${d.section}:${d.term}`,
    )
    expect(defined).toEqual(['1:Listing Document', '1.1:node', '1.1:connection input', '2:orphan'])
  })

  test('requires a record, citing the section', () => {
    const terms = [
      term({ id: 'listing.listing', display_name: 'listing', source: ['blueprint v2 §1'] }),
      term({ id: 'blueprint.node', display_name: 'node', source: ['blueprint v2 §4'] }),
      term({
        id: 'component.connection-input',
        display_name: 'connection input',
        source: ['blueprint v2 §1.1'],
      }),
    ]
    const problems = checkDefinedTerms(
      terms,
      definedTermsIn(markdown, 'blueprint', 'v2', 'spec.md'),
    )
    expect(problems).toEqual([
      'spec.md:8: "node" is defined in blueprint v2 §1.1, and blueprint.node does not cite it',
      'spec.md:13: "orphan" is defined here and has no term record',
    ])
  })

  test('matches plurals and "<kind> document"', () => {
    expect(termKeys('Connection inputs')).toContain('connection input')
    expect(termKeys('Component Documents')).toContain('component')
    expect(termKeys('Policies')).toContain('policy')
  })
})

describe('checkSources', () => {
  test('resolves spec sections, ADRs and repository paths', () => {
    repo = new FixtureRepo()
    repo.writeFile(
      familyPaths('core', 'v2').spec,
      '# Core\n\n## <a id="envelope"></a>2. Document envelope\n',
    )
    repo.writeFile('docs/adr/0038-v2.md', '# ADR 0038\n')
    repo.writeFile('docs/conformance.md', '# Conformance\n')
    const terms = [
      term({ id: 'core.a', source: ['core v2 §2', 'ADR 0038', 'docs/conformance.md'] }),
      term({ id: 'core.b', source: ['core v2 §9', 'core v3 §1', 'ADR 0099', 'docs/missing.md'] }),
    ]
    expect(checkSources(terms, repo.root)).toEqual([
      'core.b: source "core v2 §9": no §9 in core/v2',
      'core.b: source "core v3 §1": core/v3 has no spec.md',
      'core.b: source "ADR 0099": no ADR 0099 in docs/adr',
      'core.b: source "docs/missing.md" does not exist',
    ])
  })
})

/** A fixture repository holding the given records and the real schema. */
function glossaryRepo(terms: Term[]): FixtureRepo {
  const fx = new FixtureRepo()
  fx.writeFile(
    TERMINOLOGY_SCHEMA_FILE,
    readFileSync(inRepo(REPO_ROOT, TERMINOLOGY_SCHEMA_FILE), 'utf8'),
  )
  fx.writeFile(TERMINOLOGY_FILE, stringify(file(terms)))
  return fx
}

const GLOSSARY: Term[] = [
  term({
    id: 'blueprint.blueprint',
    display_name: 'blueprint',
    definition: 'The unit of deployment.',
  }),
  term({
    id: 'blueprint.node',
    display_name: 'node',
    definition: 'A named use of one component inside a blueprint.',
    part_of: ['blueprint.blueprint'],
    identifiers: { fields: ['/spec/nodes'] },
    aliases: [
      { text: 'components', status: 'banned', scope: ['identifier'], suggest: 'nodes' },
      { text: 'graph node', status: 'discouraged', scope: ['prose'] },
      { text: 'node.js node', status: 'banned', scope: ['prose'], suggest: 'node' },
    ],
    status: 'proposed',
  }),
]

describe('the generator', () => {
  test('projects prose aliases into Vale substitution styles, escaping dots', () => {
    const banned = buildValeStyle(GLOSSARY, 'banned')
    expect(banned).toContain('level: error')
    expect(banned).toContain('  "node\\\\.js node": "node"')
    expect(banned).not.toContain('components')
    const discouraged = buildValeStyle(GLOSSARY, 'discouraged')
    expect(discouraged).toContain('level: warning')
    expect(discouraged).toContain('  "graph node": "node"')
    expect(buildValeStyle([], 'banned')).toEndWith('swap: {}\n')
  })

  test('renders an index, a concept tree, every record and the words to avoid', () => {
    repo = glossaryRepo(GLOSSARY)
    const doc = buildTerminologyDoc(repo.root)
    expect(doc).toContain('| [node](#blueprint-node) *(proposed)* | blueprint |')
    expect(doc).toContain('blueprint [blueprint.blueprint]\n  - node [blueprint.node]')
    expect(doc).toContain(`#### <a id="${termAnchor('blueprint.node')}"></a>node`)
    expect(doc).toContain('| components | banned | identifier | nodes | [node](#blueprint-node) |')
    expect(buildTerminologyDoc(repo.root)).toBe(doc)
  })

  test('refuses to render invalid records', () => {
    repo = glossaryRepo([term({ id: 'core.a', kind_of: ['core.gone'] })])
    expect(() => buildTerminologyDoc(repo?.root)).toThrow('core.a: kind_of names core.gone')
  })

  test('check:docs names a stale glossary output, and has none without records', () => {
    repo = glossaryRepo(GLOSSARY)
    for (const [path, build] of terminologyOutputs(repo.root)) repo.writeFile(path, build())
    const fresh = staleDocs(repo.root).filter(
      (p) => !p.startsWith('docs/traceability') && !p.startsWith('docs/adr'),
    )
    expect(fresh).toEqual([])
    repo.writeFile(VALE_TERMS_FILE, 'hand edit\n')
    expect(staleDocs(repo.root)).toContain(
      `${VALE_TERMS_FILE} is stale. Run \`task docs\` and commit the result.`,
    )
    expect(terminologyOutputs(repo.root).map(([path]) => path)).toEqual([
      TERMINOLOGY_DOC_FILE,
      VALE_TERMS_FILE,
      VALE_DISCOURAGED_FILE,
    ])

    const bare = new FixtureRepo()
    try {
      expect(terminologyOutputs(bare.root)).toEqual([])
    } finally {
      bare.cleanup()
    }
  })
})

describe('the repository', () => {
  test('its term records are valid', () => {
    expect(runTerms(REPO_ROOT).records).toEqual([])
  })

  test('identifier collection reads every family version it discovers', () => {
    const kinds = new Set(collectIdentifiers(REPO_ROOT).map((f) => f.kind))
    for (const kind of [
      'fields',
      'values',
      'codes',
      'requirement_prefixes',
      'namespaces',
      'defs',
      'grammars',
    ]) {
      expect(kinds.has(kind as FoundIdentifier['kind'])).toBe(true)
    }
  })
})
