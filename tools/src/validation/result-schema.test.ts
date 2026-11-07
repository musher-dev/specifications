/**
 * Every result the runner produces across the corpus is a validation result
 * core's schema accepts (core v2 §6.1 and §7, docs/adr/0044), and the schema
 * holds the status rules it states.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type BehaviorCase, observe } from '../conformance/behavior.ts'
import {
  type CaseIndexEntry,
  type CaseMetadata,
  IMPLEMENTED_PHASES,
  runValidation,
} from '../conformance/conformance.ts'
import {
  CASE_INDEX_FILE,
  CASE_METADATA_FILE,
  CORE_FAMILY,
  discoverFamilies,
  type Json,
  REPO_ROOT,
  readJson,
  validationResultSchemaPath,
} from '../lib/layout.ts'
import { resultSchema, schemaErrors } from './result-schema.ts'
import { componentWarnings } from './semantic.ts'
import { validateDocument } from './validator.ts'

const families = discoverFamilies(REPO_ROOT)
const kinds = families.filter((f) => f.role === 'kind')
const core = families.find((f) => f.name === CORE_FAMILY)
if (core === undefined) throw new Error('no core family in this checkout')
const schema = resultSchema(REPO_ROOT, core.major)

/** A runner result without `ok`, the runner's own shorthand for `status === 'VALID'`. */
function asResult(result: { ok?: boolean }): Json {
  const { ok: _ok, ...rest } = result
  return JSON.parse(JSON.stringify(rest)) as Json
}

describe('the validation result schema', () => {
  test('ships with core', () => {
    expect(existsSync(validationResultSchemaPath(REPO_ROOT, core.major))).toBe(true)
  })

  test('accepts every result the runner produces for a document case', () => {
    const rejected: string[] = []
    let checked = 0
    for (const family of kinds) {
      const index = join(family.conformanceDir, CASE_INDEX_FILE)
      if (!existsSync(index)) continue
      for (const entry of (readJson(index) as unknown as { cases: CaseIndexEntry[] }).cases) {
        const caseDir = join(family.conformanceDir, entry.path)
        const metadata = readJson(join(caseDir, CASE_METADATA_FILE)) as unknown as CaseMetadata
        if (!IMPLEMENTED_PHASES.has(metadata.phase)) continue
        const result = asResult(runValidation(family, caseDir, metadata))
        checked++
        if (!schema.result(result))
          rejected.push(`${family.name}/${entry.id}: ${schemaErrors(schema.result)}`)
      }
    }
    expect(checked).toBeGreaterThan(0)
    expect(rejected).toEqual([])
  })

  test('accepts every validate observation, and every diagnostic of any other', () => {
    const rejected: string[] = []
    let checked = 0
    for (const family of kinds) {
      const path = join(family.conformanceDir, 'behavior.json')
      if (!existsSync(path)) continue
      for (const c of JSON.parse(readFileSync(path, 'utf8')) as BehaviorCase[]) {
        const observed = observe(family, c)
        checked++
        if (c.operation === 'validate') {
          const result = asResult(observed as { ok?: boolean })
          if (!schema.result(result))
            rejected.push(`${family.name}/${c.id}: ${schemaErrors(schema.result)}`)
          continue
        }
        const diagnostics =
          observed !== null && typeof observed === 'object' && !Array.isArray(observed)
            ? observed.diagnostics
            : undefined
        for (const d of Array.isArray(diagnostics) ? diagnostics : [])
          if (!schema.diagnostic(d))
            rejected.push(`${family.name}/${c.id}: ${schemaErrors(schema.diagnostic)}`)
      }
    }
    expect(checked).toBeGreaterThan(0)
    expect(rejected).toEqual([])
  })

  test('accepts every fixture expectation', () => {
    const rejected: string[] = []
    for (const family of kinds) {
      const path = join(family.conformanceDir, 'behavior.json')
      if (!existsSync(path)) continue
      for (const c of JSON.parse(readFileSync(path, 'utf8')) as BehaviorCase[])
        for (const d of c.diagnostics ?? [])
          if (!schema.expectedDiagnostic(d))
            rejected.push(`${family.name}/${c.id}: ${schemaErrors(schema.expectedDiagnostic)}`)
    }
    expect(rejected).toEqual([])
  })

  const error = { code: 'ERR_UNKNOWN_FIELD', severity: 'ERROR', phase: 'structural', path: '/x' }
  const warning = {
    code: 'WARN_ENDPOINT_SERVER_NAME',
    severity: 'WARNING',
    phase: 'semantic',
    path: '/spec/workload/endpoints/web',
  }
  const deferred = { rule: 'COMP-EP-019', path: '', missing: 'platform:privilegedPorts' }
  const result = (status: string, diagnostics: Json[], deferredList: Json[] = []): Json => ({
    status,
    validationScope: 'document',
    phase: 'semantic',
    diagnostics,
    deferred: deferredList,
  })

  test('INVALID needs an ERROR diagnostic, and a warning alone is not one', () => {
    expect(schema.result(result('INVALID', [error]))).toBe(true)
    expect(schema.result(result('INVALID', [warning]))).toBe(false)
    expect(schema.result(result('INVALID', []))).toBe(false)
  })

  test('VALID and INCOMPLETE carry warnings but no ERROR', () => {
    expect(schema.result(result('VALID', [warning]))).toBe(true)
    expect(schema.result(result('VALID', [error]))).toBe(false)
    expect(schema.result(result('VALID', [], [deferred]))).toBe(false)
    expect(schema.result(result('INCOMPLETE', [warning], [deferred]))).toBe(true)
    expect(schema.result(result('INCOMPLETE', [], []))).toBe(false)
    expect(schema.result(result('INCOMPLETE', [error], [deferred]))).toBe(false)
  })

  test('a diagnostic carries a severity, and a stage exactly in the resolution phase', () => {
    const { severity: _severity, ...unrated } = error
    expect(schema.diagnostic(unrated)).toBe(false)
    expect(schema.diagnostic({ ...error, stage: null })).toBe(false)
    expect(schema.diagnostic({ ...error, stage: 'values' })).toBe(false)
    expect(schema.diagnostic({ ...error, phase: 'resolution' })).toBe(false)
    expect(schema.diagnostic({ ...error, phase: 'resolution', stage: 'values' })).toBe(true)
    expect(schema.diagnostic({ ...error, artifact: 'listing.yaml' })).toBe(true)
    expect(schema.diagnostic({ ...error, extra: true })).toBe(false)
  })

  test('an expected diagnostic defaults its severity, and needs only a code', () => {
    expect(schema.expectedDiagnostic({ code: 'ERR_UNKNOWN_FIELD' })).toBe(true)
    expect(schema.expectedDiagnostic({ code: 'ERR_X', phase: 'semantic', stage: 'values' })).toBe(
      false,
    )
    expect(schema.expectedDiagnostic({ code: 'ERR_X', severity: 'INFO' })).toBe(false)
    expect(schema.expectedDiagnostic({ code: 'ERR_X', message: 'text' })).toBe(false)
  })
})

describe('WARN_ENDPOINT_SERVER_NAME', () => {
  const component = (tls?: Json): Json => ({
    spec: {
      workload: {
        endpoints: { web: { targetPort: 8443, protocol: 'HTTPS', ...(tls ? { tls } : {}) } },
      },
    },
  })
  test('is reported for an HTTPS endpoint that verifies without a serverName', () => {
    expect(componentWarnings(component()).map((d) => d.code)).toEqual(['WARN_ENDPOINT_SERVER_NAME'])
    expect(componentWarnings(component({ verify: 'SYSTEM' }))).toHaveLength(1)
  })
  test('is not reported under NONE, with a serverName, or on another protocol', () => {
    expect(componentWarnings(component({ verify: 'NONE' }))).toEqual([])
    expect(componentWarnings(component({ serverName: 'web.example.internal' }))).toEqual([])
    expect(
      componentWarnings({
        spec: { workload: { endpoints: { web: { targetPort: 80, protocol: 'HTTP' } } } },
      }),
    ).toEqual([])
  })
  test('never changes the status of a result', () => {
    const family = kinds.find((f) => f.name === 'component')
    if (family === undefined) throw new Error('no component family')
    const result = validateDocument(
      family,
      [
        'specVersion: v2',
        'kind: COMPONENT',
        'metadata: { revision: 1 }',
        'spec:',
        '  type: SERVICE',
        '  workload:',
        '    source: { image: example/web:1 }',
        '    endpoints:',
        '      web: { targetPort: 8443, protocol: HTTPS }',
        '  contract: { inputs: {}, outputs: {} }',
        '',
      ].join('\n'),
    )
    expect(result.status).toBe('VALID')
    expect(result.phase).toBe('semantic')
    expect(result.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ['WARN_ENDPOINT_SERVER_NAME', 'WARNING'],
    ])
  })
})
