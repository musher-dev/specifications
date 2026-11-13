import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { type BehaviorCase, observe } from '../conformance/behavior.ts'
import {
  CONNECTION_EVIDENCE_SCHEMA_FILE,
  discoverKinds,
  familyPaths,
  inRepo,
  type Json,
  REPO_ROOT,
} from '../lib/layout.ts'
import { loadProtocolRegistry } from '../lib/protocols.ts'
import { strictAjv } from '../schema/lint.ts'
import { replaceBlock } from './protocols.ts'

const registry = loadProtocolRegistry()

describe('the protocol registry', () => {
  test('lists every protocol in category order', () => {
    expect(registry.protocols.map((p) => p.id).slice(0, 6)).toEqual([
      'OPENAI_CHAT_COMPLETIONS',
      'ANTHROPIC_MESSAGES',
      'OPENAI_EMBEDDINGS',
      'POSTGRES',
      'REDIS',
      'S3',
    ])
  })

  test('every protocol has exactly one credential, and an HTTP one one locator', () => {
    for (const p of registry.protocols) {
      expect(p.members.filter((m) => m.role === 'credential')).toHaveLength(1)
      expect(p.members.filter((m) => m.role === 'locator').length).toBeLessThanOrEqual(1)
    }
  })
})

describe('generated blocks', () => {
  test('replace only what lies between their markers', () => {
    const text = [
      'before',
      '<!-- BEGIN GENERATED t: source -->',
      '',
      'old',
      '',
      '<!-- END GENERATED t -->',
      'after',
    ].join('\n')
    expect(replaceBlock(text, 't', 'new', 'x.md')).toBe(text.replace('old', 'new'))
    expect(() => replaceBlock('no markers', 't', 'new', 'x.md')).toThrow('x.md')
  })
})

describe('the connection-evidence schema', () => {
  const blueprint = discoverKinds().find((f) => f.name === 'blueprint')
  if (!blueprint) throw new Error('no blueprint family')
  const schema = JSON.parse(
    readFileSync(
      inRepo(
        REPO_ROOT,
        `${familyPaths('blueprint', blueprint.major).interfaces}/${CONNECTION_EVIDENCE_SCHEMA_FILE}`,
      ),
      'utf8',
    ),
  )
  const validate = strictAjv().compile(schema)
  const cases = (
    JSON.parse(readFileSync(`${blueprint.conformanceDir}/behavior.json`, 'utf8')) as BehaviorCase[]
  ).filter((c) => (c.context as { connections?: Json } | undefined)?.connections !== undefined)

  test('is exercised by the behavioural corpus', () => {
    expect(cases.length).toBeGreaterThan(20)
  })

  // Shape only: evidence the schema rejects is malformed, so the runner
  // reports ERR_INVALID_RESOLUTION_CONTEXT for it; evidence it accepts may
  // still break a rule of blueprint §5.3.
  for (const c of cases) {
    test(`${c.id}: rejected evidence is malformed evidence`, () => {
      const connections = (c.context as { connections: Json }).connections
      if (validate(connections)) return
      const observed = observe(blueprint, c) as { diagnostics?: { code: string }[] }
      expect(observed.diagnostics?.map((d) => d.code)).toContain('ERR_INVALID_RESOLUTION_CONTEXT')
    })
  }

  test('accepts the evidence of every resolving case', () => {
    const rejected = cases
      .filter((c) => (c.expect as Record<string, Json>)['/status'] === 'VALID')
      .filter((c) => !validate((c.context as { connections: Json }).connections))
      .map((c) => c.id)
    expect(rejected).toEqual([])
  })
})
