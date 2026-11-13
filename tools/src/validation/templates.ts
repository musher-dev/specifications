/**
 * Blueprint §4.2.1: a template binding, which composes a string from literal
 * text and placeholders naming deployment parameters and node outputs.
 * NON-NORMATIVE: blueprint BP-BIND-009 to BP-BIND-011 are the rule.
 */
import { isObject, type Json } from '../lib/layout.ts'
import { type Reference, scanReferences } from '../lib/references.ts'

/** BP-BIND-009: the namespaces a binding's `template` permits. */
export const TEMPLATE_NAMESPACES = ['parameters', 'nodes'] as const

/** What one placeholder of a template names, or why it names nothing. */
export type TemplateTarget =
  | { readonly kind: 'parameter'; readonly parameter: string; readonly reference: Reference }
  | {
      readonly kind: 'output'
      readonly node: string
      readonly output: string
      readonly reference: Reference
    }
  | { readonly kind: 'unknown-parameter'; readonly reference: Reference }
  | { readonly kind: 'unknown-output'; readonly reference: Reference }

/**
 * BP-BIND-009: `parameters.<parameter>` names one deployment parameter, and
 * `nodes.<node>.outputs.<output>` one output of one node. Any other path names
 * neither explicitly.
 */
export function templateTarget(reference: Reference): TemplateTarget {
  const [first, second, third, ...rest] = reference.path
  if (reference.namespace === 'parameters')
    return first !== undefined && second === undefined
      ? { kind: 'parameter', parameter: first, reference }
      : { kind: 'unknown-parameter', reference }
  return first !== undefined && second === 'outputs' && third !== undefined && !rest.length
    ? { kind: 'output', node: first, output: third, reference }
    : { kind: 'unknown-output', reference }
}

/** The URL component a placeholder of a `URL` template sits in (BP-BIND-010). */
export type UrlComponent = 'userinfo' | 'host' | 'path' | 'query' | 'fragment'

/** RFC 3986's characters: unreserved, reserved and `%`. */
const URI_CHARACTER = /^[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]$/
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/
const MARK = '\u0000'

/**
 * BP-BIND-010: the component each placeholder of a `URL` template sits in, in
 * the order the placeholders are written, or undefined when the template is no
 * URL: its scheme is not literal text before the first placeholder, or its
 * literal text holds a character RFC 3986 does not.
 */
export function urlComponents(
  text: string,
  references: readonly Reference[],
): UrlComponent[] | undefined {
  let skeleton = '',
    at = 0
  for (const reference of references) {
    skeleton += text.slice(at, reference.offset).replaceAll('$${{', '${{') + MARK
    at = reference.offset + reference.raw.length
  }
  skeleton += text.slice(at).replaceAll('$${{', '${{')
  const scheme = SCHEME.exec(skeleton)
  if (!scheme) return
  if ([...skeleton].some((ch) => ch !== MARK && !URI_CHARACTER.test(ch))) return
  const components: UrlComponent[] = []
  let i = scheme[0].length,
    component: UrlComponent = 'path'
  const authority = skeleton.startsWith('//', i)
  let hostStart = -1
  if (authority) {
    i += 2
    let end = i
    while (end < skeleton.length && !'/?#'.includes(skeleton[end] as string)) end++
    const at = skeleton.lastIndexOf('@', end - 1)
    hostStart = at >= i ? at + 1 : i
    for (let j = i; j < end; j++)
      if (skeleton[j] === MARK) components.push(j < hostStart ? 'userinfo' : 'host')
    i = end
  }
  for (; i < skeleton.length; i++) {
    const ch = skeleton[i]
    if (ch === '?' && component === 'path') component = 'query'
    else if (ch === '#' && component !== 'fragment') component = 'fragment'
    else if (ch === MARK) components.push(component)
  }
  return components
}

/**
 * BP-BIND-010: percent-encode a value's UTF-8 octets, every one but RFC 3986's
 * unreserved characters, so it never ends the component it sits in.
 */
export function percentEncode(value: string): string {
  let out = ''
  for (const byte of Buffer.from(value, 'utf8')) {
    const ch = String.fromCharCode(byte)
    out += /^[A-Za-z0-9\-._~]$/.test(ch)
      ? ch
      : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
  }
  return out
}

/** BP-BIND-010: a value in a URL's host and port is written as it is, and holds only these. */
export const HOST_VALUE = /^[A-Za-z0-9\-._~:[\]]+$/

/** BP-BIND-009: the string form of a scalar, or undefined for any other value. */
export function stringForm(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  return
}

/** Scan a binding's template under the namespaces it permits. */
export const scanTemplate = (text: string) => scanReferences(text, TEMPLATE_NAMESPACES)

/** Core v2 §5.2: the escape, and the opener it renders. */
export const ESCAPED = '$${{'
export const OPENER = '${{'

/**
 * The parameters a binding reads: the one a `parameter` binding names, or each
 * one its template names (BP-BIND-009).
 */
export function parametersReadBy(binding: Json | undefined): string[] {
  if (!isObject(binding)) return []
  if (typeof binding.parameter === 'string') return [binding.parameter]
  if (typeof binding.template !== 'string') return []
  return scanTemplate(binding.template)
    .references.map(templateTarget)
    .flatMap((t) => (t.kind === 'parameter' ? [t.parameter] : []))
}

/** An input a parameter reaches, and the binding that carries it there. */
export interface ParameterReceiver {
  readonly node: string
  readonly input: string
  readonly via: 'parameter' | 'template'
  /** The input's declaration, when the node's component is available. */
  readonly declaration: Json | undefined
}

/**
 * Every input each parameter reaches, through a `parameter` binding or a
 * template that names it (BP-BIND-009, BP-BIND-011, BP-BIND-012), with nodes
 * and inputs in UTF-16 order. A template is a binding of each parameter it names.
 */
export function parameterReceivers(
  nodes: Readonly<Record<string, Json>>,
  inputOf: (node: string, input: string) => Json | undefined,
): Map<string, ParameterReceiver[]> {
  const out = new Map<string, ParameterReceiver[]>()
  for (const node of Object.keys(nodes).sort()) {
    const entry = nodes[node],
      bindings = isObject(entry) ? entry.bindings : undefined
    if (!isObject(bindings)) continue
    for (const input of Object.keys(bindings).sort()) {
      const binding = bindings[input],
        via = isObject(binding) && typeof binding.parameter === 'string' ? 'parameter' : 'template'
      for (const name of new Set(parametersReadBy(binding))) {
        const list = out.get(name) ?? []
        list.push({ node, input, via, declaration: inputOf(node, input) })
        out.set(name, list)
      }
    }
  }
  return out
}

/** Whether an input declaration is sensitive. */
export const isSensitive = (declaration: Json | undefined): boolean =>
  isObject(declaration) && declaration.sensitive === true
