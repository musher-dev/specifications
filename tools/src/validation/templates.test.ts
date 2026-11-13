// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the `${{ }}` placeholder grammar is the data under test, not a template literal
/**
 * Blueprint §4.2.1: the URL components a template's placeholders sit in, the
 * percent-encoding of a value, and the string form of a scalar.
 */
import { describe, expect, test } from 'bun:test'
import { percentEncode, scanTemplate, stringForm, urlComponents } from './templates.ts'

/** The components of a `URL` template, scanned as the validator scans it. */
function components(template: string) {
  return urlComponents(template, scanTemplate(template).references)
}

describe('urlComponents', () => {
  test('places each placeholder of an authority URL', () => {
    expect(
      components(
        'postgres://${{ parameters.user }}:${{ parameters.password }}@${{ nodes.db.outputs.host }}:5432/${{ parameters.db }}?sslmode=${{ parameters.mode }}#${{ parameters.tag }}',
      ),
    ).toEqual(['userinfo', 'userinfo', 'host', 'path', 'query', 'fragment'])
  })

  test('reads a URL without an authority from its path', () => {
    expect(components('mailto:${{ parameters.to }}')).toEqual(['path'])
    expect(components('urn:x:${{ parameters.id }}?q=${{ parameters.q }}')).toEqual([
      'path',
      'query',
    ])
  })

  test('a ? opens the query and a later # the fragment', () => {
    expect(components('https://h/p?a=${{ parameters.a }}#${{ parameters.b }}')).toEqual([
      'query',
      'fragment',
    ])
  })

  test('a ? after a # stays in the fragment', () => {
    expect(components('https://h/p#${{ parameters.a }}?b=${{ parameters.b }}')).toEqual([
      'fragment',
      'fragment',
    ])
  })

  test('an @ in the path does not end user information', () => {
    expect(components('https://h/${{ parameters.a }}@x')).toEqual(['path'])
  })

  test('places a placeholder beside an IPv6 literal in the host', () => {
    expect(components('http://[::1]:${{ parameters.port }}/x')).toEqual(['host'])
    expect(
      components('http://u:${{ parameters.p }}@[${{ nodes.db.outputs.address }}]:5432/'),
    ).toEqual(['userinfo', 'host'])
  })

  test('is undefined when the scheme is not literal text before the first placeholder', () => {
    expect(components('${{ parameters.scheme }}://h/')).toBeUndefined()
    expect(components('//h/${{ parameters.a }}')).toBeUndefined()
  })

  test('is undefined when literal text holds a character RFC 3986 does not', () => {
    expect(components('https://h/a b/${{ parameters.a }}')).toBeUndefined()
    expect(components('https://h/é/${{ parameters.a }}')).toBeUndefined()
  })

  test('reads an escaped opener as literal text, whose braces RFC 3986 does not allow', () => {
    expect(components('https://h/$${{x}}/${{ parameters.a }}')).toBeUndefined()
  })
})

describe('percentEncode', () => {
  test('keeps only the unreserved characters', () => {
    expect(percentEncode('aZ09-._~')).toBe('aZ09-._~')
    expect(percentEncode('a b/c?d#e@f:g%')).toBe('a%20b%2Fc%3Fd%23e%40f%3Ag%25')
  })

  test('encodes every UTF-8 octet of a multi-byte character', () => {
    expect(percentEncode('é')).toBe('%C3%A9')
    expect(percentEncode('€')).toBe('%E2%82%AC')
    expect(percentEncode('😀')).toBe('%F0%9F%98%80')
  })
})

describe('stringForm', () => {
  test('writes a string as it is and a boolean as true or false', () => {
    expect(stringForm('x y')).toBe('x y')
    expect(stringForm(true)).toBe('true')
    expect(stringForm(false)).toBe('false')
  })

  test('writes a number as its shortest round-trip JSON text', () => {
    expect(stringForm(5432)).toBe('5432')
    expect(stringForm(0.1)).toBe('0.1')
    expect(stringForm(1e21)).toBe('1e+21')
    expect(stringForm(1e-7)).toBe('1e-7')
    expect(stringForm(-0)).toBe('0')
  })

  test('is undefined for anything that is not a scalar', () => {
    expect(stringForm(null)).toBeUndefined()
    expect(stringForm(Number.NaN)).toBeUndefined()
    expect(stringForm(Number.POSITIVE_INFINITY)).toBeUndefined()
    expect(stringForm({ a: 1 })).toBeUndefined()
    expect(stringForm([1])).toBeUndefined()
  })
})
