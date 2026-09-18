/** Logical values, bounded schemas and environment encoding. NON-NORMATIVE. */
import { isObject, type Json } from '../lib/layout.ts'
import { strictAjv } from '../schema/lint.ts'
import { MAX_DEPTH, MAX_DOCUMENT_BYTES, MAX_SCALAR_BYTES } from './document.ts'

export const TYPES = new Set(['string', 'integer', 'number', 'boolean', 'null', 'array', 'object'])
const compiler = strictAjv()
const validators = new Map<string, ReturnType<typeof compiler.compile>>()
function compile(schema: object) {
  const key = JSON.stringify(schema)
  let validator = validators.get(key)
  if (!validator) {
    validator = compiler.compile(schema)
    validators.set(key, validator)
  }
  return validator
}
const COMMON = new Set(['type', 'enum'])
const KEYWORDS: Record<string, readonly string[]> = {
  string: ['minLength', 'maxLength', 'pattern'],
  integer: ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'],
  number: ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'],
  boolean: [],
  null: [],
  array: ['items', 'minItems', 'maxItems', 'uniqueItems'],
  object: ['properties', 'required', 'additionalProperties'],
}

/** Restrict patterns to ASCII atoms/classes with no groups, alternation or backreferences. */
export function portablePattern(pattern: string): boolean {
  if (pattern.length > 256 || /[^\x20-\x7e]/.test(pattern)) return false
  if (/[()|]/.test(pattern) || /\\(?:[1-9]|[pPkKbB])/u.test(pattern)) return false
  // One quantified atom, anchored at the start, prevents combinatorial
  // backtracking while retaining common length and identifier constraints.
  const atoms = pattern.replace(/\\[\s\S]|\[(?:\\[\s\S]|[^\]\\])*\]/g, 'x')
  const quantifiers = atoms.match(/[*+?]|\{\d+(?:,\d*)?\}/g) ?? []
  if (quantifiers.length > 1 || (quantifiers.length && !pattern.startsWith('^'))) return false
  if (quantifiers.some((q) => [...q.matchAll(/\d+/g)].some((n) => Number(n[0]) > 1024)))
    return false
  try {
    new RegExp(pattern, 'u')
    return true
  } catch {
    return false
  }
}

export function schemaProblem(schema: Json, depth = 0): string | undefined {
  if (depth > 16 || !isObject(schema) || typeof schema.type !== 'string' || !TYPES.has(schema.type))
    return 'invalid logical schema'
  const allowed = new Set([...COMMON, ...(KEYWORDS[schema.type] ?? [])])
  if (Object.keys(schema).some((key) => !allowed.has(key)))
    return 'unsupported keyword for logical type'
  if (typeof schema.pattern === 'string' && !portablePattern(schema.pattern))
    return 'pattern outside portable profile'
  if (schema.type === 'array') {
    if (!isObject(schema.items)) return 'array requires items'
    const problem = schemaProblem(schema.items, depth + 1)
    if (problem) return problem
  }
  if (schema.type === 'object') {
    if (!isObject(schema.properties) || schema.additionalProperties !== false)
      return 'object must declare and close its properties'
    for (const value of Object.values(schema.properties)) {
      const problem = schemaProblem(value, depth + 1)
      if (problem) return problem
    }
    if (
      Array.isArray(schema.required) &&
      schema.required.some(
        (key) => typeof key !== 'string' || !Object.hasOwn(schema.properties as object, key),
      )
    )
      return 'required names an undeclared property'
  }
  try {
    compile(schema)
  } catch {
    return 'invalid schema constraints'
  }
  return undefined
}

export function boundedValue(value: Json): boolean {
  const stack = [{ value, depth: 0 }]
  while (stack.length) {
    const item = stack.pop()!
    if (item.depth > MAX_DEPTH) return false
    const v = item.value
    if (v !== null && !['string', 'number', 'boolean', 'object'].includes(typeof v)) return false
    if (
      typeof v === 'number' &&
      (!Number.isFinite(v) || (Number.isInteger(v) && !Number.isSafeInteger(v)))
    )
      return false
    if (typeof v === 'string' && (!v.isWellFormed() || Buffer.byteLength(v) > MAX_SCALAR_BYTES))
      return false
    if (v !== null && typeof v === 'object') {
      if (
        !Array.isArray(v) &&
        Object.getPrototypeOf(v) !== Object.prototype &&
        Object.getPrototypeOf(v) !== null
      )
        return false
      for (const [key, child] of Object.entries(v)) {
        if (!key.isWellFormed() || Buffer.byteLength(key) > MAX_SCALAR_BYTES) return false
        stack.push({ value: child, depth: item.depth + 1 })
      }
    }
  }
  return Buffer.byteLength(JSON.stringify(value)) <= MAX_DOCUMENT_BYTES
}
export function valueFits(schema: Json, value: Json): boolean {
  if (!boundedValue(value) || schemaProblem(schema)) return false
  return compile(schema as object)(value) as boolean
}
export function compatible(from: Record<string, Json>, to: Record<string, Json>): boolean {
  const a = isObject(from.schema) ? from.schema.type : undefined
  const b = isObject(to.schema) ? to.schema.type : undefined
  return a === b || (a === 'integer' && b === 'number')
}
/** Logical object ordering is independent of the document-envelope serializer. */
export function logicalJson(value: Json): string {
  if (Array.isArray(value)) return '[' + value.map(logicalJson).join(',') + ']'
  if (isObject(value))
    return (
      '{' +
      Object.keys(value)
        .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
        .map((key) => JSON.stringify(key) + ':' + logicalJson(value[key]!))
        .join(',') +
      '}'
    )
  return JSON.stringify(value)
}
export function encodeEnvironment(value: Json): string {
  if (!boundedValue(value)) throw new Error('value exceeds supported bounds')
  const encoded = typeof value === 'string' ? value : logicalJson(value)
  if (encoded.includes('\0')) throw new Error('environment value contains NUL')
  return encoded
}
