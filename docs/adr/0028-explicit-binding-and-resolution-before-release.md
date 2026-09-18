# ADR 0028: Explicit binding and resolution before release

- **Status:** Accepted
- **Date:** 2026-09-17
- **Supersedes:** [ADR 0013](0013-value-shape-vocabulary.md)
- **Supersedes:** [ADR 0020](0020-multi-value-value-shape.md)
- **Supersedes:** [ADR 0026](0026-a-component-declares-requirements.md) §4, §5, §6
- **Supersedes:** [ADR 0027](0027-a-reference-names-a-fact-the-document-cannot-contain.md) §6, §7
- **Refines:** [ADR 0005](0005-platform-divergence-reconciliation.md) §2, §5
- **Supersedes:** [ADR 0009](0009-resource-type-registry.md)
- **Refines:** [ADR 0008](0008-effective-values.md)
- **Refines:** [ADR 0022](0022-the-musher-document-core-specification.md)
- **Extends:** [ADR 0002](0002-conformance-case-trees.md)

## Context

No family has a published release. The pre-release review found implicit input
sharing, unchecked values, incomplete validation presented as success, and
resolution rules whose meaning depended on unrelated declarations. The approved
foundation reset intentionally breaks the draft syntax before its first release.

## Decision

### 1. Ownership and bindings

Components own contracts, workload input targets, endpoint capabilities, mount
paths and storage minima. Blueprint nodes own bindings, compute, actual storage
allocation and public exposure. Every bound input names exactly one source:
parameter, output, literal or authorized configuration reference.
CONFIG_REF.source uses a whole core reference such as `${{ config.llm.baseUrl }}`
to organization configuration authorized at installation. resourceType is removed
at value and external-node scope; it is not a supplier and no registry type
selects a configuration value. Names never
implicitly bind. Parameters need not be form fields; presentation is optional.
An absent binding uses the input default, then optional absence, otherwise fails.
Failure of an explicit binding never selects a fallback.

### 2. Values and sensitivity

Values are logical JSON values validated against a bounded 2020-12 profile.
Defaults, sensitivity and presentation hints belong beside the
schema, not inside it. Validation never coerces values. Environment encoding is
specified separately. Secret plaintext is forbidden in published artifacts;
sensitivity propagates and cannot be downgraded. Generated credentials persist
per installation, parameter and rotation generation, including across retries.

### 3. Resolution

All v1 values resolve before workload startup. Outputs explicitly name literals,
inputs, endpoint properties or single-pass endpoint templates. Endpoints are
always named. Component owns address semantics and core owns reference syntax.
Discovery cycles are permitted; value-dependency cycles are rejected. Runtime
job outputs and startup dependency declarations are unsupported.

### 4. Evidence and compatibility

Validation reports VALID, INVALID or INCOMPLETE for a claimed profile, with
deferred obligations. Acquisition is separate from offline semantic evaluation.
Publication and deployment complete their respective obligations before admission.
A generated, versioned resolution record pins dependencies without secret values.
Redeploy reuses it; update is explicit.

Compatibility preserves acceptance and defined outcomes under pinned context,
regardless of validation phase. Historical replay reconstructs case context and
effective outcomes. Conformance includes normalization, resolution, rendering and
lifecycle observations; implementation obligations may carry requirement IDs.

## Consequences

The family layout and data-only publication model remain. Old draft spellings
are rejected, not accepted through a second binding mechanism. Listings retain
itemType for standalone exchange and use full relative paths for media identity.
Schemas, prose, examples and fixtures change together. Downstream implementations
must migrate and run adapters before claiming the new behavioural profiles.
