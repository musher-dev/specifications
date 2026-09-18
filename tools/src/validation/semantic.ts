/** Offline semantic checks over explicit contracts. NON-NORMATIVE. */
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, join, posix, relative, resolve } from 'node:path'
import { type Node, Parser } from 'commonmark'
import { canonicalJson, type Family, isObject, type Json } from '../lib/layout.ts'
import { scanReferences } from '../lib/references.ts'
import { type Diagnostic, parseDocument, parseDocumentBytes } from './document.ts'
import { compatible, schemaProblem, valueFits } from './values.ts'

export type { Diagnostic }
export interface DeferredObligation {
  readonly rule: string
  readonly path: string
  readonly missing: string
}
export interface PinnedContract {
  readonly source: string
  readonly digest: string
}
export interface SemanticContext {
  readonly itemRoot?: string
  readonly documentPath?: string
  readonly contracts?: Readonly<Record<string, PinnedContract>>
  readonly profile?: 'structural' | 'document' | 'publication' | 'deployment'
  readonly checkComponent?: (source: Uint8Array) => boolean
}
export const record = (value: Json | undefined): Record<string, Json> =>
  isObject(value) ? Object.assign(Object.create(null), value) : Object.create(null)
export const at = (value: Json | undefined, ...keys: string[]): Json | undefined =>
  keys.reduce<Json | undefined>((v, k) => record(v)[k], value)
const child = (value: Json | undefined, key: string) => at(value, key)
const asString = (value: Json | undefined) => (typeof value === 'string' ? value : undefined)
const keysOf = (value: Json | undefined) => Object.keys(record(value))
export const token = (value: string) => value.replaceAll('~', '~0').replaceAll('/', '~1')
const issue = (out: Diagnostic[], code: string, path: string) =>
  out.push({ code, path, message: code })
const FLOATING_TAGS = new Set([
  'latest',
  'main',
  'main-stable',
  'master',
  'stable',
  'edge',
  'nightly',
  'dev',
  'rolling',
])
export const ADDRESS_PROPERTIES = [
  'publicUrl',
  'publicHostname',
  'publicAddress',
  'publicPort',
  'privateHostname',
  'privatePort',
  'privateAddress',
]
export function endpointProblem(
  component: Json,
  endpoint: string,
  property: string,
): string | undefined {
  const declared = at(component, 'spec', 'workload', 'endpoints', endpoint)
  if (!declared) return 'ERR_UNKNOWN_ENDPOINT'
  if (!ADDRESS_PROPERTIES.includes(property)) return 'ERR_REFERENCE_NOT_IN_SCOPE'
  const http = ['HTTP', 'HTTPS', 'WS', 'GRPC'].includes(String(at(declared, 'protocol')))
  if (['publicUrl', 'publicHostname'].includes(property) && !http) return 'ERR_ENDPOINT_NOT_HTTP'
  if (['publicAddress', 'publicPort'].includes(property) && http) return 'ERR_ENDPOINT_NOT_L4'
  return undefined
}
export function sourceEndpoints(source: Json): { endpoint: string; property: string }[] {
  const s = record(source)
  if (s.type === 'ENDPOINT') return [{ endpoint: String(s.endpoint), property: String(s.property) }]
  if (s.type !== 'TEMPLATE' || typeof s.template !== 'string') return []
  return scanReferences(s.template, ['self']).references.map((ref) => ({
    endpoint: ref.path[1] ?? '',
    property: ref.path.length === 2 ? (ref.path[0] ?? '') : '',
  }))
}
export function componentDiagnostics(document: Json): Diagnostic[] {
  const out: Diagnostic[] = []
  const workload = record(at(document, 'spec', 'workload'))
  const contract = record(at(document, 'spec', 'contract'))
  const image = record(workload.source)
  if (image.type === 'IMAGE' && typeof image.ref === 'string' && !image.ref.includes('@sha256:')) {
    const tag = image.ref.slice(image.ref.lastIndexOf('/') + 1).split(':')[1]
    if (tag && FLOATING_TAGS.has(tag.toLowerCase()))
      issue(out, 'ERR_UNPINNED_IMAGE', '/spec/workload/source/ref')
  }
  for (const [name, probe] of Object.entries(record(workload.health))) {
    const p = record(probe),
      endpoint = at(workload, 'endpoints', String(p.endpoint))
    if (!endpoint)
      issue(out, 'ERR_UNKNOWN_ENDPOINT', `/spec/workload/health/${token(name)}/endpoint`)
    else if (!['HTTP', 'HTTPS'].includes(String(at(endpoint, 'protocol'))))
      issue(out, 'ERR_ENDPOINT_NOT_HTTP', `/spec/workload/health/${token(name)}/endpoint`)
  }
  const mounts: string[] = []
  for (const [name, volume] of Object.entries(record(workload.volumes))) {
    const path = String(at(volume, 'mountPath'))
    if (
      path !== posix.normalize(path) ||
      !path.startsWith('/') ||
      (path.length > 1 && path.endsWith('/')) ||
      mounts.some(
        (other) =>
          path === other ||
          path.startsWith(other === '/' ? '/' : other + '/') ||
          other.startsWith(path === '/' ? '/' : path + '/'),
      )
    )
      issue(out, 'ERR_INVALID_MOUNT', `/spec/workload/volumes/${token(name)}/mountPath`)
    mounts.push(path)
  }
  const env = new Set<string>()
  for (const [index, value] of (Array.isArray(workload.envVars)
    ? workload.envVars
    : []
  ).entries()) {
    const key = String(at(value, 'key'))
    if (env.has(key)) issue(out, 'ERR_DUPLICATE_ENV_KEY', `/spec/workload/envVars/${index}/key`)
    env.add(key)
  }
  for (const direction of ['inputs', 'outputs']) {
    for (const [name, value] of Object.entries(record(contract[direction])).sort(([a], [b]) =>
      Buffer.compare(Buffer.from(a), Buffer.from(b)),
    )) {
      const v = record(value),
        path = `/spec/contract/${direction}/${token(name)}`
      if (v.schema === undefined || schemaProblem(v.schema))
        issue(out, 'ERR_INVALID_VALUE_SCHEMA', path + '/schema')
      const literal =
        direction === 'inputs'
          ? v.default
          : at(v.source, 'type') === 'LITERAL'
            ? at(v.source, 'value')
            : undefined
      if (literal !== undefined && v.schema !== undefined && !valueFits(v.schema, literal))
        issue(
          out,
          'ERR_VALUE_CONSTRAINT',
          direction === 'inputs' ? path + '/default' : path + '/source/value',
        )
      if (literal !== undefined && v.sensitive === true)
        issue(
          out,
          'ERR_SECRET_LITERAL',
          direction === 'inputs' ? path + '/default' : path + '/source/value',
        )
      const target = at(v.target, 'envVarKey')
      if (typeof target === 'string') {
        if (env.has(target)) issue(out, 'ERR_CONFLICTING_ENV_KEY', path + '/target/envVarKey')
        env.add(target)
      }
      if (direction !== 'outputs') continue
      const source = record(v.source)
      if (source.type === 'INPUT') {
        const input = at(contract, 'inputs', String(source.input))
        if (!input) issue(out, 'ERR_UNKNOWN_INPUT_REFERENCE', path + '/source/input')
        else if (!compatible(record(input), v))
          issue(out, 'ERR_VALUE_CONSTRAINT', path + '/source/input')
      }
      if (source.type === 'TEMPLATE' && typeof source.template === 'string') {
        const scanned = scanReferences(source.template, ['self'])
        for (const failure of scanned.failures)
          issue(
            out,
            failure.kind === 'malformed'
              ? 'ERR_MALFORMED_REFERENCE'
              : failure.kind === 'unknown-namespace'
                ? 'ERR_UNKNOWN_REFERENCE_NAMESPACE'
                : 'ERR_REFERENCE_NOT_IN_SCOPE',
            path + '/source/template',
          )
      }
      for (const ref of sourceEndpoints(source)) {
        const problem = endpointProblem(document, ref.endpoint, ref.property)
        if (problem) issue(out, problem, path + '/source')
      }
      if (source.type === 'TEMPLATE' && at(v.schema, 'type') !== 'string')
        issue(out, 'ERR_VALUE_CONSTRAINT', path + '/schema')
      if (source.type === 'ENDPOINT') {
        const type = String(source.property).endsWith('Port') ? 'integer' : 'string'
        if (
          at(v.schema, 'type') !== type &&
          !(type === 'integer' && at(v.schema, 'type') === 'number')
        )
          issue(out, 'ERR_VALUE_CONSTRAINT', path + '/schema')
      }
    }
  }
  return out
}

function checkScreenshotPaths(document: Json, out: Diagnostic[]): void {
  const screenshots = child(child(document, 'spec'), 'screenshots')
  if (!Array.isArray(screenshots)) return

  const seen = new Map<string, number>()
  for (const [position, screenshot] of screenshots.entries()) {
    const file = asString(child(screenshot, 'file'))
    if (file === undefined) continue
    const name = file
    const earlier = seen.get(name)
    if (earlier === undefined) {
      seen.set(name, position)
      continue
    }
    // Reported at the later of the two: the first declaration is the one that
    // stands, so the second is the one an author has to change.
    out.push({
      code: 'ERR_DUPLICATE_MEDIA_PATH',
      path: `/spec/screenshots/${position}/file`,
      message: `media path is already used by screenshot ${earlier}`,
    })
  }
}

/**
 * Listing §5's media path grammar, as the schema carries it. Restated here
 * because §4.1 holds a description image to the same shape, and a description
 * is a Markdown blob no `pattern` can reach into.
 */
const MEDIA_PATH =
  /^media\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.(?:[Pp][Nn][Gg]|[Jj][Pp][Gg]|[Jj][Pp][Ee][Gg]|[Ww][Ee][Bb][Pp])$/

/** Listing §4.1 — the schemes a description link destination may use. */
const PERMITTED_SCHEMES = new Set(['https:', 'http:', 'mailto:'])

/**
 * `spec.description` parsed as CommonMark 0.31.2, or `undefined` when the
 * listing declares none. Parsed once and walked by every §4.1 rule: three
 * separate walks over the same blob would be three chances to disagree about
 * what the document says.
 */
function descriptionAst(document: Json): Node | undefined {
  const description = asString(child(child(document, 'spec'), 'description'))
  if (description === undefined) return undefined
  return new Parser().parse(description)
}

/** Every node in an AST, in document order. */
function* walk(ast: Node): Generator<Node> {
  const walker = ast.walker()
  let step = walker.next()
  while (step !== null) {
    if (step.entering) yield step.node
    step = walker.next()
  }
}

/**
 * Listing §4.1 — a link destination must carry a permitted scheme or be a
 * fragment. A destination CommonMark could not resolve to a URL at all is not
 * a scheme this set contains, so it fails with the rest.
 */
function schemeIsPermitted(destination: string): boolean {
  if (destination.startsWith('#')) return true
  try {
    return PERMITTED_SCHEMES.has(new URL(destination).protocol)
  } catch {
    // Not absolute. A storefront has no base URL to resolve it against, so a
    // relative link resolves against the storefront's own path — a broken link
    // rather than a hostile one, but not a link this profile permits either.
    return false
  }
}

/**
 * Listing §4.1 — the three rules the description profile carries. Every
 * diagnostic anchors at `/spec/description`: the field is one scalar, so there
 * is no finer pointer to give, and the offending destination rides in the
 * message instead. Message text is not normative (docs/conformance.md).
 */
function checkDescriptionMarkdown(document: Json, out: Diagnostic[]): void {
  const ast = descriptionAst(document)
  if (ast === undefined) return

  for (const node of walk(ast)) {
    // A code span and a fenced code block are their own constructs in
    // CommonMark's grammar, never `html_block` or `html_inline` — which is why
    // a listing may document `<script>` inside a fence and stay conforming.
    if (node.type === 'html_block' || node.type === 'html_inline') {
      out.push({
        code: 'ERR_RAW_HTML',
        path: '/spec/description',
        message: `description contains raw HTML: ${summarise(node.literal ?? '')}`,
      })
      continue
    }
    const destination = node.destination ?? ''
    if (node.type === 'link' && !schemeIsPermitted(destination)) {
      out.push({
        code: 'ERR_DISALLOWED_SCHEME',
        path: '/spec/description',
        message: `link destination "${summarise(destination)}" is not https, http, mailto, or a fragment`,
      })
    }
    if (node.type === 'image' && !MEDIA_PATH.test(destination)) {
      out.push({
        code: 'ERR_IMAGE_NOT_LOCAL',
        path: '/spec/description',
        message: `image destination "${summarise(destination)}" is not a media path under media/`,
      })
    }
  }
}

/** A diagnostic message quotes the offender; it does not reproduce it. */
function summarise(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat
}

// ===========================================================================
// item-scoped rules
// ===========================================================================

/** Every media path a listing declares, paired with its JSON Pointer. */
function mediaPaths(document: Json): { path: string; pointer: string }[] {
  const spec = child(document, 'spec')
  const found: { path: string; pointer: string }[] = []

  const icon = asString(child(spec, 'icon'))
  if (icon !== undefined) found.push({ path: icon, pointer: '/spec/icon' })

  const screenshots = child(spec, 'screenshots')
  if (Array.isArray(screenshots)) {
    for (const [position, screenshot] of screenshots.entries()) {
      const file = asString(child(screenshot, 'file'))
      if (file !== undefined) {
        found.push({ path: file, pointer: `/spec/screenshots/${position}/file` })
      }
    }
  }

  // §4.1 — a description image is a media path, so §5's existence and
  // containment rules reach it. Only well-formed ones: a destination that is
  // not a media path at all is already ERR_IMAGE_NOT_LOCAL, and piling
  // ERR_MEDIA_NOT_FOUND on top would report one mistake twice.
  const ast = descriptionAst(document)
  if (ast !== undefined) {
    for (const node of walk(ast)) {
      const destination = node.destination ?? ''
      if (node.type === 'image' && MEDIA_PATH.test(destination)) {
        found.push({ path: destination, pointer: '/spec/description' })
      }
    }
  }
  return found
}

/**
 * True when `target` lies strictly inside `root`. Both are expected to be
 * resolved already — this compares locations, and the caller is the one that
 * decides what resolution means.
 */
function contains(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * The resolved location of `path`, following symlinks. Containment is a
 * property of the resolved location rather than of the spelling — listing §5
 * and blueprint §4.1 both turn on that distinction.
 */
function resolveReal(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    // A dangling symlink still has a target, and a target outside the item root
    // is an escape whether or not anything is there. `readlinkSync` reads the
    // link itself, which `realpathSync` cannot once the chain is broken.
    try {
      return resolve(dirname(path), readlinkSync(path))
    } catch {
      // Not a link, or unreadable — the caller reports it as missing instead.
      return resolve(path)
    }
  }
}

/** Listing §5 — existence and containment, both of which need the filesystem. */
function checkMediaOnDisk(document: Json, itemRoot: string, out: Diagnostic[]): void {
  for (const { path, pointer } of mediaPaths(document)) {
    const target = join(itemRoot, path)
    if (!existsSync(target) && !isSymlink(target)) {
      out.push({
        code: 'ERR_MEDIA_NOT_FOUND',
        path: pointer,
        message: `${path} does not exist in the item`,
      })
      continue
    }
    if (!contains(itemRoot, resolveReal(target))) {
      out.push({
        code: 'ERR_PATH_ESCAPE',
        path: pointer,
        message: `${path} resolves outside the item root`,
      })
    }
  }
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

/** Every `*.yaml`/`*.yml` under `root`, recursively, as absolute paths. */
function yamlFiles(root: string): string[] {
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.ya?ml$/i.test(entry.name)) found.push(path)
    }
  }
  walk(root)
  return found.sort()
}

/** Parse a document off disk, or `undefined` when it is unreadable. */
function readDocument(path: string): Json | undefined {
  let parsed: Json | undefined
  try {
    const result = parseDocumentBytes(readFileSync(path))
    parsed = 'value' in result ? result.value : undefined
  } catch {
    // Unreadable or malformed. The item's own parser-phase run reports that;
    // this one declines to describe a document it could not read.
    parsed = undefined
  }
  return parsed
}

/**
 * Core §4.2 — an item document's `metadata.slug` MUST equal the item directory
 * name. Blueprint §3 and listing §3 are where each family cites it.
 */
function checkSlug(document: Json, itemRoot: string, out: Diagnostic[]): void {
  const slug = asString(child(child(document, 'metadata'), 'slug'))
  const directory = basename(itemRoot)
  if (slug === undefined || slug === directory) return
  out.push({
    code: 'ERR_SLUG_MISMATCH',
    path: '/metadata/slug',
    message: `slug "${slug}" disagrees with the item directory "${directory}"`,
  })
}

/**
 * `LIST-ITEM-001` — listing §3. `spec.itemType` is `BLUEPRINT` if and only if
 * the item root holds `blueprint.yaml`.
 *
 * The rule reads the directory rather than the document, which is what makes it
 * `semantic` rather than something the bundle could state. An item root is
 * required to decide it at all; the caller has already returned where there is
 * none, as core §4.1 requires.
 */
function checkItemType(document: Json, itemRoot: string, out: Diagnostic[]): void {
  const declared = asString(child(child(document, 'spec'), 'itemType'))
  if (declared === undefined) return
  const holdsBlueprint = existsSync(join(itemRoot, 'blueprint.yaml'))
  const actual = holdsBlueprint ? 'BLUEPRINT' : 'COMPONENT'
  if (declared === actual) return
  out.push({
    code: 'ERR_ITEM_TYPE_MISMATCH',
    path: '/spec/itemType',
    message: holdsBlueprint
      ? `itemType is ${declared}, but the item root holds a blueprint.yaml`
      : `itemType is ${declared}, but the item root holds no blueprint.yaml`,
  })
}

export interface SemanticReport {
  diagnostics: Diagnostic[]
  deferred: DeferredObligation[]
  components: Map<string, Json>
  valueOrder?: string[]
}
export function semanticReport(
  family: Pick<Family, 'name'>,
  document: Json,
  context: SemanticContext = {},
): SemanticReport {
  const out: Diagnostic[] = [],
    deferred: DeferredObligation[] = [],
    resolved = new Map<string, Json>()
  const defer = (rule: string, path: string, missing: string) =>
    deferred.push({ rule, path, missing })
  if (family.name === 'component') out.push(...componentDiagnostics(document))
  if (family.name === 'listing') {
    checkScreenshotPaths(document, out)
    checkDescriptionMarkdown(document, out)
    if (context.itemRoot) {
      checkSlug(document, context.itemRoot, out)
      checkItemType(document, context.itemRoot, out)
      checkMediaOnDisk(document, context.itemRoot, out)
    } else defer('LIST-ITEM-001', '/spec/itemType', 'itemRoot')
  }
  if (family.name !== 'blueprint') return { diagnostics: out, deferred, components: resolved }
  const spec = record(at(document, 'spec')),
    nodes = record(spec.components),
    parameters = record(spec.parameters)
  const referenced = new Set<string>()
  if (context.itemRoot) checkSlug(document, context.itemRoot, out)
  else defer('CORE-ITEM-001', '/metadata/slug', 'itemRoot')
  for (const [name, node] of Object.entries(nodes)) {
    const n = record(node),
      ref = String(n.componentRef),
      path = `/spec/components/${token(name)}/componentRef`
    let bytes: Uint8Array | undefined
    if (/^\.\.?\//.test(ref)) {
      if (!context.itemRoot) {
        defer('BP-REF-002', path, 'itemRoot')
        continue
      }
      const target = resolve(
        dirname(context.documentPath ?? join(context.itemRoot, 'blueprint.yaml')),
        ref,
      )
      if (!contains(context.itemRoot, resolveReal(target))) {
        issue(out, 'ERR_REFERENCE_ESCAPE', path)
        continue
      }
      if (!existsSync(target)) {
        issue(out, 'ERR_COMPONENT_NOT_FOUND', path)
        continue
      }
      try {
        referenced.add(realpathSync(target))
        bytes = readFileSync(target)
      } catch {
        issue(out, 'ERR_COMPONENT_NOT_FOUND', path)
        continue
      }
    } else {
      const key = `${ref}@${n.revision}`
      const pinned =
        context.contracts && Object.hasOwn(context.contracts, key)
          ? context.contracts[key]
          : undefined
      if (!pinned) {
        defer('BP-REF-002', path, `contract:${ref}@${n.revision}`)
        continue
      }
      if (
        typeof pinned.source !== 'string' ||
        createHash('sha256').update(pinned.source).digest('hex') !== pinned.digest
      ) {
        issue(out, 'ERR_INVALID_DEPENDENCY', path)
        continue
      }
      bytes = Buffer.from(pinned.source)
    }
    const parsed = parseDocumentBytes(bytes)
    if (
      'errors' in parsed ||
      at(parsed.value, 'kind') !== 'COMPONENT' ||
      (context.checkComponent && !context.checkComponent(bytes)) ||
      (!('errors' in parsed) && componentDiagnostics(parsed.value).length)
    ) {
      issue(out, 'ERR_INVALID_DEPENDENCY', path)
      continue
    }
    if (!/^\.\.?\//.test(ref) && at(parsed.value, 'metadata', 'revision') !== n.revision) {
      issue(out, 'ERR_INVALID_DEPENDENCY', path)
      continue
    }
    resolved.set(name, parsed.value)
  }
  if (context.itemRoot)
    for (const path of yamlFiles(context.itemRoot)) {
      const target = resolveReal(path)
      if (!contains(context.itemRoot, target) || referenced.has(target)) continue
      if (at(readDocument(path), 'kind') === 'COMPONENT')
        issue(out, 'ERR_UNREFERENCED_COMPONENT', '/spec/components')
    }
  const consumers = new Map<string, Record<string, Json>[]>()
  const dependencies = new Map<string, string[]>()
  for (const [name, node] of Object.entries(nodes)) {
    const n = record(node),
      base = `/spec/components/${token(name)}`,
      component = resolved.get(name)
    const inputs = record(at(component, 'spec', 'contract', 'inputs')),
      outputs = record(at(component, 'spec', 'contract', 'outputs'))
    const workload = at(component, 'spec', 'workload')
    if (component && (workload === undefined) !== (n.size === null))
      issue(out, 'ERR_CONFLICTING_NODE_COMPUTE', base + '/size')
    if (component) {
      const declared = record(at(workload, 'volumes')),
        allocated = record(n.volumes)
      for (const volume of new Set([...Object.keys(declared), ...Object.keys(allocated)])) {
        if (
          !declared[volume] ||
          !allocated[volume] ||
          Number(at(allocated[volume], 'sizeGiB')) < Number(at(declared[volume], 'minimumSizeGiB'))
        )
          issue(out, 'ERR_INVALID_VOLUME_ALLOCATION', base + '/volumes/' + token(volume))
      }
      for (const [endpoint, exposure] of Object.entries(record(n.exposure))) {
        const e = at(workload, 'endpoints', endpoint)
        if (!e) issue(out, 'ERR_UNKNOWN_ENDPOINT', base + '/exposure/' + token(endpoint))
        else if (
          exposure === 'PUBLIC' &&
          ['HTTP', 'HTTPS', 'WS', 'GRPC'].includes(String(at(e, 'protocol'))) &&
          !at(workload, 'health', 'readiness')
        )
          issue(out, 'ERR_READINESS_REQUIRED', base + '/exposure/' + token(endpoint))
      }
      for (const [output, v] of Object.entries(outputs)) {
        const source = record(at(v, 'source'))
        dependencies.set(
          `${name}:out:${output}`,
          source.type === 'INPUT' ? [`${name}:in:${source.input}`] : [],
        )
        for (const ref of sourceEndpoints(source))
          if (ref.property.startsWith('public') && at(n.exposure, ref.endpoint) !== 'PUBLIC')
            issue(out, 'ERR_ENDPOINT_NOT_PUBLIC', base + '/exposure/' + token(ref.endpoint))
      }
      for (const [input, v] of Object.entries(inputs)) {
        dependencies.set(`${name}:in:${input}`, [])
        if (
          at(n.bindings, input) === undefined &&
          at(v, 'default') === undefined &&
          at(v, 'required') !== false
        )
          issue(out, 'ERR_UNSATISFIED_REQUIRED_INPUT', base + '/bindings/' + token(input))
      }
    }
    for (const [input, binding] of Object.entries(record(n.bindings))) {
      const s = record(binding),
        path = base + '/bindings/' + token(input),
        consumer = record(inputs[input])
      if (component && !inputs[input]) issue(out, 'ERR_UNKNOWN_INPUT', path)
      dependencies.set(
        `${name}:in:${input}`,
        s.type === 'OUTPUT' ? [`${s.node}:out:${s.output}`] : [],
      )
      if (s.type === 'PARAMETER') {
        const p = parameters[String(s.parameter)]
        if (!p) {
          issue(out, 'ERR_UNKNOWN_PARAMETER', path + '/parameter')
          continue
        }
        if (inputs[input]) {
          const receivers = consumers.get(String(s.parameter)) ?? []
          receivers.push(consumer)
          consumers.set(String(s.parameter), receivers)
          const value = at(p, 'default')
          if (
            value !== undefined &&
            consumer.schema !== undefined &&
            !valueFits(consumer.schema, value)
          )
            issue(
              out,
              'ERR_VALUE_CONSTRAINT',
              '/spec/parameters/' + token(String(s.parameter)) + '/default',
            )
          if (value !== undefined && consumer.sensitive === true)
            issue(
              out,
              'ERR_SECRET_LITERAL',
              '/spec/parameters/' + token(String(s.parameter)) + '/default',
            )
        }
      } else if (s.type === 'OUTPUT') {
        if (!nodes[String(s.node)]) issue(out, 'ERR_UNKNOWN_NODE', path + '/node')
        const producer = resolved.get(String(s.node)),
          output = at(producer, 'spec', 'contract', 'outputs', String(s.output))
        if (producer && !output) issue(out, 'ERR_UNKNOWN_OUTPUT', path + '/output')
        if (output && inputs[input] && !compatible(record(output), consumer))
          issue(out, 'ERR_INCOMPATIBLE_TYPE', path + '/output')
        const literal =
          at(output, 'source', 'type') === 'LITERAL' ? at(output, 'source', 'value') : undefined
        if (
          literal !== undefined &&
          consumer.schema !== undefined &&
          !valueFits(consumer.schema, literal)
        )
          issue(out, 'ERR_VALUE_CONSTRAINT', path)
      } else if (s.type === 'CONFIG_REF') {
        const scan = scanReferences(String(s.source), ['config'])
        if (
          scan.failures.length ||
          scan.references.length !== 1 ||
          scan.references[0]?.raw !== s.source
        )
          issue(out, 'ERR_INVALID_CONFIG_REFERENCE', path + '/source')
      } else if (s.type === 'LITERAL' && inputs[input]) {
        if (
          consumer.schema !== undefined &&
          s.value !== undefined &&
          !valueFits(consumer.schema, s.value)
        )
          issue(out, 'ERR_VALUE_CONSTRAINT', path + '/value')
        if (consumer.sensitive === true) issue(out, 'ERR_SECRET_LITERAL', path + '/value')
      }
    }
  }
  for (const [name, p] of Object.entries(parameters)) {
    const receivers = consumers.get(name) ?? [],
      path = '/spec/parameters/' + token(name)
    const used = Object.values(nodes).some((n) =>
      Object.values(record(at(n, 'bindings'))).some(
        (b) => at(b, 'type') === 'PARAMETER' && at(b, 'parameter') === name,
      ),
    )
    if (!used) issue(out, 'ERR_UNBOUND_PARAMETER', path)
    if (
      receivers.length > 1 &&
      receivers.some(
        (v) => canonicalJson(v.schema ?? null) !== canonicalJson(receivers[0]!.schema ?? null),
      )
    )
      issue(out, 'ERR_CONFLICTING_INPUT_SCHEMA', path)
    const schema = record(receivers[0]?.schema)
    const members = Array.isArray(schema.enum)
      ? schema.enum
      : Array.isArray(at(schema.items, 'enum'))
        ? (at(schema.items, 'enum') as Json[])
        : []
    for (const member of Object.keys(record(at(p, 'ui', 'enumLabels'))))
      if (receivers.length && !members.some((v) => String(v) === member))
        issue(out, 'ERR_UNKNOWN_ENUM_MEMBER', path + '/ui/enumLabels/' + token(member))
    if (
      at(p, 'generator') !== undefined &&
      receivers.some((v) => at(v.schema, 'type') !== 'string')
    )
      issue(out, 'ERR_VALUE_CONSTRAINT', path + '/generator')
  }
  // Kahn ordering separates value dependencies from discovery relationships.
  const pending = new Map<string, number>(),
    dependents = new Map<string, string[]>()
  for (const [key, deps] of dependencies) {
    pending.set(key, deps.filter((d) => dependencies.has(d)).length)
    for (const dep of deps) {
      const list = dependents.get(dep) ?? []
      list.push(key)
      dependents.set(dep, list)
    }
  }
  const ready = [...pending].filter(([, n]) => n === 0).map(([key]) => key),
    ordered: string[] = []
  for (let i = 0; i < ready.length; i++) {
    const key = ready[i]!
    ordered.push(key)
    for (const dependent of dependents.get(key) ?? []) {
      const n = pending.get(dependent)! - 1
      pending.set(dependent, n)
      if (n === 0) ready.push(dependent)
    }
  }
  if (ordered.length !== pending.size) issue(out, 'ERR_VALUE_CYCLE', '/spec/components')
  // Propagate statically known values through arbitrarily many forwarding nodes.
  const known = new Map<string, Json>()
  for (const key of ordered) {
    const [node, direction, name] = key.split(':') as [string, string, string]
    const definition = record(
      at(resolved.get(node), 'spec', 'contract', direction === 'in' ? 'inputs' : 'outputs', name),
    )
    const binding =
      direction === 'in' ? record(at(nodes[node], 'bindings', name)) : record(definition.source)
    let value: Json | undefined
    if (binding.type === 'LITERAL') value = binding.value
    else if (binding.type === 'PARAMETER')
      value = at(parameters, String(binding.parameter), 'default')
    else if (!binding.type && direction === 'in') value = definition.default
    else {
      const dependency = dependencies.get(key)?.[0]
      if (dependency) value = known.get(dependency)
    }
    if (value === undefined) continue
    known.set(key, value)
    const path =
      direction === 'in'
        ? '/spec/components/' + token(node) + '/bindings/' + token(name)
        : '/spec/components/' + token(node) + '/outputs/' + token(name)
    if (
      definition.schema &&
      !valueFits(definition.schema, value) &&
      !out.some((d) => d.code === 'ERR_VALUE_CONSTRAINT' && d.path === path)
    )
      issue(out, 'ERR_VALUE_CONSTRAINT', path)
    if (definition.sensitive === true && (binding.type === 'OUTPUT' || binding.type === 'INPUT'))
      issue(out, 'ERR_SECRET_LITERAL', path)
  }
  return { diagnostics: out, deferred, components: resolved, valueOrder: ordered }
}
export function semanticDiagnostics(
  family: Family,
  document: Json,
  context: SemanticContext = {},
): Diagnostic[] {
  return semanticReport(family, document, context).diagnostics
}
