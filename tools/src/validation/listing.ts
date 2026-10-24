// cspell:words IHDR
/**
 * Listing v2 rules that need more than the schema: the Markdown fields, the
 * media references, media bounds and the admission rules. NON-NORMATIVE.
 *
 * The semantic rules that share helpers with blueprint (slug, containment) stay
 * in semantic.ts and call into this module for what is listing's own.
 */
import { closeSync, openSync, readSync } from 'node:fs'
import { extname, join } from 'node:path'
import { type Node, Parser } from 'commonmark'
import { isObject, type Json } from '../lib/layout.ts'
import type { Diagnostic } from './document.ts'
import { MEDIA_PATH } from './listing-policy.ts'

/** Listing §4 and §4.1: the two fields written in the overview Markdown profile. */
export const MARKDOWN_FIELDS = ['overview', 'gettingStarted'] as const

/** What a media path is used as, which decides its bounds (listing §5). */
export type MediaRole = 'icon' | 'screenshot' | 'image'

export interface MediaReference {
  readonly path: string
  readonly pointer: string
  readonly role: MediaRole
}

/** `LIST-MEDIA-004`: the icon at most 1 MiB, every other media file at most 5 MiB. */
export const MEDIA_BYTES: Readonly<Record<MediaRole, number>> = {
  icon: 1024 * 1024,
  screenshot: 5 * 1024 * 1024,
  image: 5 * 1024 * 1024,
}

/** `LIST-MEDIA-005`: the icon's smallest side, and every other image's largest. */
export const ICON_MIN_PIXELS = 256
export const IMAGE_MAX_PIXELS = 4096

const spec = (document: Json): Record<string, Json> => {
  const value = isObject(document) ? document.spec : undefined
  return isObject(value) ? value : {}
}

/**
 * Each Markdown field the listing declares, parsed once as CommonMark 0.31.2.
 * Every §4.1 rule walks the same tree: separate parses of one blob would be
 * separate chances to disagree about what the document says.
 */
export function markdownFields(document: Json): { pointer: string; ast: Node }[] {
  const s = spec(document)
  const found: { pointer: string; ast: Node }[] = []
  for (const field of MARKDOWN_FIELDS) {
    const text = s[field]
    if (typeof text === 'string')
      found.push({ pointer: `/spec/${field}`, ast: new Parser().parse(text) })
  }
  return found
}

/** Every node in an AST, in document order. */
export function* walk(ast: Node): Generator<Node> {
  const walker = ast.walker()
  let step = walker.next()
  while (step !== null) {
    if (step.entering) yield step.node
    step = walker.next()
  }
}

/**
 * Every media path a listing declares, with its JSON Pointer and role. An
 * overview image counts only when it is a media path at all: one that is not is
 * already `ERR_IMAGE_NOT_LOCAL`, and reporting `ERR_MEDIA_NOT_FOUND` on top
 * would report one mistake twice.
 */
export function mediaReferences(document: Json): MediaReference[] {
  const s = spec(document)
  const found: MediaReference[] = []
  if (typeof s.icon === 'string') found.push({ path: s.icon, pointer: '/spec/icon', role: 'icon' })
  if (Array.isArray(s.screenshots))
    for (const [position, screenshot] of s.screenshots.entries()) {
      const file = isObject(screenshot) ? screenshot.file : undefined
      if (typeof file === 'string')
        found.push({
          path: file,
          pointer: `/spec/screenshots/${position}/file`,
          role: 'screenshot',
        })
    }
  for (const { pointer, ast } of markdownFields(document))
    for (const node of walk(ast)) {
      const destination = node.destination ?? ''
      if (node.type === 'image' && MEDIA_PATH.test(destination))
        found.push({ path: destination, pointer, role: 'image' })
    }
  return found
}

// ===========================================================================
// admission: image headers
// ===========================================================================

export interface Dimensions {
  readonly width: number
  readonly height: number
}

/** Positional reads of a file, so only the bytes a header occupies are read. */
type Reader = (position: number, length: number) => Uint8Array

const be16 = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0)
const le16 = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8)
const le24 = (b: Uint8Array, i: number) => le16(b, i) | ((b[i + 2] ?? 0) << 16)
const be32 = (b: Uint8Array, i: number) => be16(b, i) * 0x10000 + be16(b, i + 2)
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n))

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** The PNG `IHDR` chunk: the first chunk, at a fixed offset. */
function pngDimensions(read: Reader): Dimensions | undefined {
  const b = read(0, 24)
  if (b.length < 24 || PNG_SIGNATURE.some((byte, i) => b[i] !== byte)) return
  if (ascii(b, 12, 4) !== 'IHDR') return
  return { width: be32(b, 16), height: be32(b, 20) }
}

/**
 * The JPEG start-of-frame segment, reached by skipping each earlier segment by
 * its declared length. Nothing is decoded: a marker, a length and, at the
 * frame, four bytes of dimensions are all that is read.
 */
function jpegDimensions(read: Reader): Dimensions | undefined {
  const start = read(0, 2)
  if (start[0] !== 0xff || start[1] !== 0xd8) return
  let position = 2
  for (let segments = 0; segments < 1024; segments++) {
    const head = read(position, 4)
    if (head.length < 2 || head[0] !== 0xff) return
    const marker = head[1] ?? 0
    if (marker === 0xff) {
      position += 1 // fill byte
      continue
    }
    // Standalone markers carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      position += 2
      continue
    }
    // End of image, or scan data, before any frame header: no dimensions.
    if (marker === 0xd9 || marker === 0xda || head.length < 4) return
    const length = be16(head, 2)
    if (length < 2) return
    const frame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
    if (frame) {
      const sof = read(position + 4, 5)
      if (sof.length < 5) return
      return { width: be16(sof, 3), height: be16(sof, 1) }
    }
    position += 2 + length
  }
  return
}

/** The WebP `VP8 `, `VP8L` or `VP8X` chunk, the first chunk after the RIFF header. */
function webpDimensions(read: Reader): Dimensions | undefined {
  const b = read(0, 30)
  if (b.length < 16 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return
  const chunk = ascii(b, 12, 4)
  if (chunk === 'VP8 ') {
    if (b.length < 30 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return
    return { width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff }
  }
  if (chunk === 'VP8L') {
    if (b.length < 25 || b[20] !== 0x2f) return
    const bits = le16(b, 21) | (le16(b, 23) << 16)
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X') {
    if (b.length < 30) return
    return { width: le24(b, 24) + 1, height: le24(b, 27) + 1 }
  }
  return
}

/**
 * The dimensions a media file's header states, in the format its extension
 * names, or `undefined` when the header states none in that format (listing
 * §5, `LIST-MEDIA-005`). Only header bytes are read.
 */
export function imageDimensions(file: string): Dimensions | undefined {
  const extension = extname(file).toLowerCase()
  const parse =
    extension === '.png'
      ? pngDimensions
      : extension === '.jpg' || extension === '.jpeg'
        ? jpegDimensions
        : extension === '.webp'
          ? webpDimensions
          : undefined
  if (parse === undefined) return
  let fd: number
  try {
    fd = openSync(file, 'r')
  } catch {
    return
  }
  try {
    const read: Reader = (position, length) => {
      const buffer = new Uint8Array(length)
      const got = readSync(fd, buffer, 0, length, position)
      return buffer.subarray(0, got)
    }
    const dimensions = parse(read)
    return dimensions && dimensions.width > 0 && dimensions.height > 0 ? dimensions : undefined
  } finally {
    closeSync(fd)
  }
}

/** Why a media file's dimensions break `LIST-MEDIA-005`, or `undefined` when they do not. */
export function dimensionProblem(role: MediaRole, d: Dimensions | undefined): string | undefined {
  if (d === undefined) return 'the header states no dimensions in the format the extension names'
  if (role === 'icon') {
    if (d.width !== d.height) return `the icon is ${d.width}x${d.height}, not square`
    if (d.width < ICON_MIN_PIXELS)
      return `the icon is ${d.width} px per side, under ${ICON_MIN_PIXELS}`
    return
  }
  if (d.width > IMAGE_MAX_PIXELS || d.height > IMAGE_MAX_PIXELS)
    return `the image is ${d.width}x${d.height}, over ${IMAGE_MAX_PIXELS} px per side`
  return
}

// ===========================================================================
// admission: SPDX membership
// ===========================================================================

/** The SPDX License List release the platform pins, as a fixture supplies it. */
export interface LicenseList {
  readonly licenses: readonly string[]
  readonly exceptions: readonly string[]
}

const OPERATORS = new Set(['AND', 'OR', 'WITH'])

/**
 * Every identifier in `expression` that `LIST-LICENSE-002` rejects. SPDX
 * identifiers compare case-insensitively, a trailing `+` is the "or later"
 * operator, `LicenseRef-` names an author-defined licence and is accepted
 * without lookup, and an identifier after `WITH` is an exception.
 */
export function unknownLicenses(expression: string, list: LicenseList): string[] {
  const licenses = new Set(list.licenses.map((id) => id.toLowerCase()))
  const exceptions = new Set(list.exceptions.map((id) => id.toLowerCase()))
  const tokens = expression.replace(/[()]/g, ' ').split(/\s+/).filter(Boolean)
  const unknown: string[] = []
  for (const [i, token] of tokens.entries()) {
    if (OPERATORS.has(token)) continue
    if (tokens[i - 1] === 'WITH') {
      if (!exceptions.has(token.toLowerCase())) unknown.push(token)
      continue
    }
    const id = token.endsWith('+') ? token.slice(0, -1) : token
    if (id.toLowerCase().startsWith('licenseRef-'.toLowerCase())) continue
    if (!licenses.has(id.toLowerCase())) unknown.push(token)
  }
  return unknown
}

// ===========================================================================
// the admission rules, as publication applies them
// ===========================================================================

export interface ListingAdmissionContext {
  readonly itemRoot?: string
  readonly licenseList?: LicenseList
}

export interface DeferredRule {
  readonly rule: string
  readonly path: string
  readonly missing: string
}

/**
 * Listing §5 and §4: `LIST-MEDIA-005` and `LIST-LICENSE-002`, the two rules a
 * listing meets only when it is published. Each is deferred, never guessed,
 * when the context it reads is absent: an item root for the headers, and the
 * pinned SPDX release for membership.
 *
 * This runs only once the semantic phase has passed, so every media path
 * already names a file inside the item root no larger than its bound.
 */
export function listingObligations(
  document: Json,
  context: ListingAdmissionContext,
): { diagnostics: Diagnostic[]; deferred: DeferredRule[] } {
  const diagnostics: Diagnostic[] = [],
    deferred: DeferredRule[] = []
  const media = mediaReferences(document)
  if (media.length && !context.itemRoot)
    deferred.push({ rule: 'LIST-MEDIA-005', path: media[0]!.pointer, missing: 'itemRoot' })
  else if (context.itemRoot) {
    const root = context.itemRoot
    for (const { path, pointer, role } of media) {
      const problem = dimensionProblem(role, imageDimensions(join(root, path)))
      if (problem)
        diagnostics.push({
          code: 'ERR_MEDIA_DIMENSIONS',
          path: pointer,
          message: `${path}: ${problem}`,
          phase: 'admission',
        })
    }
  }
  const license = spec(document).license
  if (typeof license === 'string') {
    if (!context.licenseList)
      deferred.push({
        rule: 'LIST-LICENSE-002',
        path: '/spec/license',
        missing: 'the SPDX License List release the platform pins',
      })
    else {
      const unknown = unknownLicenses(license, context.licenseList)
      if (unknown.length)
        diagnostics.push({
          code: 'ERR_UNKNOWN_LICENSE',
          path: '/spec/license',
          message: `not on the pinned SPDX lists: ${unknown.join(', ')}`,
          phase: 'admission',
        })
    }
  }
  return { diagnostics, deferred }
}
