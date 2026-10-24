/**
 * The validation pipeline, as far as this repository implements it.
 *
 * Core v2 §6 declares five phases. `parser`, `structural` and `semantic` run
 * here. `admission` all but does not: it needs an account, a region, a quota
 * and a catalog, which is a server. The exceptions are the admission rules a
 * document decides on its own (a publication with no description, or with an
 * empty blueprint graph), and they run here so the behavioural corpus can pin
 * them. `resolution` runs only in the behavioural adapter (resolution.ts),
 * over a synthetic deployment context.
 *
 * Running these phases is not this repository publishing a reference validator.
 * ADR 0001 §6 forbids that and is untouched; ADR 0001 §7 describes tools/ as one
 * non-normative adapter over the corpus, and ADR 0002 §5 records why executing
 * the fixtures beats declaring them.
 */
import type { ErrorObject, ValidateFunction } from 'ajv'
import { discoverKinds, type Family, isObject, type Json } from '../lib/layout.ts'
import { familyBundle } from '../schema/bundle.ts'
import { strictAjv } from '../schema/lint.ts'
import {
  type Diagnostic,
  type Phase,
  parseDocument,
  parseDocumentBytes,
  type ValidationScope,
} from './document.ts'
import { listingObligations } from './listing.ts'
import {
  componentObligations,
  type DeferredObligation,
  type SemanticContext,
  semanticReport,
} from './semantic.ts'

export type { Diagnostic, Phase, ValidationScope }
// Re-exported so callers keep one import for the pipeline. The parser phase
// lives in document.ts because semantic.ts needs it to read an item's other
// documents, and importing it from here would close a cycle.
export { parseDocument, parseDocumentBytes }

export interface ValidationResult {
  readonly ok: boolean
  readonly status: 'VALID' | 'INVALID' | 'INCOMPLETE'
  /** How far the result reaches, on core v2 §6.1's lattice. */
  readonly validationScope: ValidationScope
  readonly deferred: DeferredObligation[]
  /** Phase the document reached. On failure, the phase that rejected it. */
  readonly phase: Phase
  readonly diagnostics: Diagnostic[]
}

/**
 * What a caller supplies. The scope ranges over core v2 §6.1's whole lattice;
 * the semantic phase reads the rest of the context.
 */
export type ValidationContext = Omit<SemanticContext, 'validationScope'> & {
  readonly validationScope?: ValidationScope
  /** The platform's catalog and runtime, for the admission rules that read them. */
  readonly platform?: Json
}

/**
 * The admission rules that read the platform's catalog and runtime
 * (docs/conformance.md, Admission context): component `COMP-EP-019` and
 * blueprint `BP-NODE-009` to `BP-NODE-012`. Each is decided against the
 * supplied `platform` context, and deferred where the context is absent.
 */
interface Admission {
  readonly diagnostics: Diagnostic[]
  readonly deferred: DeferredObligation[]
}

const field = (value: Json | undefined, key: string): Json | undefined =>
  isObject(value) && Object.hasOwn(value, key) ? value[key] : undefined
const entries = (value: Json | undefined): [string, Json][] =>
  isObject(value) ? Object.entries(value) : []
const strings = (value: Json | undefined): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
const pointer = (key: string) => key.replaceAll('~', '~0').replaceAll('/', '~1')

/** Blueprint §4.4: whether one host of a compute profile meets every placement constraint. */
function hostMeets(host: Json, placement: Json | undefined): boolean {
  const architectures = strings(field(placement, 'cpuArchitectures'))
  if (architectures.length && !architectures.includes(String(field(host, 'cpuArchitecture'))))
    return false
  if (
    field(placement, 'cpuDedication') === 'dedicated' &&
    field(host, 'cpuDedication') !== 'dedicated'
  )
    return false
  const memory = field(placement, 'minAcceleratorMemoryGiB')
  if (typeof memory === 'number' && !(Number(field(host, 'acceleratorMemoryGiB') ?? 0) >= memory))
    return false
  const runtimes = strings(field(host, 'acceleratorRuntimes'))
  if (strings(field(placement, 'acceleratorRuntimes')).some((r) => !runtimes.includes(r)))
    return false
  for (const key of ['acceleratorInterconnect', 'acceleratorSKUClass', 'networkClass']) {
    const wanted = field(placement, key)
    if (wanted !== undefined && field(host, key) !== wanted) return false
  }
  return true
}

function admission(family: Family, document: Json, platform: Json | undefined): Admission {
  const diagnostics: Diagnostic[] = []
  const deferred: DeferredObligation[] = []
  const reject = (code: string, path: string) =>
    diagnostics.push({ code, path, message: code, phase: 'admission' })
  const spec = field(document, 'spec')
  if (family.name === 'component') {
    // COMP-EP-019: a port below 1024 where the runtime cannot bind one.
    for (const [name, endpoint] of entries(field(field(spec, 'workload'), 'endpoints'))) {
      const port = field(endpoint, 'targetPort')
      if (typeof port !== 'number' || port >= 1024) continue
      const path = `/spec/workload/endpoints/${pointer(name)}/targetPort`
      const binds = field(platform, 'privilegedPorts')
      if (typeof binds !== 'boolean')
        deferred.push({ rule: 'COMP-EP-019', path, missing: 'platform.privilegedPorts' })
      else if (!binds) reject('ERR_PRIVILEGED_PORT', path)
    }
  }
  if (family.name !== 'blueprint') return { diagnostics, deferred }
  const region = field(platform, 'region')
  const profiles = field(platform, 'computeProfiles')
  const classes = field(platform, 'storageClasses')
  for (const [node, n] of entries(field(spec, 'nodes'))) {
    const base = `/spec/nodes/${pointer(node)}`
    const compute = field(n, 'compute')
    const slug = field(compute, 'profile')
    if (typeof slug === 'string') {
      if (!isObject(profiles) || typeof region !== 'string')
        deferred.push({
          rule: 'BP-NODE-009',
          path: `${base}/compute/profile`,
          missing: 'platform.computeProfiles',
        })
      else {
        // BP-NODE-009 and BP-NODE-010: a profile with a host in the region, and
        // one of those hosts meeting every placement constraint at once.
        const offered = field(field(profiles, slug), 'hosts')
        const hosts = (Array.isArray(offered) ? offered : []).filter(
          (host) => field(host, 'region') === region,
        )
        if (!hosts.length) reject('ERR_COMPUTE_PROFILE_UNAVAILABLE', `${base}/compute/profile`)
        else if (
          field(compute, 'placement') !== undefined &&
          !hosts.some((host) => hostMeets(host, field(compute, 'placement')))
        )
          reject('ERR_PLACEMENT_UNSATISFIABLE', `${base}/compute/placement`)
      }
    }
    for (const [volume, allocation] of entries(field(n, 'volumes'))) {
      const at = `${base}/volumes/${pointer(volume)}`
      const name = field(allocation, 'storageClass') ?? field(platform, 'defaultStorageClass')
      if (!isObject(classes) || typeof region !== 'string' || typeof name !== 'string') {
        deferred.push({ rule: 'BP-NODE-011', path: at, missing: 'platform.storageClasses' })
        deferred.push({ rule: 'BP-NODE-012', path: at, missing: 'platform.storageClasses' })
        continue
      }
      // BP-NODE-011: a class the region offers, provisioning the IOPS floor.
      const offered = field(classes, name)
      if (!strings(field(offered, 'regions')).includes(region)) {
        reject('ERR_STORAGE_UNAVAILABLE', `${at}/storageClass`)
        continue
      }
      const floor = field(allocation, 'minIOPS')
      if (typeof floor === 'number' && !(Number(field(offered, 'maxIOPS') ?? 0) >= floor))
        reject('ERR_STORAGE_UNAVAILABLE', `${at}/minIOPS`)
      // BP-NODE-012: no larger than the class allocates.
      const size = field(allocation, 'sizeGiB')
      if (typeof size === 'number' && !(Number(field(offered, 'maxSizeGiB') ?? 0) >= size))
        reject('ERR_VOLUME_TOO_LARGE', `${at}/sizeGiB`)
    }
  }
  return { diagnostics, deferred }
}

/**
 * Map an Ajv error onto a normative diagnostic code.
 *
 * Keyword-to-code is deliberately coarse. The code is the contract; the
 * keyword that produced it is an implementation detail of this runner.
 */
function toDiagnostic(error: ErrorObject): Diagnostic {
  const path = error.instancePath
  const message = `${path || '/'} ${error.message ?? 'is invalid'}`

  switch (error.keyword) {
    case 'required':
    case 'dependentRequired':
      return { code: 'ERR_MISSING_FIELD', path, message }
    case 'additionalProperties':
    case 'unevaluatedProperties':
      return { code: 'ERR_UNKNOWN_FIELD', path, message }
    case 'type':
      return { code: 'ERR_INVALID_TYPE', path, message }
    case 'const':
      return {
        code: path === '/kind' ? 'ERR_WRONG_KIND' : 'ERR_INVALID_VALUE',
        path,
        message,
      }
    case 'enum':
      return {
        code: path === '/specVersion' ? 'ERR_UNSUPPORTED_SPEC_VERSION' : 'ERR_INVALID_VALUE',
        path,
        message,
      }
    default:
      return { code: 'ERR_INVALID_VALUE', path, message }
  }
}

const compiled = new Map<string, ValidateFunction>()

/** Compile a family's bundle, built in memory from its sources. Cached, because compilation is not cheap. */
export function compileFamily(family: Family): ValidateFunction {
  // The same strict compiler the linter uses. Two Ajv configurations would be
  // two definitions of what a valid schema is, and the looser one would decide
  // what this repository actually ships.
  const bundle = familyBundle(family)
  if (bundle === null) {
    throw new Error(`${family.name}/${family.major}: no schema modules authored to compile`)
  }
  const cached = compiled.get(bundle)
  if (cached) return cached
  const validate = strictAjv().compile(JSON.parse(bundle) as object)
  compiled.set(bundle, validate)
  return validate
}

/**
 * The publication obligations this runner can decide from the document alone.
 *
 * `admission` is the server's phase, and most of what it decides needs a
 * catalog this runner does not have. A description, a component's runtime
 * minimums and a blueprint's first node are the exceptions: the field is right
 * there, and what makes each rule `admission` is not that deciding it needs the
 * network but that only a publisher can tell an absent one from one its author
 * has not written yet (component v2 §4 and §5, blueprint v2 §3 and §4).
 */
function publicationDiagnostics(family: Family, document: Json): Diagnostic[] {
  if (family.name === 'component') return componentObligations(document)
  if (family.name !== 'blueprint') return []
  const out: Diagnostic[] = []
  const obligation = (code: string, path: string) =>
    out.push({ code, path, message: code, phase: 'admission' })
  const metadata = isObject(document) ? document.metadata : undefined
  if (!isObject(metadata) || metadata.description === undefined)
    obligation('ERR_DESCRIPTION_REQUIRED', '/metadata')
  const spec = isObject(document) ? document.spec : undefined
  if (isObject(spec) && isObject(spec.nodes) && Object.keys(spec.nodes).length === 0)
    obligation('ERR_NODE_REQUIRED', '/spec/nodes')
  return out
}

/**
 * Run the phases a validation scope needs over one document, in order. A later
 * phase is not entered until the earlier ones pass, which is what core v2 §6
 * requires of every implementation.
 *
 * `context.itemRoot` is what separates the two kinds of semantic rule. Without
 * one, only the rules a single document can decide are reported. That is not a
 * concession to this runner: core v2 §4.1 says a document handed over with no
 * directory has no item root, and an implementation in that position MUST NOT
 * report a rule measured against one. It is also why `check:examples` passes:
 * `examples/` is not an item root, and its documents reference component files
 * and media that deliberately do not exist beside them.
 */
export function validateDocument(
  family: Family,
  source: string | Uint8Array,
  context: ValidationContext = {},
): ValidationResult {
  const scope: ValidationScope = context.validationScope ?? 'document'
  const parsed = typeof source === 'string' ? parseDocument(source) : parseDocumentBytes(source)
  if ('errors' in parsed) {
    return {
      ok: false,
      status: 'INVALID',
      validationScope: scope,
      deferred: [],
      phase: 'parser',
      diagnostics: parsed.errors.map((d) => ({ ...d, phase: 'parser' })),
    }
  }
  if (scope === 'parser')
    return {
      ok: true,
      status: 'VALID',
      validationScope: scope,
      deferred: [],
      phase: 'parser',
      diagnostics: [],
    }

  const validate = compileFamily(family)
  if (validate(parsed.value) as boolean) {
    if (scope === 'structural')
      return {
        ok: true,
        status: 'VALID',
        validationScope: scope,
        deferred: [],
        phase: 'structural',
        diagnostics: [],
      }
    const component =
      family.name === 'blueprint'
        ? discoverKinds(family.repoRoot).find((f) => f.name === 'component')
        : undefined
    const report = semanticReport(family, parsed.value, {
      ...context,
      validationScope: scope as SemanticContext['validationScope'],
      checkComponent: (bytes) =>
        component !== undefined &&
        validateDocument(component, bytes, { validationScope: 'document' }).status === 'VALID',
    })
    if (scope === 'publication' || scope === 'deployment')
      report.deferred.push({
        rule: 'CORE-ADMISSION-001',
        path: '',
        missing: 'authorized catalog and policy admission',
      })
    if (scope === 'deployment')
      report.deferred.push({
        rule: 'BP-RESOLVE-001',
        path: '/spec/nodes',
        missing: 'deployment resolution',
      })
    const diagnostics: Diagnostic[] = report.diagnostics.map((d) => ({ ...d, phase: 'semantic' }))
    // Core v2 §6: a later phase is not entered until the earlier ones pass.
    if (diagnostics.length === 0 && (scope === 'publication' || scope === 'deployment')) {
      diagnostics.push(...publicationDiagnostics(family, parsed.value))
      const decided = admission(family, parsed.value, context.platform)
      diagnostics.push(...decided.diagnostics)
      report.deferred.push(...decided.deferred)
      // Listing §4 and §5: media dimensions and SPDX membership, each deferred
      // when the item root or the pinned SPDX release it reads is absent.
      if (family.name === 'listing') {
        const listing = listingObligations(parsed.value, context)
        diagnostics.push(...listing.diagnostics)
        report.deferred.push(...listing.deferred)
      }
    }
    const status = diagnostics.length ? 'INVALID' : report.deferred.length ? 'INCOMPLETE' : 'VALID'
    return {
      ok: status === 'VALID',
      status,
      validationScope: scope,
      deferred: report.deferred,
      phase: diagnostics.some((d) => d.phase === 'admission') ? 'admission' : 'semantic',
      diagnostics,
    }
  }

  const seen = new Set<string>()
  const diagnostics: Diagnostic[] = []
  for (const error of validate.errors ?? []) {
    const diagnostic = toDiagnostic(error)
    const key = `${diagnostic.code}\u0000${diagnostic.path}`
    if (seen.has(key)) continue
    seen.add(key)
    diagnostics.push({ ...diagnostic, phase: 'structural' })
  }

  return {
    ok: false,
    status: 'INVALID',
    validationScope: scope,
    deferred: [],
    phase: 'structural',
    diagnostics,
  }
}
