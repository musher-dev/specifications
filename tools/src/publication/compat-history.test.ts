import { afterEach, expect, test } from 'bun:test'
import { discoverFamilies, Failures, familyPaths, type Json } from '../lib/layout.ts'
import { FixtureRepo } from '../testing/fixture.ts'
import { Pipeline } from '../testing/pipeline.ts'
import { replayRelease } from './compat.ts'
import { readLedger, taggedEntries } from './ledger.ts'

const repos: FixtureRepo[] = []
afterEach(() => {
  for (const repo of repos.splice(0)) repo.cleanup()
})
function setup(family = 'component') {
  const fx = new FixtureRepo()
  repos.push(fx)
  const pipeline = new Pipeline(fx)
  pipeline.releaseCore('1.0.0')
  fx.writeFamilySkeleton(family, 'v1')
  return { fx, pipeline, paths: familyPaths(family, 'v1'), family }
}
function release(s: ReturnType<typeof setup>, schema?: Json) {
  s.pipeline.releaseKind(s.family, 'v1', '1.0.0', schema ?? s.fx.bundleDoc(s.family, 'v1'), {
    skeleton: false,
    publish: false,
  })
}
function replay(s: ReturnType<typeof setup>) {
  const family = discoverFamilies(s.fx.root).find((f) => f.name === s.family)!
  const recorded = taggedEntries(s.fx.root, readLedger(s.fx.root)).find(
    (r) => r.release.family === s.family,
  )!
  const failures = new Failures()
  const count = replayRelease(s.fx.root, family, recorded, failures)
  return { failures, count }
}
function flat(s: ReturnType<typeof setup>, source: string, metadata: object) {
  const path = 'semantic/001-history'
  s.fx.writeFile(
    s.paths.conformance + '/cases.json',
    JSON.stringify({ cases: [{ id: 'semantic-001-history', phase: 'semantic', path }] }),
  )
  s.fx.writeFile(
    s.paths.conformance + '/' + path + '/metadata.json',
    JSON.stringify({
      id: 'semantic-001-history',
      phase: 'semantic',
      expected: 'pass',
      ...metadata,
    }),
  )
  s.fx.writeFile(s.paths.conformance + '/' + path + '/case.yaml', source)
}
test('historical semantic acceptance survives removal of the current fixture', () => {
  const s = setup()
  flat(
    s,
    JSON.stringify({
      kind: 'COMPONENT',
      spec: { type: 'SERVICE', workload: { source: { image: 'example:latest' } } },
    }),
    {},
  )
  release(s)
  s.fx.remove(s.paths.conformance)
  s.fx.writeFile(s.paths.conformance + '/cases.json', '{"cases":[]}')
  // Structural validation accepts this historical document. Current semantics reject it.
  const { failures, count } = replay(s)
  expect(count).toBe(2)
  expect(failures.count).toBeGreaterThan(0)
})
test('historical effective defaults survive edits to current expectations', () => {
  const s = setup(),
    schema = s.fx.bundleDoc('component', 'v1', {
      properties: { kind: { type: 'string' }, enabled: { type: 'boolean', default: true } },
    })
  flat(s, 'kind: COMPONENT\n', { effective: { '/enabled': true } })
  release(s, schema)
  s.fx.writeSources(
    'component',
    'v1',
    s.fx.bundleDoc('component', 'v1', {
      properties: { kind: { type: 'string' }, enabled: { type: 'boolean', default: false } },
    }),
  )
  s.fx.remove(s.paths.conformance)
  expect(replay(s).failures.count).toBeGreaterThan(0)
})
test('historical tree media and declared symlinks are reconstructed', () => {
  const s = setup('listing'),
    path = 'semantic/001-history'
  s.fx.writeFile(
    s.paths.conformance + '/cases.json',
    JSON.stringify({ cases: [{ id: 'semantic-001-history', phase: 'semantic', path }] }),
  )
  s.fx.writeFile(
    s.paths.conformance + '/' + path + '/metadata.json',
    JSON.stringify({
      id: 'semantic-001-history',
      phase: 'semantic',
      expected: 'pass',
      document: 'app/listing.yaml',
      symlinks: { 'app/media/icon.png': 'original.png' },
    }),
  )
  s.fx.writeFile(
    s.paths.conformance + '/' + path + '/tree/app/listing.yaml',
    JSON.stringify({
      kind: 'LISTING',
      metadata: { slug: 'app' },
      spec: { itemType: 'COMPONENT', icon: 'media/icon.png' },
    }),
  )
  s.fx.writeFile(s.paths.conformance + '/' + path + '/tree/app/media/original.png', '')
  release(s)
  s.fx.remove(s.paths.conformance)
  const result = replay(s)
  expect(result.count).toBe(2)
  expect(result.failures.count).toBe(0)
})
test('historical behavioural observations survive replacement of current fixtures', () => {
  const s = setup('listing')
  s.fx.writeFile(
    s.paths.conformance + '/behavior.json',
    JSON.stringify([
      {
        id: 'historical-rendering',
        profile: 'rendering',
        operation: 'render',
        requirements: [],
        input: { markdown: '**safe**' },
        expect: { '/html': '<p><strong>safe</strong></p>\n' },
      },
    ]),
  )
  release(s)
  s.fx.remove(s.paths.conformance)
  expect(replay(s).failures.count).toBe(0)
})
