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
  for (let item = stack.pop(); item !== undefined; item = stack.pop()) {
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
  if (Array.isArray(value)) return `[${value.map(logicalJson).join(',')}]`
  if (isObject(value))
    return `{${Object.entries(value)
      .sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
      .map(([key, member]) => `${JSON.stringify(key)}:${logicalJson(member)}`)
      .join(',')}}`
  return JSON.stringify(value)
}
export function encodeEnvironment(value: Json): string {
  if (!boundedValue(value)) throw new Error('value exceeds supported bounds')
  const encoded = typeof value === 'string' ? value : logicalJson(value)
  if (encoded.includes('\0')) throw new Error('environment value contains NUL')
  return encoded
}

/**
 * Blueprint BP-PARAM-002: two value schemas are the same when they differ only
 * in mapping order or in the order of a set, `required` or `enum`.
 */
export function schemaKey(schema: Json | undefined): string {
  const normal = (value: Json, key?: string): Json => {
    if (Array.isArray(value)) {
      const members = value.map((member) => normal(member))
      return key === 'required' || key === 'enum'
        ? [...members].sort((a, b) => logicalJson(a).localeCompare(logicalJson(b)))
        : members
    }
    if (isObject(value))
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normal(v, k)]))
    return value
  }
  return logicalJson(normal(schema ?? null))
}

const numberOf = (value: Json | undefined): number | undefined =>
  typeof value === 'number' ? value : undefined
const schemaType = (schema: Json): string | undefined =>
  isObject(schema) && typeof schema.type === 'string' ? schema.type : undefined

/**
 * Blueprint BP-PARAM-002: the keywords whose constraints cannot hold together
 * across `schemas`, decided keyword by keyword and recursively. Empty when some
 * value may satisfy every schema. `pattern` is never compared against another
 * pattern; it is decided only against an `enum`'s members.
 */
export function intersectionConflicts(schemas: readonly Json[]): string[] {
  const conflicts = new Set<string>()
  if (schemas.length < 2) return []
  const types = new Set(schemas.map(schemaType))
  const numeric = [...types].every((t) => t === 'integer' || t === 'number')
  if (types.size > 1 && !numeric) return ['type']
  const type = types.has('integer') ? 'integer' : schemaType(schemas[0] as Json)
  const all = schemas.filter(isObject)
  const enums = all.filter((s) => Array.isArray(s.enum))
  for (const s of enums)
    if (!(s.enum as Json[]).some((member) => all.every((other) => valueFits(other, member))))
      conflicts.add('enum')
  const bound = (min: string, max: string) => {
    const lows = all.map((s) => numberOf(s[min])).filter((n) => n !== undefined)
    const highs = all.map((s) => numberOf(s[max])).filter((n) => n !== undefined)
    return {
      low: lows.length ? Math.max(...lows) : undefined,
      high: highs.length ? Math.min(...highs) : undefined,
    }
  }
  if (type === 'string') {
    const { low, high } = bound('minLength', 'maxLength')
    if (low !== undefined && high !== undefined && low > high) {
      conflicts.add('minLength')
      conflicts.add('maxLength')
    }
  }
  if (type === 'integer' || type === 'number') {
    // The tightest lower and upper bounds, each remembering whether it is exclusive.
    let low: { at: number; open: boolean; keyword: string } | undefined
    let high: { at: number; open: boolean; keyword: string } | undefined
    for (const s of all)
      for (const [keyword, open, lower] of [
        ['minimum', false, true],
        ['exclusiveMinimum', true, true],
        ['maximum', false, false],
        ['exclusiveMaximum', true, false],
      ] as const) {
        const at = numberOf(s[keyword])
        if (at === undefined) continue
        if (lower && (!low || at > low.at || (at === low.at && open))) low = { at, open, keyword }
        if (!lower && (!high || at < high.at || (at === high.at && open)))
          high = { at, open, keyword }
      }
    if (low && high) {
      const empty =
        type === 'integer'
          ? (() => {
              const first = low.open ? Math.floor(low.at) + 1 : Math.ceil(low.at)
              const last = high.open ? Math.ceil(high.at) - 1 : Math.floor(high.at)
              return first > last
            })()
          : low.at > high.at || (low.at === high.at && (low.open || high.open))
      if (empty) {
        conflicts.add(low.keyword)
        conflicts.add(high.keyword)
      }
    }
  }
  if (type === 'array') {
    const { low, high } = bound('minItems', 'maxItems')
    if (low !== undefined && high !== undefined && low > high) {
      conflicts.add('minItems')
      conflicts.add('maxItems')
    }
    const items = intersectionConflicts(all.map((s) => s.items as Json))
    if (items.length && (low ?? 0) > 0) for (const k of items) conflicts.add(`items/${k}`)
  }
  if (type === 'object') {
    // Every object is closed, so a value holds only properties every schema declares.
    const declared = (s: Record<string, Json>) =>
      Object.keys(isObject(s.properties) ? s.properties : {})
    for (const s of all)
      for (const name of Array.isArray(s.required) ? s.required : []) {
        if (typeof name !== 'string') continue
        if (!all.every((other) => declared(other).includes(name))) {
          conflicts.add('required')
          conflicts.add('properties')
          continue
        }
        for (const k of intersectionConflicts(
          all.map((other) => (other.properties as Record<string, Json>)[name] as Json),
        ))
          conflicts.add(`properties/${name}/${k}`)
      }
  }
  return [...conflicts]
}

/** Blueprint BP-PARAM-004: the characters each encoding draws from. */
const ALPHABETS: Record<string, string> = {
  HEX: '0123456789abcdef',
  BASE64: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
  BASE64URL: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
}

/**
 * Blueprint BP-PARAM-004: a generator's output language, as the characters each
 * position may hold. Every string of its encoded length over its encoding's
 * alphabet, with `BASE64`'s padding fixed at the end.
 */
export function outputLanguage(generator: Json | undefined): string[][] {
  const g = isObject(generator) ? generator : {}
  const bytes = typeof g.byteLength === 'number' ? g.byteLength : 32
  const encoding = typeof g.encoding === 'string' ? g.encoding : 'HEX'
  const alphabet = [...(ALPHABETS[encoding] ?? ALPHABETS.HEX ?? '')]
  if (encoding === 'BASE64') {
    const length = 4 * Math.ceil(bytes / 3),
      padding = (3 - (bytes % 3)) % 3
    return Array.from({ length }, (_, i) => (i >= length - padding ? ['='] : alphabet))
  }
  const length = encoding === 'BASE64URL' ? Math.ceil((4 * bytes) / 3) : 2 * bytes
  return Array.from({ length }, () => alphabet)
}

interface Atom {
  readonly test: (ch: string) => boolean
  readonly min: number
  readonly max: number
}
/**
 * A pattern of component's value-schema pattern profile (COMP-VAL-007) as a
 * sequence of atoms, or undefined where it holds a construct this reading does
 * not take: an anchor anywhere but the ends.
 */
function patternAtoms(
  pattern: string,
): { atoms: Atom[]; start: boolean; end: boolean } | undefined {
  let i = 0
  const start = pattern.startsWith('^')
  if (start) i = 1
  let body = pattern
  const end = body.endsWith('$') && !body.endsWith('\\$')
  if (end) body = body.slice(0, -1)
  const atoms: Atom[] = []
  while (i < body.length) {
    let source: string
    const ch = body[i] as string
    if (ch === '\\') {
      source = body.slice(i, i + 2)
      i += 2
    } else if (ch === '[') {
      let j = i + 1
      if (body[j] === '^') j++
      if (body[j] === ']') j++
      while (j < body.length && body[j] !== ']') j += body[j] === '\\' ? 2 : 1
      source = body.slice(i, j + 1)
      i = j + 1
    } else if (ch === '^' || ch === '$') return undefined
    else {
      source = ch
      i++
    }
    let min = 1,
      max = 1
    const quantifier = /^(?:[*+?]|\{(\d+)(?:(,)(\d*))?\})/.exec(body.slice(i))
    if (quantifier) {
      const q = quantifier[0]
      if (q === '*') [min, max] = [0, Infinity]
      else if (q === '+') [min, max] = [1, Infinity]
      else if (q === '?') [min, max] = [0, 1]
      else {
        min = Number(quantifier[1])
        max = quantifier[2] ? (quantifier[3] ? Number(quantifier[3]) : Infinity) : min
      }
      i += q.length
      if (body[i] === '?') i++
    }
    let regex: RegExp
    try {
      regex = new RegExp(`^${source}$`, 'u')
    } catch {
      return undefined
    }
    atoms.push({ test: (c) => regex.test(c), min, max })
  }
  return { atoms, start, end }
}

/**
 * Whether every string whose characters `positions` allows matches `pattern`,
 * by simulating the pattern over sets of strings: a search for one string the
 * pattern rejects. Undefined when the pattern is outside what this reads.
 */
export function matchesEvery(pattern: string, positions: readonly string[][]): boolean | undefined {
  const parsed = patternAtoms(pattern)
  if (!parsed) return undefined
  const { atoms, start, end } = parsed
  // A state is an atom index and how many times that atom has matched, capped
  // where further matches change nothing.
  const cap = (i: number) => {
    const atom = atoms[i] as Atom
    return Number.isFinite(atom.max) ? atom.max : atom.min
  }
  const close = (states: Set<string>): Set<string> => {
    const out = new Set(states),
      queue = [...states]
    for (const state of queue) {
      const [i, n] = state.split(':').map(Number) as [number, number]
      if (i < atoms.length && n >= (atoms[i] as Atom).min) {
        const next = `${i + 1}:0`
        if (!out.has(next)) {
          out.add(next)
          queue.push(next)
        }
      }
    }
    return out
  }
  const initial = close(new Set(['0:0']))
  const accepting = (states: Set<string>) => states.has(`${atoms.length}:0`)
  const step = (states: Set<string>, ch: string): Set<string> => {
    const next = new Set<string>()
    for (const state of states) {
      const [i, n] = state.split(':').map(Number) as [number, number]
      const atom = atoms[i]
      if (!atom || n >= atom.max || !atom.test(ch)) continue
      next.add(`${i}:${Math.min(n + 1, cap(i))}`)
    }
    if (!start) for (const s of initial) next.add(s)
    return close(next)
  }
  const key = (states: Set<string>) => [...states].sort().join(',')
  // Without `$`, reaching the end of the pattern accepts the string whatever follows.
  if (!end && accepting(initial)) return true
  let frontier = new Map([[key(initial), initial]])
  for (const allowed of positions) {
    const next = new Map<string, Set<string>>()
    for (const states of frontier.values())
      for (const ch of allowed) {
        const after = step(states, ch)
        if (!end && accepting(after)) continue
        if (!after.size) return false
        next.set(key(after), after)
      }
    frontier = next
    if (!frontier.size) return true
  }
  return [...frontier.values()].every(accepting)
}

/**
 * Blueprint BP-PARAM-002, BP-PARAM-017: the keywords of `schema` that some value
 * a generator can produce fails. A generator produces a string, so any other
 * type fails at `type`, and an `enum` is never met by every output.
 */
export function generatorConflicts(generator: Json | undefined, schema: Json): string[] {
  if (!isObject(schema)) return []
  if (schema.type !== 'string') return ['type']
  const positions = outputLanguage(generator),
    length = positions.length,
    out: string[] = []
  if (Array.isArray(schema.enum)) out.push('enum')
  if (typeof schema.minLength === 'number' && length < schema.minLength) out.push('minLength')
  if (typeof schema.maxLength === 'number' && length > schema.maxLength) out.push('maxLength')
  if (typeof schema.pattern === 'string' && matchesEvery(schema.pattern, positions) === false)
    out.push('pattern')
  return out
}
