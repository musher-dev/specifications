/** Language-neutral observable behavior fixtures; no live account or network. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { canonicalJson, discoverKinds, type Family, isObject, type Json } from '../lib/layout.ts'
import { familyBundle } from '../schema/bundle.ts'
import { parseDocumentBytes } from '../validation/document.ts'
import { normalizeDocument } from '../validation/normalization.ts'
import { formControls, renderListing } from '../validation/presentation.ts'
import {
  credential,
  type InstallationContext,
  inspectValue,
  type ResolutionRecord,
  type ResolvedValue,
  resolutionRecord,
  resolveInstallation,
} from '../validation/resolution.ts'
import { at, record, semanticReport } from '../validation/semantic.ts'
import { validateDocument } from '../validation/validator.ts'

export interface BehaviorCase {
  id: string
  profile: 'normalization' | 'resolution' | 'rendering' | 'lifecycle'
  operation:
    | 'normalize'
    | 'resolve'
    | 'render'
    | 'form'
    | 'credential'
    | 'validate'
    | 'record'
    | 'revision'
  requirements: string[]
  tree?: Record<string, string>
  document?: string
  input?: Json
  context?: Json
  expect: Record<string, Json>
  diagnostics?: { code: string; path?: string }[]
}
export function observe(family: Family, c: BehaviorCase): Json {
  const scratch = mkdtempSync(join(tmpdir(), 'musher-behavior-'))
  try {
    for (const [name, source] of Object.entries(c.tree ?? {})) {
      const target = resolve(scratch, name),
        rel = relative(scratch, target)
      if (rel === '..' || rel.startsWith('../') || isAbsolute(rel))
        throw new Error('fixture path escapes tree')
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, source)
    }
    const path = c.document ? resolve(scratch, c.document) : undefined
    if (path && (relative(scratch, path).startsWith('..') || isAbsolute(relative(scratch, path))))
      throw new Error('fixture document escapes tree')
    const source = path ? readFileSync(path) : Buffer.from(JSON.stringify(c.input ?? null))
    const parsed = parseDocumentBytes(source)
    const document = 'value' in parsed ? parsed.value : null
    const component = discoverKinds(family.repoRoot).find((f) => f.name === 'component')
    const context: InstallationContext = {
      ...record(c.context),
      ...(path ? { itemRoot: dirname(path), documentPath: path } : {}),
      checkComponent: (bytes) =>
        component !== undefined && validateDocument(component, bytes).status === 'VALID',
    } as InstallationContext
    if ('errors' in parsed && c.operation !== 'validate')
      throw new Error('behavior input does not parse')
    if (c.operation === 'revision') {
      const revision = Number(at(c.input, 'revision')),
        highest = Number(at(c.input, 'highestPublishedRevision'))
      if (
        !Number.isSafeInteger(revision) ||
        revision < 1 ||
        !Number.isSafeInteger(highest) ||
        highest < 0
      )
        throw new Error('invalid publication fixture context')
      return revision > highest
        ? { status: 'VALID', diagnostics: [] }
        : {
            status: 'INVALID',
            diagnostics: [{ code: 'ERR_VERSION_NOT_MONOTONIC', path: '/metadata/revision' }],
          }
    }
    if (c.operation === 'record') {
      const v = record(c.input)
      try {
        return {
          status: 'VALID',
          record: resolutionRecord(
            Buffer.from(String(v.blueprint)),
            record(v.specifications) as Record<string, string>,
            v.components as unknown as ResolutionRecord['components'],
            v.configuration as unknown as ResolutionRecord['configuration'],
            v.credentials as unknown as ResolutionRecord['credentials'],
          ),
        } as unknown as Json
      } catch {
        return {
          status: 'INVALID',
          diagnostics: [{ code: 'ERR_INVALID_RESOLUTION_CONTEXT', path: '' }],
        }
      }
    }
    if (c.operation === 'validate')
      return validateDocument(family, source, context) as unknown as Json
    if (c.operation === 'normalize') {
      const bundle = JSON.parse(familyBundle(family)!)
      const once = normalizeDocument(bundle, document)
      return {
        value: once,
        idempotent: canonicalJson(once) === canonicalJson(normalizeDocument(bundle, once)),
      }
    }
    if (c.operation === 'resolve') {
      const result = resolveInstallation(document, context, discoverKinds(family.repoRoot))
      return {
        ...result,
        inspection: Object.fromEntries(
          Object.entries(result.inputs).map(([key, v]) => [key, inspectValue(v)]),
        ),
      } as unknown as Json
    }
    if (c.operation === 'render')
      return {
        html: renderListing(
          String(at(c.input, 'markdown')),
          record(at(c.input, 'media')) as Record<string, string>,
        ),
      }
    if (c.operation === 'form')
      return formControls(document, semanticReport(family, document, context).components)
    const entries = new Map<string, ResolvedValue>(),
      values: Json[] = []
    let generated = 0
    const store = {
      getOrCreate(key: string, create: () => ResolvedValue) {
        if (!entries.has(key)) entries.set(key, create())
        return entries.get(key)!
      },
    }
    const steps = at(c.input, 'steps')
    if (!Array.isArray(steps)) throw new Error('credential fixture requires steps')
    for (const step of steps)
      values.push(
        credential(
          store,
          String(at(step, 'installation')),
          String(at(step, 'parameter')),
          Number(at(step, 'rotation')),
          () => ({ value: 'synthetic-' + ++generated, sensitive: true }),
        ) as unknown as Json,
      )
    return { generated, values }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}
function pointer(value: Json, path: string): Json | undefined {
  if (path === '') return value
  if (!path.startsWith('/')) throw new Error('observation is not a JSON pointer')
  let current: Json | undefined = value
  for (const part of path
    .slice(1)
    .split('/')
    .map((p) => p.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    current = Array.isArray(current)
      ? current[Number(part)]
      : isObject(current)
        ? current[part]
        : undefined
  }
  return current
}
export function runBehaviorCases(family: Family, log: (line: string) => void) {
  const path = join(family.conformanceDir, 'behavior.json')
  const result = {
    ran: 0,
    requirements: new Set<string>(),
    codes: new Set<string>(),
    failures: [] as string[],
  }
  if (!existsSync(path)) return result
  const cases = JSON.parse(readFileSync(path, 'utf8')) as BehaviorCase[]
  const seen = new Set<string>()
  for (const c of cases) {
    try {
      if (
        !c.id ||
        seen.has(c.id) ||
        !['normalization', 'resolution', 'rendering', 'lifecycle'].includes(c.profile) ||
        !Array.isArray(c.requirements) ||
        !isObject(c.expect)
      )
        throw new Error('invalid behavior fixture')
      seen.add(c.id)
      const operations = {
        normalization: ['normalize'],
        resolution: ['resolve', 'validate', 'record'],
        rendering: ['render', 'form'],
        lifecycle: ['credential', 'revision'],
      }
      if (!operations[c.profile].includes(c.operation))
        throw new Error('operation does not belong to profile')
      const observed = observe(family, c)
      for (const expected of c.diagnostics ?? []) {
        const produced = at(observed, 'diagnostics')
        if (
          !Array.isArray(produced) ||
          !produced.some(
            (d) =>
              at(d, 'code') === expected.code &&
              (expected.path === undefined || at(d, 'path') === expected.path),
          )
        )
          throw new Error('declared behavioural diagnostic was not produced')
        result.codes.add(expected.code)
      }
      for (const [path, expected] of Object.entries(c.expect)) {
        const value = pointer(observed, path)
        if (value === undefined || canonicalJson(value) !== canonicalJson(expected))
          throw new Error('observation differs at ' + path)
        if (path.endsWith('/code') && typeof expected === 'string') result.codes.add(expected)
      }
      for (const requirement of c.requirements) result.requirements.add(requirement)
      result.ran++
      log(`  ✓ ${family.name}/${family.major}/${c.id} (${c.profile})`)
    } catch (error) {
      result.failures.push(`${family.name}/${c.id}: ${(error as Error).message}`)
    }
  }
  return result
}
