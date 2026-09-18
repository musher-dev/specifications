/**
 * The matrix states core's requirements before any family's, because every
 * family applies them.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { CORE_FAMILY, familyPaths } from '../lib/layout.ts'
import { FixtureRepo } from '../testing/fixture.ts'
import { buildMatrix, clauseTitle } from './traceability.ts'

let repo: FixtureRepo | null = null

afterEach(() => {
  repo?.cleanup()
  repo = null
})

describe('buildMatrix', () => {
  test('puts a core section first, then each kind family in name order', () => {
    const fx = new FixtureRepo()
    repo = fx
    fx.writeFile(
      familyPaths('blueprint', 'v1').spec,
      '## <a id="identity"></a>3. Identity\n\n<a id="BP-ID-003"></a>rule\n',
    )
    fx.writeFamilySkeleton('blueprint', 'v1')
    fx.writeFile(
      familyPaths(CORE_FAMILY, 'v1').spec,
      '## <a id="envelope"></a>2. Document envelope\n\n<a id="CORE-ENV-001"></a>rule\n',
    )
    fx.writeCoreSkeleton('v1')

    const matrix = buildMatrix(fx.root)
    const core = matrix.indexOf('## core/v1')
    const blueprint = matrix.indexOf('## blueprint/v1')
    expect(core).toBeGreaterThan(-1)
    expect(blueprint).toBeGreaterThan(core)
    expect(matrix).toContain('(../specifications/core/v1/spec.md#CORE-ENV-001)')
    expect(matrix).toContain('2 requirement(s)')
  })

  test('has no core section when no core family exists', () => {
    const fx = new FixtureRepo()
    repo = fx
    fx.writeFile(
      familyPaths('listing', 'v1').spec,
      '## <a id="identity"></a>3. Identity\n\n<a id="LIST-ID-003"></a>rule\n',
    )
    expect(buildMatrix(fx.root)).not.toContain('## core/')
  })

  test('renders a heading with several anchors as plain text', () => {
    const fx = new FixtureRepo()
    repo = fx
    fx.writeFile(
      familyPaths('component', 'v1').spec,
      '## <a id="workload"></a><a id="type"></a>5. The shape\n\n<a id="COMP-TYPE-001"></a>rule\n',
    )
    const matrix = buildMatrix(fx.root)
    expect(matrix).toContain('[§The shape](../specifications/component/v1/spec.md#workload)')
    expect(matrix).not.toContain('<a id="type">')
  })
})

describe('clauseTitle', () => {
  test('leaves a plain title alone', () => {
    expect(clauseTitle('Document envelope')).toBe('Document envelope')
  })

  test('drops trailing anchors and the number behind them', () => {
    expect(clauseTitle('<a id="type"></a>5. The shape')).toBe('The shape')
    expect(clauseTitle('<a id="a"></a><a id="b"></a>5.1 Recipients')).toBe('Recipients')
  })

  test('keeps a number that is part of the title', () => {
    expect(clauseTitle('Version 2 names')).toBe('Version 2 names')
  })
})
