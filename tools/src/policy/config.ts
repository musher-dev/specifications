/**
 * Hold the repository root to `ROOT_ENTRIES` (CFG-09).
 *
 * The root holds only the entries `ROOT_ENTRIES` in `tools/src/lib/layout.ts`
 * names (docs/adr/0024), so a leftover or a stray file fails rather than
 * accreting one commit at a time. It is stricter than the engineering
 * conventions' own root rule, and specific to this repository, so it stays
 * here (docs/adr/0036 §1).
 *
 * The `.config/` layout rules, CFG-01 to CFG-08, retired when the conventions'
 * CONF family, which states the same rules as CONF-01 to CONF-09, became
 * enforced (docs/adr/0037). `task check:conventions` runs them now.
 *
 * NON-NORMATIVE, like everything under tools/.
 */
import { git } from '../lib/git.ts'
import { Failures, REPO_ROOT, ROOT_ENTRIES } from '../lib/layout.ts'

/**
 * Every root entry git tracks that `ROOT_ENTRIES` does not name, as
 * `CFG-09: <what>. <fix>` messages.
 *
 * Exported and taking `repoRoot` so the test suite can exercise the rule
 * against a throwaway tree rather than against this repository.
 */
export function configViolations(repoRoot: string = REPO_ROOT): string[] {
  const problems: string[] = []
  for (const name of rootEntries(repoRoot)) {
    if (ROOT_ENTRIES.includes(name)) continue
    problems.push(
      `CFG-09: ${name} at the repo root is not in ROOT_ENTRIES (tools/src/lib/layout.ts). ` +
        'Move it under the directory that owns its concern, or gitignore it if it is ' +
        'build output. See docs/adr/0024.',
    )
  }
  return problems
}

/**
 * The top-level names of every path git tracks, staged ones included.
 *
 * Untracked paths do not count. The allowlist governs what the repository
 * holds, and a checkout also holds what runs in it: CI downloads actionlint's
 * archive into the workspace root before it lints, and local build output sits
 * there until `task clean`. Counting those failed a clean tree in CI.
 */
function rootEntries(repoRoot: string): string[] {
  const listing = git(repoRoot, ['ls-files', '-z', '--cached'])
  const names = listing
    .split('\0')
    .filter((path) => path !== '')
    .map((path) => path.split('/')[0] as string)
  return [...new Set(names)].sort()
}

function main(): void {
  const failures = new Failures()
  for (const problem of configViolations()) failures.add(problem)
  failures.report('The repository root holds only ROOT_ENTRIES (CFG-09).')
}

if (import.meta.main) main()
