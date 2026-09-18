/**
 * Strict, byte-oriented YAML/JSON boundary. NON-NORMATIVE adapter for core §6.1.
 */
import { Composer, type CST, type Document, isAlias, isMap, isScalar, isSeq, Parser } from 'yaml'
import type { Json } from '../lib/layout.ts'

export type Phase = 'parser' | 'structural' | 'semantic' | 'capability' | 'resolution'
export interface Diagnostic {
  readonly code: string
  readonly path: string
  readonly message: string
  readonly phase?: Phase
  readonly stage?:
    | 'contracts'
    | 'parameters'
    | 'allocation'
    | 'values'
    | 'environment'
    | 'record'
    | 'connections'
  readonly related?: readonly { readonly artifact: string; readonly path: string }[]
}
export const MAX_DOCUMENT_BYTES = 1024 * 1024
export const MAX_SCALAR_BYTES = 64 * 1024
export const MAX_DEPTH = 64
const diagnostic = (code: string, message: string): Diagnostic => ({ code, path: '', message })

/** Validate original bytes before decoding; replacement decoding is forbidden. */
export function parseDocumentBytes(source: Uint8Array): { value: Json } | { errors: Diagnostic[] } {
  if (source.byteLength > MAX_DOCUMENT_BYTES) {
    return { errors: [diagnostic('ERR_DOCUMENT_TOO_LARGE', 'document exceeds the byte limit')] }
  }
  let decoded: string
  try {
    decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(source)
  } catch {
    return { errors: [diagnostic('ERR_INVALID_UTF8', 'document is not valid UTF-8')] }
  }
  return parseDocument(decoded)
}

/** String entry point for already decoded text; filesystem callers use bytes. */
export function parseDocument(source: string): { value: Json } | { errors: Diagnostic[] } {
  const errors: Diagnostic[] = []
  if (Buffer.byteLength(source, 'utf8') > MAX_DOCUMENT_BYTES) {
    return { errors: [diagnostic('ERR_DOCUMENT_TOO_LARGE', 'document exceeds the byte limit')] }
  }
  if (!source.isWellFormed())
    return { errors: [diagnostic('ERR_INVALID_UTF8', 'unpaired surrogate')] }
  // Bound concrete collections before the composer's recursive representation walk.
  const tokens: CST.Token[] = []
  try {
    for (const token of new Parser().parse(
      source.startsWith('\uFEFF') ? source.slice(1) : source,
    )) {
      const pending: { value: unknown; depth: number }[] = [{ value: token, depth: 0 }]
      while (pending.length) {
        const { value, depth } = pending.pop()!
        if (value === null || typeof value !== 'object') continue
        const node = value as Record<string, unknown>
        const next =
          depth +
          (['block-map', 'block-seq', 'flow-collection'].includes(String(node.type)) ? 1 : 0)
        if (next > MAX_DEPTH + 1)
          return { errors: [diagnostic('ERR_DEPTH_EXCEEDED', 'document exceeds nesting limit')] }
        for (const child of Object.values(node))
          if (child !== null && typeof child === 'object')
            pending.push({ value: child, depth: next })
      }
      tokens.push(token)
    }
  } catch (error) {
    return {
      errors: [
        diagnostic(
          error instanceof RangeError ? 'ERR_DEPTH_EXCEEDED' : 'ERR_INVALID_YAML',
          'document cannot be parsed within the profile',
        ),
      ],
    }
  }
  let docs: Document.Parsed[]
  try {
    docs = [
      ...new Composer({
        uniqueKeys: true,
        merge: false,
        strict: true,
        version: '1.2',
        intAsBigInt: true,
      }).compose(tokens),
    ]
  } catch {
    return { errors: [diagnostic('ERR_INVALID_YAML', 'document cannot be composed')] }
  }
  if (docs.length !== 1)
    return {
      errors: [
        diagnostic(
          docs.length > 1 ? 'ERR_MULTIPLE_DOCUMENTS' : 'ERR_INVALID_YAML',
          'exactly one document is required',
        ),
      ],
    }
  const first = docs[0]!
  for (const error of first.errors)
    errors.push(
      diagnostic(
        error.code === 'DUPLICATE_KEY' ? 'ERR_DUPLICATE_KEY' : 'ERR_INVALID_YAML',
        'invalid YAML document',
      ),
    )
  if (errors.length) return { errors }

  // Iterative representation walk: never expand aliases or convert an invalid AST.
  const stack: { node: unknown; depth: number }[] = [{ node: first.contents, depth: 0 }]
  while (stack.length) {
    const { node, depth } = stack.pop()!
    if (depth > MAX_DEPTH) {
      errors.push(diagnostic('ERR_DEPTH_EXCEEDED', 'document exceeds nesting limit'))
      continue
    }
    if (isAlias(node)) {
      errors.push(diagnostic('ERR_ANCHOR_OR_ALIAS', 'aliases are forbidden'))
      continue
    }
    if (isMap(node) || isSeq(node) || isScalar(node)) {
      if (node.anchor !== undefined)
        errors.push(diagnostic('ERR_ANCHOR_OR_ALIAS', 'anchors are forbidden'))
      if (node.tag) errors.push(diagnostic('ERR_EXPLICIT_TAG', 'explicit tags are forbidden'))
    }
    if (isScalar(node)) {
      const value = node.value
      if (typeof value === 'string' && Buffer.byteLength(value, 'utf8') > MAX_SCALAR_BYTES)
        errors.push(diagnostic('ERR_SCALAR_TOO_LONG', 'scalar exceeds byte limit'))
      if (
        (typeof value === 'number' &&
          (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) ||
        (typeof value === 'bigint' &&
          (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)))
      )
        errors.push(diagnostic('ERR_INVALID_NUMBER', 'number is outside the supported range'))
      if (
        typeof value === 'bigint' &&
        value <= BigInt(Number.MAX_SAFE_INTEGER) &&
        value >= BigInt(Number.MIN_SAFE_INTEGER)
      )
        node.value = Number(value)
    } else if (isMap(node)) {
      for (const pair of node.items) {
        if (!isScalar(pair.key) || typeof pair.key.value !== 'string')
          errors.push(diagnostic('ERR_NON_STRING_KEY', 'mapping keys must be strings'))
        else if (pair.key.value === '<<')
          errors.push(diagnostic('ERR_MERGE_KEY', 'merge keys are forbidden'))
        stack.push({ node: pair.key, depth: depth + 1 }, { node: pair.value, depth: depth + 1 })
      }
    } else if (isSeq(node))
      for (const item of node.items) stack.push({ node: item, depth: depth + 1 })
  }
  if (errors.length) return { errors }
  try {
    return { value: first.toJS({ maxAliasCount: 0 }) as Json }
  } catch {
    return { errors: [diagnostic('ERR_INVALID_YAML', 'document cannot be represented as JSON')] }
  }
}
