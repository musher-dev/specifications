/**
 * The definitions matching of the release record: which files an interface's
 * `definitions` entry names (EC-0030).
 */
import { describe, expect, test } from 'bun:test'
import { matchesDefinition } from './release-record.ts'

describe('matchesDefinition', () => {
  test('a file names itself, and a directory entry names every file under it', () => {
    expect(matchesDefinition('a/b.json', 'a/b.json')).toBe(true)
    expect(matchesDefinition('a/b.json', 'a/c.json')).toBe(false)
    expect(matchesDefinition('a/', 'a/b/c.json')).toBe(true)
    expect(matchesDefinition('a/', 'ab/c.json')).toBe(false)
  })

  test('* stays within one segment', () => {
    expect(matchesDefinition('a/*.json', 'a/b.json')).toBe(true)
    expect(matchesDefinition('a/*.json', 'a/b/c.json')).toBe(false)
    expect(matchesDefinition('a/*.json', 'a/b.yaml')).toBe(false)
  })

  test('**/ matches zero or more whole directories', () => {
    const glob = 'a/**/*.json'
    expect(matchesDefinition(glob, 'a/b.json')).toBe(true)
    expect(matchesDefinition(glob, 'a/x/b.json')).toBe(true)
    expect(matchesDefinition(glob, 'a/x/y/b.json')).toBe(true)
    expect(matchesDefinition(glob, 'ab.json')).toBe(false)
    expect(matchesDefinition(glob, 'b/a/b.json')).toBe(false)
    expect(matchesDefinition('**/b.json', 'b.json')).toBe(true)
    expect(matchesDefinition('**/b.json', 'x/b.json')).toBe(true)
    expect(matchesDefinition('**/b.json', 'xb.json')).toBe(false)
  })

  test('a trailing ** crosses segments, and literal characters are escaped', () => {
    expect(matchesDefinition('a/**', 'a/x/y.json')).toBe(true)
    expect(matchesDefinition('a/*.json', 'a/b-json')).toBe(false)
  })
})
