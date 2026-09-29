# ADR 0036: The repository adopts the organization's engineering conventions

- **Status:** Accepted
- **Date:** 2026-09-29
- **Refines:** [ADR 0011](0011-tooling-configuration-layout.md) §3, a second tool that finds its configuration itself
- **Refines:** [ADR 0024](0024-the-repository-root-holds-only-what-must-be-there.md) §1, two more root entries
- **Supersedes:** [ADR 0024](0024-the-repository-root-holds-only-what-must-be-there.md) §3, no root `AGENTS.md`
- **Closes:** [ADR 0011](0011-tooling-configuration-layout.md) follow-up 2

## Context

This repository grew its own governance: a `.config/` layout and its checks
(CFG-01..CFG-09), a review gate over the rulesets (RUL-01..RUL-09), the ADR
checks, and a set of workflows named by habit. Its siblings grew the same rules
separately, and [ADR 0011](0011-tooling-configuration-layout.md) already records
the cost: the `.config/` convention is "shared" with two other repositories by
prose alone, and a change here has to be raised against them by hand.

[`musher-dev/engineering-conventions`](https://github.com/musher-dev/engineering-conventions)
now publishes those rules once, as versioned requirements with permanent IDs,
and releases the checks that find breaches of them. A repository pins a release
and runs `conventions check`, locally and in CI. Its requirements cover what
this repository checks for itself, and more: the GitHub Actions workflows, the
toolchain pins, the git hooks, the agent context, and three declarations under
`.repo/` that say what the repository is and what it publishes.

A dry run of release 0.6.1 against this repository reported 68 findings, every
one a warning. Most are workflow hygiene the CFG and RUL checks never looked at:
runners on `ubuntu-latest`, checkouts that keep their credentials, a job named
`release-please`, exit codes discarded with `|| true`. A few collide with
decisions recorded here. `.repo/` and a root `AGENTS.md` are not in
`ROOT_ENTRIES`, and mise's configuration lives in `.devcontainer/mise.toml`,
which CI does not read. That leaves two copies of every tool pin, held in step
by comment ([ADR 0011](0011-tooling-configuration-layout.md), follow-up 2).

## Decision

### 1. The repository is checked against a pinned conventions release

`.config/mise/config.toml` pins `github:musher-dev/engineering-conventions` to
an exact release, and `task check:conventions` runs `conventions check` against
it. CI runs the same task in the Validate workflow, so a finding is reported
the same way locally and in CI.

The check reports without failing until two things hold: every finding this
repository has not yet fixed is either fixed or waived, and the conventions
release it pins can enforce some families while others only report. From then
on, CI runs it with `--fail-on warning` and lists the families it enforces in
`.repo/conventions.toml`. The list grows one family per pull request until it
covers every family.

Where a convention and a local check govern the same thing, the convention
becomes the authority once its family is enforced here, and the local check
retires in that same pull request:

| Local check | What happens | Why |
|---|---|---|
| CFG-01..CFG-08 | Retired when the conventions' CONF family is enforced | The same `.config/` rules, maintained once |
| RUL-09 | Retired when the GHA family is enforced | The required contexts are checked by the conventions' ruleset requirements |
| actionlint installed from a tarball in CI | Retired with the move to mise (§3) | mise installs and verifies it from the lockfile |
| CFG-09 and `ROOT_ENTRIES` | Kept | Stricter than the conventions' root rule, and specific to this repository |
| RUL-01..RUL-08 | Kept | The review gate of [ADR 0015](0015-selective-code-owner-review.md) is this repository's own |
| ADR-01..ADR-04 | Kept | The conventions do not read `docs/adr/` or this header format |
| Every publication, schema and conformance check | Kept | They check the specifications, which no convention governs |

### 2. `.repo/` holds three declarations

`.repo/` joins `ROOT_ENTRIES`. It holds:

- `repository.toml`: the repository's name, system, component, kind, owner,
  lifecycle, audience and tier. `[layout] product = ""` says there is no
  product directory. What this repository publishes is data under
  `specifications/`, which holds no build manifest, and its release packages
  and ledger paths already name that directory.
- `outputs.toml`: what the repository publishes and where. That is each kind
  family's schema, as a `contract`, and each family's release archive, as a
  `bundle`. Both come from `release.yml`
  ([ADR 0023](0023-published-bytes-are-immutable-release-assets.md) §2). When the
  conventions release defines an output kind for a site, the publication tree
  joins them.
- `conventions.toml`: the families this repository enforces, and its waivers.
  Each waiver names a reason, a public tracking issue and an expiry date.

The conventions' tools read these files at fixed paths. There is no flag that
could point elsewhere, which is the test [ADR 0024](0024-the-repository-root-holds-only-what-must-be-there.md)
§1 sets for a root entry.

### 3. mise reads `.config/mise/config.toml`, and CI reads it too

Every CLI this repository runs is pinned once, in `.config/mise/config.toml`,
with a committed `mise.lock` beside it. That covers Bun, Node, Task,
actionlint, lefthook and the conventions release. The dev container installs
from it, and so does every workflow job that checks out `main` or a pull
request, through `jdx/mise-action`. `.devcontainer/mise.toml`, the
`MISE_GLOBAL_CONFIG_FILE` that pointed at it, and the Bun and Task dev container
Features are removed. `tools/.bun-version` stays, and says what mise pins.

`release.yml` is the exception. Its artifacts job builds a tag's own tree, and
a tag cut before this decision has no `.config/mise/`. That job keeps its own
install of Bun, from `tools/.bun-version`, and of Task, whose version it
repeats.

mise discovers `.config/mise/config.toml` itself, as lefthook discovers
`.config/lefthook.yml`. That makes it the second exception to
[ADR 0011](0011-tooling-configuration-layout.md) §3. It is taken for the same
reason as lefthook: mise has no flag every caller could pass, and an
environment variable that points at the file is what left CI reading nothing.
`AUTO_DISCOVERED` in `tools/src/policy/config.ts` names it, so CFG-04 still
holds every other file to an explicit caller.

This closes [ADR 0011](0011-tooling-configuration-layout.md) follow-up 2. The
workflows install what the config pins, rather than repeating each version.
The one version still repeated, Task's in `release.yml`, is repeated for a
reason the file states.

### 4. A root `AGENTS.md` points coding agents at `.claude/CLAUDE.md`

[ADR 0024](0024-the-repository-root-holds-only-what-must-be-there.md) §3 ruled
out a root `AGENTS.md`, because a router file for an opt-in tool would put back
a root entry. The conventions require one wherever a repository has agent
context. Tools other than Claude Code look for `AGENTS.md` only at the root, so
it passes the root-entry test. It holds a pointer to `.claude/CLAUDE.md` and
restates none of it. The rest of §3 stands: the brief stays at
`.claude/CLAUDE.md`, and local agent state stays gitignored.

### 5. Workflows are named by what they are responsible for

The conventions name a workflow for its responsibility. Checks that gate a pull
request go in `validate.yml`, and checks of the pull request itself in
`validate-pull-request.yml`, each with one `Required` job. The ruleset then
requires those two contexts instead of the four job names it lists today.
`ci.yml` and `dco.yml` are replaced in three steps:

1. The new workflows run beside the old ones.
2. The ruleset switches to the new contexts.
3. The old workflows are deleted.

That way no pull request is left waiting on a context nothing reports.

## Alternatives considered

**Keep the local checks and do not adopt.** This costs nothing now. It was
rejected because the siblings are adopting, and a rule this repository holds
alone drifts from theirs, as [ADR 0011](0011-tooling-configuration-layout.md)
already records.

**Adopt only the families that match a local check.** This would be a smaller
change. It was rejected because the families this repository has no check for,
such as workflows, hooks and toolchain, are where the dry run found most of its
findings.

**Keep mise's configuration in `.devcontainer/` and point every caller at it.**
This keeps §3's rule without exception. It was rejected because CI would still
need the variable in every job, and a job that forgets it installs nothing and
passes. That is the silent failure the rule exists to prevent.

**`product = "specifications"`.** It would name the data as the product. It was
rejected because the conventions expect a product directory to hold a build
manifest, and this data has none.

## Consequences

- One version per tool: bumping a pin is one edit and `mise lock`.
- CI installs tools from a lockfile with recorded checksums, instead of three
  setup actions and a tarball.
- The conventions release is a dependency. Each upgrade may report new findings,
  and the pin moves only through a pull request that deals with them.
- Two more root entries, each with the reason it cannot live elsewhere.
- While families are adopted one at a time, `conventions check` reports findings
  CI does not fail on. `.repo/conventions.toml` says which those are and when the
  staged adoption ends.

## Follow-ups

1. **Enforce the remaining families.** Add one family per pull request to the
   enforced list in `.repo/conventions.toml`, retiring the local check it
   replaces, until every family is enforced.
2. **Switch the required contexts.** Change the ruleset's required contexts to
   the Validate aggregates (§5), then delete `ci.yml` and `dco.yml`.
