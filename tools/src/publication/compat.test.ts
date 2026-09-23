/**
 * The compatibility replay must replay something.
 *
 * It reads each release's examples and conformance corpus out of the tag, under
 * the ledger's path. Read at a path the tag does not carry, that corpus is
 * empty, the replay checks zero documents, and the gate reports that nothing
 * regressed. These tests hold that a missing corpus is a failure instead.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { discoverKinds, Failures, familyPaths, LayoutError, REPO_ROOT } from '../lib/layout.ts'
import { FixtureRepo } from '../testing/fixture.ts'
import { Pipeline } from '../testing/pipeline.ts'
import { replayAll, replayRelease, WITHDRAWN } from './compat.ts'
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

function replay(fx: FixtureRepo, failures: Failures): number {
  const family = discoverKinds(fx.root).find((f) => f.name === 'component')
  const recorded = taggedEntries(fx.root, readLedger(fx.root)).find(
    (r) => r.release.family === 'component',
  )
  if (family === undefined || recorded === undefined) throw new Error('fixture has no release')
  return replayRelease(fx.root, family, recorded, failures)
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

    test('still replays a kind release beside a core one', () => {
      const fx = cut()
      const failures = new Failures()
      expect(replayAll(fx.root, failures)).toEqual({ replayed: 1, checked: 2 })
      expect(failures.count).toBe(0)
    })
  })
})

/**
 * A declared relaxation, and the two ways it is refused.
 *
 * ADR 0032 §3. The fixture uses the real key from `RELAXED`, so these tests
 * exercise the entry the repository actually ships rather than a stand-in.
 */
describe('a declared relaxation', () => {
  const RELAXED_CASE = 'structural-093-metadata-without-a-description'

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
    expect(replay(cutWithCase('fail'), failures)).toBe(2)
    expect(failures.messages).toEqual([])
  })

  test('a relaxation whose case still rejects is reported, so it cannot go stale', () => {
    const failures = new Failures()
    replay(cutWithCase('fail', true), failures)
    expect(failures.messages.join('\n')).toContain('expected to pass but failed')
  })

  test('a relaxation naming a case the release accepted is refused', () => {
    const error = thrown(() => replay(cutWithCase('pass'), new Failures()))
    expect(error).toBeInstanceOf(LayoutError)
    expect((error as Error).message).toContain('moves a verdict from fail to pass')
  })
})

/**
 * The one-time v1 baseline reset, ADR 0033 §5.
 *
 * The reset is spent. This test is where adding a sixth release would have to
 * be argued, in a diff a reviewer reads, and it holds each entry to the tree
 * the ledger recorded so an entry cannot name a release that does not exist.
 */
describe('the withdrawn releases', () => {
  test('are exactly the five releases ADR 0033 names', () => {
    expect([...WITHDRAWN.keys()].sort()).toEqual([
      'blueprint/v1.0.0',
      'blueprint/v1.1.0',
      'blueprint/v1.2.0',
      'component/v1.0.0',
      'component/v1.1.0',
    ])
  })

  test('each names the tree the ledger recorded for its tag', () => {
    const ledger = readLedger(REPO_ROOT)
    for (const [tag, tree] of WITHDRAWN) expect(ledger.releases[tag]?.tree).toBe(tree)
  })
})
