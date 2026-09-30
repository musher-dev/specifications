/**
 * The root allowlist, CFG-09, exercised against a throwaway tree.
 *
 * A gate that cannot fail is indistinguishable from no gate, so the rule gets
 * cases that provoke it, and a clean tree gets one that proves it stays quiet.
 * CFG-01 to CFG-08 retired with docs/adr/0037: the conventions' CONF family
 * checks the `.config/` layout now.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { FixtureRepo } from '../testing/fixture.ts'
import { configViolations } from './config.ts'

let repo: FixtureRepo | null = null

afterEach(() => {
  repo?.cleanup()
  repo = null
})

/** A tree that satisfies the rule, as the starting point for each case. */
function intact(): FixtureRepo {
  repo = new FixtureRepo()
  repo.writeFile('.config/README.md', '# Tool configuration\n')
  repo.writeFile('Taskfile.yml', 'version: "3"\n')
  return repo
}

/** The codes reported, so a case asserts on the rule rather than the prose. */
function codes(root: string): string[] {
  return configViolations(root).map((problem) => problem.slice(0, 6))
}

describe('an intact tree', () => {
  test('reports nothing', () => {
    const fx = intact()
    fx.commit('an intact tree')
    expect(configViolations(fx.root)).toEqual([])
  })
})

describe('CFG-09: the root allowlist', () => {
  test('fires on a tracked root file ROOT_ENTRIES does not name', () => {
    const fx = intact()
    fx.writeFile('NOTES.md', '# Notes\n')
    fx.commit('add a stray root file')
    expect(codes(fx.root)).toEqual(['CFG-09'])
  })

  test('fires on a tracked root directory ROOT_ENTRIES does not name', () => {
    // The shape of the leftover it exists to catch: a directory emptied by a
    // move down to one README.
    const fx = intact()
    fx.writeFile('leftovers/README.md', '# Leftovers\n')
    fx.commit('add a leftover directory')
    expect(codes(fx.root)).toEqual(['CFG-09'])
  })

  test('accepts every entry ROOT_ENTRIES names', () => {
    const fx = intact()
    for (const path of ['.claude/CLAUDE.md', 'docs/README.md', 'LICENSE', 'published.json']) {
      fx.writeFile(path, '\n')
    }
    fx.commit('add allowed entries')
    expect(configViolations(fx.root)).toEqual([])
  })

  test('ignores untracked files in the checkout', () => {
    // CI unpacks actionlint into the workspace root before linting. A file the
    // repository does not hold is not the repository's layout.
    const fx = intact()
    fx.commit('an intact tree')
    fx.writeFile('actionlint_1.7.11_linux_amd64.tar.gz', 'archive\n')
    fx.writeFile('actionlint', 'binary\n')
    expect(configViolations(fx.root)).toEqual([])
  })
})
