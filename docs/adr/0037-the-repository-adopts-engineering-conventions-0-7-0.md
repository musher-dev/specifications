# ADR 0037: The repository adopts engineering-conventions 0.7.0 and enforces every family

- **Status:** Accepted
- **Date:** 2026-09-30
- **Refines:** [ADR 0023](0023-published-bytes-are-immutable-release-assets.md) §2, the release rules
- **Refines:** [ADR 0023](0023-published-bytes-are-immutable-release-assets.md) §6, the records an archive carries
- **Refines:** [ADR 0036](0036-the-repository-adopts-the-engineering-conventions.md) §1, every family enforced at once
- **Refines:** [ADR 0036](0036-the-repository-adopts-the-engineering-conventions.md) §2, interfaces and the site
- **Closes:** [ADR 0036](0036-the-repository-adopts-the-engineering-conventions.md) follow-up 1

## Context

[ADR 0036](0036-the-repository-adopts-the-engineering-conventions.md) pinned
engineering-conventions 0.6.1 and ran `conventions check` report-only. Four
releases have shipped since. Checked against 0.7.0, the repository reports nine
findings:

| Requirement | Finding |
|---|---|
| OUT-03 | The three schemas are declared as `contract` outputs, a kind 0.7.0 retires ([decision 0022](https://github.com/musher-dev/engineering-conventions/blob/v0.7.0/docs/decisions/0022-interfaces-and-dependencies.md)) |
| ADOPT-06 | The REPO-04 waiver suppresses nothing, because 0.6.2 leaves a malformed name to REPO-08 |
| REL-06 | Release pull requests are titled `chore(repo): release…`, and `release` is not a commit scope |
| REL-13 | The tag ruleset does not block tag creation, and no App may bypass it |
| REL-18 | Release assets are attested one by one, with no `SHA256SUMS` |
| REL-19 | The draft release is published with `GITHUB_TOKEN`, so its `published` event starts no workflow |

ADR 0036 §1 made CI fail on findings once two things held: every finding fixed
or waived, and a conventions release able to enforce some families while
others report. 0.6.2 added the second. This decision fixes the first.

[Issue #163](https://github.com/musher-dev/specifications/issues/163) asks for
0.7.0's interface model. Each schema becomes an interface, and each family
bundle carries the conventions' release record, so a repository that vendors a
release can verify its copy offline. The record has to be `release.json` at the
bundle's root, and its schema allows no other field. Every archive already
carries a `release.json` in this repository's own shape (ADR 0023 §6), with the
dependency closure the conventions' record cannot hold.

## Decision

### 1. Each kind family's schema is an interface its bundle delivers

`.repo/outputs.toml` moves to `schema_version = 2`. The `contract` outputs go.
Three `[[interfaces]]` take their place, one per kind family:

- `<family>-schema`, `format = "json-schema"`, `audience = "public"`;
- `definitions` is the family's `schemas/src/` directory;
- `delivered_by` is the family's bundle output, `<family>-release`;
- `compatibility = "gated"`.

`gated`, not `versioned`, because a break inside a major fails `check:compat`
and needs a new `specifications/<family>/v<N>/` directory, which is a new
major. `versioned` would also need the major in each file's name (IFACE-07).
Here it is in the directory, and the `$id` URLs depend on those names.

The site joins the outputs as `kind = "site"`, published by `deploy.yml` at
`https://specifications.musher.dev`, as ADR 0036 §2 said it would once the
conventions defined the kind. IFACE-08, the contracts directory, does not apply
to a `specification` repository, so nothing moves.

### 2. The `contracts` tasks name the checks that already exist

`taskfiles/contracts.Taskfile.yml` defines the three tasks the conventions ask
of every producer (IFACE-11). Each runs checks the repository already has:

| Task | Runs |
|---|---|
| `contracts:check` | `check:schema`, `check:generated`, `check:examples` |
| `contracts:breaking` | `check:compat` |
| `contracts:bundle` | `release:stage` |

There is no `contracts:generate`, because no schema is generated. The
Specifications / Schema job runs `task contracts:check contracts:breaking
ci:test`, and `ci:test` drops the four checks the first two cover (IFACE-12).
`release.yml` stages through `contracts:bundle` (IFACE-13). A tag cut before
this decision has no `contracts:bundle`, so a recovery of one falls back to
`release:stage`.

### 3. An archive carries two records

A kind family archive carries the conventions' release record as
`release.json`. It lists the repository, the output, the version, tag and
commit, and the family's interface, with the bundle's SHA-256. This
repository's own record, unchanged in content, becomes `specification.json`.
Core delivers no interface, and the conventions' schema requires at least one,
so a core archive carries `specification.json` alone.

`release:stage` reads `.repo/repository.toml` and `.repo/outputs.toml` at the
tag to write the record, as it reads every other byte of a release. Archives
already published keep their bytes, and their `release.json` keeps its old
meaning. `release.yml` reads `specification.json`, and `release.json` for a tag
cut before this decision.

### 4. Releases follow the conventions' release rules

- **REL-06.** release-please titles release pull requests
  `chore(release): release${component} ${version}`, and `release` joins the
  commit scopes in every copy `check:commits` holds in step.
- **REL-13.** The tag ruleset blocks creation too, and the `musher-release`
  App is its one bypass actor. release-please cuts every tag as that App, so no
  person can push a release tag, and ADR 0006's ledger check stays the
  backstop. The bypass also lets the App move or delete a tag, which the release
  workflow never does. A role or a person could do the same with no workflow
  run to show for it, which is why only the App may bypass.
- **REL-18.** The artifacts job writes `SHA256SUMS` over the staged assets,
  attests every file it lists with one `actions/attest` step, and uploads it
  with them. A release published before this decision has no `SHA256SUMS`, and
  is re-verified on its other assets.
- **REL-19.** The draft is published with a release App token minted for that
  step alone, with `contents: write`.

### 5. Every family is enforced

`task check:conventions` runs `conventions check --fail-on warning`, locally
and in CI, and `.repo/conventions.toml` has no `[adoption]` table. Without one,
every family is enforced, including any a later release adds. The upgrade that
brings a new family fixes or waives what it reports, as ADR 0036's
consequences already require of every upgrade.

ADR 0036 §1 grew the enforced list one family per pull request. This decision
enforces them all at once, because 0.7.0 reports nothing once §1 to §4 land.
The local checks the conventions replace retire here, as §1 planned:

| Local check | Replaced by |
|---|---|
| CFG-01..CFG-08 | CONF-01..CONF-09 |
| RUL-09 | GHA-15, and the rule that a workflow emitting a required check has no `paths:` filter |

CFG-09, RUL-01..RUL-08 and the ADR checks stay, for the reasons ADR 0036 §1
gives.

## Alternatives considered

**Deliver the interfaces by the site, with no release record.** This leaves
the archives alone. It was rejected because consumers would keep their own
lock files, and the vendoring check the conventions define could not run
against a release of this repository.

**Keep this repository's `release.json` and add the conventions' record under
another name.** No archive changes shape. It was rejected because the
conventions fix the name, so a consumer's vendoring check would never find the
record.

**Enforce one family per pull request, as ADR 0036 §1 planned.** Each step
would be smaller. It was rejected because once every finding is fixed, a
staged list only delays failures that would all pass today, and it needs an
expiring `[adoption]` table and a tracking issue to hold it.

## Consequences

- A kind family archive changes shape: `release.json` is now the conventions'
  record, and a reader of the dependency closure reads `specification.json`
  from the first release after this decision. Published archives do not change.
- Every release carries one more asset, `SHA256SUMS`.
- The tag ruleset must be reapplied before the next release. Until the live
  ruleset has the App as its bypass actor, a creation rule applied without it
  would stop release-please from tagging.
- Any finding from a conventions upgrade fails CI, so the pin moves only with
  the fixes or waivers its findings need.
- CFG-01..CFG-08 and RUL-09 are retired. Their IDs are not reused.
