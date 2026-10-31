/**
 * The compatibility replay must replay something.
 *
 * It reads each release's examples and conformance corpus out of the tag, under
 * the ledger's path. Read at a path the tag does not carry, that corpus is
 * empty, the replay checks zero documents, and the gate reports that nothing
 * regressed. These tests hold that a missing corpus is a failure instead.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { discoverKinds, Failures, familyPaths, LayoutError } from '../lib/layout.ts'
import { FixtureRepo } from '../testing/fixture.ts'
import { Pipeline } from '../testing/pipeline.ts'
import { type ReplayCount, replayAll, replayConcurrently, replayRelease } from './compat.ts'
import { readLedger, taggedEntries } from './ledger.ts'

const COMPONENT = familyPaths('component', 'v1')

let repo: FixtureRepo | null = null

afterEach(() => {
  repo?.cleanup()
  repo = null
})

/** Release component 1.0.0 to its tag, optionally without one of its parts. */
function cut(without?: 'examples' | 'conformance'): FixtureRepo {
  const fx = new FixtureRepo()
  repo = fx
  const p = new Pipeline(fx)
  p.releaseCore('1.0.0')
  fx.writeFamilySkeleton('component', 'v1')
  if (without !== undefined) fx.remove(COMPONENT[without])
  p.releaseKind('component', 'v1', '1.0.0', fx.bundleDoc('component', 'v1'), {
    skeleton: false,
    publish: false,
  })
  return fx
}

/** Replay the fixture's component release, with the shipped relaxations unless given others. */
function replay(
  fx: FixtureRepo,
  failures: Failures,
  relaxed?: ReadonlyMap<string, string>,
): number {
  return replayCount(fx, failures, relaxed).count
}

function replayCount(
  fx: FixtureRepo,
  failures: Failures,
  relaxed?: ReadonlyMap<string, string>,
): ReplayCount {
  const family = discoverKinds(fx.root).find((f) => f.name === 'component')
  const recorded = taggedEntries(fx.root, readLedger(fx.root)).find(
    (r) => r.release.family === 'component',
  )
  if (family === undefined || recorded === undefined) throw new Error('fixture has no release')
  return replayRelease(fx.root, family, recorded, failures, relaxed)
}

function thrown(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

describe('replayRelease', () => {
  test("replays a release's examples from its tag", () => {
    const fx = cut()
    const failures = new Failures()
    expect(replay(fx, failures)).toBe(1)
    expect(failures.count).toBe(0)
  })

  test('counts a case in a phase this repository cannot run, without failing it', () => {
    const fx = new FixtureRepo()
    repo = fx
    const p = new Pipeline(fx)
    p.releaseCore('1.0.0')
    fx.writeFamilySkeleton('component', 'v1')
    const id = 'admission-001-needs-a-server'
    fx.writeFile(`${COMPONENT.conformance}/admission/001-needs-a-server/case.yaml`, 'kind: X\n')
    fx.writeFile(
      `${COMPONENT.conformance}/admission/001-needs-a-server/metadata.json`,
      JSON.stringify({ id, phase: 'admission', expected: 'pass' }, null, 2),
    )
    fx.writeFile(
      `${COMPONENT.conformance}/cases.json`,
      JSON.stringify(
        { cases: [{ id, phase: 'admission', path: 'admission/001-needs-a-server' }] },
        null,
        2,
      ),
    )
    p.releaseKind('component', 'v1', '1.0.0', fx.bundleDoc('component', 'v1'), {
      skeleton: false,
      publish: false,
    })
    const failures = new Failures()
    expect(replayCount(fx, failures)).toEqual({ count: 1, unrunnable: 1 })
    expect(failures.messages).toEqual([])
  })

  for (const part of ['examples', 'conformance'] as const) {
    test(`a release tag lacking its ${part} throws rather than replaying nothing`, () => {
      const fx = cut(part)
      const error = thrown(() => replay(fx, new Failures()))
      expect(error).toBeInstanceOf(LayoutError)
      expect((error as Error).message).toContain('component/v1.0.0')
      expect((error as Error).message).toContain(COMPONENT[part])
    })
  }

  describe('replayAll', () => {
    test('replays the core parser corpus even without a schema', () => {
      const fx = new FixtureRepo()
      repo = fx
      new Pipeline(fx).releaseCore('1.0.0')
      const failures = new Failures()
      expect(replayAll(fx.root, failures)).toEqual({ replayed: 0, checked: 1 })
      expect(failures.count).toBe(0)
    })

    test('skips a retired major whose directory is gone, and says why', () => {
      const fx = cut()
      fx.remove(COMPONENT.dir)
      fx.commit('refactor(component): retire v1')
      const failures = new Failures()
      expect(replayAll(fx.root, failures)).toEqual({ replayed: 0, checked: 1 })
      expect(failures.count).toBe(0)
    })

    test('fails a tagged major that is missing but not retired', () => {
      const fx = new FixtureRepo()
      repo = fx
      const p = new Pipeline(fx)
      const v3 = familyPaths('component', 'v3')
      p.releaseKind('component', 'v3', '3.0.0', fx.bundleDoc('component', 'v3'), {
        publish: false,
      })
      fx.remove(v3.dir)
      fx.commit('refactor(component): drop v3 without retiring it')
      const failures = new Failures()
      replayAll(fx.root, failures)
      expect(failures.messages.join('\n')).toContain(
        'component/v3.0.0: no component/v3 in the working tree, and v3 is not a retired major',
      )
    })

    test('still replays a kind release beside a core one', () => {
      const fx = cut()
      const failures = new Failures()
      expect(replayAll(fx.root, failures)).toEqual({ replayed: 1, checked: 2 })
      expect(failures.count).toBe(0)
    })
  })

  describe('replayConcurrently', () => {
    test('replays each release in a process of its own, with the same result', async () => {
      const fx = cut()
      const failures = new Failures()
      expect(await replayConcurrently(fx.root, failures)).toEqual(
        replayAll(fx.root, new Failures()),
      )
      expect(failures.count).toBe(0)
    })

    test("a release tag lacking its corpus still throws the child's LayoutError", async () => {
      const fx = cut('conformance')
      const error = await replayConcurrently(fx.root, new Failures()).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(LayoutError)
      expect((error as Error).message).toContain(COMPONENT.conformance)
    })
  })
})

/**
 * A declared relaxation, and the two ways it is refused.
 *
 * ADR 0032 §3. The repository ships no relaxation, so these tests declare their
 * own for the fixture's release, keyed as `RELAXED` keys one.
 */
describe('a declared relaxation', () => {
  const RELAXED_CASE = 'structural-093-metadata-without-a-description'
  const RELAXATIONS: ReadonlyMap<string, string> = new Map([
    [`component/v1.0.0:${RELAXED_CASE}`, 'the candidate stops requiring metadata.description'],
  ])

  /** Release component 1.0.0 carrying one case, with the verdict it declared. */
  function cutWithCase(expected: 'pass' | 'fail', reject = false): FixtureRepo {
    const fx = new FixtureRepo()
    repo = fx
    const p = new Pipeline(fx)
    p.releaseCore('1.0.0')
    fx.writeFamilySkeleton('component', 'v1')
    const dir = `${COMPONENT.conformance}/structural/093-metadata-without-a-description`
    fx.writeFile(`${dir}/case.yaml`, 'metadata:\n  revision: 1\n')
    fx.writeFile(
      `${dir}/metadata.json`,
      JSON.stringify({ id: RELAXED_CASE, phase: 'structural', expected }, null, 2),
    )
    if (expected === 'fail')
      fx.writeFile(
        `${dir}/diagnostics.json`,
        JSON.stringify([{ code: 'ERR_MISSING_FIELD', path: '/metadata' }], null, 2),
      )
    fx.writeFile(
      `${COMPONENT.conformance}/cases.json`,
      JSON.stringify(
        {
          cases: [
            {
              id: RELAXED_CASE,
              phase: 'structural',
              path: 'structural/093-metadata-without-a-description',
            },
          ],
        },
        null,
        2,
      ),
    )
    p.releaseKind(
      'component',
      'v1',
      '1.0.0',
      fx.bundleDoc(
        'component',
        'v1',
        reject
          ? { properties: { description: { type: 'string' } }, required: ['description'] }
          : {},
      ),
      { skeleton: false, publish: false },
    )
    return fx
  }

  test('a rejection the candidate no longer makes is replayed as a pass', () => {
    const failures = new Failures()
    expect(replay(cutWithCase('fail'), failures, RELAXATIONS)).toBe(2)
    expect(failures.messages).toEqual([])
  })

  test('the same rejection, undeclared, fails the replay: nothing is relaxed by default', () => {
    const failures = new Failures()
    replay(cutWithCase('fail'), failures)
    expect(failures.messages.some((message) => message.includes(RELAXED_CASE))).toBe(true)
  })

  test('a relaxation whose case still rejects is reported, so it cannot go stale', () => {
    const failures = new Failures()
    replay(cutWithCase('fail', true), failures, RELAXATIONS)
    expect(failures.messages.join('\n')).toContain('expected to pass but failed')
  })

  test('a relaxation naming a case the release accepted is refused', () => {
    const error = thrown(() => replay(cutWithCase('pass'), new Failures(), RELAXATIONS))
    expect(error).toBeInstanceOf(LayoutError)
    expect((error as Error).message).toContain('moves a verdict from fail to pass')
  })
})
