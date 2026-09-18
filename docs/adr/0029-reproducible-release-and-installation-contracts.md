# ADR 0029: Reproducible release and installation contracts

- **Status:** Accepted
- **Date:** 2026-09-18
- **Refines:** [ADR 0028](0028-explicit-binding-and-resolution-before-release.md)
- **Refines:** [ADR 0023](0023-published-bytes-are-immutable-release-assets.md)
- **Extends:** [ADR 0017](0017-generated-field-reference.md)

## Context

The first release review found incomplete dependency pins, independently supplied
endpoint views, and records that could not distinguish installation parameters.
No family has been released. The maintainer approved this focused hardening plan
before implementation; the architecture and family layout remain unchanged.

## Decision

### 1. Publication dependencies

Normative dependency tables are the only declaration of family dependencies.
Every release pins exact compatible editions and verifies their complete
transitive closure, rejecting conflicting editions. Archives include the pinned
dependency artifacts; generated reference links follow those same pins. Later
publications cannot change the interpretation of an earlier release.

### 2. Installation identity

A resolution record references an immutable, versioned private installation
snapshot covering submitted values, acquired selections, credential references,
and allocation identities. It contains neither secret values nor their hashes.
Record verification reconciles the blueprint and referenced component artifacts
with the record. A changed effective selection requires a new snapshot and record.
This promises reproducible configuration, not deterministic external services.

### 3. Endpoint facts and diagnostics

Component ports and acquired routing allocations are authoritative. Address and
URL properties are derived views, not independent configuration sources.
Diagnostics point into actual authored documents, with related artifact locations
for cross-document failures. Conditions declare permitted phases; observations
report the actual phase and stage. Validation profiles are distinguished from
implementation and behavioural conformance profiles. Value resolution does not
establish current deployment authorization, quota, or placement eligibility.

## Consequences

The unreleased record and context interfaces change together with their fixtures.
Historical published artifacts remain immutable. Dependency publication remains
ordered: core, component and listing, then blueprint. Private persistence formats
and production admission services remain downstream responsibilities.
