# ADR 0051: A component states the compute it needs

- **Status:** Proposed
- **Date:** 2026-11-13
- **Relies on:** [ADR 0033](0033-inputs-are-the-only-way-into-a-component.md) §1, inputs are the only way in
- **Relies on:** [ADR 0003](0003-controlled-vocabulary-placement.md) §1, offerings are the platform's
- **Closes:** [platform-api#1450](https://github.com/musher-dev/platform-api/issues/1450)

## Context

Compute is a blueprint node's: `compute.profile` names a slug from the
platform's catalog ([blueprint §4.3](../../specifications/blueprint/v2/spec.md#node-compute)).
A component has nowhere to say what it needs
([platform-api#1450](https://github.com/musher-dev/platform-api/issues/1450)).
llama-cpp, docling-serve and crawl4ai validate on a 1 GiB profile and are
killed for memory at run time, and their sizing advice lives in listing prose
the deploy form cannot read. CPU engines also size thread pools from the
host's cores, or from constants, because nothing tells them the vCPUs they
have.

## Decision

### 1. `workload.compute` states figures, not profiles

```yaml
compute:
  minimum: { vcpus: 2, memoryMiB: 4096 }
  recommended: { vcpus: 4, memoryMiB: 8192 }
```

`COMP-COMPUTE-001`, structural: `compute` is optional and closed; `minimum`
and `recommended` are each optional, and each requires `vcpus`, a number
greater than 0 and at most 256, and `memoryMiB`, an integer from 64 to
4194304.

A component states resources, never a profile slug. A slug names an offering
of one platform's catalog, which changes on the platform's schedule
([ADR 0003](0003-controlled-vocabulary-placement.md) §1); a component is
published once and deployed by many items. The deploy form pre-selects the
smallest profile that meets `recommended`, and a validator can judge any
profile against `minimum`.

`COMP-COMPUTE-002`, semantic: `recommended` is at or above `minimum` in both
figures. A new code, `ERR_INVALID_COMPUTE`, at the figure that is below.

### 2. Blueprint decides a node against the minimum

`COMP-COMPUTE-003`: a node MUST NOT run the workload on a profile with fewer
vCPUs or less memory than `minimum`. It is decided by blueprint, at
admission, against the compute catalog, as `COMP-EP-003` is decided by
blueprint against exposure. Blueprint's admission context gains each
profile's figures, and the rule its code; both are blueprint's to write. Until
they are, the requirement is recorded in `UNPINNED`.

### 3. The compute fact enters through an input

A workload reads its vCPUs through an input, like every other value
([ADR 0033](0033-inputs-are-the-only-way-into-a-component.md) §1): an integer
input targeting `LLAMA_ARG_THREADS`, bound by the blueprint from a new
deployment fact of the node's compute. The component needs nothing new for
this; the fact path is blueprint's, beside `deployment.creator.*`. The
runtime injects no variable for it
([ADR 0048](0048-a-workload-environment-is-the-image-environment-overlaid-by-inputs.md)).

## Alternatives considered

**`recommendedProfile`, a slug.** Ties a reusable component to one catalog's
names.

**`self.compute.vcpus` in a component template.** Component templates exist
only in outputs, so it cannot reach the environment; and an input `default`
is a literal.

**Inject `MUSHER_VCPUS`.** A second way in, which ADR 0033 removed.

## Consequences

The memory-optimised and GPU profile ranges #1450 asks about are catalog
decisions, outside this repository. Blueprint owes the minimum check and the
compute fact.
