/**
 * The four-phase validation pipeline, as far as this repository implements it.
 *
 * Phases `parser`, `structural` and `semantic` run here. `capability` all but
 * does not: it needs an account, a region and a quota, which is a server. The
 * exceptions are the capability rules a document decides on its own, a
 * publication profile with no description or with an empty blueprint graph, and
 * they run here so the behavioural corpus can pin them.
 *
 * Running three phases is not this repository publishing a reference validator.
 * ADR 0001 §6 forbids that and is untouched; ADR 0001 §7 describes tools/ as one
 * non-normative adapter over the corpus, and ADR 0002 §5 records why executing
 * the fixtures beats declaring them.
 */
import type { ErrorObject, ValidateFunction } from 'ajv'
import { discoverKinds, type Family, isObject, type Json } from '../lib/layout.ts'
import { familyBundle } from '../schema/bundle.ts'
import { strictAjv } from '../schema/lint.ts'
import { type Diagnostic, type Phase, parseDocument, parseDocumentBytes } from './document.ts'
import { type DeferredObligation, type SemanticContext, semanticReport } from './semantic.ts'

export type { Diagnostic, Phase }
// Re-exported so callers keep one import for the pipeline. The parser phase
// lives in document.ts because semantic.ts needs it to read an item's other
// documents, and importing it from here would close a cycle.
export { parseDocument, parseDocumentBytes }

export interface ValidationResult {
  readonly ok: boolean
  readonly status: 'VALID' | 'INVALID' | 'INCOMPLETE'
  readonly validationProfile: NonNullable<SemanticContext['validationProfile']>
  readonly deferred: DeferredObligation[]
  /** Phase the document reached. On failure, the phase that rejected it. */
  readonly phase: Phase
  readonly diagnostics: Diagnostic[]
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

/** Compile a family's bundle, built in memory from its sources. Cached — compilation is not cheap. */
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
 * `capability` is the server's phase, and most of what it decides needs a
 * catalog this runner does not have. A description and a blueprint's first node
 * are the exceptions: the field is right there, and what makes each rule
 * `capability` is not that deciding it needs the network but that only a
 * publisher can tell an absent one from one its author has not written yet
 * (component v1 §4, blueprint v1 §3 and §4).
 */
function publicationDiagnostics(family: Family, document: Json): Diagnostic[] {
  if (family.name !== 'component' && family.name !== 'blueprint') return []
  const out: Diagnostic[] = []
  const obligation = (code: string, path: string) =>
    out.push({ code, path, message: code, phase: 'capability' })
  const metadata = isObject(document) ? document.metadata : undefined
  if (!isObject(metadata) || metadata.description === undefined)
    obligation('ERR_DESCRIPTION_REQUIRED', '/metadata')
  const spec = isObject(document) ? document.spec : undefined
  if (
    family.name === 'blueprint' &&
    isObject(spec) &&
    isObject(spec.components) &&
    Object.keys(spec.components).length === 0
  )
    obligation('ERR_NODE_REQUIRED', '/spec/components')
  return out
}

/**
 * Run the parser, structural and semantic phases over one document, in order.
 * A later phase is not entered until the earlier ones pass, which is what
 * core v1 §6 requires of every implementation.
 *
 * `context.itemRoot` is what separates the two kinds of semantic rule. Without
 * one, only the rules a single document can decide are reported. That is not a
 * concession to this runner: core v1 §4.1 says a document handed over with no
 * directory has no item root, and an implementation in that position MUST NOT
 * report a rule measured against one. It is also why `check:examples` passes —
 * `examples/` is not an item root, and its documents reference component files
 * and media that deliberately do not exist beside them.
 */
export function validateDocument(
  family: Family,
  source: string | Uint8Array,
  context: SemanticContext = {},
): ValidationResult {
  const profile = context.validationProfile ?? 'document'
  const parsed = typeof source === 'string' ? parseDocument(source) : parseDocumentBytes(source)
  if ('errors' in parsed) {
    return {
      ok: false,
      status: 'INVALID',
      validationProfile: profile,
      deferred: [],
      phase: 'parser',
      diagnostics: parsed.errors.map((d) => ({ ...d, phase: 'parser' })),
    }
  }

  const validate = compileFamily(family)
  if (validate(parsed.value) as boolean) {
    if (profile === 'structural')
      return {
        ok: true,
        status: 'VALID',
        validationProfile: profile,
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
      checkComponent: (bytes) =>
        component !== undefined &&
        validateDocument(component, bytes, { validationProfile: 'document' }).status === 'VALID',
    })
    if (profile === 'publication' || profile === 'deployment')
      report.deferred.push({
        rule: 'CORE-ADMISSION-001',
        path: '',
        missing: 'authorized catalog and policy admission',
      })
    if (profile === 'deployment')
      report.deferred.push({
        rule: 'BP-RESOLVE-001',
        path: '/spec/components',
        missing: 'installation resolution',
      })
    const diagnostics: Diagnostic[] = report.diagnostics.map((d) => ({ ...d, phase: 'semantic' }))
    // Core v1 §6: a later phase is not entered until the earlier ones pass.
    if (diagnostics.length === 0 && (profile === 'publication' || profile === 'deployment'))
      diagnostics.push(...publicationDiagnostics(family, parsed.value))
    const status = diagnostics.length ? 'INVALID' : report.deferred.length ? 'INCOMPLETE' : 'VALID'
    return {
      ok: status === 'VALID',
      status,
      validationProfile: profile,
      deferred: report.deferred,
      phase: diagnostics.some((d) => d.phase === 'capability') ? 'capability' : 'semantic',
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
    validationProfile: profile,
    deferred: [],
    phase: 'structural',
    diagnostics,
  }
}
