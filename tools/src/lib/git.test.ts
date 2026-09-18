// cspell:ignore worktree
/**
 * The environment git runs in: neutralised, yet still able to open the
 * repository it was pointed at when another user owns that directory.
 */
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { FixtureRepo } from '../testing/fixture.ts'
import { git, gitEnvironment } from './git.ts'

describe('gitEnvironment', () => {
  test('ignores the global and system config', () => {
    const env = gitEnvironment('.')
    expect(env.GIT_CONFIG_GLOBAL).toBe('/dev/null')
    expect(env.GIT_CONFIG_SYSTEM).toBe('/dev/null')
  })

  test('trusts exactly the repository it was given', () => {
    const env = gitEnvironment('some/repo')
    expect(env.GIT_CONFIG_COUNT).toBe('1')
    expect(env.GIT_CONFIG_KEY_0).toBe('safe.directory')
    expect(env.GIT_CONFIG_VALUE_0).toBe(resolve('some/repo'))
  })

  test('the trust reaches git, and is the only safe.directory it sees', () => {
    // Ownership cannot be faked without root, so this proves the next best
    // thing: git reads the exception from command scope, where it is honoured.
    const fx = new FixtureRepo()
    try {
      expect(git(fx.root, ['config', '--get-all', 'safe.directory'])).toBe(resolve(fx.root))
    } finally {
      fx.cleanup()
    }
  })
})

test('repository overrides are removed without mutating the caller environment', () => {
  const inherited = {
    PATH: '/usr/bin',
    GIT_SSH_COMMAND: 'ssh -F fixture-config',
    GIT_DIR: '/caller/.git',
    GIT_WORK_TREE: '/caller',
    GIT_COMMON_DIR: '/caller/.git',
    GIT_INDEX_FILE: '/caller/index',
    GIT_OBJECT_DIRECTORY: '/caller/objects',
    GIT_ALTERNATE_OBJECT_DIRECTORIES: '/caller/alternate',
    GIT_QUARANTINE_PATH: '/caller/quarantine',
    GIT_CONFIG: '/caller/config',
    GIT_CONFIG_PARAMETERS: "'core.bare=true'",
    GIT_CONFIG_COUNT: '3',
    GIT_CONFIG_KEY_2: 'core.bare',
    GIT_CONFIG_VALUE_2: 'true',
    GIT_NAMESPACE: 'caller',
    GIT_PREFIX: 'caller/',
    GIT_TEMPLATE_DIR: '/caller/template',
    GIT_SHALLOW_FILE: '/caller/shallow',
    GIT_REPLACE_REF_BASE: 'refs/caller/',
  }
  const env = gitEnvironment('/fixture', inherited)
  for (const key of Object.keys(inherited)) {
    if (key === 'PATH' || key === 'GIT_SSH_COMMAND' || key === 'GIT_CONFIG_COUNT') continue
    expect(env[key]).toBeUndefined()
  }
  expect(env.GIT_CONFIG_COUNT).toBe('1')
  expect(env.PATH).toBe(inherited.PATH)
  expect(env.GIT_SSH_COMMAND).toBe(inherited.GIT_SSH_COMMAND)
  expect(inherited.GIT_DIR).toBe('/caller/.git')
})

test('hook Git environment cannot redirect fixture commits, tags, index or configuration', () => {
  const original = new FixtureRepo()
  try {
    original.writeFile('tracked.txt', 'original\n')
    original.commit('original commit')
    original.tag('original-tag')
    original.writeFile('staged.txt', 'preserve this staged file\n')
    git(original.root, ['add', 'staged.txt'])
    const gitDir = join(original.root, '.git')
    const before = {
      refs: git(original.root, ['show-ref']),
      index: readFileSync(join(gitDir, 'index')),
      config: readFileSync(join(gitDir, 'config')),
      status: git(original.root, ['status', '--porcelain']),
    }
    // The polluted environment exists only in this child, never in the test
    // runner. A regression can damage only the disposable original fixture.
    const child = spawnSync(
      process.execPath,
      [
        '-e',
        `
      import { FixtureRepo } from ${JSON.stringify(pathToFileURL(resolve(import.meta.dir, '../testing/fixture.ts')).href)};
      import { git } from ${JSON.stringify(pathToFileURL(resolve(import.meta.dir, 'git.ts')).href)};
      const fixture = new FixtureRepo();
      try {
        fixture.writeFile('isolated.txt', 'fixture');
        fixture.commit('fixture commit');
        fixture.tag('fixture-tag');
        if (git(fixture.root, ['rev-parse', '--show-toplevel']) !== fixture.root) throw new Error('wrong repository');
        if (git(fixture.root, ['show', 'HEAD:isolated.txt']) !== 'fixture') throw new Error('wrong commit');
        if (git(fixture.root, ['tag', '--list']) !== 'fixture-tag') throw new Error('wrong tags');
        git(fixture.root, ['config', '--local', 'core.bare', 'true']);
        if (git(fixture.root, ['config', '--local', '--get', 'core.bare']) !== 'true') throw new Error('wrong local config');
      } finally { fixture.cleanup(); }
    `,
      ],
      {
        cwd: original.root,
        env: {
          ...process.env,
          GIT_DIR: gitDir,
          GIT_WORK_TREE: original.root,
          GIT_COMMON_DIR: gitDir,
          GIT_INDEX_FILE: join(gitDir, 'index'),
          GIT_OBJECT_DIRECTORY: join(gitDir, 'objects'),
          GIT_ALTERNATE_OBJECT_DIRECTORIES: join(gitDir, 'objects'),
          GIT_CONFIG: join(gitDir, 'config'),
          GIT_CONFIG_PARAMETERS: "'core.bare=true'",
          GIT_CONFIG_COUNT: '2',
          GIT_CONFIG_KEY_0: 'core.worktree',
          GIT_CONFIG_VALUE_0: original.root,
          GIT_CONFIG_KEY_1: 'core.bare',
          GIT_CONFIG_VALUE_1: 'true',
          GIT_NAMESPACE: 'hook-namespace',
          GIT_PREFIX: 'hook-prefix/',
        },
        encoding: 'utf8',
      },
    )
    expect(child.stderr).toBe('')
    expect(child.status).toBe(0)
    expect(git(original.root, ['show-ref'])).toBe(before.refs)
    expect(readFileSync(join(gitDir, 'index')).equals(before.index)).toBe(true)
    expect(readFileSync(join(gitDir, 'config')).equals(before.config)).toBe(true)
    expect(git(original.root, ['status', '--porcelain'])).toBe(before.status)
    expect(git(original.root, ['config', '--local', '--get', 'core.bare'])).toBe('false')
  } finally {
    original.cleanup()
  }
})
