/**
 * The catalog binds editors to schemas, so it names kind families only.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { FixtureRepo } from '../testing/fixture.ts'
import { buildCatalog } from './catalog.ts'

let repo: FixtureRepo | null = null

afterEach(() => {
  repo?.cleanup()
  repo = null
})

describe('buildCatalog', () => {
  test('skips core, which has no schema and no document of its own', () => {
    const fx = new FixtureRepo()
    repo = fx
    fx.writeCoreSkeleton('v1')
    fx.writeFamilySkeleton('component', 'v1')

    const catalog = buildCatalog(fx.root) as { schemas: { name: string; url: string }[] }
    expect(catalog.schemas.map((s) => s.name)).toEqual(['Musher Component Document'])
    expect(JSON.stringify(catalog)).not.toContain('/core/')
  })

  test('points every kind family at its major-version alias', () => {
    const catalog = buildCatalog() as { schemas: { url: string }[] }
    expect(catalog.schemas.length).toBeGreaterThan(0)
    for (const schema of catalog.schemas) {
      expect(schema.url).toMatch(/^https:\/\/specifications\.musher\.dev\/[a-z-]+\/v\d+\//)
    }
  })

  test('names released and authored majors, and points at the newest released one', () => {
    const fx = new FixtureRepo()
    repo = fx
    fx.writeFamilySkeleton('component', 'v2')
    const alias = (major: string) =>
      `https://specifications.musher.dev/component/${major}/component.schema.json`
    const entry = { bundleSha256: 'x', path: 'p', requires: { core: '1.0.0' }, tree: 't' }
    const component = () =>
      (buildCatalog(fx.root) as { schemas: { url: string; versions: object }[] }).schemas[0]

    fx.setLedger({ version: 2, releases: { 'component/v1.0.0': entry, 'core/v1.0.0': entry } })
    expect(component()).toMatchObject({
      url: alias('v1'),
      versions: { v1: alias('v1'), v2: alias('v2') },
    })

    fx.setLedger({
      version: 2,
      releases: { 'component/v1.0.0': entry, 'component/v2.0.0': entry },
    })
    expect(component()?.url).toBe(alias('v2'))
  })

  test('a family authored but never released points at its newest major', () => {
    const fx = new FixtureRepo()
    repo = fx
    fx.writeFamilySkeleton('component', 'v2')
    const catalog = buildCatalog(fx.root) as { schemas: { url: string }[] }
    expect(catalog.schemas[0]?.url).toContain('/component/v2/')
  })
})
