/**
 * The `semantic` phase: rules JSON Schema cannot express.
 *
 * NON-NORMATIVE, like everything under tools/. The definitive rule for each
 * check below is the `spec.md` clause named in its comment; this file is one
 * adapter's reading of it, and where the two disagree the prose wins.
 *
 * The rules divide by what they need, and the division is the prose's, not this
 * runner's. An **in-document** rule is decided by reading the document. An
 * **item-scoped** rule is measured against the item root
 * ([core v1 §4.1](../../specifications/core/v1/spec.md#item-directory)),
 * and a caller that supplies no item root MUST NOT have those rules reported:
 * "a diagnostic it cannot substantiate is worse than a silence."
 */
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { type Node, Parser } from 'commonmark'
import { type Family, isObject, type Json } from '../lib/layout.ts'
import { scanReferences } from '../lib/references.ts'
import { type Diagnostic, parseDocument } from './document.ts'

export type { Diagnostic }

export interface SemanticContext {
  /**
   * Absolute path to the item root. Absent when the document did not arrive
   * with a directory — a payload submitted over an API, or an `examples/`
   * document. Item-scoped rules are silent without it.
   */
  readonly itemRoot?: string
  /**
   * Absolute path to the document under test. Repo-local component references
   * resolve relative to its directory (blueprint §4.1). Defaults to the item
   * root's conventional `blueprint.yaml` when omitted.
   */
  readonly documentPath?: string
}

/** Escape one JSON Pointer reference token (RFC 6901 §3). */
function token(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1')
}

function child(value: Json | undefined, key: string): Json | undefined {
  return isObject(value) ? value[key] : undefined
}

function asString(value: Json | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/** Mapping keys in document order, or an empty list when the node is not one. */
function keysOf(value: Json | undefined): string[] {
  return isObject(value) ? Object.keys(value) : []
}

// ===========================================================================
// component
// ===========================================================================

/**
 * Component §5.1. Curated, and it will grow — which is exactly why it is here
 * and not in a `pattern`. Growing a pattern makes a previously valid document
 * invalid; growing this list is a minor release.
 */
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

/**
 * Component §5.2 — the protocols whose `PUBLIC` form publishes a URL. A `TCP` or
 * `UDP` endpoint publishes a `host:port` address instead, and every reference
 * reads one form or the other: §5.4's probes and blueprint §5.2's PUBLIC_URL
 * and PUBLIC_HOSTNAME need this set, PUBLIC_ADDRESS and PUBLIC_PORT need its
 * complement.
 */
const HTTP_FAMILY = new Set(['HTTP', 'HTTPS', 'WS', 'GRPC'])

/**
 * The tag of an image reference, or `undefined` when it carries none.
 *
 * The tag colon is the one after the final slash. Without that rule
 * `localhost:5000/nginx` reads as an image named `localhost` tagged
 * `5000/nginx`, and a reference behind a ported registry is misjudged.
 */
function imageTag(ref: string): string | undefined {
  const afterSlash = ref.slice(ref.lastIndexOf('/') + 1)
  const colon = afterSlash.indexOf(':')
  return colon === -1 ? undefined : afterSlash.slice(colon + 1)
}

/** Component §5.1 — a reference MUST NOT carry a floating tag. */
function checkImageRef(document: Json, out: Diagnostic[]): void {
  const source = child(child(child(document, 'spec'), 'workload'), 'source')
  const ref = asString(child(source, 'ref'))
  if (ref === undefined || child(source, 'type') !== 'IMAGE') return

  // A digest is what resolves, so it satisfies the rule whatever tag it carries.
  if (ref.includes('@sha256:')) return

  const tag = imageTag(ref)
  if (tag !== undefined && FLOATING_TAGS.has(tag.toLowerCase())) {
    out.push({
      code: 'ERR_UNPINNED_IMAGE',
      path: '/spec/workload/source/ref',
      message: `tag "${tag}" floats; pin a digest or an immutable tag`,
    })
  }
}

/**
 * Component §5.2 — the endpoint a null reference selects. The sole endpoint
 * where the workload declares exactly one, failing that its sole PUBLIC one,
 * failing that nothing.
 *
 * §5.2 chose "nothing" over a sort-order tiebreak deliberately: a tiebreak
 * lets a new endpoint named `api` silently re-point a probe that already works.
 */
function primaryEndpoint(endpoints: Json | undefined): string | undefined {
  const names = keysOf(endpoints)
  if (names.length === 1) return names[0]

  const publicNames = names.filter(
    (name) => child(child(endpoints, name), 'visibility') === 'PUBLIC',
  )
  return publicNames.length === 1 ? publicNames[0] : undefined
}

/**
 * Which of §5.2's two address forms a reference reads. A probe and the two
 * URL-derived platform-default sources need `http`; the two edge-address
 * sources need `l4`.
 */
type AddressForm = 'http' | 'l4'

/**
 * One place a document names an endpoint: a probe's `endpoint` (component §5.4)
 * or a `self` reference in a blueprint parameter's `default` (blueprint §5.2).
 * `mustBePublic` is what separates them — every `self` path reads an externally
 * reachable address.
 */
interface EndpointReference {
  /** The raw value, so an explicit null and an absent key are one case. */
  readonly value: Json | undefined
  readonly path: string
  readonly subject: string
  readonly mustBePublic: boolean
  /**
   * The address form this reference reads, or undefined where the document
   * named a path this contract does not define — guessing a form here would
   * report a second diagnostic about one cause.
   */
  readonly addressForm: AddressForm | undefined
}

/**
 * Component §5.2 and §5.4, and blueprint §5.2. JSON Schema can express none of
 * this: the endpoint names are mapping keys in the component document, and no
 * keyword constrains a value against keys it cannot see.
 */
function checkEndpointReference(
  reference: EndpointReference,
  endpoints: Json | undefined,
  out: Diagnostic[],
): void {
  const named = asString(reference.value)

  // Absent or null both select the primary, which §5.2 may elect to be nothing.
  // Every rule below is measured against whichever endpoint the reference
  // resolves to, named or elected — §5.2 makes the primary what null *selects*,
  // so a rule about the endpoint a reference names reaches it equally.
  const selected = named ?? primaryEndpoint(endpoints)
  if (selected === undefined) {
    out.push({
      code: 'ERR_AMBIGUOUS_ENDPOINT',
      path: reference.path,
      message: `${reference.subject} names no endpoint, and the workload elects no primary`,
    })
    return
  }

  const declared = child(endpoints, selected)
  if (declared === undefined) {
    out.push({
      code: 'ERR_UNKNOWN_ENDPOINT',
      path: reference.path,
      message: `${reference.subject} targets endpoint "${selected}", which the workload does not declare`,
    })
    return
  }

  // A reference reads one of component §5.2's two address forms, and the
  // endpoint has to publish that one. A probe polls an HTTP path; PUBLIC_URL
  // and PUBLIC_HOSTNAME take a URL; PUBLIC_ADDRESS and PUBLIC_PORT take the
  // edge address only a TCP or UDP endpoint is allocated.
  const protocol = asString(child(declared, 'protocol'))
  if (protocol !== undefined && reference.addressForm !== undefined) {
    const isHttp = HTTP_FAMILY.has(protocol)
    if (reference.addressForm === 'http' && !isHttp) {
      out.push({
        code: 'ERR_ENDPOINT_NOT_HTTP',
        path: reference.path,
        message: `${reference.subject} resolves to endpoint "${selected}", which serves ${protocol}`,
      })
      return
    }
    if (reference.addressForm === 'l4' && isHttp) {
      out.push({
        code: 'ERR_ENDPOINT_NOT_L4',
        path: reference.path,
        message: `${reference.subject} resolves to endpoint "${selected}", which serves ${protocol} and is allocated no edge port`,
      })
      return
    }
  }

  if (reference.mustBePublic && child(declared, 'visibility') !== 'PUBLIC') {
    out.push({
      code: 'ERR_ENDPOINT_NOT_PUBLIC',
      path: reference.path,
      message: `${reference.subject} derives a public address from endpoint "${selected}", which is PRIVATE`,
    })
  }
}

/** Every endpoint a component document's probes name, in document order. */
function endpointReferences(document: Json): EndpointReference[] {
  const spec = child(document, 'spec')
  const health = child(child(spec, 'workload'), 'health')
  const references: EndpointReference[] = []

  for (const probe of keysOf(health)) {
    references.push({
      value: child(child(health, probe), 'endpoint'),
      path: `/spec/workload/health/${token(probe)}/endpoint`,
      subject: `${probe} probe`,
      mustBePublic: false,
      addressForm: 'http',
    })
  }

  return references
}

function checkEndpointReferences(document: Json, out: Diagnostic[]): void {
  const endpoints = child(child(child(document, 'spec'), 'workload'), 'endpoints')
  for (const reference of endpointReferences(document)) {
    checkEndpointReference(reference, endpoints, out)
  }
}

/**
 * Component §6.2 — an `INPUT` output reads one of its own component's inputs.
 *
 * Whether that input is wired is not this document's to know; blueprint §4.2's
 * `BP-CONN-002` keeps a wire off it, which is what keeps every output
 * resolvable before any edge is bound.
 */
function checkOutputInputReferences(document: Json, out: Diagnostic[]): void {
  const contract = child(child(document, 'spec'), 'contract')
  const inputs = child(contract, 'inputs')
  const outputs = child(contract, 'outputs')

  for (const name of keysOf(outputs)) {
    const output = child(outputs, name)
    if (asString(child(output, 'valueFrom')) !== 'INPUT') continue

    const reference = asString(child(output, 'input'))
    if (reference === undefined) continue // COMP-OUT-001, structural
    const pointer = `/spec/contract/outputs/${token(name)}/input`

    if (child(inputs, reference) !== undefined) continue
    out.push({
      code: 'ERR_UNKNOWN_INPUT_REFERENCE',
      path: pointer,
      message: `output "${name}" reads input "${reference}", which this component does not declare`,
    })
  }
}

/** Core v1 §5.2, `CORE-REF-003` — the namespaces a `DECLARED` output's `value` admits. */
const OUTPUT_NAMESPACES = ['self']

/**
 * Component §6.2, `COMP-REF-001` — a `DECLARED` output's `value` may name this
 * node's own addressing, and nothing else.
 *
 * Only the grammar is decided here. Whether `self.publicUrl.web` resolves needs
 * the endpoints of the node the component is deployed as, which is the
 * blueprint's to know: the same reference on two nodes resolves twice.
 */
function checkOutputValueReferences(document: Json, out: Diagnostic[]): void {
  const outputs = child(child(child(document, 'spec'), 'contract'), 'outputs')

  for (const name of keysOf(outputs)) {
    const output = child(outputs, name)
    if (asString(child(output, 'valueFrom')) !== 'DECLARED') continue
    const value = asString(child(output, 'value'))
    if (value === undefined) continue // COMP-OUT-001, structural

    const pointer = `/spec/contract/outputs/${token(name)}/value`
    for (const failure of scanReferences(value, OUTPUT_NAMESPACES).failures) {
      if (failure.kind === 'malformed') {
        out.push({
          code: 'ERR_MALFORMED_REFERENCE',
          path: pointer,
          message: `"${failure.raw}" does not open a well-formed reference: ${failure.why}`,
        })
        continue
      }
      const { namespace, raw } = failure.reference
      out.push({
        code:
          failure.kind === 'unknown-namespace'
            ? 'ERR_UNKNOWN_REFERENCE_NAMESPACE'
            : 'ERR_REFERENCE_NOT_IN_SCOPE',
        path: pointer,
        message:
          failure.kind === 'unknown-namespace'
            ? `"${raw}" names no reserved namespace`
            : `"${raw}" names the "${namespace}" namespace, which an output value does not admit`,
      })
    }
  }
}

/**
 * Component §5.3 — every environment-variable key is declared exactly once,
 * across both the places that declare one.
 *
 * `envVars` is a sequence rather than a mapping, so §5's "a repeated key is
 * ERR_DUPLICATE_KEY in the parser phase" does not reach it: two entries of a
 * sequence repeat nothing at the YAML level. An input's `target.envVarKey`
 * binds into the same namespace, so it competes with them.
 */
function checkEnvVarKeys(document: Json, out: Diagnostic[]): void {
  const spec = child(document, 'spec')
  const envVars = child(child(spec, 'workload'), 'envVars')
  const inputs = child(child(spec, 'contract'), 'inputs')

  // First declaration wins the key, so the later one is what an author changes.
  const declared = new Map<string, string>()

  if (Array.isArray(envVars)) {
    for (const [position, entry] of envVars.entries()) {
      const key = asString(child(entry, 'key'))
      if (key === undefined) continue
      const earlier = declared.get(key)
      if (earlier === undefined) {
        declared.set(key, `envVars entry ${position}`)
        continue
      }
      out.push({
        code: 'ERR_DUPLICATE_ENV_KEY',
        path: `/spec/workload/envVars/${position}/key`,
        message: `environment variable "${key}" is already declared by ${earlier}`,
      })
    }
  }

  // Lexicographic input-name order, because §5.3 anchors the collision at the
  // later of two inputs and a mapping supplies no order of its own.
  for (const input of keysOf(inputs).sort()) {
    const key = asString(child(child(child(inputs, input), 'target'), 'envVarKey'))
    if (key === undefined) continue
    const earlier = declared.get(key)
    if (earlier === undefined) {
      declared.set(key, `input "${input}"`)
      continue
    }
    out.push({
      code: 'ERR_CONFLICTING_ENV_KEY',
      path: `/spec/contract/inputs/${token(input)}/target/envVarKey`,
      message: `environment variable "${key}" is already claimed by ${earlier}`,
    })
  }
}

// ===========================================================================
// blueprint
// ===========================================================================

const LOCAL_REFERENCE = /^\.\.?\//

/** Blueprint §4.2 — `fromNode` MUST name a node in this blueprint. */
function checkConnectionNodes(document: Json, out: Diagnostic[]): void {
  const components = child(child(document, 'spec'), 'components')
  const nodes = new Set(keysOf(components))
  for (const node of nodes) {
    const connections = child(child(components, node), 'connections')
    for (const key of keysOf(connections)) {
      const from = asString(child(child(connections, key), 'fromNode'))
      if (from !== undefined && !nodes.has(from)) {
        out.push({
          code: 'ERR_UNKNOWN_NODE',
          path: `/spec/components/${token(node)}/connections/${token(key)}/fromNode`,
          message: `fromNode "${from}" names no node in this blueprint`,
        })
      }
    }
  }
}

// ===========================================================================
// listing
// ===========================================================================

/**
 * Listing §5 — two screenshots MUST NOT share a basename, across the whole item
 * rather than within a directory. Published assets are addressed by basename,
 * so `media/desktop/overview.png` and `media/mobile/overview.png` are one file.
 */
function checkScreenshotBasenames(document: Json, out: Diagnostic[]): void {
  const screenshots = child(child(document, 'spec'), 'screenshots')
  if (!Array.isArray(screenshots)) return

  const seen = new Map<string, number>()
  for (const [position, screenshot] of screenshots.entries()) {
    const file = asString(child(screenshot, 'file'))
    if (file === undefined) continue
    const name = basename(file).toLowerCase()
    const earlier = seen.get(name)
    if (earlier === undefined) {
      seen.set(name, position)
      continue
    }
    // Reported at the later of the two: the first declaration is the one that
    // stands, so the second is the one an author has to change.
    out.push({
      code: 'ERR_DUPLICATE_MEDIA_BASENAME',
      path: `/spec/screenshots/${position}/file`,
      message: `basename "${basename(file)}" is already used by screenshot ${earlier}`,
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

const documentCache = new Map<string, Json | undefined>()

/** Parse a document off disk, or `undefined` when it is unreadable. */
function readDocument(path: string): Json | undefined {
  if (documentCache.has(path)) return documentCache.get(path)
  let parsed: Json | undefined
  try {
    const result = parseDocument(readFileSync(path, 'utf8'))
    parsed = 'value' in result ? result.value : undefined
  } catch {
    // Unreadable or malformed. The item's own parser-phase run reports that;
    // this one declines to describe a document it could not read.
    parsed = undefined
  }
  documentCache.set(path, parsed)
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

/**
 * Blueprint §4.1 and §4.2, plus §3's unreferenced-document rule and §5's
 * parameter rules. All of them need the component documents the graph names,
 * which is what makes them item-scoped.
 */
function checkGraphAgainstItem(
  document: Json,
  itemRoot: string,
  documentPath: string,
  out: Diagnostic[],
): void {
  const components = child(child(document, 'spec'), 'components')
  const parameters = child(child(document, 'spec'), 'parameters')
  const baseDir = dirname(documentPath)
  const referenced = new Set<string>()
  const resolved = new Map<string, Json>()

  for (const node of keysOf(components)) {
    const reference = asString(child(child(components, node), 'componentRef'))
    const pointer = `/spec/components/${token(node)}/componentRef`
    // A published reference is a UUID and belongs to the capability phase; only
    // the repo-local form resolves offline (§4.1).
    if (reference === undefined || !LOCAL_REFERENCE.test(reference)) continue

    const target = resolve(baseDir, reference)
    if (!contains(itemRoot, resolveReal(target))) {
      out.push({
        code: 'ERR_REFERENCE_ESCAPE',
        path: pointer,
        message: `${reference} resolves outside the item root`,
      })
      continue
    }
    if (!existsSync(target)) {
      out.push({
        code: 'ERR_COMPONENT_NOT_FOUND',
        path: pointer,
        message: `${reference} names no document`,
      })
      continue
    }
    referenced.add(realpathSync(target))
    const component = readDocument(target)
    if (component !== undefined) resolved.set(node, component)
  }

  checkUnreferencedComponents(itemRoot, documentPath, referenced, out)
  checkConnectionOutputs(components, resolved, out)
  checkConnectionInputs(components, resolved, out)
  checkConnectableInputs(components, resolved, out)
  checkConnectionCompatibility(components, resolved, out)
  checkNodeCompute(components, resolved, out)
  checkParameters(parameters, components, resolved, out)
}

/** Blueprint §3 — every component document in the item MUST be referenced. */
function checkUnreferencedComponents(
  itemRoot: string,
  documentPath: string,
  referenced: Set<string>,
  out: Diagnostic[],
): void {
  const self = realpathSync(documentPath)
  for (const path of yamlFiles(itemRoot)) {
    const real = realpathSync(path)
    if (real === self || referenced.has(real)) continue
    if (child(readDocument(path), 'kind') !== 'COMPONENT') continue
    out.push({
      code: 'ERR_UNREFERENCED_COMPONENT',
      // Anchored at the mapping that should have named the file: a JSON Pointer
      // addresses this document, and the file it complains about is not in it.
      path: '/spec/components',
      message: `${relative(itemRoot, path)} is referenced by no node`,
    })
  }
}

/**
 * Blueprint §4.2, `BP-CONN-002` — a connection MUST NOT fill an input that one
 * of the consuming component's own `INPUT` outputs reads.
 *
 * Component §6.2 makes every output a function of its own node, which is what
 * lets §4.2 permit a cycle: every output resolves before any edge is bound. An
 * output republishing a wired input would depend on an inbound edge, and the
 * component cannot see which of its inputs are wired. This document can.
 */
function checkConnectableInputs(
  components: Json | undefined,
  resolved: Map<string, Json>,
  out: Diagnostic[],
): void {
  for (const node of keysOf(components)) {
    const component = resolved.get(node)
    if (component === undefined) continue
    const outputs = child(child(child(component, 'spec'), 'contract'), 'outputs')
    const republished = new Map<string, string>()
    for (const name of keysOf(outputs)) {
      const output = child(outputs, name)
      if (child(output, 'valueFrom') !== 'INPUT') continue
      const input = asString(child(output, 'input'))
      if (input !== undefined && !republished.has(input)) republished.set(input, name)
    }

    for (const key of keysOf(child(child(components, node), 'connections'))) {
      const output = republished.get(key)
      if (output === undefined) continue
      out.push({
        code: 'ERR_INPUT_NOT_CONNECTABLE',
        path: `/spec/components/${token(node)}/connections/${token(key)}`,
        message: `input "${key}" is republished by output "${output}", so no connection may fill it`,
      })
    }
  }
}

/**
 * Blueprint §4.3 — a node names compute if and only if it runs something.
 *
 * One code for both directions: `ERR_CONFLICTING_*` in this repository means two
 * declarations claiming one slot, which is what the node and the component it
 * deploys are doing about this node's compute. Both anchor at the node's `size`,
 * the field an author has to change.
 *
 * Goes silent for a published reference, on the terms §5.3 sets for every rule
 * that reads a referenced component: `resolved` holds only what resolved
 * offline.
 */
function checkNodeCompute(
  components: Json | undefined,
  resolved: Map<string, Json>,
  out: Diagnostic[],
): void {
  for (const node of keysOf(components)) {
    const component = resolved.get(node)
    if (component === undefined) continue
    const external = child(child(component, 'spec'), 'external') !== undefined
    const size = child(child(components, node), 'size')
    // An absent `size` is ERR_MISSING_FIELD in the structural phase; this rule
    // is about the two declarations disagreeing, not about a missing one.
    if (size === undefined) continue
    if (external === (size === null)) continue
    out.push({
      code: 'ERR_CONFLICTING_NODE_COMPUTE',
      path: `/spec/components/${token(node)}/size`,
      message: external
        ? `node "${node}" names compute for a component this platform does not run`
        : `node "${node}" names no compute for a component that runs`,
    })
  }
}

/** Blueprint §4.2 — `fromOutput` MUST name an output the component declares. */
function checkConnectionOutputs(
  components: Json | undefined,
  resolved: Map<string, Json>,
  out: Diagnostic[],
): void {
  for (const node of keysOf(components)) {
    const connections = child(child(components, node), 'connections')
    for (const key of keysOf(connections)) {
      const connection = child(connections, key)
      const producerNode = asString(child(connection, 'fromNode'))
      const output = asString(child(connection, 'fromOutput'))
      if (producerNode === undefined || output === undefined) continue

      const producer = resolved.get(producerNode)
      // An unresolved producer is already ERR_UNKNOWN_NODE or
      // ERR_COMPONENT_NOT_FOUND; do not pile a second diagnostic on one cause.
      if (producer === undefined) continue

      const outputs = child(child(child(producer, 'spec'), 'contract'), 'outputs')
      if (!keysOf(outputs).includes(output)) {
        out.push({
          code: 'ERR_UNKNOWN_OUTPUT',
          path: `/spec/components/${token(node)}/connections/${token(key)}/fromOutput`,
          message: `"${output}" is not an output of the component "${producerNode}" deploys`,
        })
      }
    }
  }
}

/** The inputs a node's component declares, keyed by input name. */
function inputsOf(component: Json | undefined): Json | undefined {
  return child(child(child(component, 'spec'), 'contract'), 'inputs')
}

/**
 * Blueprint §4.2 — a connection's map key MUST name an input of the component
 * the *consuming* node deploys. The mirror of `ERR_UNKNOWN_OUTPUT`: a wire whose
 * two ends are each checked and whose consumer end is not can be misspelled at
 * one end only.
 */
function checkConnectionInputs(
  components: Json | undefined,
  resolved: Map<string, Json>,
  out: Diagnostic[],
): void {
  for (const node of keysOf(components)) {
    const consumer = resolved.get(node)
    // An unresolved consumer is already ERR_COMPONENT_NOT_FOUND, or is a
    // published reference this phase may not resolve at all.
    if (consumer === undefined) continue

    const declared = keysOf(inputsOf(consumer))
    for (const key of keysOf(child(child(components, node), 'connections'))) {
      if (declared.includes(key)) continue
      out.push({
        code: 'ERR_UNKNOWN_INPUT',
        path: `/spec/components/${token(node)}/connections/${token(key)}`,
        message: `"${key}" is not an input of the component "${node}" deploys`,
      })
    }
  }
}

/**
 * Blueprint §4.2 — the two ends of a connection MUST fit.
 *
 * `type` is compared for equality with no widening in either direction; a
 * `resourceType` the consumer names must be matched exactly by the producer,
 * while a consumer naming none accepts anything. Both ends always carry a
 * `schema` with a required `type`, so there is no unconstrained producer case.
 */
function checkConnectionCompatibility(
  components: Json | undefined,
  resolved: Map<string, Json>,
  out: Diagnostic[],
): void {
  for (const node of keysOf(components)) {
    const connections = child(child(components, node), 'connections')
    const consumer = resolved.get(node)
    if (consumer === undefined) continue

    for (const key of keysOf(connections)) {
      const connection = child(connections, key)
      const producerNode = asString(child(connection, 'fromNode'))
      const output = asString(child(connection, 'fromOutput'))
      if (producerNode === undefined || output === undefined) continue

      const producer = resolved.get(producerNode)
      if (producer === undefined) continue

      // A dangling end is already ERR_UNKNOWN_OUTPUT or ERR_UNKNOWN_INPUT; do
      // not pile a compatibility verdict on a pair that does not both exist.
      const outputs = child(child(child(producer, 'spec'), 'contract'), 'outputs')
      const inputs = child(child(child(consumer, 'spec'), 'contract'), 'inputs')
      const from = child(child(outputs, output), 'schema')
      const to = child(child(inputs, key), 'schema')
      if (from === undefined || to === undefined) continue

      const path = `/spec/components/${token(node)}/connections/${token(key)}/fromOutput`
      const fromType = child(from, 'type')
      const toType = child(to, 'type')
      if (fromType !== toType) {
        out.push({
          code: 'ERR_INCOMPATIBLE_TYPE',
          path,
          message: `output "${output}" is ${String(fromType)}, and input "${key}" takes ${String(toType)}`,
        })
        continue
      }

      // A consumer naming no resourceType has said the value addresses no
      // particular resource, so nothing it receives can contradict that.
      const toResource = asString(child(to, 'resourceType'))
      if (toResource === undefined) continue
      const fromResource = asString(child(from, 'resourceType'))
      if (fromResource !== toResource) {
        out.push({
          code: 'ERR_INCOMPATIBLE_RESOURCE_TYPE',
          path,
          message: `input "${key}" requires ${toResource}, and output "${output}" declares ${fromResource ?? 'none'}`,
        })
      }
    }
  }
}

/**
 * The defaults component §6.3's `schema` block carries. A property left out
 * declares the same thing as one written at its default, so both have to reach
 * the same canonical form before two blocks are compared.
 */
const VALUE_SCHEMA_DEFAULTS: Record<string, Json> = {
  default: null,
  format: null,
  sensitive: false,
  pattern: null,
  resourceType: null,
}

/**
 * A schema block reduced to a form that depends on what it declares rather than
 * on how it was written: defaults filled in, keys emitted in a fixed order.
 */
function canonicalValueSchema(schema: Json | undefined): string {
  if (
    schema === undefined ||
    schema === null ||
    typeof schema !== 'object' ||
    Array.isArray(schema)
  ) {
    return JSON.stringify(schema ?? null)
  }
  const merged: Record<string, Json> = { ...VALUE_SCHEMA_DEFAULTS }
  for (const key of keysOf(schema)) {
    const value = child(schema, key)
    if (value !== undefined) merged[key] = value
  }
  const canonical: Record<string, Json> = {}
  for (const key of Object.keys(merged).sort()) canonical[key] = merged[key] as Json
  return JSON.stringify(canonical)
}

/** Present and not null. An optional property spelled `null` sets nothing. */
function isSet(value: Json | undefined): boolean {
  return value !== undefined && value !== null
}

/**
 * One input a parameter covers: the node declaring it, and the declaration.
 * Nodes are walked in sorted order, so the first entry is the one blueprint
 * §5.3 takes a covered input's wording from.
 */
interface CoveredInput {
  readonly node: string
  readonly input: Json
}

/**
 * Blueprint §5.1 — the input key a parameter covers. `toInput` names it where
 * it differs from the parameter's own key; absent, the key is the input key.
 */
function coveredKey(key: string, parameter: Json | undefined): string {
  return asString(child(parameter, 'toInput')) ?? key
}

/**
 * Blueprint §5.1 — the inputs a parameter covers: every resolved node's input
 * of the covered key which no connection on the node fills. A wired input is
 * not a candidate, so a wire and a parameter never claim one value.
 *
 * `toNode` restricts the walk to one node. It narrows the correspondence and
 * does not replace it: a parameter carrying neither field covers exactly what
 * binding by key covers.
 */
function coveredInputs(
  key: string,
  parameter: Json | undefined,
  components: Json | undefined,
  resolved: Map<string, Json>,
): CoveredInput[] {
  const input_key = coveredKey(key, parameter)
  const only = asString(child(parameter, 'toNode'))
  const covered: CoveredInput[] = []
  for (const node of keysOf(components).sort()) {
    if (only !== undefined && node !== only) continue
    const input = child(inputsOf(resolved.get(node)), input_key)
    if (input === undefined) continue
    if (keysOf(child(child(components, node), 'connections')).includes(input_key)) continue
    covered.push({ node, input })
  }
  return covered
}

/**
 * Blueprint §5.1, `BP-PARAM-006` and `BP-PARAM-007` — a narrowing field MUST
 * narrow onto something. Both are the coverage failure `BP-PARAM-001` reports,
 * caught one step earlier and at the field that caused it.
 *
 * `BP-PARAM-007` is measured against the nodes the parameter covers, so like
 * `BP-PARAM-001` it is decidable only when every node's component was read.
 */
function checkParameterTarget(
  key: string,
  parameter: Json | undefined,
  components: Json | undefined,
  resolved: Map<string, Json>,
  allReadable: boolean,
  out: Diagnostic[],
): boolean {
  const node = asString(child(parameter, 'toNode'))
  if (node !== undefined && !keysOf(components).includes(node)) {
    out.push({
      code: 'ERR_UNKNOWN_NODE',
      path: `/spec/parameters/${token(key)}/toNode`,
      message: `toNode "${node}" names no node in this blueprint`,
    })
    return true
  }

  const input = asString(child(parameter, 'toInput'))
  if (input === undefined || !allReadable) return false
  const scope = node === undefined ? keysOf(components) : [node]
  const declared = scope.some((each) => child(inputsOf(resolved.get(each)), input) !== undefined)
  if (declared) return false
  out.push({
    code: 'ERR_UNKNOWN_INPUT',
    path: `/spec/parameters/${token(key)}/toInput`,
    message: `toInput "${input}" names no input of ${
      node === undefined ? 'any node in this blueprint' : `node "${node}"`
    }`,
  })
  return true
}

/**
 * Blueprint §5 — the install form is always authored, and every rule here reads
 * the component documents the graph references. A node whose component was not
 * read — a published reference, or a local one already rejected — contributes
 * nothing, and an implementation MUST NOT report an input it could not read.
 */
function checkParameters(
  parameters: Json | undefined,
  components: Json | undefined,
  resolved: Map<string, Json>,
  out: Diagnostic[],
): void {
  // `BP-PARAM-001` asserts that *no* node declares the key, which is a claim
  // about every node's inputs. It is decidable only when every node was read.
  const allReadable = keysOf(components).every((node) => resolved.has(node))
  const coveredKeys = new Set<string>()

  for (const key of keysOf(parameters)) {
    const parameter = child(parameters, key)
    const pointer = `/spec/parameters/${token(key)}`
    // A narrowing field that names nothing has already been reported, and the
    // empty coverage it causes is that one cause seen twice.
    if (checkParameterTarget(key, parameter, components, resolved, allReadable, out)) continue

    const covered = coveredInputs(key, parameter, components, resolved)
    if (covered.length === 0) {
      if (!allReadable) continue
      out.push({
        code: 'ERR_UNBOUND_PARAMETER',
        path: pointer,
        message: `parameter "${key}" covers no unwired input of any node`,
      })
      continue
    }
    for (const { node } of covered) coveredKeys.add(`${node}\u0000${coveredKey(key, parameter)}`)

    // `BP-PARAM-002` — one field asks for one value, so the inputs it feeds have
    // to agree on what that value is. Compared "once defaults are applied".
    const first = covered[0] as CoveredInput
    const shape = canonicalValueSchema(child(first.input, 'schema'))
    const conflict = covered.find(
      ({ input }) => canonicalValueSchema(child(input, 'schema')) !== shape,
    )
    if (conflict !== undefined) {
      out.push({
        code: 'ERR_CONFLICTING_INPUT_SCHEMA',
        path: pointer,
        message: `parameter "${key}" covers inputs on nodes "${first.node}" and "${conflict.node}" whose schemas differ`,
      })
    }

    checkGeneratedParameter(key, parameter, covered, out)
    checkParameterDefault(key, parameter, covered, resolved, out)
    if (conflict === undefined) checkEnumLabels(key, parameter, first.input, out)
  }

  checkSatisfiedInputs(components, resolved, coveredKeys, out)
}

/**
 * Blueprint §5.1, `BP-PARAM-003` — an input the component requires and gives no
 * default MUST be wired or covered. `required` defaults to true, so an absent
 * key is a required input.
 */
function checkSatisfiedInputs(
  components: Json | undefined,
  resolved: Map<string, Json>,
  coveredKeys: Set<string>,
  out: Diagnostic[],
): void {
  for (const node of keysOf(components)) {
    const inputs = inputsOf(resolved.get(node))
    const wired = new Set(keysOf(child(child(components, node), 'connections')))
    for (const key of keysOf(inputs)) {
      const input = child(inputs, key)
      if (child(input, 'required') === false) continue
      if (isSet(child(child(input, 'schema'), 'default'))) continue
      if (wired.has(key) || coveredKeys.has(`${node}\u0000${key}`)) continue
      out.push({
        code: 'ERR_UNSATISFIED_REQUIRED_INPUT',
        path: `/spec/components/${token(node)}`,
        message: `required input "${key}" of node "${node}" is neither wired nor covered by a parameter`,
      })
    }
  }
}

/**
 * Blueprint §5.2, `BP-PARAM-004` — a generated value is secret material, and
 * whether a value is secret is the component's to say. Every input a generated
 * parameter covers MUST declare `schema.sensitive: true`; `sensitive` defaults
 * to false, which is the wrong answer here.
 */
function checkGeneratedParameter(
  key: string,
  parameter: Json | undefined,
  covered: readonly CoveredInput[],
  out: Diagnostic[],
): void {
  if (!isSet(child(parameter, 'generator'))) return
  const exposed = covered.find(({ input }) => child(child(input, 'schema'), 'sensitive') !== true)
  if (exposed === undefined) return
  out.push({
    code: 'ERR_GENERATED_INPUT_NOT_SENSITIVE',
    path: `/spec/parameters/${token(key)}/generator`,
    message: `parameter "${key}" generates a value for input "${key}" of node "${exposed.node}", which is not marked sensitive`,
  })
}

/** Blueprint §5.2 — the address form each `self` path reads. */
const SELF_ADDRESS_FORM: Record<string, AddressForm> = {
  publicUrl: 'http',
  publicHostname: 'http',
  publicAddress: 'l4',
  publicPort: 'l4',
}

/** Core v1 §5.2, `CORE-REF-003` — the namespaces a parameter's `default` admits. */
const DEFAULT_NAMESPACES = ['self']

/**
 * Blueprint §5.2 — a parameter's `default`.
 *
 * Three layers, in the order a reader meets them: the grammar
 * (`CORE-REF-001..003`), then `BP-PARAM-008`, then `BP-PARAM-005`. Each later
 * one presumes the earlier passed, so a malformed reference reports once rather
 * than cascading into "this endpoint does not exist".
 *
 * A `default` with no reference in it is a literal the blueprint supplies, and
 * none of this applies to it.
 */
function checkParameterDefault(
  key: string,
  parameter: Json | undefined,
  covered: readonly CoveredInput[],
  resolved: Map<string, Json>,
  out: Diagnostic[],
): void {
  const value = asString(child(parameter, 'default'))
  if (value === undefined) return
  const pointer = `/spec/parameters/${token(key)}/default`

  const { references, failures } = scanReferences(value, DEFAULT_NAMESPACES)

  // A diagnostic quotes the reference as written and never a resolved value
  // (core v1 §5.2, §11).
  for (const failure of failures) {
    if (failure.kind === 'malformed') {
      out.push({
        code: 'ERR_MALFORMED_REFERENCE',
        path: pointer,
        message: `"${failure.raw}" does not open a well-formed reference: ${failure.why}`,
      })
      continue
    }
    const { namespace, raw } = { ...failure.reference }
    out.push({
      code:
        failure.kind === 'unknown-namespace'
          ? 'ERR_UNKNOWN_REFERENCE_NAMESPACE'
          : 'ERR_REFERENCE_NOT_IN_SCOPE',
      path: pointer,
      message:
        failure.kind === 'unknown-namespace'
          ? `"${raw}" names no reserved namespace`
          : `"${raw}" names the "${namespace}" namespace, which a parameter's default does not admit`,
    })
  }
  if (failures.length > 0 || references.length === 0) return

  // `BP-PARAM-008` — one field shows one value, and two nodes have two
  // addresses. Rejected rather than picked; `toNode` is how an author says
  // which node they meant.
  if (covered.length > 1) {
    out.push({
      code: 'ERR_AMBIGUOUS_SELF_REFERENCE',
      path: pointer,
      message: `parameter "${key}" reads self addressing and covers ${covered.length} nodes; name one with toNode`,
    })
    return
  }

  const only = covered[0]
  if (only === undefined) return
  const endpoints = child(child(child(resolved.get(only.node), 'spec'), 'workload'), 'endpoints')

  // `BP-PARAM-005` — the path has to resolve on that node by component §5.2's
  // rules. One pointer serves the whole string, so two references failing the
  // same way is one diagnostic rather than two.
  const reported = new Set<string>()
  for (const reference of references) {
    const [form, endpoint] = reference.path
    if (form === undefined) continue
    const found: Diagnostic[] = []
    checkEndpointReference(
      {
        // An absent endpoint segment selects the primary, exactly as an omitted
        // `endpoint` did on the field this replaced.
        value: endpoint ?? undefined,
        path: pointer,
        subject: `"${reference.raw}" on parameter "${key}"`,
        mustBePublic: true,
        // A path outside the four the prose names is already
        // ERR_REFERENCE_NOT_IN_SCOPE's neighbour: the grammar admitted it, so
        // report nothing rather than guess an address form.
        addressForm: SELF_ADDRESS_FORM[form],
      },
      endpoints,
      found,
    )
    for (const diagnostic of found) {
      if (reported.has(diagnostic.code)) continue
      reported.add(diagnostic.code)
      out.push(diagnostic)
    }
  }
}

/**
 * Blueprint §5.3, `BP-UI-003` — every `ui.enumLabels` key MUST be a member of
 * the covered inputs' `schema.enum`. Read from the first covered input, which
 * `BP-PARAM-002` has already made equal to the rest.
 *
 * `semantic` because the members live in another document. The reverse
 * direction is deliberately not an error: a member with no label is offered as
 * it is spelled.
 */
function checkEnumLabels(
  key: string,
  parameter: Json | undefined,
  input: Json,
  out: Diagnostic[],
): void {
  const labels = child(child(parameter, 'ui'), 'enumLabels')
  if (!isObject(labels)) return

  const members = child(child(input, 'schema'), 'enum')
  const known = new Set(Array.isArray(members) ? members.filter((m) => typeof m === 'string') : [])

  // Sorted so two implementations anchor the same diagnostic first when a
  // document mislabels more than one member; a mapping supplies no order.
  for (const member of keysOf(labels).sort()) {
    if (known.has(member)) continue
    out.push({
      code: 'ERR_UNKNOWN_ENUM_MEMBER',
      path: `/spec/parameters/${token(key)}/ui/enumLabels/${token(member)}`,
      message: `"${member}" is not a member of the enum the covered input declares`,
    })
  }
}

// ===========================================================================
// entry point
// ===========================================================================

/**
 * Every semantic diagnostic one document produces. Ordering within the result is
 * not normative — the conformance contract is that a declared diagnostic is
 * among those produced, not that it is produced first.
 */
export function semanticDiagnostics(
  family: Family,
  document: Json,
  context: SemanticContext = {},
): Diagnostic[] {
  const out: Diagnostic[] = []

  if (family.name === 'component') {
    checkImageRef(document, out)
    checkEndpointReferences(document, out)
    checkOutputInputReferences(document, out)
    checkOutputValueReferences(document, out)
    checkEnvVarKeys(document, out)
  }
  if (family.name === 'blueprint') {
    checkConnectionNodes(document, out)
  }
  if (family.name === 'listing') {
    checkScreenshotBasenames(document, out)
    checkDescriptionMarkdown(document, out)
  }

  const { itemRoot } = context
  if (itemRoot === undefined) return out

  const documentPath =
    context.documentPath ??
    join(itemRoot, family.name === 'blueprint' ? 'blueprint.yaml' : 'listing.yaml')

  if (family.name === 'blueprint' || family.name === 'listing') {
    checkSlug(document, itemRoot, out)
  }
  if (family.name === 'blueprint') {
    checkGraphAgainstItem(document, itemRoot, documentPath, out)
  }
  if (family.name === 'listing') {
    checkItemType(document, itemRoot, out)
    checkMediaOnDisk(document, itemRoot, out)
  }

  return out
}
