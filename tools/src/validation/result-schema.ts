/**
 * Core's validation result schema, compiled (core v2 §6.1 and §7,
 * docs/adr/0044). The runner's own results are tested against it, and every
 * diagnostic a fixture expects is checked against its `ExpectedDiagnostic`.
 *
 * NON-NORMATIVE, like everything under tools/.
 */
import { existsSync, readFileSync } from 'node:fs'
import type { ValidateFunction } from 'ajv'
import {
  CORE_FAMILY,
  discoverFamilies,
  REPO_ROOT,
  validationResultSchemaPath,
} from '../lib/layout.ts'
import { strictAjv } from '../schema/lint.ts'

export interface ResultSchema {
  /** A whole validation result. */
  readonly result: ValidateFunction
  /** One reported diagnostic. */
  readonly diagnostic: ValidateFunction
  /** One diagnostic a conformance fixture expects. */
  readonly expectedDiagnostic: ValidateFunction
}

const cache = new Map<string, ResultSchema>()

/**
 * Where the schema is: core `<major>`'s in `repoRoot`, or else this checkout's
 * own. A synthetic tree a test builds carries no core interfaces, and a fixture
 * it declares is still a fixture of the same contract.
 */
function locate(repoRoot: string, major: string): string {
  const own = validationResultSchemaPath(repoRoot, major)
  if (existsSync(own)) return own
  const majors = discoverFamilies(REPO_ROOT)
    .filter((f) => f.name === CORE_FAMILY)
    .map((f) => f.major)
  for (const candidate of [major, ...majors.reverse()]) {
    const path = validationResultSchemaPath(REPO_ROOT, candidate)
    if (existsSync(path)) return path
  }
  throw new Error(`no ${CORE_FAMILY} validation result schema in ${repoRoot} or ${REPO_ROOT}`)
}

/** Compile core `<major>`'s validation result schema from `repoRoot`. Cached per file. */
export function resultSchema(repoRoot: string, major: string): ResultSchema {
  const path = locate(repoRoot, major)
  const cached = cache.get(path)
  if (cached) return cached
  const schema = JSON.parse(readFileSync(path, 'utf8')) as { $id: string }
  const ajv = strictAjv()
  ajv.addSchema(schema)
  const compiled: ResultSchema = {
    result: ajv.compile({ $ref: schema.$id }),
    diagnostic: ajv.compile({ $ref: `${schema.$id}#/$defs/Diagnostic` }),
    expectedDiagnostic: ajv.compile({ $ref: `${schema.$id}#/$defs/ExpectedDiagnostic` }),
  }
  cache.set(path, compiled)
  return compiled
}

/** Ajv's errors as one line, for a failure message. */
export function schemaErrors(validate: ValidateFunction): string {
  return (validate.errors ?? [])
    .map((e) => `${e.instancePath || '/'} ${e.message ?? 'is invalid'}`)
    .join('; ')
}
