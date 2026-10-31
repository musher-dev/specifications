# Musher Document Specifications

@README.md

This file is the brief for every coding agent: Claude Code (2.1.277 or later,
which reads `AGENTS.md` as its project memory), Codex, Gemini and Copilot alike.
No `CLAUDE.md` is committed, because Claude Code ignores every `AGENTS.md` while
one exists (AGENT-16, [ADR 0041](docs/adr/0041-the-repository-adopts-engineering-conventions-0-9-1.md)).
`.claude/` holds only Claude Code's settings and rules, and none are committed.
A line starting with `@` imports the file it names; an agent that does not
expand imports opens it.

This repository is the normative source of truth for the documents Musher users
author: the prose, schemas, examples and conformance corpora that define them.
The CLI, the platform API and every SDK implement what is defined here.

## Non-negotiables

1. **Edit sources, never build output.** Schemas are authored in
   `specifications/<family>/v<N>/schemas/src/`. Bundles, `catalog.json` and
   `dist/` are build output, and `task check:generated` fails if any of them is
   tracked. `site/` is build output too, but only `.gitignore` keeps it out of
   git; no check covers it.
   `docs/traceability.md`, the ADR index, `docs/terminology.md` and the Vale
   styles generated with it (`Terms.yml` and `Discouraged.yml` under
   `.config/prose/styles/MusherSpecifications/`) are generated but
   committed: run `task docs`, and `task check:docs` fails when any is stale.
2. **No remote `$ref`.** Every bundle resolves every reference inside its own
   `$defs`. `task check:schema` rejects a remote one.
3. **No behavioural change without conformance cases** in the same family
   version's `conformance/`. A rule a document can violate carries a requirement
   ID, and `task check:conformance` fails on any declared ID or diagnostic code
   that no case pins and no runner exclusion explains.
4. **Shared rules live in core.** A family cites `CORE-*` requirements and core
   clauses. It never restates an envelope, YAML-profile, validation-phase or
   shared-diagnostic rule. What core is:
   [How the families relate](specifications/README.md#how-the-families-relate).
   See [ADR 0022](docs/adr/0022-the-musher-document-core-specification.md).
5. **Validation never becomes stricter inside a major version.** A breaking
   change needs a new `v<N>` directory, *except* inside ADR 0005 §1's
   pre-publication window. That window drops the directory and the migration
   note, but not maintainer approval or the breaking-change declaration.
   `git tag -l '<family>/*'` decides which case applies, and `task check:compat`
   guards every released version that has a directory on `main`. v1 of every
   family is a retired major: tagged and recorded, with no directory on `main`,
   and it takes no further release
   ([ADR 0038 §17](docs/adr/0038-v2-one-vocabulary-and-v1-retires.md)).
6. **Released bytes never change.** `published.json`, the
   [ledger](docs/publication.md#the-ledger) (version 2), is append-only. The
   release pull request writes it through `task release:record`. That nobody
   edits it by hand is a convention, not a check, but `task check:published`
   fails a pending entry that differs from a fresh derivation, and
   `task check:ledger` rejects any edit to an entry the base branch holds.
   Release tags are never moved or deleted
   (`.github/rulesets/release-tags.json`). Pinned URLs serve verified immutable
   release assets, never `main` (`task check:published`, `task site:fetch`).
   See [ADR 0006](docs/adr/0006-publication-from-tags.md) and
   [ADR 0023](docs/adr/0023-published-bytes-are-immutable-release-assets.md).
7. **Data artifacts only.** No executables and no generated language bindings.
   See [Governance → Binary policy](docs/governance.md#binary-policy).
8. **Paths come from `tools/src/lib/layout.ts`.** No other tool spells a
   repository path, and a guard test in `tools/src/lib/layout.test.ts` fails if
   one does. A tool reading a released ref fails, rather than returning nothing,
   when a path the layout names is absent. See
   [ADR 0021 §3](docs/adr/0021-repository-organized-around-the-family-version.md).
9. **Tool configuration lives in `.config/<concern>/`, passed by path.** Never
   add a config to the repo root when the tool accepts a config flag, and never
   rely on default discovery. `task check:conventions` enforces this
   (CONF-01..CONF-09), and `task check:config` (CFG-09) holds the repository
   root to `ROOT_ENTRIES` in `tools/src/lib/layout.ts`. See
   [ADR 0011](docs/adr/0011-tooling-configuration-layout.md),
   [ADR 0024](docs/adr/0024-the-repository-root-holds-only-what-must-be-there.md)
   and
   [ADR 0037](docs/adr/0037-the-repository-adopts-engineering-conventions-0-7-0.md).
10. **Review is a code-owner gate, not a blanket approval.** A pull request
    touching no path in `.github/CODEOWNERS` merges on green CI. The two halves
    are `required_approving_review_count: 0` plus
    `require_code_owner_review: true`, and a CODEOWNERS with no `*` catch-all.
    Each is useless without the other and both break silently, so never change
    one without the other. `task check:rulesets` enforces this (RUL-01..RUL-08).
    See [ADR 0015](docs/adr/0015-selective-code-owner-review.md).
11. **Structural changes need an accepted ADR first.** An accepted ADR changes
    only by link-target maintenance: a relative link whose target moved may be
    retargeted, and nothing else may change. `task check:adr` blanks only
    relative link targets and compares absolute URLs verbatim, so it fails any
    other diff. Whether the target really moved is a review obligation, not a
    check. See
    [ADR 0021 §4](docs/adr/0021-repository-organized-around-the-family-version.md).
12. **release-please assigns commits by path, not by scope.** A `feat`, `fix` or
    `docs` commit under `specifications/<family>/v<N>/` enters that family's
    next release, whatever its scope says. Use `refactor`, `chore`, `test`,
    `ci` or `build` for a change there that should release nothing. `main`
    squash-merges under the pull request title, so a pull request carrying more
    than one type of change lists them in a `BEGIN_COMMIT_OVERRIDE` block, with
    one exception for `specifications/core/`:
    [CONTRIBUTING → Squash merges and overrides](.github/CONTRIBUTING.md#squash-merges-and-overrides).

`spec.md` states the definitive rule. Schema `description` text, examples and
the generated `/reference/` pages are informative; see
[What is normative](specifications/README.md#what-is-normative).

## Where things are

- [Anatomy of a family version](specifications/README.md#anatomy): what
  `specifications/<family>/v<N>/` holds
- [Repository conventions](docs/conventions.md): naming for directories,
  modules, `$id`s and case IDs. Field and value naming is
  [ADR 0007](docs/adr/0007-naming-conventions.md)
- [Contributing](.github/CONTRIBUTING.md): making a change, commit types, sign-off
- [Tools](tools/README.md): what each `task check` step enforces
- [Publication](docs/publication.md): releases, the ledger, the core gate and
  cache policy
- [Fixture format](docs/conformance.md), shared by every corpus
- [Governance](docs/governance.md): compatibility, release and binary policy
- [Decision records](docs/adr/README.md)

## Commits

Conventional Commits, DCO-signed:

```sh
git commit -s -m "feat(component): add restartPolicy"
```

Types, scopes, and how a commit reaches a release are covered in
[CONTRIBUTING → Commit messages](.github/CONTRIBUTING.md#commit-messages).
