import { afterEach, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Failures, familyPaths } from '../lib/layout.ts'
import { FixtureRepo } from '../testing/fixture.ts'
import { Pipeline } from '../testing/pipeline.ts'
import { assertDependencyContent, dependencyClosure } from './dependency-gate.ts'
import { type LedgerEntry, parseLedger, readLedger, sameEntry, serializeLedger } from './ledger.ts'
import { record } from './record.ts'
import { stageRelease } from './stage.ts'
import { verifyPublications } from './verify.ts'

const scratch: string[] = []
let repo: FixtureRepo | undefined
function fixture() {
  const fx = new FixtureRepo()
  repo = fx
  const p = new Pipeline(fx)
  p.releaseKind('component', 'v1', '1.0.0', fx.bundleDoc('component', 'v1'))
  return { fx, p }
}
afterEach(() => {
  repo?.cleanup()
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})
function blueprint(fx: FixtureRepo, line = 'v1') {
  const paths = familyPaths('blueprint', 'v1')
  fx.writeFamilySkeleton('blueprint', 'v1')
  fx.writeFile(
    paths.spec,
    `${fx.kindSpec('blueprint').trim()}\n| [component](../../component/${line}/spec.md) | ${line} |\n`,
  )
  fx.writeSources('blueprint', 'v1', fx.bundleDoc('blueprint', 'v1'))
  fx.setManifestVersion(paths.manifestKey, '1.0.0')
  fx.commit('feat(blueprint): composition')
}
function output() {
  const path = mkdtempSync(join(tmpdir(), 'musher-dependencies-'))
  scratch.push(path)
  return path
}
function member(archive: string, path: string) {
  return spawnSync('tar', ['-xzOf', archive, path]).stdout
}

test('records every declared dependency and preserves it in serialization and equality', () => {
  const { fx } = fixture()
  blueprint(fx)
  record(fx.root)
  const ledger = readLedger(fx.root)
  const entry = ledger.releases['blueprint/v1.0.0'] as LedgerEntry
  expect(entry.requires).toEqual({ core: '1.0.0', component: '1.0.0' })
  expect(parseLedger(serializeLedger(ledger))).toEqual(ledger)
  expect(sameEntry(entry, { ...entry, requires: { core: '1.0.0', component: '1.1.0' } })).toBe(
    false,
  )
})

test('rejects missing dependency releases and a wrong declared major', () => {
  const { fx } = fixture()
  blueprint(fx, 'v2')
  expect(() => record(fx.root)).toThrow('component v2 has never been released')
  const failures = new Failures()
  assertDependencyContent(
    fx.root,
    'blueprint/v1.0.0',
    familyPaths('blueprint', 'v1').dir,
    { core: '1.0.0', component: '1.0.0' },
    failures,
    [],
  )
  expect(failures.messages.join('\n')).toContain('declared v2 line')
})

test('rejects conflicting transitive core editions', () => {
  const { fx, p } = fixture()
  p.releaseCore('1.1.0')
  blueprint(fx)
  expect(() => record(fx.root)).toThrow('conflicting core editions')
})

test('rejects a releasable dependency change that has not been published', () => {
  const { fx } = fixture()
  fx.writeFile(familyPaths('component', 'v1').spec, `${fx.kindSpec('component')}\nNew rule.\n`)
  fx.commit('feat(component): new rule')
  blueprint(fx)
  expect(() => record(fx.root)).toThrow('component carries releasable commit(s)')
})

test('rejects dependency cycles and unrecorded tags', () => {
  const { fx } = fixture()
  const failures = new Failures()
  dependencyClosure(fx.root, 'component/v1.0.0', { core: '1.0.0', component: '1.0.0' }, failures)
  expect(failures.messages.join('\n')).toContain('dependency cycle')
  const absent = new Failures()
  dependencyClosure(fx.root, 'blueprint/v1.0.0', { core: '1.0.0' }, absent, {
    version: 2,
    releases: {},
  })
  expect(absent.messages.join('\n')).toContain('no ledger entry')
})

test('archives verified dependency bytes and stays pinned after a newer dependency release', async () => {
  const { fx, p } = fixture()
  await p.fetch()
  const componentBytes = readFileSync(join(p.cacheDir, 'component/v1.0.0/component.schema.json'))
  blueprint(fx)
  p.recordAndTag('blueprint/v1.0.0')
  const first = output()
  stageRelease(fx.root, 'blueprint/v1.0.0', first, { baseLedgerRef: 'main' })
  const archive = join(first, 'blueprint-v1.0.0.tar.gz')
  expect(
    member(archive, 'blueprint-v1/component/component.schema.json').equals(componentBytes),
  ).toBe(true)
  expect(member(archive, 'blueprint-v1/component/conformance/cases.json').length).toBeGreaterThan(0)
  expect(
    JSON.parse(member(archive, 'blueprint-v1/release.json').toString()).dependencies.component.tag,
  ).toBe('component/v1.0.0')
  p.releaseKind(
    'component',
    'v1',
    '1.1.0',
    fx.bundleDoc('component', 'v1', { description: 'new edition' }),
  )
  const second = output()
  stageRelease(fx.root, 'blueprint/v1.0.0', second, { baseLedgerRef: 'main' })
  expect(readFileSync(join(second, 'blueprint-v1.0.0.tar.gz')).equals(readFileSync(archive))).toBe(
    true,
  )
  const failures = new Failures()
  verifyPublications(fx.root, failures)
  expect(failures.messages).toEqual([])
})

test('never rebuilds a dependency when verified published bytes are unavailable', () => {
  const { fx, p } = fixture()
  blueprint(fx)
  p.recordAndTag('blueprint/v1.0.0')
  expect(() =>
    stageRelease(fx.root, 'blueprint/v1.0.0', output(), { baseLedgerRef: 'main' }),
  ).toThrow('verified dependency bundle component/v1.0.0 is missing')
})

test('staging refuses a dependency known to remain an unpublished draft, including core', async () => {
  const { fx, p } = fixture()
  await p.fetch()
  blueprint(fx)
  p.recordAndTag('blueprint/v1.0.0')
  fx.writeFile('.cache/releases/pending.json', JSON.stringify({ pending: ['core/v1.0.0'] }))
  expect(() =>
    stageRelease(fx.root, 'blueprint/v1.0.0', output(), { baseLedgerRef: 'main' }),
  ).toThrow('dependency core/v1.0.0 has not been published')
})
