/**
 * The registry projections: what each reads from spec.md, and that every file
 * the working tree commits is valid against its schema in core.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  CORE_FAMILY,
  discoverFamilies,
  familyPaths,
  inRepo,
  type Json,
  REPO_ROOT,
  readJson,
  registrySchemaFile,
} from '../lib/layout.ts'
import { FixtureRepo } from '../testing/fixture.ts'
import { buildDiagnostics, buildRequirements, declaredCodes, registryOutputs } from './registry.ts'

let repo: FixtureRepo | null = null

afterEach(() => {
  repo?.cleanup()
  repo = null
})

describe('declaredCodes', () => {
  test('reads error rows with their phases and warning rows with their requirement', () => {
    const markdown = [
      '## <a id="diagnostics"></a>9. Diagnostics',
      '',
      '| Code | Phase | Meaning |',
      '|---|---|---|',
      '| `ERR_A` | `semantic`, `parser` | A. |',
      '| `ERR_B` | `resolution` | B. |',
      '',
      '### Warnings',
      '',
      '| Code | Requirement | Meaning |',
      '|---|---|---|',
      '| `WARN_C` | [`COMP-EP-007`](#COMP-EP-007) | C. |',
      '',
      '## <a id="migration"></a>10. Migration',
      '',
      '| `WARN_D` | not a warnings table | D. |',
    ].join('\n')
    expect(declaredCodes(markdown)).toEqual([
      { code: 'ERR_A', phases: ['parser', 'semantic'], severities: ['ERROR'] },
      { code: 'ERR_B', phases: ['resolution'], severities: ['ERROR'] },
      {
        code: 'WARN_C',
        phases: ['parser', 'structural', 'semantic', 'admission', 'resolution'],
        severities: ['WARNING'],
        requirement: 'COMP-EP-007',
      },
    ])
  })
})

describe('family registries', () => {
  function tree(): FixtureRepo {
    const fx = new FixtureRepo()
    repo = fx
    fx.writeCoreSkeleton(
      'v1',
      [
        '## <a id="envelope"></a>2. Envelope',
        '',
        '<a id="CORE-ENV-001"></a>rule',
        '',
        '| Code | Phase | Meaning |',
        '|---|---|---|',
        '| `ERR_CORE` | `parser` | Core. |',
        '',
      ].join('\n'),
    )
    fx.writeFile(
      familyPaths('component', 'v1').spec,
      fx.kindSpec(
        'component',
        [
          '## <a id="scope"></a>1. Scope',
          '',
          '<a id="COMP-XY-001"></a>rule',
          '',
          '| Code | Phase | Meaning |',
          '|---|---|---|',
          '| `ERR_OWN` | `semantic` | Own. |',
          '',
        ].join('\n'),
      ),
    )
    fx.writeFamilySkeleton('component', 'v1')
    return fx
  }

  test('requirements are the family’s own, with their section', () => {
    const fx = tree()
    const component = discoverFamilies(fx.root).find((f) => f.name === 'component')
    expect(buildRequirements(component as never)).toEqual({
      family: 'component',
      major: 'v1',
      requirements: [{ id: 'COMP-XY-001', anchor: 'COMP-XY-001', section: 'scope' }],
    })
  })

  test('diagnostics are the reach, core first, each naming its declarer', () => {
    const fx = tree()
    const families = discoverFamilies(fx.root)
    const component = families.find((f) => f.name === 'component')
    expect(buildDiagnostics(component as never, families)).toEqual({
      family: 'component',
      major: 'v1',
      diagnostics: [
        { code: 'ERR_CORE', phases: ['parser'], severities: ['ERROR'], declaredBy: CORE_FAMILY },
        { code: 'ERR_OWN', phases: ['semantic'], severities: ['ERROR'], declaredBy: 'component' },
      ],
    })
  })
})

describe('the committed registries', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false })

  test('every generated file matches its committed copy and its schema in core', () => {
    const outputs = registryOutputs(REPO_ROOT)
    expect(outputs.length).toBeGreaterThan(0)
    for (const [path, build] of outputs) {
      const expected = build()
      expect(readFileSync(inRepo(REPO_ROOT, path), 'utf8')).toBe(expected)
      const file = path.split('/').pop() as string
      const schema = readJson(inRepo(REPO_ROOT, registrySchemaFile('v2', file))) as {
        [k: string]: Json
      }
      const validate = ajv.getSchema(schema.$id as string) ?? ajv.compile(schema)
      const valid = validate(JSON.parse(expected))
      if (!valid) console.error(path, validate.errors)
      expect(valid).toBe(true)
    }
  })
})
