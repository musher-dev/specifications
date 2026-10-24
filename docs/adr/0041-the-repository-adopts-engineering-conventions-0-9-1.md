# ADR 0041: The repository adopts engineering-conventions 0.9.1

- **Status:** Accepted
- **Date:** 2026-10-24
- **Refines:** [ADR 0037](0037-the-repository-adopts-engineering-conventions-0-7-0.md) §5, enforcing every family
- **Refines:** [ADR 0036](0036-the-repository-adopts-the-engineering-conventions.md) §4, the agent brief moves to `AGENTS.md`
- **Refines:** [ADR 0024](0024-the-repository-root-holds-only-what-must-be-there.md) §3, no brief under `.claude/`
- **Refines:** [ADR 0016](0016-dependency-update-policy.md) §5, the commit vocabulary has one source
- **Relies on:** [ADR 0011](0011-tooling-configuration-layout.md), every config under `.config/`, passed by path

## Context

[ADR 0037](0037-the-repository-adopts-engineering-conventions-0-7-0.md) pinned
engineering-conventions 0.7.0 and made every finding fail CI. Five releases
have shipped since: 0.7.1, 0.8.0, 0.8.1, 0.9.0 and 0.9.1. Checked against
0.9.1, the repository reports sixteen findings in eleven requirements:

| Requirement | Finding |
|---|---|
| AGENT-16 | `.claude/CLAUDE.md` is committed, so Claude Code ignores every `AGENTS.md` |
| AGENT-17 | `AGENTS.md` does not import the README beside it |
| COMMIT-01, COMMIT-02, COMMIT-03 | No `.config/commits/committed.toml`, no committed pin, and the commit-msg hook does not run committed |
| COMMIT-04 | No pull request workflow runs committed on the title, and none requires a scope |
| COMMIT-06 | `.github/conventional-commits.yaml` keeps a second list of types and scopes |
| COPY-01 | The repository publishes a site and has no Vale config |
| HOOKS-12 | The pre-commit `format` job reads as a fixer without `stage_fixed` |
| TASK-16 | `Taskfile.yml` names `/home/vscode`, a path on one machine |
| TASK-20 | One fragment is flattened and the other five are namespaced |

ADR 0037 §5 requires the upgrade that brings a finding to fix or waive it. This
decision fixes all of them. The REPO-08 waiver stays as it is.

## Decision

### 1. The pin moves to 0.9.1

`.config/mise/config.toml` pins `github:musher-dev/engineering-conventions`
at `0.9.1`, and `mise.lock` records it. The same file now pins committed
(`github:crate-ci/committed`) and Vale (`aqua:vale-cli/vale`, the version the
conventions' launcher runs), exact versions with fully qualified backends like
every other tool. mise's `min_version` does not change: 0.9.1 asks for no
newer mise.

### 2. committed checks every commit message and pull request title

`.config/commits/committed.toml` is the one list of commit types and scopes. It
keeps the eleven types and thirteen scopes the repository already had, and the
rules it already applied: a Conventional Commit header, a listed type, a listed
scope, a lowercase subject with no closing period. It sets no length limit,
because a squash commit carries the pull request number and Dependabot chooses
its own subjects, and it does not require an imperative subject, which was not
required before. Every subject in the last 300 commits on `main` passes it.

- **The hook.** The commit-msg hook runs
  `committed --config .config/commits/committed.toml --commit-file {1}`,
  skipping merges and rebases, in place of its inline regular expression.
- **The title.** The `Title / Conventional Commit` job pipes the title from an
  environment variable into committed, then runs `task check:title`, which
  reads the same file.
- **The copies.** `.github/conventional-commits.yaml` is deleted.
  `task check:commits` holds the copies that cannot read the file in step with
  it: the action's static lists in `repository-pull-request-title.yml`, the
  prefixes in `.github/dependabot.yml`, and the lists CONTRIBUTING prints.

### 3. A pull request title requires a scope

committed cannot require a scope, so COMMIT-04 asks for
`amannn/action-semantic-pull-request` with `requireScope: true`.
`repository-pull-request-title.yml` sets it, and `task check:title`, which the
ruleset requires through `Validate Pull Request / Required`, refuses an
unscoped title too.

This is a deliberate tightening. Until now an unscoped title such as
`fix: correct a typo` merged. Every recent title on `main` carries a scope, as
do release-please's `chore(release): …` and Dependabot's `build(deps): …` and
`ci(deps): …`, so the rule describes what the repository already does and stops
it drifting. A commit on a branch still needs no scope: the squash commit takes
the title.

### 4. Every Taskfile fragment is flattened

`Taskfile.yml` includes all six fragments with `flatten: true` (TASK-20). Each
fragment writes its tasks' full names, `check:format`, `ci:lint`,
`contracts:check`, `release:stage`, `setup:tools`, so no name CI, the hooks or
the docs use changes. References between fragments lose their leading colon,
which only a namespaced include needed.

The `env:` block that defaulted `BUN_INSTALL_CACHE_DIR` to `/home/vscode/.cache/bun`
goes (TASK-16). The dev container sets the variable in `devcontainer.json`, and
anywhere else bun's own default applies.

### 5. The `format` hook sets `stage_fixed`

HOOKS-12 reads a pre-commit job whose task has a `format` segment as a job that
rewrites files. `check:format` runs `biome ci`, which only reports, so the
finding is a false positive. The job sets `stage_fixed: true` anyway: it
restages nothing while the task only reports, it keeps the hook correct if the
task ever writes, and it costs less than a waiver with a tracking issue. The
false positive belongs upstream.

### 6. `AGENTS.md` is the brief for every agent

From 0.8.0 the conventions make `AGENTS.md` the project memory, and Claude Code
2.1.277 and later reads it as one. A committed `CLAUDE.md` makes Claude Code
ignore every `AGENTS.md`, so the two cannot coexist.

The content of `.claude/CLAUDE.md` moves into the root `AGENTS.md`, unchanged
in meaning, and `.claude/CLAUDE.md` is deleted. `AGENTS.md` imports
`@README.md`, as AGENT-17 asks, and no `CLAUDE.md` or `CLAUDE.local.md` is
committed at any depth. `.claude/` keeps only Claude Code's settings and rules,
and stays a root entry for them. The router `AGENTS.md` that ADR 0036 §4 added
is gone, because the brief no longer needs one.

### 7. Vale lints the published prose

The site is a `site` output, so Vale checks its copy (COPY-01).
`.config/markdown/vale.ini`:

- installs `MusherProse.zip` from the v0.9.1 release URL, the release the mise
  pin names (COPY-02), so the copy rules move with the pin;
- applies `MusherCopy`, `proselint`, `write-good` and `MusherSpecifications` in
  one section (COPY-03);
- scopes that section to every README, the guides under `docs/` and the v2
  `spec.md` files, and turns the styles off for `docs/adr/**`, which is
  history, every `CHANGELOG.md`, which release-please writes, and the two pages
  `task docs` generates, `docs/traceability.md` and `docs/terminology.md`, the
  glossary that lists the very terms the generated style flags;
- turns off `write-good.ThereIs` and `write-good.So`, because "There is" and a
  sentence opening "So" are often the plainest way to state a rule, and
  `Google.ExcessiveClaims` for the specifications, where "guarantee" is
  normative vocabulary;
- reports at `warning` and above.

`MusherSpecifications` is this repository's own style, generated from the
terminology by `task docs` into `.config/markdown/styles/MusherSpecifications/`.
`StylesPath` points at `.config/markdown/styles/`, where `vale sync` also
installs the packages. `.gitignore` ignores everything there but the
generated style, and markdownlint and cspell skip it.

`task check:prose` runs `vale sync`, then Vale over the files the section
matches, from the repository root, and fails on any alert it prints. It runs in
`task check` and in the `Tools / Lint` job through `ci:lint`.

### 8. The REPO-08 waiver stays

The repository is still named `specifications`, which is not
`<system>-<component>`. 0.9.1 does not change REPO-08 to REPO-11, and the
declaration's `system` and `component` still describe the repository. The
waiver in `.repo/conventions.toml` and its tracking issue,
[#149](https://github.com/musher-dev/specifications/issues/149), stay as they
are until a rename is decided.

## Alternatives considered

**Waive AGENT-16 and keep the brief at `.claude/CLAUDE.md`.** No file moves.
It was rejected because the split is the defect AGENT-16 names: Claude Code
would follow one file and every other agent another, and a waiver only records
that.

**Keep `.github/conventional-commits.yaml` as the source and generate
`committed.toml` from it.** The old checks keep working. It was rejected
because COMMIT-06 forbids the second list, and a generated copy is still a copy.

**Drop `check:title` and leave the scope to the action alone.** One fewer
check. It was rejected because the action runs in
`repository-pull-request-title.yml`, which no ruleset requires, so an unscoped
title would merge whenever it failed.

**Namespace every fragment instead of flattening them.** TASK-20 allows that
too. It was rejected because `task bundle` and `task site:build` would become
`task build:bundle` and `task build:site:build`, and every caller would change.

## Consequences

- An unscoped pull request title fails `Validate Pull Request / Required`.
- The commit-msg hook needs committed on the path; `mise install` puts it
  there, as it does every pinned tool.
- Contributors using Claude Code need 2.1.277 or later. An older version reads
  no project memory at all now that `.claude/CLAUDE.md` is gone.
- `task check:prose` fails until the prose clears the `MusherSpecifications`
  terms and the remaining warnings. The v2 rewrite clears them.
- A pin upgrade now also moves the MusherProse URL in `.config/markdown/vale.ini`,
  which COPY-02 holds equal to the pin.
