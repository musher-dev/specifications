/**
 * The `${{ namespace.path }}` reference grammar.
 *
 * NON-NORMATIVE, like everything under tools/. The definitive rule is
 * [core v1 §5.2](../../../specifications/core/v1/spec.md#reference-grammar);
 * this module is one adapter's reading of it, and where the two disagree the
 * prose wins.
 *
 * Purely syntactic: it turns a string into an ordered sequence of literal text
 * and reference nodes, and resolves nothing. Which namespaces a position admits
 * is the family's to say, so a caller passes them in rather than this module
 * knowing them.
 *
 * It imports nothing else in this repository on purpose. Both the component and
 * the blueprint checks read it, and a grammar that grew a dependency on either
 * one would become two grammars.
 */

/**
 * Core v1 §5.2 — the closed reserved set. An author cannot extend it, and a
 * namespace outside it is `CORE-REF-002` wherever it is written.
 *
 * Every member but `self` is reserved without a meaning: no family admits one,
 * so writing it is `CORE-REF-003`. They are listed because reserving a name is
 * the only part of this that cannot be done later.
 */
export const RESERVED_NAMESPACES = [
  'self',
  'params',
  'config',
  'deployment',
  'environment',
  'organization',
  'output',
] as const

export type Namespace = (typeof RESERVED_NAMESPACES)[number]

const RESERVED = new Set<string>(RESERVED_NAMESPACES)

/** Core v1 §5.2 — a path segment. Excludes `.`, so a dotted path reads one way. */
const SEGMENT = /^[a-z][a-zA-Z0-9]*$/

const OPEN = '${{'
const ESCAPE = '$${{'
const CLOSE = '}}'

/** One reference, as written. */
export interface Reference {
  /** The namespace, which may be one the reserved set does not hold. */
  readonly namespace: string
  /** Path segments after the namespace, at least one. */
  readonly path: readonly string[]
  /** The reference exactly as written, braces included, for a diagnostic. */
  readonly raw: string
  /** Index of the opening `$` within the scanned string. */
  readonly offset: number
}

export type ReferenceFailure =
  /** `CORE-REF-001` — an unescaped `${{` that does not open a well-formed reference. */
  | {
      readonly kind: 'malformed'
      readonly raw: string
      readonly offset: number
      readonly why: string
    }
  /** `CORE-REF-002` — a well-formed reference naming a namespace core does not reserve. */
  | { readonly kind: 'unknown-namespace'; readonly reference: Reference }
  /** `CORE-REF-003` — a reserved namespace the position does not admit. */
  | { readonly kind: 'not-in-scope'; readonly reference: Reference }

export interface ScanResult {
  readonly references: readonly Reference[]
  readonly failures: readonly ReferenceFailure[]
}

/**
 * Scan one authored string.
 *
 * `admitted` is the set of namespaces the position admits, which the family's
 * clause names — component `COMP-REF-001` and blueprint `BP-REF-001` both name
 * exactly `self` today.
 *
 * A resolved value is never scanned again (core v1 §5.2), so this is the only
 * pass there is: there is no chain, no cycle and no depth to bound.
 */
export function scanReferences(value: string, admitted: readonly string[]): ScanResult {
  const references: Reference[] = []
  const failures: ReferenceFailure[] = []
  const admit = new Set(admitted)

  let at = 0
  while (at < value.length) {
    const open = value.indexOf(OPEN, at)
    if (open === -1) break

    // `$${{` is a single four-character escape token rendering a literal `${{`,
    // not per-`$` doubling. It is matched one character earlier than the `${{`
    // that indexOf found, so test for it before treating this as an opener.
    if (open > 0 && value.startsWith(ESCAPE, open - 1)) {
      at = open + OPEN.length
      continue
    }

    const close = value.indexOf(CLOSE, open + OPEN.length)
    if (close === -1) {
      failures.push({
        kind: 'malformed',
        raw: value.slice(open),
        offset: open,
        why: 'it is never closed',
      })
      break
    }

    const raw = value.slice(open, close + CLOSE.length)
    const inner = value.slice(open + OPEN.length, close).trim()
    const parsed = parseInner(inner)
    if (typeof parsed === 'string') {
      failures.push({ kind: 'malformed', raw, offset: open, why: parsed })
    } else {
      const reference: Reference = { ...parsed, raw, offset: open }
      if (!RESERVED.has(reference.namespace)) {
        failures.push({ kind: 'unknown-namespace', reference })
      } else if (!admit.has(reference.namespace)) {
        failures.push({ kind: 'not-in-scope', reference })
      } else {
        references.push(reference)
      }
    }
    at = close + CLOSE.length
  }

  return { references, failures }
}

/**
 * The text between the braces, already trimmed. Returns the parsed halves, or a
 * sentence saying what is wrong with it — the sentence is a message and carries
 * no normative weight, but the refusal does.
 */
function parseInner(inner: string): { namespace: string; path: string[] } | string {
  if (inner === '') return 'it names nothing'
  if (inner.includes('${{')) return 'a reference cannot contain another'

  const segments = inner.split('.')
  if (segments.length < 2) {
    return `"${inner}" is a namespace with no path`
  }
  for (const segment of segments) {
    if (segment === '') return 'it has an empty segment'
    if (!SEGMENT.test(segment)) {
      return `segment "${segment}" is outside the grammar`
    }
  }
  const [namespace, ...path] = segments
  // `segments.length >= 2` and neither is empty, so both halves are present.
  return { namespace: namespace as string, path }
}

/** True where the whole string is one reference and nothing else. */
export function isWholeValueReference(value: string, reference: Reference): boolean {
  return reference.offset === 0 && reference.raw.length === value.length
}
