/**
 * Hold a pull request title to the Conventional Commits vocabulary —
 * `task check:title`, run by the `Title / Conventional Commit` job of
 * validate-pull-request.yml, on pull requests only.
 *
 * The squash merge lands the title as the commit subject, and release-please
 * reads that subject. committed checks the title first, in the same job, but
 * it cannot require a scope or a lowercase subject (COMMIT-04 in
 * musher-dev/engineering-conventions). So the title is also checked here
 * against `.config/commits/committed.toml`, the file `check:commits` holds
 * every other copy to: `<type>(<scope>)!: <subject>`, a listed type, a listed
 * scope, which is required, and a subject that starts lowercase and does not
 * end with a period, as repository-pull-request-title.yml words it.
 *
 * release-please titles its own pull requests from
 * `.github/release-please/config.json`'s `chore(release): release${component}
 * ${version}`. That title is accepted explicitly, prerelease versions included,
 * so the release pull request cannot fail on a rule tightened for people.
 *
 * The title is read from `PR_TITLE`. Unset is a failure, never a pass: the
 * check is only run where a title exists.
 *
 * NON-NORMATIVE, like everything under tools/.
 */
import { REPO_ROOT } from '../lib/layout.ts'
import { readCommitRules } from './commits.ts'

export interface Vocabulary {
  readonly types: readonly string[]
  readonly scopes: readonly string[]
  readonly requireScope: boolean
}

const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[^()]*)\))?(?<bang>!)?: (?<subject>.+)$/
const SUBJECT = /^(?![A-Z])(?!.*\.$).+$/
/** `chore(release): release${component} ${version}`, as release-please renders it (REL-06). */
const RELEASE_TITLE =
  /^chore\(release\): release(?: [a-z][a-z0-9-]*)? (?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/

/**
 * The vocabulary in `.config/commits/committed.toml`. A title always needs a
 * scope (COMMIT-04): committed has no setting for that, so it is not read from
 * the file.
 */
export function readVocabulary(repoRoot: string = REPO_ROOT): Vocabulary {
  const { types, scopes } = readCommitRules(repoRoot)
  return { types, scopes, requireScope: true }
}

/** Every problem with a title, empty when it passes. */
export function titleProblems(title: string, vocabulary: Vocabulary): string[] {
  if (RELEASE_TITLE.test(title)) return []
  const header = HEADER.exec(title)
  if (header?.groups === undefined) {
    return [`"${title}" is not a Conventional Commits title: expected <type>(<scope>): <subject>`]
  }
  const { type, scope, subject } = header.groups as {
    type: string
    scope?: string
    subject: string
  }
  const problems: string[] = []
  if (!vocabulary.types.includes(type)) {
    problems.push(`type "${type}" is not one of ${vocabulary.types.join(', ')}`)
  }
  if (scope === undefined) {
    if (vocabulary.requireScope) problems.push('a scope is required')
  } else if (!vocabulary.scopes.includes(scope)) {
    problems.push(`scope "${scope}" is not one of ${vocabulary.scopes.join(', ')}`)
  }
  if (!SUBJECT.test(subject)) {
    problems.push(
      `subject "${subject}" must start with a lowercase letter and must not end with a period`,
    )
  }
  return problems
}

function main(): void {
  const title = process.env.PR_TITLE
  if (title === undefined || title === '') {
    console.error(
      '  ✗ PR_TITLE is not set. check:title validates a pull request title passed in it.',
    )
    process.exit(1)
  }
  const problems = titleProblems(title, readVocabulary())
  if (problems.length === 0) {
    console.log(`Pull request title follows Conventional Commits: ${title}`)
    return
  }
  for (const problem of problems) console.error(`  ✗ ${problem}`)
  console.error(
    '\nThe title becomes the squash commit subject; see .config/commits/committed.toml.',
  )
  process.exit(1)
}

if (import.meta.main) main()
