/**
 * The `${{ namespace.path }}` grammar: what opens a placeholder, what is an
 * escape, and which of `CORE-PLACEHOLDER-001..003` a bad one is.
 */
import { describe, expect, test } from 'bun:test'
import { isWholeValueReference, scanReferences as scan } from './references.ts'

const SELF = ['self']

/** Every failure's kind, in the order the scanner emitted them. */
function kinds(value: string, admitted: readonly string[] = SELF): string[] {
  return scan(value, admitted).failures.map((failure) => failure.kind)
}

describe('a well-formed reference', () => {
  test('is found on its own, and yields its namespace and path', () => {
    const { references, failures } = scan('${{ self.publicURL }}', SELF)
    expect(failures).toEqual([])
    expect(references).toHaveLength(1)
    expect(references[0]?.namespace).toBe('self')
    expect(references[0]?.path).toEqual(['publicURL'])
    expect(references[0]?.raw).toBe('${{ self.publicURL }}')
  })

  test('tolerates inner whitespace, including none', () => {
    for (const written of ['${{self.publicURL}}', '${{   self.publicURL   }}']) {
      expect(scan(written, SELF).failures).toEqual([])
      expect(scan(written, SELF).references[0]?.path).toEqual(['publicURL'])
    }
  })

  test('carries every segment of a dotted path through, in order', () => {
    expect(scan('${{ self.endpoints.web.publicURL }}', SELF).references[0]?.path).toEqual([
      'endpoints',
      'web',
      'publicURL',
    ])
  })

  test('is found with text around it, and more than once', () => {
    const value = 'amqp://${{ self.publicAddress }}/v/${{ self.publicPort }}'
    const { references, failures } = scan(value, SELF)
    expect(failures).toEqual([])
    expect(references.map((each) => each.path[0])).toEqual(['publicAddress', 'publicPort'])
  })
})

describe('whole-value versus embedded', () => {
  test('a reference filling the string is the whole value', () => {
    const value = '${{ self.publicURL }}'
    const reference = scan(value, SELF).references[0]
    expect(reference && isWholeValueReference(value, reference)).toBe(true)
  })

  test('a reference with text around it is not', () => {
    const value = 'https://${{ self.publicHostname }}/cb'
    const reference = scan(value, SELF).references[0]
    expect(reference && isWholeValueReference(value, reference)).toBe(false)
  })
})

describe('the escape', () => {
  test('$${{ opens nothing and reports nothing', () => {
    const { references, failures } = scan('$${{ literal.text }}', SELF)
    expect(references).toEqual([])
    expect(failures).toEqual([])
  })

  test('is one four-character token, not per-$ doubling', () => {
    // A third `$` leaves a literal `$` in front of a real `$${{` escape, so the
    // escape still applies and nothing opens.
    expect(kinds('$$${{ literal.text }}')).toEqual([])
  })

  test('does not swallow a real reference later in the string', () => {
    const { references, failures } = scan('$${{ literal }} ${{ self.publicURL }}', SELF)
    expect(failures).toEqual([])
    expect(references).toHaveLength(1)
  })

  test('a lone $ is literal and needs no escape', () => {
    expect(kinds('costs $5, or ${{ self.publicPort }}')).toEqual([])
  })
})

describe('CORE-PLACEHOLDER-001: an unescaped ${{ must open a well-formed placeholder', () => {
  test('rejects an unclosed opener', () => {
    expect(kinds('${{ self.publicURL }')).toEqual(['malformed'])
  })

  test('rejects a namespace with no path', () => {
    // The typo shape that ships as literal text when a scanner passes it
    // through: one dot away from correct.
    expect(kinds('${{ publicURL }}')).toEqual(['malformed'])
  })

  test('rejects an empty reference and an empty segment', () => {
    expect(kinds('${{ }}')).toEqual(['malformed'])
    expect(kinds('${{ self..publicURL }}')).toEqual(['malformed'])
  })

  test('rejects a segment outside the grammar', () => {
    for (const written of [
      '${{ self.public- }}',
      '${{ self.-url }}',
      '${{ Self.publicURL }}',
      '${{ self.0 }}',
      '${{ self.public_url }}',
    ]) {
      expect(kinds(written)).toEqual(['malformed'])
    }
  })

  test('accepts a DNS-label segment, so a node name is addressable', () => {
    for (const written of ['${{ self.web-ui }}', '${{ self.endpoints.a1-b2.publicURL }}']) {
      expect(kinds(written)).toEqual([])
    }
  })

  test('rejects a nested reference rather than resolving one', () => {
    expect(kinds('${{ self.${{ self.x }} }}')).toEqual(['malformed'])
  })

  test('a string with no opener is not scanned for anything', () => {
    const { references, failures } = scan('https://example.com/{{ handlebars }}', SELF)
    expect(references).toEqual([])
    expect(failures).toEqual([])
  })
})

describe('CORE-PLACEHOLDER-002 and CORE-PLACEHOLDER-003: the closed set, and what a position permits', () => {
  test('a namespace outside the reserved set is unknown, never a pass-through', () => {
    // A misspelling lands here too: the set is closed precisely so a typo in it
    // is reportable rather than shipped as literal text.
    expect(kinds('${{ vault.publicURL }}')).toEqual(['unknown-namespace'])
  })

  test('a reserved namespace the position does not admit is out of scope', () => {
    // The distinction matters: "core reserves no such name" and "this field
    // does not take that one" send an author to two different places.
    for (const namespace of ['parameters', 'variables', 'connections', 'deployment', 'nodes']) {
      expect(kinds(`\${{ ${namespace}.thing }}`)).toEqual(['not-in-scope'])
    }
  })

  test('the v1 namespace output is no longer reserved', () => {
    // v2 renamed it to nodes (core v2 §1.4), so it is unknown, not out of scope.
    expect(kinds('${{ output.thing }}')).toEqual(['unknown-namespace'])
  })

  test('admitting a namespace is what makes it resolvable', () => {
    expect(kinds('${{ parameters.siteTitle }}', ['self', 'parameters'])).toEqual([])
  })

  test('reports each bad reference in a string separately', () => {
    expect(kinds('${{ vault.a }} and ${{ parameters.b }} and ${{ c }}')).toEqual([
      'unknown-namespace',
      'not-in-scope',
      'malformed',
    ])
  })
})
