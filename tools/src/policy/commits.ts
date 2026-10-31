/**
 * Hold every copy of the Conventional Commits vocabulary in step.
 *
 * `.config/commits/committed.toml` is the one list of commit types and scopes
 * (COMMIT-01 in musher-dev/engineering-conventions). committed reads it in the
 * commit-msg hook and on the pull request title, and `task check:title` reads
 * it too, so none of those keeps a copy.
 *
 * Three copies cannot read it, and this check holds each against it.
 * repository-pull-request-title.yml runs on `pull_request_target` with no
 * checkout, so its action's lists are static YAML. `.github/dependabot.yml`
 * writes commit prefixes, and it carried `prefix: 'devcontainer'` -- a scope
 * where a type belongs -- for months, so every devcontainer update opened with
 * a title no gate would accept and nothing said why. CONTRIBUTING.md prints
 * both lists for a human and had already drifted once, missing `deps-dev`.
 *
 * The scope does not pick a release -- release-please assigns a commit to a
 * package by the paths it changes -- but a scope accepted by the hook and
 * rejected by CI is still a pull request that cannot merge, and a list that
 * drifts is a vocabulary nobody can trust.
 *
 * NON-NORMATIVE, like everything under tools/.
 */
import { readFileSync } from 'node:fs'
import {
  COMMIT_RULES_FILE,
  CONTRIBUTING_FILE,
  DEPENDABOT_FILE,
  Failures,
  inRepo,
  PULL_REQUEST_TITLE_WORKFLOW_FILE,
  REPO_ROOT,
} from '../lib/layout.ts'

/** The scopes `include: 'scope'` appends, by the dependency's own type. */
const DEPENDABOT_SCOPES = ['deps', 'deps-dev'] as const

/** The types and scopes committed accepts. */
export interface CommitRules {
  readonly types: readonly string[]
  readonly scopes: readonly string[]
}

/** Where committed's configuration lives under a repository root. */
export function commitRulesPath(repoRoot: string = REPO_ROOT): string {
  return inRepo(repoRoot, COMMIT_RULES_FILE)
}

/**
 * `allowed_types` and `allowed_scopes` from `.config/commits/committed.toml`.
 * Throws when either is missing or empty: a check against no vocabulary would
 * pass everything.
 */
export function readCommitRules(repoRoot: string = REPO_ROOT): CommitRules {
  const path = commitRulesPath(repoRoot)
  const parsed = Bun.TOML.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  const list = (key: string): string[] => {
    const value = parsed[key]
    if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === 'string')) {
      throw new Error(`${COMMIT_RULES_FILE} sets no ${key}, or not a list of strings`)
    }
    return value as string[]
  }
  return { types: list('allowed_types'), scopes: list('allowed_scopes') }
}

/** A `key: |` block-scalar whose lines are the values, as the action takes them. */
function blockScalar(source: string, key: string): string[] {
  const lines = source.split('\n')
  const start = lines.findIndex((line) => line.trim() === `${key}: |`)
  if (start < 0) return []
  const indent = (lines[start] as string).search(/\S/)
  const items: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue
    if (line.search(/\S/) <= indent) break
    items.push(line.trim())
  }
  return items
}

/** Every commit-message prefix Dependabot is configured to write. */
function dependabotPrefixes(source: string): string[] {
  const values: string[] = []
  for (const line of source.split('\n')) {
    const text = line.trim()
    if (text.startsWith('#')) continue
    const match = /^(?:prefix|prefix-development):\s*(.+?)\s*(?:#.*)?$/.exec(text)
    if (match?.[1] !== undefined) values.push(match[1].replace(/^['"]|['"]$/g, ''))
  }
  return values
}

/** Whether any entry asks Dependabot to append `(deps)` / `(deps-dev)`. */
function dependabotIncludesScope(source: string): boolean {
  return source.split('\n').some((line) => /^include:\s*['"]?scope['"]?/.test(line.trim()))
}

/** A prose `Label: `a`, `b`, `c`.` run, as CONTRIBUTING.md prints one. */
function proseList(source: string, label: string): string[] {
  const lines = source.split('\n')
  const start = lines.findIndex((line) => line.startsWith(`${label}:`))
  if (start < 0) return []
  const run: string[] = []
  for (const line of lines.slice(start)) {
    if (line.trim() === '') break
    run.push(line)
  }
  return [...run.join(' ').matchAll(/`([^`]+)`/g)].map((match) => match[1] as string)
}

function compare(
  label: string,
  expected: readonly string[],
  actual: readonly string[],
  failures: Failures,
): void {
  if (actual.length === 0) {
    failures.add(`${label}: found no vocabulary to compare; the file's shape changed`)
    return
  }
  const missing = expected.filter((item) => !actual.includes(item))
  const extra = actual.filter((item) => !expected.includes(item))
  if (missing.length > 0) {
    failures.add(`${label}: missing ${missing.join(', ')}, present in ${COMMIT_RULES_FILE}`)
  }
  if (extra.length > 0) {
    failures.add(`${label}: has ${extra.join(', ')}, which ${COMMIT_RULES_FILE} does not list`)
  }
}

function main(): void {
  const failures = new Failures()
  let rules: CommitRules
  try {
    rules = readCommitRules()
  } catch (error) {
    failures.add((error as Error).message)
    failures.report('')
    return
  }
  const { types, scopes } = rules

  const workflow = readFileSync(inRepo(REPO_ROOT, PULL_REQUEST_TITLE_WORKFLOW_FILE), 'utf8')
  compare(
    `${PULL_REQUEST_TITLE_WORKFLOW_FILE} types`,
    types,
    blockScalar(workflow, 'types'),
    failures,
  )
  compare(
    `${PULL_REQUEST_TITLE_WORKFLOW_FILE} scopes`,
    scopes,
    blockScalar(workflow, 'scopes'),
    failures,
  )

  const contributing = readFileSync(inRepo(REPO_ROOT, CONTRIBUTING_FILE), 'utf8')
  compare(`${CONTRIBUTING_FILE} types`, types, proseList(contributing, 'Types'), failures)
  compare(`${CONTRIBUTING_FILE} scopes`, scopes, proseList(contributing, 'Scopes'), failures)

  // Dependabot emits `commit-message.prefix` as the TYPE, so a value that is
  // only a valid scope produces a message every gate rejects. Checked as a
  // prefix rather than compared as a list: the file names a few of the
  // vocabulary, not all of it.
  const dependabot = readFileSync(inRepo(REPO_ROOT, DEPENDABOT_FILE), 'utf8')
  const prefixes = dependabotPrefixes(dependabot)
  if (prefixes.length === 0) {
    failures.add(`${DEPENDABOT_FILE} declares no commit-message prefix; the file's shape changed`)
  }
  for (const prefix of prefixes) {
    const parsed = /^([a-z]+)(?:\(([a-z][a-z-]*)\))?$/.exec(prefix)
    if (parsed === null) {
      failures.add(`${DEPENDABOT_FILE}: prefix '${prefix}' is not a <type> or <type>(<scope>)`)
      continue
    }
    const [, type, scope] = parsed
    if (type !== undefined && !types.includes(type)) {
      const hint = scopes.includes(type) ? '; it is a scope, not a type' : ''
      failures.add(
        `${DEPENDABOT_FILE}: prefix '${prefix}' has type '${type}', ` +
          `which ${COMMIT_RULES_FILE} does not list${hint}`,
      )
    }
    if (scope !== undefined && !scopes.includes(scope)) {
      failures.add(
        `${DEPENDABOT_FILE}: prefix '${prefix}' has scope '${scope}', ` +
          `which ${COMMIT_RULES_FILE} does not list`,
      )
    }
  }
  if (dependabotIncludesScope(dependabot)) {
    const absent = DEPENDABOT_SCOPES.filter((scope) => !scopes.includes(scope))
    if (absent.length > 0) {
      failures.add(
        `${DEPENDABOT_FILE} asks for include: 'scope', which writes ` +
          `${DEPENDABOT_SCOPES.join(' and ')}, which ${COMMIT_RULES_FILE} does not ` +
          `list ${absent.join(' or ')}`,
      )
    }
  }

  failures.report(
    `Conventional Commits vocabulary agrees across 4 file(s): ${types.length} type(s), ` +
      `${scopes.length} scope(s), ${prefixes.length} Dependabot prefix(es).`,
  )
}

if (import.meta.main) main()
