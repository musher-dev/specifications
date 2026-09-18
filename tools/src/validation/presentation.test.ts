import { describe, expect, test } from 'bun:test'
import { renderListing } from './presentation.ts'

describe('listing rendering without prior validation', () => {
  for (const destination of [
    'ftp://example.com/file',
    'guide.md',
    '//example.com/path',
    'javascript:alert(1)',
    'data:text/plain,hello',
    'jav&#x61;script:alert(1)',
  ]) {
    test(`rejects ${destination}`, () => {
      expect(() => renderListing(`[Link](${destination})`)).toThrow('disallowed link destination')
    })
  }
  for (const destination of [
    'https://example.com',
    'HTTP://example.com',
    'mailto:hello@example.com',
    '#section',
  ]) {
    test(`permits ${destination}`, () => {
      expect(renderListing(`[Link](${destination})`)).toContain('<a href=')
    })
  }
  test('rejects remote images even when the media map supplies a target', () => {
    expect(() =>
      renderListing('![Image](https://example.com/image.png)', {
        'https://example.com/image.png': 'https://assets.invalid/image.png',
      }),
    ).toThrow('invalid media path')
  })
  test('rejects unresolved local media', () => {
    expect(() => renderListing('![Image](media/image.png)')).toThrow('unresolved media')
  })
  test('suppresses raw HTML while preserving escaped code', () => {
    expect(renderListing('<script>alert(1)</script>')).not.toContain('<script>')
    expect(renderListing('`<script>`')).toContain('&lt;script&gt;')
  })
})
