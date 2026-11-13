import { describe, expect, test } from 'bun:test'
import {
  generatorConflicts,
  intersectionConflicts,
  matchesEvery,
  outputLanguage,
  schemaKey,
} from './values.ts'

const hex = (n: number) => Array.from({ length: n }, () => [...'0123456789abcdef'])

describe('blueprint BP-PARAM-002: the intersection of value schemas', () => {
  test('a stricter consumer intersects a plain one', () => {
    expect(
      intersectionConflicts([
        { type: 'string' },
        { type: 'string', minLength: 8, pattern: '^a+$' },
      ]),
    ).toEqual([])
  })
  test('crossing bounds name both keywords', () => {
    expect(
      intersectionConflicts([
        { type: 'string', minLength: 9 },
        { type: 'string', maxLength: 8 },
      ]).sort(),
    ).toEqual(['maxLength', 'minLength'])
  })
  test('integer beside number intersects to integer', () => {
    expect(intersectionConflicts([{ type: 'integer' }, { type: 'number', minimum: 1.5 }])).toEqual(
      [],
    )
    expect(
      intersectionConflicts([
        { type: 'integer', minimum: 1.2 },
        { type: 'number', maximum: 1.8 },
      ]).sort(),
    ).toEqual(['maximum', 'minimum'])
  })
  test('different types do not intersect', () => {
    expect(intersectionConflicts([{ type: 'string' }, { type: 'boolean' }])).toEqual(['type'])
  })
  test('an enum member must fit every schema, patterns included', () => {
    expect(
      intersectionConflicts([
        { type: 'string', enum: ['a-b', 'c'] },
        { type: 'string', pattern: '^[a-z]+$' },
      ]),
    ).toEqual([])
    expect(
      intersectionConflicts([
        { type: 'string', enum: ['a-b'] },
        { type: 'string', pattern: '^[a-z]+$' },
      ]),
    ).toEqual(['enum'])
  })
  test('a closed object cannot hold a property another requires and does not declare', () => {
    expect(
      intersectionConflicts([
        {
          type: 'object',
          properties: { a: { type: 'string' } },
          required: ['a'],
          additionalProperties: false,
        },
        { type: 'object', properties: { b: { type: 'string' } }, additionalProperties: false },
      ]).sort(),
    ).toEqual(['properties', 'required'])
  })
  test('required and enum compare as sets', () => {
    expect(schemaKey({ type: 'string', enum: ['b', 'a'] })).toBe(
      schemaKey({ enum: ['a', 'b'], type: 'string' }),
    )
  })
})

describe('blueprint BP-PARAM-004: a generator output language against a pattern', () => {
  test('the lengths of each encoding', () => {
    expect(outputLanguage({ byteLength: 32 }).length).toBe(64)
    expect(outputLanguage({ byteLength: 32, encoding: 'BASE64' }).length).toBe(44)
    expect(outputLanguage({ byteLength: 32, encoding: 'BASE64URL' }).length).toBe(43)
  })
  test('anchored and unanchored patterns', () => {
    expect(matchesEvery('^[0-9a-f]+$', hex(4))).toBe(true)
    expect(matchesEvery('^[0-9]+$', hex(4))).toBe(false)
    expect(matchesEvery('^[0-9a-f]{4}$', hex(4))).toBe(true)
    expect(matchesEvery('^[0-9a-f]{3}$', hex(4))).toBe(false)
    expect(matchesEvery('^[0-9a-f]{3}', hex(4))).toBe(true)
    expect(matchesEvery('[0-9]', hex(4))).toBe(false)
    expect(matchesEvery('[0-9a-f]', hex(4))).toBe(true)
  })
  test('BASE64 padding and alphabet', () => {
    const base64 = { byteLength: 16, encoding: 'BASE64' }
    expect(generatorConflicts(base64, { type: 'string', pattern: '^[A-Za-z0-9_-]+$' })).toEqual([
      'pattern',
    ])
    expect(generatorConflicts(base64, { type: 'string', pattern: '^[A-Za-z0-9+/]+=*$' })).toEqual(
      [],
    )
  })
})
