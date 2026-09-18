## What changes

<!-- One paragraph. What does this alter about the contract? -->

## Why

<!-- Link the issue or ADR. Structural changes need an accepted ADR first. -->

## Compatibility

<!-- Delete the lines that do not apply. -->

- [ ] No schema change (docs, tooling, or CI only)
- [ ] **Additive** — new optional field. A document valid before is still valid.
- [ ] **Correction** — does not change what validates.
- [ ] **Breaking** — a previously valid document now fails.

A breaking change requires maintainer approval (an obligation, not a gate), a
new `v<N>` directory, and a migration note after the family's first release.
Before that release, drafts may be corrected in place under the
[governance exception](../docs/governance.md#compatibility-review). Preserve
acceptance and defined meaning within a released major version.

## Checklist

- [ ] `task check` passes locally
- [ ] Schemas edited under `schemas/src/` only — bundles are build output and are never committed
- [ ] Conformance fixtures added for every behavioural change, each citing a `clause`
- [ ] Normative prose updated in the affected `spec.md` — schema `description`s are explanatory, not normative
- [ ] Commit messages are Conventional and scoped to the area they touch (release-please picks the release from the paths a commit changes, not its scope)
- [ ] Commits are DCO signed off (`git commit -s`)
