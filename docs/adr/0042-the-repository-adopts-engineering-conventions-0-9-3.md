# ADR 0042: The repository adopts engineering-conventions 0.9.3

- **Status:** Accepted
- **Date:** 2026-10-31
- **Refines:** [ADR 0041](0041-the-repository-adopts-engineering-conventions-0-9-1.md) §4, nine fragments, not six
- **Refines:** [ADR 0041](0041-the-repository-adopts-engineering-conventions-0-9-1.md) §7, Vale moves to `prose/`
- **Relies on:** [ADR 0011](0011-tooling-configuration-layout.md) §2, a configuration is bucketed by its concern
- **Relies on:** [ADR 0015](0015-selective-code-owner-review.md) §3, CODEOWNERS already has no catch-all
- **Relies on:** [ADR 0037](0037-the-repository-adopts-engineering-conventions-0-7-0.md) §5, fix or waive each finding

## Context

[ADR 0041](0041-the-repository-adopts-engineering-conventions-0-9-1.md) pinned
engineering-conventions 0.9.1. Two releases have shipped since, both on
2026-10-24. 0.9.2 keys each `.config/` concern on the files its tool reads, sets
a strictness floor for tool configuration, adds a tool-wrapper layer for
Taskfiles, and forbids a CODEOWNERS catch-all and dead CODEOWNERS paths. 0.9.3
makes the catch-all rule, COMM-09, impossible to waive, adds COMM-11, which asks
GitHub whether the CODEOWNERS owners resolve, and registers `terraform` as a
concern. Checked against either release, the repository reports nine findings
in two requirements
([#206](https://github.com/musher-dev/specifications/issues/206)):

| Requirement | Finding |
|---|---|
| CONF-15 | `.config/markdown/vale.ini` is Vale configuration, which belongs in the `prose` concern |
| TASK-27 | `taskfiles/build.Taskfile.yml` holds eight tasks not named under its area: `bundle`, `catalog`, `changes`, `docs`, `site:fetch`, `site:build`, `site:deploy` and `site:verify-live` |

Two of 0.9.2's requirements are checked by review, so no run of
`conventions check` reports them. CONF-22 asks that a tool's warnings fail the
gate that runs it, and `check:format` ran `biome ci`, which printed 124 warnings
and exited zero. CONF-23 asks that every departure from a tool's preset carry
its reason beside it.

ADR 0037 §5 requires the upgrade that brings a finding to fix or waive it. This
decision fixes all of them and waives none. The REPO-08 waiver stays as
ADR 0041 §8 left it.

## Decision

### 1. The pin moves to 0.9.3

`.config/mise/config.toml` pins `github:musher-dev/engineering-conventions`
at `0.9.3`, and `mise.lock` records its archive for each of the four platforms
it lists. The MusherProse URL in `.config/prose/vale.ini` names the same
release (COPY-02). mise's `min_version` does not change.

The pin passes over 0.9.2, the release #206 was written for. 0.9.3 reports the
same nine findings, and what it adds is either met already (§6) or does not
apply: this repository has no `.config/terraform/`.

### 2. Vale's configuration moves to the prose concern

CONF-15 puts a known tool's configuration in that tool's concern, and Vale's is
`prose`: Vale judges prose, whatever file holds it. `.config/markdown/vale.ini`
moves to `.config/prose/vale.ini`, and the style `task docs` generates moves
with it, to `.config/prose/styles/MusherSpecifications/`. `StylesPath = styles`
is relative to the configuration, so the line does not change and the styles
stay beside the file that applies them. `vale sync` installs the packages into
the new directory, and `.gitignore` ignores everything there but the generated
style, as it did under `markdown/`.

Every caller names the new path: `task check:prose`, `VALE_STYLE_DIR` in
`tools/src/lib/layout.ts`, the markdownlint exclusions in `task check:md` and
`task fmt:md`, the cspell exclusion, `.config/README.md` and the comments in
`.config/mise/config.toml`. `markdown/` keeps `markdownlint.jsonc`, the one
configuration left in its concern. The rest of ADR 0041 §7 stands: the same
styles, scope, exclusions and task.

### 3. Each task sits in the fragment its name gives

A flattened fragment's tasks show in `task --list` with nothing to say which
file holds them, so TASK-27 asks that each be named under its fragment's area.
`build.Taskfile.yml` held everything that regenerates a generated artifact,
each task named for what it makes. It splits into four fragments, each included
with `flatten: true` beside the other five (TASK-20):

| Fragment | Tasks |
|---|---|
| `taskfiles/bundle.Taskfile.yml` | `bundle` |
| `taskfiles/changes.Taskfile.yml` | `changes` |
| `taskfiles/docs.Taskfile.yml` | `docs` |
| `taskfiles/site.Taskfile.yml` | `site:fetch`, `site:build`, `site:deploy`, `site:verify-live` |

Every task moves unchanged, so each name the workflows, the dev container,
CONTRIBUTING and the docs call still works, and `task --list` loses only
`catalog`. Each fragment opens with a comment naming its area (TASK-22) and
declares no top-level variables (TASK-21): `TOOLS_DIR` and `SITE` stay in the
root `Taskfile.yml`.

`catalog` is deleted, not moved. It wrote `dist/catalog.json`, which
`task bundle` already writes beside the bundles, and nothing called it:
`task site:build` builds the catalog it serves in memory.
`tools/src/publication/catalog.ts` keeps `buildCatalog`, which the bundler and
the site assembler import, and loses its own entry point, along with the
`catalog` script in `tools/package.json`.

### 4. A tool's warnings fail the gate that runs it

`check:format` runs `biome ci --error-on-warnings` (CONF-22). The same change
clears the 124 warnings, so the gate starts green and the next warning fails
it. A rule that should not fail the gate is turned off or suppressed, with its
reason beside it (§5), not left to warn.

### 5. A departure from Biome's preset carries its reason in the source

`tools/biome.json` keeps Biome's recommended rules (CONF-20). One of them,
`noTemplateCurlyInString`, reports a `${` inside a plain string, the mark of a
template literal written with the wrong quotes. The tooling writes the
documents' `${{ }}` placeholder grammar in plain strings on purpose, almost all
of it in test data. CONF-23 wants the reason for that departure beside it, and
the configuration cannot hold one: Biome refuses a comment in `biome.json`. So
the rule stays on, and each string that means the placeholder carries a
`biome-ignore lint/suspicious/noTemplateCurlyInString` comment that gives the
reason. The suppression is as narrow as the departure, and a template literal
written with the wrong quotes anywhere else is still reported.

### 6. The CODEOWNERS requirements are already met

- **COMM-09.** CODEOWNERS owns `/.github/CODEOWNERS` and `/.github/rulesets/`,
  and has no catch-all. `task check:rulesets` already refuses a `*` line
  (RUL-05, ADR 0015 §3).
- **COMM-11.** `conventions check` never reaches the network, so COMM-11 is a
  command of its own, `conventions codeowners`, which asks GitHub's CODEOWNERS
  errors API through `gh` and needs it signed in or given `GH_TOKEN`. Neither
  `task check:conventions` nor the `Conventions / Check` job, which passes no
  token, runs it, so the pin changes nothing CI needs. Run by hand against
  `main` at 7111499, it reports no errors. Running it in validation, against
  each pull request's head, is left to a change of its own.

## Alternatives considered

**Rename the eight tasks under `build:`.** TASK-27 allows it, and no file
splits. It was rejected because `task bundle` would become `task build:bundle`
and `task site:build` would become `task build:site:build`, so three workflows,
the dev container, CONTRIBUTING and the docs would all change. ADR 0041 §4
kept these names for the same reason.

**Keep Vale under `markdown/` with a waiver.** Nothing moves. It was rejected
because a waiver needs a tracking issue and an expiry, and records that the
configuration sits in the wrong concern instead of moving it to the right one.
The move costs one path in each caller.

**Move `vale.ini` and leave its style under `markdown/styles/`.** The generated
style stays put. It was rejected because `StylesPath` would have to reach back
into the markdown concern, and `vale sync` would keep installing Vale's
packages there.

**Rename `biome.json` to `biome.jsonc` and turn `noTemplateCurlyInString` off
there, with its reason.** Biome reads comments in a `.jsonc` configuration. It
was rejected because the rule would then be off in every file, and the mistake
it catches would pass everywhere to spare the strings that mean the
placeholder.

**Stay on 0.9.1.** Nothing changes now. It was rejected because the nine
findings arrive with any later upgrade, and fixing them then costs what it
costs now.

**Pin 0.9.2, the release #206 names.** The issue's plan is followed as written.
It was rejected because 0.9.3 reports the same findings and adds only what the
repository already meets, so stopping at 0.9.2 buys a second upgrade and saves
no work.

## Consequences

- `vale --config .config/prose/vale.ini` is the command, locally and in
  `task check:prose`. A checkout that ran `vale sync` before this change keeps
  the old packages under `.config/markdown/styles/`, no longer ignored: delete
  that directory.
- `task catalog` is gone. `task bundle` writes `dist/catalog.json`.
- A new task goes in the fragment its name gives, or in a new fragment for its
  area. `task check:conventions` fails it anywhere else.
- A Biome warning fails `task check:format`, the pre-commit hook and the
  `Tools / Lint` job. A Biome upgrade that adds a rule to the recommended set
  fixes what it reports, or turns the rule off with its reason, before it
  merges.
- A pin upgrade moves the MusherProse URL in `.config/prose/vale.ini`, which
  COPY-02 holds equal to the pin.
