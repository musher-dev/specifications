# ADR 0026: A component declares what it needs, and the blueprint decides how it is supplied

- **Status:** Accepted
- **Date:** 2026-09-17
- **Supersedes:** [ADR 0018](0018-install-form-presentation.md) §1, §6
- **Supersedes:** [ADR 0019](0019-external-component-node.md) §4
- **Refines:** [ADR 0018](0018-install-form-presentation.md) §3, §4, §5
- **Refines:** [ADR 0019](0019-external-component-node.md) §3
- **Refines:** [ADR 0020](0020-multi-value-value-shape.md) §3
- **Relies on:** [ADR 0005](0005-platform-divergence-reconciliation.md) §1

## Context

A component input carried three kinds of statement at once:

| Kind | Fields |
|---|---|
| What the component needs | `schema`, `required`, `description`, `target` |
| Who or what supplies the value | `suppliedBy`, `generator`, `platformDefault` |
| How a person is asked for it | `ui` |

Only the first is a fact about the component. The other two are facts about a
composition, and a component document is the one document that never sees a
composition. One component is deployed by many blueprints, and whether its
`databaseUrl` is wired from a sibling or typed into a form is something each of
them decides differently.

Writing those decisions on the component cost a web of cross-document rules to
keep them consistent with the blueprint that actually made them:

- `COMP-UI-001` and `COMP-UI-002` tied `ui` to `suppliedBy`.
- `COMP-GEN-001` tied `generator` to `suppliedBy` and `sensitive`.
- `COMP-EXT-005` excluded both value sources from an external node.
- `COMP-OUT-003` stopped an output reading a `CONNECTION` input.
- `BP-CONN-001` stopped a connection filling a `USER` input.
- Blueprint §4.2's unwired rule and §5.3's uncovered rule said the same thing
  twice, once per value of `suppliedBy`.
- Blueprint §5.1 and §5.2 derived a form from the components and merged it,
  with `ERR_CONFLICTING_INPUT_SCHEMA` for when two of them disagreed.
- Blueprint §5.3 checked an authored parameter's `schema.type` and
  `resourceType` against the inputs it covered, and warned in prose that
  `required` defaulted in opposite directions on the two documents.

Each of those rules was sound. Together they asked a reader to hold two
documents' worth of supply logic in mind to answer "where does this value come
from", when the answer is written in only one of them.

### Why now

`git tag -l` is empty and `published.json` records no release, so
[ADR 0005](0005-platform-divergence-reconciliation.md) §1's pre-publication
window is open. Every decision below narrows what validates, and every one of
them is free only inside it.

## Decision

### 1. A component input states requirements only

A component input carries `description`, `schema`, `required` and `target`, and
nothing else. `suppliedBy`, `ui`, `generator` and `platformDefault` are removed,
and a document carrying one reports `ERR_UNKNOWN_FIELD`.

`COMP-UI-001` through `COMP-UI-005`, `COMP-GEN-001`, `COMP-EP-004` and
`COMP-EXT-005` are withdrawn from component. Component §6.4 is removed.

### 2. `description` is required on every input and output

`COMP-DESC-001`: every input and every output MUST declare a non-empty
`description`. It is the single place a value is explained. A blueprint
parameter carries no description of its own and shows the covered input's, so
every blueprint deploying a component shows the same words, written by the
author who knows what the value is for.

### 3. The install form is always authored

Derivation and the merge are removed. `spec.parameters` is every field the
deploying user is shown, and absent and empty both mean a form with no fields.
The derivation of a *control* from a value's `schema`, which
[ADR 0018](0018-install-form-presentation.md) §1 placed in component §6.4, moves
unchanged in substance to blueprint §5.3. It now reads the covered input's
`schema`. `COMP-UI-003..005` become `BP-UI-001..003`.

A parameter carries `ui` (REQUIRED), and at most one of `generator` and
`platformDefault`. It carries no `schema`, no `required` and no `description`,
since the inputs it covers declare all three. The two parameter compatibility
codes, `ERR_INCOMPATIBLE_PARAMETER_TYPE` and
`ERR_INCOMPATIBLE_PARAMETER_RESOURCE_TYPE`, have nothing left to compare and
are withdrawn, and so is the asymmetric `required` default
[ADR 0018](0018-install-form-presentation.md) §6 inherited.

### 4. Binding stays by key, over unwired inputs

A parameter covers every input of its key on every node where no connection
fills that input. A wired input is never covered, so a wire and a field never
claim one value, and a composition wiring node A's `apiKey` while asking the
user for node B's stays expressible. Any input may be wired, so `BP-CONN-001` is
withdrawn, superseding [ADR 0019](0019-external-component-node.md) §4.

Three rules replace the four this section retires:

- `BP-PARAM-001`, `ERR_UNBOUND_PARAMETER`: a parameter covers something.
- `BP-PARAM-002`, `ERR_CONFLICTING_INPUT_SCHEMA`: the inputs one parameter
  covers declare equal `schema` blocks. The code keeps its name and narrows its
  meaning from "two nodes" to "two nodes one field joins".
- `BP-PARAM-003`, `ERR_UNSATISFIED_REQUIRED_INPUT`: a required input with no
  default is wired or covered. It replaces `ERR_UNWIRED_REQUIRED_INPUT` and
  `ERR_UNCOVERED_REQUIRED_INPUT`.

### 5. Value sources move to the parameter

`generator` and `platformDefault` are properties of a parameter only.
[ADR 0018](0018-install-form-presentation.md) §5's `SELF_ADDRESS` tag, its four
sources and their endpoint rules move to blueprint §5.2 as `BP-PARAM-005`, and
resolve against each node the parameter covers. `ERR_ENDPOINT_NOT_PUBLIC` and
`ERR_ENDPOINT_NOT_L4` move to blueprint's table; the three endpoint codes a
probe also reports stay declared in component. A default covering an external
node has no endpoints to resolve and reports the existing ambiguous or unknown
endpoint code, so `COMP-EXT-005` needs no successor.

`COMP-GEN-001`'s guarantee survives as `BP-PARAM-004`,
`ERR_GENERATED_INPUT_NOT_SENSITIVE`: a generated parameter covers only inputs
marked `sensitive: true`. It becomes `semantic`, because `sensitive` is now read
from the component.

### 6. The output invariant is enforced where wiring is visible

[ADR 0019](0019-external-component-node.md) §3's invariant, that every output
resolves before any edge is bound, is unchanged. A component can no longer tell
which of its inputs will be wired, so `COMP-OUT-003` and
`ERR_INPUT_NOT_REFERENCEABLE` are withdrawn and `BP-CONN-002` takes their place:
a connection MUST NOT fill an input an `INPUT` output of the same component
reads. It reports `ERR_INPUT_NOT_CONNECTABLE`, whose old meaning `BP-CONN-001`
took with it.

## Alternatives considered

**Explicit per-node bindings.** Replacing `connections` with a per-node
`inputs` map whose entries name a wire or a parameter would make every input's
supplier visible on its node, and remove key matching entirely. Rejected for
now as a larger change to the graph's shape than the problem needs; the key
binding keeps its decidability caveat and nothing else about it got harder.

**Keeping derivation, with labels taken from `description`.** A derived form
would spare a small blueprint its `parameters` block. Rejected because it keeps
the merge and its conflict rule, and because a label and a description are
different sentences: deriving one from the other puts a paragraph where a form
wants two words.

**Keeping `platformDefault` on the component as an intrinsic fallback.** It
reads the component's own endpoints, which argues for leaving it there, and it
would keep its endpoint checks offline for a published reference. Rejected
because it answers "who supplies this value", which is the question this record
moves out of the component, and because a blueprint may reasonably want a
typed value where another wants the node's address.

**A parameter keeping its own `schema`.** It would let a form narrow what the
input accepts. Rejected because two statements of one value's shape need a rule
deciding between them, which is the rule this record withdraws.

## Consequences

**A component is shorter, and reads as a contract.** Every input in the corpus
loses between one and four properties and gains a description where it lacked
one. The question "who fills this" has one place to look.

**Small blueprints get longer.** A single-node blueprint that relied on
derivation now writes a `parameters` block with a label per field. That is the
cost of the form having one owner, and it is paid once per blueprint rather than
once per component.

**Offline checks narrow for published references.** Platform-default endpoint
checks and enum-label checks now read a referenced component, so they go silent
for a node referenced by UUID, on the terms blueprint §5.1 sets for every such
rule.

**Ten requirement identifiers and five diagnostic codes are withdrawn; ten
identifiers and two codes are added.** Every withdrawn case is deleted rather
than excused.

**`musher-dev/catalog` fetches the bundles from `main` unpinned**, as
[ADR 0018](0018-install-form-presentation.md) recorded, and will fail until its
items move `ui`, `generator` and `platformDefault` from their components into
their blueprints' `parameters`, drop `suppliedBy`, and describe every input and
output.
