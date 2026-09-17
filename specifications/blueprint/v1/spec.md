# Musher Blueprint Document — Specification v1

**Status:** Draft (pre-stable)
**Family:** `blueprint`
**Schema:** `https://specifications.musher.dev/blueprint/v1/blueprint.schema.json`

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) when, and only when, they
appear in all capitals, as shown here.

> **What is normative.** This document, together with the
> [Musher Document Core Specification](../../core/v1/spec.md) it applies,
> defines the complete behaviour of the specification. The JSON Schema bundle is its executable form for structural
> validity, and the [conformance corpus](../../../docs/conformance.md) is its
> executable form for observable outcomes; both are normative, and neither is
> permitted to disagree with this document or with the other. Schema
> `description` fields, examples, generated documentation, and validator message
> text are informative.
>
> A disagreement between two normative artifacts is a defect in this
> specification and blocks a release. Until it is fixed this document governs —
> but that is how to read a broken contract, not a licence for the schema to be
> wrong.

---

## <a id="scope"></a>1. Scope

A **Blueprint Document** composes one or more
[Component Documents](../../component/v1/spec.md) into a single deployable
application: which components participate, how large each runs, and how they
are wired to one another.

The blueprint is the unit of deployment.

**Out of scope for this document**

- One workload's own definition → `component` family
- Storefront presentation → `listing` family
- API request and response bodies, including the optimistic-lock token carried
  by a declarative-apply call → the Musher API. A document a human writes into
  a repository does not carry a lock token; see [§3](#identity).
- The `apiVersion: musher.dev/v1`, `kind: App` shape read by `musher deploy`.
  [ADR 0001](../../../docs/adr/0001-canonical-repository-architecture.md) §2
  declines to ratify it. It is superseded by a repo-local `blueprint` document
  paired with its `component` documents, which the reference form in
  [§4.1](#component-reference) makes expressible.

## <a id="envelope"></a>2. Document envelope

```yaml
specVersion: v1
kind: BLUEPRINT
metadata: { slug: …, revision: … }
spec: { components: {…}, parameters: {…} }
```

A Blueprint Document is a Musher document as the
[Musher Document Core Specification](../../core/v1/spec.md) defines one, and
every rule of core v1 applies to it. This family binds the parameters
[core v1 §1.1](../../core/v1/spec.md#bindings) leaves to a family:

| Core parameter | This family |
|---|---|
| `kind` ([`CORE-ENV-002`](../../core/v1/spec.md#CORE-ENV-002)) | `BLUEPRINT` |
| `metadata` ([`CORE-ENV-003`](../../core/v1/spec.md#CORE-ENV-003)) | [§3](#identity) |
| Fields accepting `null` ([`CORE-ENV-007`](../../core/v1/spec.md#CORE-ENV-007)) | `size` — [§4.3](#node-compute) |
| Item document ([core v1 §4.1](../../core/v1/spec.md#item-directory)) | `blueprint.yaml` |

This specification narrows core v1 where it says so and relaxes it nowhere. It
cites core by its line — "core v1 §N" — and the core edition a release was
built and tested against is recorded with that release
([core v1 §9](../../core/v1/spec.md#editions)).

**Normative dependencies**

| Specification | Line |
|---|---|
| [core](../../core/v1/spec.md) | v1 |
| [component](../../component/v1/spec.md) | v1 |

## <a id="identity"></a>3. Identity

`metadata` carries `slug` and `revision`, and nothing else. A record identifier
and a concurrency token — the `id` and `rowVersion` an API carries on a
declarative apply — describe a row in a control plane, not a document. They
MUST NOT appear on a blueprint document, and a validator MUST reject them with
`ERR_UNKNOWN_FIELD` like any other unknown property.

**`revision` counts releases of the catalog item.** It is an integer, 1 or
greater, REQUIRED and never defaulted. Like a component's
([component §4](../../component/v1/spec.md#metadata)) it names a position in one
lineage and nothing more: nothing is derivable from the distance between 2 and
7, and nothing is promised about how one revision of an item behaves against
another. It orders, and that is the whole of its job.

**It is the item's only revision.** A blueprint is the one item document that
carries one: [listing §3](../../listing/v1/spec.md#identity) says why the
sibling listing carries none, and component §4 says why the component documents
beneath the item count something else. An item holding no blueprint therefore
has no item revision at all, and is ordered by the components it publishes.

Two rules bind the item together. Both are `semantic`, and both are measured
against the item root [§3.1](#item-directory) locates. The first is stated once
for every family in
[core v1 §4.2](../../core/v1/spec.md#item-identity):
[`CORE-ITEM-001`](../../core/v1/spec.md#CORE-ITEM-001) binds `metadata.slug` to
the item directory name. The second is this family's:

| ID | Rule | Diagnostic |
|---|---|---|
| <a id="BP-ID-003"></a>`BP-ID-003` | Every component document in the item MUST be referenced by some node. | `ERR_UNREFERENCED_COMPONENT` |

**An unreferenced component document is an error, not dead weight.** A
component nothing references is not deployed, not checked against any node,
and not visible to a reader working out what the item contains. Permitted, it
accumulates: last release's `postgres.yaml` sitting beside the one actually in
use, with nothing in the directory saying which is live. The diagnostic
anchors at `/spec/components` — the mapping that should have named the file —
because a JSON Pointer addresses this document, and the file it is complaining
about is not in it.

**What v1 does not constrain.** An item holding a `blueprint.yaml` and no
`listing.yaml` is not rejected. Nothing in
[core v1 §4.2](../../core/v1/spec.md#item-identity) requires the sibling listing
[§3.1](#item-directory) shows, and an item with no storefront entry is one that
is deployable and not browsable rather than one that is malformed. Nothing
orders one item's revisions against another's either, and nothing checks a
blueprint revision against the lineage it extends: `minimum: 1` is the whole of
the offline rule. Component §4 carries a `capability` rule for a component's
lineage, and this family has no analogue of it.

### <a id="item-directory"></a>3.1 The item directory

A blueprint and its sibling listing are the item documents of one
[catalog item](../../core/v1/spec.md#item-directory).

```
<slug>/
  blueprint.yaml        this document
  listing.yaml          the sibling storefront entry
  components/           the component documents the graph references
  media/                icon and screenshots
```

`blueprint.yaml` is this family's item document, so the directory containing it
is the **item root** [core v1 §4.1](../../core/v1/spec.md#item-directory)
defines. It is what §3's three rules are measured against, what
[§4.1](#component-reference) means by containment, and what
[listing §5](../../listing/v1/spec.md#media) resolves a media path inside.

Only two names in that tree are fixed: `blueprint.yaml` and `listing.yaml`.
Component documents MAY sit anywhere under the root — `components/` is a
convention, and [§4.1](#component-reference) accepts a flat sibling equally.
`media/` is fixed too, but by the listing family rather than by this one.

A blueprint handed over with no directory has no item root, so
[core v1 §4.1](../../core/v1/spec.md#item-directory) forbids reporting any of
§3's rules for it. [§4.1](#component-reference) draws the same line for the
component reference, for the same reason.

## <a id="components"></a>4. Component graph

`spec.components` is a mapping from **graph-local node name** to a component
reference. The node name is the identifier used by connections; it is local to
this blueprint and carries no meaning outside it.

`spec.components` is REQUIRED and MUST declare at least one node. [§1](#scope)
makes a blueprint a composition of one or more component documents, and an
empty graph deploys nothing while claiming to be the unit of deployment. Both
halves are `structural`: an absent mapping is `ERR_MISSING_FIELD` and an empty
one `ERR_INVALID_VALUE`.

A node name MUST match `^[a-z][a-z0-9-]{0,61}[a-z0-9]$`, the label grammar
[core v1 §5.1](../../core/v1/spec.md#label-grammar) names, which `metadata.slug`
uses too. Uniqueness needs no rule of its own: `spec.components`
is a mapping, so a repeated node name is `ERR_DUPLICATE_KEY` in the `parser`
phase, before the graph is looked at.

The name is graph-local, which is to say it means nothing outside this
document. Two blueprints MAY each declare a node called `db` and neither is
the other's. Its jobs are to be what [§4.2](#connections) `fromRole` names, and what
[§5.1](#coverage) orders the graph by where one parameter covers two nodes.

A node carries three things: the component it deploys ([§4.1](#component-reference)),
the wires feeding it ([§4.2](#connections)), and the compute it runs on
([§4.3](#node-compute)).

### <a id="component-reference"></a>4.1 Component reference

A node names the component it deploys with a single field, `componentRef`. The
**form** of the value selects how it resolves. There is exactly one field for
this concept; a second parallel key naming the same slot is what made the
earlier dialects mutually unreadable.

Two forms are defined.

**Repo-local.** The reference MUST begin with `./` or `../` and MUST end with
`.yaml` or `.yml`. It is resolved relative to the directory containing the
referencing blueprint document. Every path segment MUST begin with a letter or
a digit, so `.` and `..` are not valid interior segments: each referenced
document has exactly one spelling.

```yaml
db:
  componentRef: ./components/postgres.yaml
  size: general.standard.small
  connections: {}
```

The node's `revision` MUST NOT be present. The revision deployed is the referenced
document's `metadata.revision`, so a second revision here could contradict it
with no rule saying which wins.

**Published.** The reference is the component's UUID, and `revision`
MUST be present. The UUID names the component across every revision it has, not
any one of them: it identifies the lineage that
[component §4](../../component/v1/spec.md#metadata) orders, and `revision`
selects the position in it that the node deploys. A tool MUST NOT treat the UUID
as the identity of a single revision. What a published node deploys is the UUID
and the `revision` together.

```yaml
db:
  componentRef: 550e8400-e29b-41d4-a716-446655440000
  revision: 3
  size: general.standard.small
  connections: {}
```

A reference matching neither form MUST be rejected in the `structural` phase.

**Why the prefix is required.** A bare name is not distinguishable from a
UUID: the label grammar [core v1 §5.1](../../core/v1/spec.md#label-grammar),
`^[a-z][a-z0-9-]{0,61}[a-z0-9]$`, matches
`e29b8400-e29b-41d4-a716-446655440000`. Without a prefix no validator could
decide which resolver a reference wanted, so the prefix is load-bearing rather
than decorative.

**The local form imposes no directory layout.** `./components/postgres.yaml`
and `./component-web.yaml` are equally valid. A blueprint MAY sit beside its
components in one flat directory.

**Where each form resolves.** A repo-local reference is resolved in the
`semantic` phase: it reads the filesystem, which
[core v1 §6](../../core/v1/spec.md#validation-layers) permits, since
that phase MUST NOT require network access. A published reference cannot be
resolved under that constraint and therefore belongs to the `capability`
phase, server-side. An offline client MUST NOT report a published reference as
unresolvable; it has not been given the means to check. A published reference
naming no component, or naming one without the requested `revision`,
MUST be rejected with `ERR_UNKNOWN_COMPONENT`.

Resolving is not the whole of it. A component the catalog holds but has not
published is not deployable, and a reference to one MUST be rejected with
`ERR_COMPONENT_NOT_PUBLISHED`. What counts as published is the registry's to
define — this contract says only that the two failures read differently to an
author, since a component that exists and is not yet released is a wait rather
than a typo. Both are `capability`, for the reason above, so neither can carry
a fixture.

A context holding no filesystem location for the document — a document
submitted over an API, for example — has no base directory to resolve against.
It MUST reject a repo-local reference with `ERR_COMPONENT_NOT_FOUND` rather
than assume a base. Guessing one is what let the same field mean two different
things depending on who was reading it.

A repo-local reference MUST resolve to a document inside the item root.
`../` segments that escape it MUST be rejected with `ERR_REFERENCE_ESCAPE`, and
a reference naming no document with `ERR_COMPONENT_NOT_FOUND`. Both are
`semantic`, both are decided after normalising the path — containment is a
property of the resolved location, not of the spelling.

**Reserved.** A third form, `<publisher>/<slug>`, is reserved for a public
registry and is not implemented. It will require `revision`. Until it
is specified, a reference of that shape matches no form and is rejected.

### <a id="connections"></a>4.2 Connections

Connections are **consumer-anchored**: the node that needs a value declares
where it comes from. A component never declares who consumes it.

```yaml
connections:
  databaseUrl:
    fromRole: db
    fromOutput: connectionString
```

The producer end MUST resolve.

- `fromRole` MUST name a node in this blueprint. A connection cannot reach
  outside the graph it is written in. `ERR_UNKNOWN_ROLE`.
- `fromOutput` MUST name an output declared by the component that node
  deploys. `ERR_UNKNOWN_OUTPUT`.

Both are `semantic`. The first needs only this document; the second needs the
referenced component document, which a repo-local reference makes readable
without a network.

**The consumer end MUST resolve too**, and it is named rather than written: the
map key is the input being filled, and the enclosing node is the consumer. A
key naming no input of the component that node deploys is `ERR_UNKNOWN_INPUT`
— the mirror of `ERR_UNKNOWN_OUTPUT`, needing the same referenced document and
carrying the same argument. A wire whose two ends are each checked and whose
consumer end is not is a wire that can be misspelled at one end only.

**A connection key is an input name, and takes the input grammar.** A key MUST
match `^[a-z][a-zA-Z0-9]{0,63}$`, and one that does not is rejected in the
`structural` phase with `ERR_INVALID_VALUE`. It is not a second vocabulary: the
key *is* the input being filled, so
[component §6](../../component/v1/spec.md#contract) fixes the grammar and this
section inherits it. In particular a key is not the environment-variable name
the value lands on — that is the consuming input's `target`.

Uniqueness needs no rule. One input cannot take two wires, because the map key
is what names it — a second wire to the same input is a repeated mapping key
and therefore `ERR_DUPLICATE_KEY` in the `parser` phase. That is a property of
how a connection is spelled, not an omission from this section.

**Any input may be wired.** A component does not say who supplies its inputs
([component §6.1](../../component/v1/spec.md#inputs)), so a connection may fill
any input the consuming component declares. An input a connection fills is
supplied, and [§5.1](#coverage) takes it out of every parameter's coverage, so a
wire and the install form never both claim one value. A required input that is
neither wired nor covered is [`BP-PARAM-003`](#BP-PARAM-003).

<a id="BP-CONN-002"></a>**`BP-CONN-002` — a connection MUST NOT fill an input
the component republishes.** Where the consuming component declares an output
whose `valueFrom` is `INPUT` and whose `input` names the connection's key, the
connection is rejected in the `semantic` phase with `ERR_INPUT_NOT_CONNECTABLE`,
anchored at the connection.

[Component §6.2](../../component/v1/spec.md#outputs) makes every output
resolvable before any edge is bound, and that invariant is what lets the cycles
this section permits resolve. An output reading a wired input would depend on
an inbound edge. The component cannot enforce the invariant for such an output,
because it does not know which of its inputs a composition wires; this document
does, so the rule is decided here.

**The two ends MUST fit.** Resolving both ends establishes only that they
exist. A `STRING` output wired into a `NUMBER` input satisfies every rule
above, and fails at deploy time inside the consuming workload, the failure
shape [§5.1](#coverage) rejects for a parameter covering two unequal inputs, on
the grounds that it lands
"a long way from the two documents that disagreed and with nothing pointing
back at them". The argument is the same here, so the answer is.

Both ends always carry a `schema`, and `type` is REQUIRED on one
([component §6.1](../../component/v1/spec.md#inputs),
[component §6.2](../../component/v1/spec.md#outputs)), so there is no
unconstrained producer to make an exception for. Two axes are compared. Both
are `semantic`, both need the referenced component documents, and both anchor
at the connection's `fromOutput`.

**`type` MUST be equal.** A mismatch is `ERR_INCOMPATIBLE_TYPE`. No widening is
permitted, in either direction. A `NUMBER` output feeding a `STRING` input
looks harmless — everything is a string by the time it reaches a container —
but *which* string is a decision each language's formatter makes differently,
and `5432`, `5432.0` and `5.432e3` are one value with three spellings. A
contract that permitted the wire would be promising a value it cannot describe.
An author who wants the conversion writes an output that already has the type
the consumer asked for.

**`JSON` is not an exception, and it is the member most likely to look like
one.** It names a value whose string form is a JSON document
([component §6.3](../../component/v1/spec.md#value-schema)), not a supertype of
the other three. A `STRING` output does not satisfy a `JSON` input, and a
`JSON` output does not satisfy a `STRING` one — in either direction and for
the same reason: a consumer that will parse what it receives and one that will
not are asking for different things, and the wire is the last place that
difference is visible.

**`STRING_LIST` is not an exception either.** It names a value whose string
form is a JSON array of strings drawn from a named set
([component §6.3](../../component/v1/spec.md#value-schema)), not a `STRING` that
happens to hold several. A `STRING` output does not satisfy a `STRING_LIST`
input and a `STRING_LIST` output does not satisfy a `STRING` one — a consumer
that will parse an array out of what it receives and one that will not are
asking for different things, which is the argument above with a different pair
of members in it. This section needs no rule of its own to say so: the
multiplicity is part of `type`, so the equality already stated decides it.

**`resourceType` MUST agree where the consumer names one.** A consumer
declaring none accepts any producer: it has said the value addresses no
particular resource, and nothing it receives can contradict that. A consumer
declaring an identifier requires a producer declaring the **same** identifier —
including rejecting a producer that declares none, because an unconstrained
producer does not satisfy a constrained consumer. A mismatch is
`ERR_INCOMPATIBLE_RESOURCE_TYPE`.

That is what `resourceType` is for, given `type` exists. `type` is the
primitive shape; `resourceType` is the resource the value addresses. A Postgres
connection string and a MySQL one are both `STRING`, both plausibly
`CONNECTION_STRING`-formatted, and wiring one into a consumer expecting the
other is the mistake the tag exists to catch.

**The comparison is an equality and stays offline.** It asks whether the two
ends declare the same identifier, which is two strings and no network. Whether
that identifier is *registered* is a different question, and
[component §6.3](../../component/v1/spec.md#value-schema) answers it in the
`capability` phase — so a consumer and producer that agree on
`com.acme.billing.tenant-key` wire cleanly in an offline client that has never
heard of Acme.

**What v1 does not compare.** `format`, `enum`, `pattern`, `default` and
`sensitive` take no part in the decision. A producer whose `pattern` admits
more than the consumer's does is accepted, and nothing checks that a
non-sensitive output is not wired into a sensitive input. Those silences are
gaps rather than considered permissions, recorded here so a reader can tell the
two apart; closing any of them rejects compositions that validate today.

**The connection graph MAY contain a cycle.** Two nodes MAY each consume an
output of the other, and an implementation MUST NOT reject a composition for
that reason alone.

The rule follows from one already stated. An output is a function of its own
node and nothing else
([component §6.2](../../component/v1/spec.md#outputs)), so every output in the
graph is resolvable before any edge is bound. Resolution is one pass over a
finite set of nodes: it needs no topological order, and there is no order for a
cycle to contradict. A cyclic graph is not a resolution hazard, and rejecting
one would be rejecting a document nothing in this contract cannot process.

What it permits has a name. **Mutual service discovery** — two services that
each need the other's address — is a composition an author writes deliberately,
and it is expressible only if a cycle is legal. A rule that forbade it would be
spending a working capability.

**What this forecloses, stated rather than discovered later.** No rule in this
version depends on the order in which nodes are materialised, and a later one
that did — an ordered rollout, a health-gated start, a value that legitimately
depends on an inbound edge — would need an acyclic graph to be meaningful.
Requiring acyclicity after publication rejects compositions that validate
today, so such a rule is a new major version rather than an addition to this
one. Anyone proposing one should know that before starting rather than
afterwards.

### <a id="node-compute"></a>4.3 Node compute

`size` is REQUIRED on every node and names the **Compute Profile** it runs on —
a provider-neutral machine tier, not a raw resource request. A component
document carries no compute of its own
([component §5](../../component/v1/spec.md#workload)), so the node is the only
place it can be said, and two blueprints MAY run the same component revision at
different sizes without forking it.

<a id="BP-NODE-001"></a>**`BP-NODE-001` — a node that runs nothing writes
`size: null`.** A node deploying an
[external component](../../component/v1/spec.md#external) has no compute to
name, and `null` is how it says so. The field stays REQUIRED, so absence still
means the author forgot: an absent `size` is `ERR_MISSING_FIELD` in the
`structural` phase, and `null` is a declaration rather than a fallback and
carries no default.

This is the third placement
[ADR 0007](../../../docs/adr/0007-naming-conventions.md) §5 leaves a field
nullable, and it is named because that section named only two. §5's rule is that
`null` is admitted where it means something omission does not. Here omission is
not available — the field is REQUIRED — so `null` is the only spelling left for
a deliberate none. It is the same argument §5 accepts for a `schedule` on a
workload that is forbidden one, reached from the opposite direction.

<a id="BP-NODE-002"></a>**`BP-NODE-002` — the node and the component MUST
agree.** `size` is `null` if and only if the component the node deploys
declares `spec.external`. A profile named for a component this platform does not
run, and an absent profile for one it does, are both rejected in the `semantic`
phase with `ERR_CONFLICTING_NODE_COMPUTE`, anchored at the node's `size` — the
field an author has to change. One code serves both directions because
`ERR_CONFLICTING_…` in this contract means two declarations claiming one slot,
which is what the node and the component are doing about this node's compute.

**Why it is `semantic` rather than `structural`.** A blueprint cannot see
whether its node's component is external. `componentRef` is a path or a UUID,
and reading the referenced document is `semantic` for the repo-local form and
`capability` for the published one, so no structural rule could condition `size`
on it. This rule therefore goes silent where the reference does not resolve
offline, on the terms [§5.1](#coverage) sets for every rule that
reads a referenced component.

```yaml
db:
  componentRef: ./components/postgres.yaml
  size: general.standard.medium
  connections: {}
```

**A profile slug has three segments, `family.tier.size`.** Two layers enforce
it, and the split between them is deliberate.

The three segments are drawn from closed sets. A value outside them is rejected
in the `structural` phase with `ERR_INVALID_VALUE`.

| Segment | Members |
|---|---|
| family | `general`, `compute`, `memory`, `storage`, `gpu`, `accelerator` |
| tier | `economy`, `standard`, `performance`, `premium` |
| size | `nano`, `small`, `medium`, `large`, `xlarge` |

That is a grammar, so the schema carries it. The last segment shares the field's
name and is not the field: `size` holds the whole slug, and `small` is one third
of one.

A tier names a capability band rather than a workload — for the `gpu` and
`accelerator` families, `economy` through `premium` run entry inference to
frontier training. The exact accelerator is not encoded in the slug; it is
pinned, if at all, by [§4.4](#placement-constraints).

**A grammatical slug is not necessarily an offered one.** Which profiles are
actually available is not a property of this document, and a node naming one
that is not is rejected with `ERR_UNKNOWN_COMPUTE_PROFILE` in the `capability`
phase. Deciding it needs the catalog, which needs the network, which
[core v1 §6](../../core/v1/spec.md#validation-layers) forbids the earlier phases from reaching — so an
offline implementation MUST NOT report it, on the same grounds
[§4.1](#component-reference) gives for a published component reference. It has
not been given the means to check.

**Where the vocabulary is published.** The profiles on offer are served,
unauthenticated, at
`https://api.musher.dev/v1/reference/compute-profiles`, and rendered for a
reader at <https://docs.musher.dev/reference/compute-profiles>. The endpoint
lists what can be deployed now; a slug the grammar admits and the endpoint does
not name is reserved rather than available.

**Why the vocabulary is not an `enum`.** The grammar is settled and the
membership is not: a profile becomes available when the platform has hardware
to back it, which is not an event this specification can observe and not one a
release of it coincides with. A schema that enumerated the offering would be
wrong in both directions between releases — naming tiers that cannot yet be
deployed, and rejecting ones that can. Growing the *grammar* is safe by
contrast, because an allowlist admitting more is a relaxation and ships in a
minor release ([core v1 §3](../../core/v1/spec.md#compatibility));
narrowing one would be major. That is the mirror of
[component §5.1](../../component/v1/spec.md#source), where the floating-tag
blocklist stays out of the schema precisely because growing a *blocklist* is a
narrowing.

**A bare slug, and never a versioned one.** A profile is versioned where it is
published, and a slug carrying that version is not a value this field takes —
the grammar has three segments and rejects a fourth. A node names the profile
and gets the current version of it, which means the vCPU and memory behind a
slug MAY differ between two deployments of an unchanged document. That is the
point of naming a tier rather than a machine: a name like `4vcpu-16gb` fixes
numbers it cannot keep, promising identical silicon across hardware generations
that do not deliver it.

### <a id="placement-constraints"></a><a id="advanced-constraints"></a>4.4 Placement constraints

`placement` is OPTIONAL and narrows the hosts a node may be placed on. An
absent block and a block whose every pin is unset mean the same thing: no
constraints.

<a id="BP-NODE-003"></a>**`BP-NODE-003`** — A node whose `size` is `null` MUST
NOT declare `placement`. `structural`, `ERR_INVALID_VALUE`. A pin narrows the
hosts a node may be placed on, and a node placed on none has nothing to narrow,
so the block is rejected rather than ignored — which is the rule
[component §5](../../component/v1/spec.md#workload) states for a forbidden
field. A pin whose value is an array means "any" when the array is empty,
and MUST NOT repeat a term.

| Pin | Narrows |
|---|---|
| `cpuArchitectures` | Permitted CPU architectures |
| `cpuDedication` | `shared` or `dedicated` |
| `minAcceleratorMemoryGiB` | Accelerator VRAM floor |
| `acceleratorRuntimes` | Required accelerator runtimes |
| `acceleratorInterconnect` | Required accelerator interconnect |
| `acceleratorSKUClass` | Exact accelerator SKU class |
| `storageClass` | Required storage class |
| `minStorageIOPS` | Provisioned IOPS floor |
| `networkClass` | Required network class |

**A pin narrows placement and nothing else.** `size` remains what the node runs
as; a pin only reduces the set of hosts that may run it. A node pinning
`cpuDedication: dedicated` gets the vCPU and memory its profile names, on a host
that dedicates them — never more compute than it asked for, and never a
substitute profile.

**A pin term is a lowercase token**, `^[a-z0-9][a-z0-9_-]*$`, which admits
`x86_64`, `arm64`, `local-nvme`, `nvlink` and `cuda`. Numeric pins are positive
integers. Both are grammar, both are `structural`, and a violation is
`ERR_INVALID_VALUE`. `cpuDedication` is the one pin whose vocabulary this
contract closes, because `shared` and `dedicated` are the whole of the concept
and a third value would be a different one.

**The two terms are not symmetric in effect.** `dedicated` narrows placement to
hosts that dedicate the vCPU the profile names; `shared` is that constraint's
absence written down, and selects the same hosts as leaving the pin unset. It is
spelled anyway because an author who has considered the question should be able
to record what they concluded, and because a platform that later offers a host
which must be shared can give the term force without touching this grammar.

**What v1 does not constrain.** No vocabulary is published for the other eight
pins — not by this repository and not, today, by the platform. `local-nvme` is
an example rather than a member, and nothing here says what the permitted
storage classes are. Nor does anything say what happens when no host satisfies a
pin: it is not decidable offline, and it carries no diagnostic in v1. Those are
gaps rather than considered permissions, recorded here so a reader can tell the
two apart. Naming a code for them would claim an implementation reports
something none does; closing them properly means publishing the terms first, at
which point they take the same shape `size` has above.

## <a id="parameters"></a>5. Parameters

`spec.parameters` is the install form: every field a deploying user is shown,
once, for the whole composition. It is always authored. Nothing derives a field
from a component, because a component declares what it needs and nothing about
how a person is asked for it
([component §6](../../component/v1/spec.md#contract)).

**A parameter says how a value is supplied, and the input says what the value
is.** A parameter carries `ui`, and at most one of `generator` and
`platformDefault`. It carries no `schema`, no `required` and no `description`:
the input it covers declares all three, and a form field reads them from there.
Writing them twice would give a composition two statements of one value's shape
with nothing to decide which is right. That is the failure
[§4.2](#connections) rejects for a wire, and [§5.1](#coverage) for coverage.

| Property | Presence | Says |
|---|---|---|
| `ui` | REQUIRED | How the field is presented ([§5.3](#install-form)). |
| `generator` | OPTIONAL | The platform mints the value at deploy time ([§5.2](#value-sources)). |
| `platformDefault` | OPTIONAL | The platform derives the value from the node's own addressing ([§5.2](#value-sources)). |

A parameter carrying neither is a value the deploying user types. Any other
property is `ERR_UNKNOWN_FIELD`.

**A parameter name is an input name.** A key of `spec.parameters` MUST match
`^[a-z][a-zA-Z0-9]{0,63}$` and is rejected in the `structural` phase with
`ERR_INVALID_VALUE` otherwise. [§5.1](#coverage) makes the key the whole of the
correspondence between a parameter and the inputs it covers, so a parameter
spelled outside the input grammar could cover nothing.

**Absent and empty mean the same thing**: a form with no fields. That is the
right form for a composition whose every required input is wired or has a
default, and [§5.1](#coverage) rejects it for any other.

### <a id="coverage"></a><a id="derivation"></a><a id="merge"></a><a id="authored-parameters"></a>5.1 Coverage

**Binding is by key.** A parameter **covers** every input whose key equals its
own, on every node where no connection fills that input. Nothing else is
available to make the correspondence, since a parameter names no node and no
`target`, so the key is not one signal among several but the whole of it. That
is what lets one parameter serve two components.

**A wired input is not a candidate.** A connection on a node takes that node's
input out of coverage, so a node whose `apiKey` arrives over a wire and a second
node whose `apiKey` is typed into the form are both expressible. A component
cannot rename its inputs, and a rule that made the two collide would leave that
composition with no spelling at all. There is no precedence here either: a wired
input is never covered, so a wire and a parameter never claim one value.

Three rules follow. All are `semantic`, and all need the component documents
the graph references, which a repo-local reference makes readable without a
network.

| ID | Rule | Diagnostic |
|---|---|---|
| <a id="BP-PARAM-001"></a>`BP-PARAM-001` | A parameter MUST cover at least one input. | `ERR_UNBOUND_PARAMETER` |
| <a id="BP-PARAM-002"></a>`BP-PARAM-002` | The inputs one parameter covers MUST declare equal `schema` blocks. | `ERR_CONFLICTING_INPUT_SCHEMA` |
| <a id="BP-PARAM-003"></a>`BP-PARAM-003` | A required input with no default MUST be wired or covered. | `ERR_UNSATISFIED_REQUIRED_INPUT` |

**A parameter MUST cover something.** One covering no input is reported at
`/spec/parameters/<key>`. The install form asks a deploying user for a value and
nothing in the composition ever reads it. Permitted, these accumulate exactly as
[§3](#identity) says an unreferenced component document does: last release's
`legacyMode` still on the form beside the parameters that do something, with
nothing in the document saying which is which.

**The inputs a parameter covers MUST agree on what the value is.** Two
declarations are equal when their `schema` blocks are equal once defaults are
applied. `description`, `required` and `target` are not compared: they say what
each component does with the value, not what the value is. A mismatch is
reported at `/spec/parameters/<key>`, the field that joined them.

One field produces one value, and each component then receives it against its
own `schema`. Taking the first schema and ignoring a different second one would
settle the ambiguity without telling anyone there was one: the second component
receives a value validated against the first one's rules, a bare `STRING` where
it required an enum member, a 64-byte secret where its pattern allowed 32.
Nothing fails at validation time. It fails at deploy time, inside the consuming
workload, a long way from the two documents that disagreed and with nothing
pointing back at them. Two components that disagree about a value need two
values, and nothing forces them into one field; the conflict is between two
declarations a single key has joined.

**A required input MUST be supplied.** An input is required when its `required`
is not `false`, which is its default. A required input whose `schema` declares a
`default` has a value already. Every other required input on a node MUST be
filled by a connection on that node or covered by a parameter, and one that is
neither is reported at `/spec/components/<node>`, the node that would start
without it. The message names the input, since a JSON Pointer addresses this
document and the input is not in it.

A covering parameter needs no further guarantee. A typed field for a required
input is a required field, a generated one is minted, and a platform default is
derived: each supplies the value, and the form a client draws makes a typed field
mandatory exactly where some input it covers is required and has no default.

**None of this reaches a published reference.** All three rules read the
referenced component's inputs, so a node naming its component by UUID
contributes none of them ([§4.1](#component-reference)). A blueprint mixing the
two forms is checked against the repo-local half and no further, and an
implementation MUST NOT report an input it was never given the means to read.

**And one of the three stops being decidable.** The equality and satisfaction
rules read only the inputs in front of them, so an unreadable node subtracts
from what they check and does nothing else. `ERR_UNBOUND_PARAMETER` is the
mirror image: it asserts that *no* node has a covered input, which is a claim
about every node's inputs. Where any node's component is unreadable, whether a
published reference or a repo-local one already rejected as naming no document
or as escaping the item root, an implementation MUST NOT report
`ERR_UNBOUND_PARAMETER` for any parameter. The claim becomes decidable again
only when every node's inputs were readable, and a diagnostic an implementation
cannot substantiate is worse than a silence, which is the trade [§3](#identity)
already makes for a document handed over without a directory.

**What v1 does not compare.** A parameter covering inputs whose `description`s
differ is accepted, and the form shows the description of the covered input on
the first of those nodes in node-name order. Wording is presentation, and two
components phrasing one value differently are not in conflict. That silence is a
decision rather than a gap.

### <a id="value-sources"></a>5.2 Value sources

A parameter with no source is typed by the deploying user. Two sources let the
platform supply the value instead, and a parameter carrying one still reaches
the form: "three secrets will be generated for you" and "this is filled in for
you, override it only for a custom domain" are both things worth being able to
say.

**Minting a value and deriving one are two answers to one question.** A
parameter MUST NOT carry both `generator` and `platformDefault`, and one that
does is rejected in the `structural` phase with `ERR_INVALID_VALUE`, anchored at
`platformDefault`.

| ID | Rule | Diagnostic |
|---|---|---|
| <a id="BP-PARAM-004"></a>`BP-PARAM-004` | A parameter carrying `generator` MUST cover only inputs whose `schema.sensitive` is `true`. | `ERR_GENERATED_INPUT_NOT_SENSITIVE` |
| <a id="BP-PARAM-005"></a>`BP-PARAM-005` | A platform default MUST resolve, on every node the parameter covers, to a `PUBLIC` endpoint publishing the address form its `source` reads. | See below |

Both are `semantic`, and both go silent for a node whose component was not read,
on the terms [§5.1](#coverage) sets.

**A generated value is secret material.** A generator mints a credential, and a
value not marked sensitive is echoed back into logs and interfaces. Whether a
value is sensitive is what the covered input declares
([component §6.3](../../component/v1/spec.md#value-schema)), so the rule reads it
there, and a parameter covering any input not marked `sensitive: true` is
reported once, at `/spec/parameters/<key>/generator`. `sensitive` defaults to
`false`, so an input that says nothing about it is bound by this.

**A platform default derives the value from the node's own addressing.**
`platformDefault` carries three properties. `type` is REQUIRED and names the kind
of default, `source` is REQUIRED and selects what is derived, and `endpoint`
names which endpoint it is derived from.

`type` has one member, `SELF_ADDRESS`. It is REQUIRED and carries no default,
because a discriminator a document may leave out is one two implementations may
read differently. A second kind is admitted beside this one without invalidating
a document written against it, which is why the tag is written now rather than
when a second kind arrives.

There are four sources, and they come in two pairs because
[component §5.2](../../component/v1/spec.md#endpoints) gives a `PUBLIC` endpoint
two address forms:

| `source` | Derives | From an endpoint publishing |
|---|---|---|
| `PUBLIC_URL` | The full URL. | a **URL**: `HTTP`, `HTTPS`, `WS`, `GRPC` |
| `PUBLIC_HOSTNAME` | The host part of that URL. | a **URL** |
| `PUBLIC_ADDRESS` | The full `host:port`. | a **`host:port`**: `TCP`, `UDP` |
| `PUBLIC_PORT` | The allocated edge port alone. | a **`host:port`** |

Each pair reads one address form. `PUBLIC_PORT` and `PUBLIC_HOSTNAME` exist
beside the whole they are part of because a consumer that takes host and port
as separate settings should not have to split a string this contract had
already composed.

**The endpoint resolves on each covered node.** A `SELF_ADDRESS` default is the
address of the node whose input it fills, so a parameter covering two nodes
derives two values, one from each. `endpoint` is OPTIONAL, and omitting it
selects the primary endpoint
[component §5.2](../../component/v1/spec.md#endpoints) elects on that node. Every
diagnostic below is reported at `/spec/parameters/<key>/platformDefault/endpoint`,
once however many covered nodes produce it.

- An omitted `endpoint` on a node that elects no primary is
  `ERR_AMBIGUOUS_ENDPOINT`. A node deploying an
  [external component](../../component/v1/spec.md#external) declares no endpoint
  and elects none, so a default covering one lands here: it has no addressing to
  read.
- An `endpoint` the node's workload does not declare is `ERR_UNKNOWN_ENDPOINT`,
  the code a probe naming one carries.
- An endpoint that is declared but `PRIVATE` is `ERR_ENDPOINT_NOT_PUBLIC`: every
  source derives an externally reachable address, and a `PRIVATE` endpoint has
  none to give.
- A URL source resolving to a `TCP` or `UDP` endpoint is
  `ERR_ENDPOINT_NOT_HTTP`, the code a probe on such an endpoint carries. A
  `host:port` source resolving to an HTTP-family endpoint is
  `ERR_ENDPOINT_NOT_L4`. Two codes rather than one so a diagnostic names the axis
  that failed, which is the same reason [§4.2](#connections) splits its two
  compatibility codes.

**Why an HTTP-family endpoint does not answer `PUBLIC_ADDRESS`.** It is
reachable at a host and a port like anything else, so admitting it would be
easy and is refused deliberately. Such an endpoint is published through the
shared ingress rather than on a port allocated to it, so what the derivation
would yield is the ingress address on the ingress port: true, and not the thing
an author asking for an edge address is asking for. They want the port their
broker was given. A source that returns a defensible value nobody wanted is
worse than one that rejects the document, because the first failure is silent
and arrives at runtime.

**A platform default is not a connection.** The value comes from the covered
node's own workload, never from an upstream node, which is the line
[component §6.2](../../component/v1/spec.md#outputs) draws around an output. A
wired input is never covered ([§5.1](#coverage)), so a wire and a platform
default never answer for one input.

### <a id="install-form"></a>5.3 Install-form presentation

`ui` is the presentation metadata every parameter carries, and this section
defines it.

| ID | Rule | Diagnostic |
|---|---|---|
| <a id="BP-UI-001"></a>`BP-UI-001` | A parameter MUST carry `ui`, `ui` MUST carry `label`, and `ui` admits no member this section does not name. | `ERR_MISSING_FIELD`, `ERR_UNKNOWN_FIELD` |
| <a id="BP-UI-002"></a>`BP-UI-002` | `prominence` MUST be `PRIMARY` or `SECONDARY`. | `ERR_INVALID_VALUE` |
| <a id="BP-UI-003"></a>`BP-UI-003` | Every `enumLabels` key MUST be a member of the covered inputs' `schema.enum`. | `ERR_UNKNOWN_ENUM_MEMBER` |

`BP-UI-001` and `BP-UI-002` are `structural`. `BP-UI-003` is `semantic`.

| Member | Presence | Means |
|---|---|---|
| `label` | REQUIRED | What the field is called. |
| `order` | OPTIONAL | Where the field sits. Lower sorts first. |
| `prominence` | OPTIONAL | How prominently it is offered. Default `PRIMARY`. |
| `examples` | OPTIONAL | Values illustrating the form the value takes. |
| `enumLabels` | OPTIONAL | What each `enum` member is called. |

The field's help text is not a member. It is the covered input's `description`
([component §6](../../component/v1/spec.md#COMP-DESC-001)), so a value is
described once, by the document that needs it.

**`ui` says how a value is asked for, never what it is.** Nothing here changes
what a value means or what would validate, which is what keeps the data contract
and the rendered control from being two declarations that can disagree. That is
also why the control itself is not declared; see the derivation below.

**`prominence`.** `PRIMARY` is offered directly; `SECONDARY` is offered behind a
disclosure the deploying user opens. It is distinct from whether the value is
required: an optional field may be either, and a form of eleven fields where
three are optional is not the same form as one where three are advanced.

**`examples` is never submitted.** It illustrates the form a value takes. A
value that is actually submitted when the user supplies none is the covered
input's [`schema.default`](../../component/v1/spec.md#value-schema), and the two
are different claims: an example may be one nobody should deploy. Where a value
carries an `enum`, `examples` says nothing a chooser does not already show, and a
client SHOULD ignore it.

**`enumLabels` names the members of an `enum` this document does not hold.**
The members are declared by the inputs the parameter covers, which
[§5.1](#coverage) requires to agree, so a key naming no member of that `enum` is
reported at `/spec/parameters/<key>/ui/enumLabels/<member>`. Where the parameter
covers nothing that was read, or covers inputs that disagree, there is no one
`enum` to compare against and the rule is silent.

`enumLabels` is keyed by the member rather than held in a list beside `enum`, so
the labels cannot fall out of step with the members by length or by order, and
so a member labelled twice is `ERR_DUPLICATE_KEY` in the `parser` phase
([core v1 §6.1](../../core/v1/spec.md#yaml-profile)) rather than a rule this
section would have to invent. A member with no label is offered as it is
spelled. A label naming no member is the other direction and is the error: it is
a typo that changes nothing a validator would otherwise see, and it would stay
invisible for the life of the document.

**Why the labels live here and not in the component.** A label is wording for a
form, and the form is this document's. Two blueprints deploying one component
may word one enumeration differently, and neither is wrong.

#### The derivation

**The control is derived from the covered input's `schema`, and this is that
derivation.** A client rendering the install form MUST derive each field's
control from the `schema` of the inputs the parameter covers and from the
parameter's `ui` as follows, and MUST NOT require any further declaration in
order to do it. Where more than one row applies, the first that applies decides.

| Where the covered input's `schema` says | The control |
|---|---|
| `sensitive: true` | MUST conceal the value as it is entered, and MUST NOT display a stored one. |
| `type: STRING_LIST` | MUST offer several of the `enum` members at once, under their `enumLabels` wording where one is given, and MUST NOT offer a value outside them. |
| a non-empty `enum` | MUST offer those members, under their `enumLabels` wording where one is given, and MUST NOT offer a value outside them. |
| `type: BOOLEAN` | MUST offer exactly `true` and `false`. |
| `type: JSON` | SHOULD accept text spanning more than one line. |
| `format: EMAIL` | SHOULD offer a control specialised for a mailbox address. |
| `format: TIMEZONE` | SHOULD offer the identifiers [component §6.3](../../component/v1/spec.md#value-schema) names. |
| anything else | accepts text. |

The order matters in two places and is stated rather than left to chance. A
secret drawn from an enumeration is concealed rather than listed, because
`sensitive` is read first. And a `STRING_LIST` always carries a non-empty `enum`
([`COMP-VAL-006`](../../component/v1/spec.md#value-schema)), so it is read before
the `enum` row that would otherwise catch it and offer exactly one member.

A field is mandatory when some input it covers is required and has no
`schema.default`, and the parameter carries neither source. A client MUST NOT
submit the form without a value for a mandatory field.

**This clause binds an implementation's output rather than a document**, which
[listing §4.1](../../listing/v1/spec.md#description-markdown) is the only other
place in these specifications to do. There the grounds were security; here they
are that this contract has already spent the alternative. `ui` carries a label
and no control *because* the control is derived, and a `widget` member is
withheld on the same reasoning: a control declared beside the schema it renders
is one fact stated twice, with nothing to decide which is wrong when they
disagree. A derivation that is not written down makes `ui` not a minimal
contract but an incomplete one, and leaves two conforming implementations free
to render one document differently with neither of them defective.

**It carries no requirement identifier.** No document can violate it, and
[docs/conformance.md](../../../docs/conformance.md#requirements) reserves an
identifier for a rule one can. What the corpus holds down instead is the rules
that make the derivation total: [`BP-UI-001`](#BP-UI-001) through
[`BP-UI-003`](#BP-UI-003), [`BP-PARAM-002`](#BP-PARAM-002) and
[`COMP-VAL-004`](../../component/v1/spec.md#value-schema), each of which is a
statement about a document.

**Field order.** A client SHOULD present fields in ascending `ui.order`. A
parameter declaring none sorts after every parameter that declares one, and
parameters that tie, including all of them in a document that declares no order
at all, sort by parameter key compared as UTF-8 bytes. A mapping has no
sequence, and an order left implicit is whichever order an implementation
happens to iterate in.

**What this does not constrain.** No widget, no medium, no library, and no
appearance. Nothing here obliges a control to *reject* a value the `schema`
would reject:
[component §6.3](../../component/v1/spec.md#value-schema) records that no phase
tests a value against its schema, and this section opens no such phase. The
`enum` and `BOOLEAN` rows say what a control offers, not what the platform will
accept. A client that renders every field as a text box and every enumeration as
a list of its members is defective; one that chooses a different-looking chooser
than another client is not.

## <a id="validation-layers"></a>6. Validation layers

As defined in [core v1 §6](../../core/v1/spec.md#validation-layers), and
written in the YAML profile
[core v1 §6.1](../../core/v1/spec.md#yaml-profile) states.
Blueprint documents exercise the `semantic` phase more heavily than any other
family — repo-local reference resolution, connection compatibility, and parameter
coverage all live there.

Published reference resolution is the exception: it needs the catalog, so it
belongs to `capability`. A blueprint composed entirely of repo-local references
therefore validates completely offline, all the way through `semantic`.

## <a id="diagnostics"></a>7. Diagnostics

The codes in [core v1 §7](../../core/v1/spec.md#diagnostics) apply to every
document in this family. This family adds:

| Code | Phase | Meaning |
|---|---|---|
| `ERR_COMPONENT_NOT_FOUND` | `semantic` | A repo-local `componentRef` reference resolves to no document. |
| `ERR_REFERENCE_ESCAPE` | `semantic` | A repo-local `componentRef` reference resolves outside the item root. |
| `ERR_UNKNOWN_COMPONENT` | `capability` | A published `componentRef` reference names no component, or no such `revision`. |
| `ERR_CONFLICTING_NODE_COMPUTE` | `semantic` | A node's `size` disagrees with whether the component it deploys is run. |
| `ERR_INPUT_NOT_CONNECTABLE` | `semantic` | A connection fills an input that an `INPUT` output of the same component reads. |
| `ERR_UNKNOWN_ROLE` | `semantic` | A connection's `fromRole` names no node in this blueprint. |
| `ERR_UNKNOWN_OUTPUT` | `semantic` | A connection's `fromOutput` names no output of the referenced component. |
| `ERR_UNKNOWN_INPUT` | `semantic` | A connection's map key names no input of the consuming node's component. |
| `ERR_COMPONENT_NOT_PUBLISHED` | `capability` | A published `componentRef` reference resolves to a component that is not in a published state. |
| `ERR_UNKNOWN_COMPUTE_PROFILE` | `capability` | A node's `size` names a Compute Profile the catalog does not offer. |
| `ERR_INCOMPATIBLE_TYPE` | `semantic` | A connection joins an output and an input whose `schema.type`s differ. |
| `ERR_INCOMPATIBLE_RESOURCE_TYPE` | `semantic` | A connection joins an output and an input whose `schema.resourceType`s disagree. |
| `ERR_UNREFERENCED_COMPONENT` | `semantic` | A component document in the item is referenced by no node. |
| `ERR_CONFLICTING_INPUT_SCHEMA` | `semantic` | The inputs one parameter covers declare different schemas. |
| `ERR_UNBOUND_PARAMETER` | `semantic` | A parameter covers no input of any node. |
| `ERR_UNSATISFIED_REQUIRED_INPUT` | `semantic` | A required input with no default is neither wired nor covered by a parameter. |
| `ERR_GENERATED_INPUT_NOT_SENSITIVE` | `semantic` | A parameter carrying a `generator` covers an input not marked `sensitive`. |
| `ERR_ENDPOINT_NOT_PUBLIC` | `semantic` | A platform default resolves to a `PRIVATE` endpoint. |
| `ERR_ENDPOINT_NOT_L4` | `semantic` | A platform default deriving an edge address resolves to an endpoint whose protocol is in the HTTP family. |
| `ERR_UNKNOWN_ENUM_MEMBER` | `semantic` | An `enumLabels` key names no member of the covered inputs' `enum`. |

A platform default also reports three codes
[component §8](../../component/v1/spec.md#diagnostics) declares:
`ERR_UNKNOWN_ENDPOINT`, `ERR_AMBIGUOUS_ENDPOINT` and `ERR_ENDPOINT_NOT_HTTP`
([§5.2](#value-sources)). They are declared there, where the endpoint names and
the primary election they are measured against are defined.

## <a id="conformance"></a>8. Conformance

An implementation conforms to this specification when it produces the declared
outcome for every case in [this family's corpus](conformance/) and in the
[core corpus](../../core/v1/conformance/) at the core edition the release
records ([core v1 §8](../../core/v1/spec.md#conformance)). It MUST declare the
profile it claims, as [core v1 §8](../../core/v1/spec.md#conformance) requires. A
skipped case is never a passed one.

## <a id="known-debt"></a>9. Known debt

Each entry below is a gap this version leaves open, with the section that
records it.

**No configured instance is shared across graphs.** [§4.2](#connections) is
explicit that a connection cannot reach outside the graph it is written in, so
two blueprints that both need the same
[external component](../../component/v1/spec.md#external) each instantiate their
own node and each ask for their own values. Sharing one configured instance
needs a reference form that reaches outside the graph plus a phase to resolve
it, which is a new contract surface rather than a field.
[Component §10](../../component/v1/spec.md#known-debt) records the same gap from
the other end.

**A node set that depends on an install-form answer is foreclosed, and the
reason is architectural.** "Deploy an engine for me, or let me point at one I
have" reads like a parameter and is not one: it would make `spec.components` a
function of the answers to the form, which makes the form a function of its own
output and turns [§5.1](#coverage)'s coverage rules into claims quantified over
a value space rather than over the document in front of them. The `semantic` phase
would stop being a static analysis of the bytes it was handed. Whoever proposes
it should know that before starting rather than afterwards, which is why it is
recorded here in the shape [§4.2](#connections) already uses for the acyclicity
foreclosure.

**What the install form still cannot say.** [§5.3](#install-form) gives a field a
name, a position, a standing and a wording for its choices. It gives it no
**grouping**: an eleven-field form is presented as one list, and a blueprint
cannot say that three of its fields belong together under a heading. When `ui`
lived on a component input this was an objection of principle, because a group
name was a claim about a form holding other components' inputs. The form is now
this document's, so the objection is gone and what remains is an unmade
decision. Admitting a grouping later is additive.

**The platform default has one kind.** `SELF_ADDRESS` reads the covered node's
own addressing, which a node deploying an external component does not have, so
a default covering one is rejected ([§5.2](#value-sources)). A second kind that
resolved a value from a resource the organisation already holds would be
meaningful there. Recorded so the rejection is not later read as a decision
about platform defaults as a class.

What remains is not a gap in the prose but a vocabulary nothing publishes yet:
[§4.4](#placement-constraints)'s compute-constraint pins, recorded there as a gap
rather than described as a decision. See also
[component §10](../../component/v1/spec.md#known-debt).

## <a id="security"></a>10. Security considerations

[Core v1 §11](../../core/v1/spec.md#security) applies in full: a blueprint
document is untrusted input. This section adds what is specific to blueprint, a
document that resolves *other* documents.

**Path containment is the central one.** A repo-local `componentRef` reference is a
path this implementation will open, chosen by the document's author.
[§4.1](#component-reference) requires it to stay inside the item root, and
`ERR_REFERENCE_ESCAPE` is that rule. It is decided on the resolved location,
symbolic links included, as [core v1 §11](../../core/v1/spec.md#security)
requires of every path inside an item.

**Graph traversal.** [§4.2](#connections) makes the component graph a directed
graph an implementation walks, and permits that graph to contain a cycle. An
implementation MUST therefore detect cycles rather than relying on a recursion
limit to stop it — a stack overflow is a crash, not a diagnostic. Detecting one
means terminating the walk, not rejecting the document: that clause forbids
rejecting a composition for containing a cycle, so a traversal that meets one
MUST finish rather than report. The parser's nesting bound does not help here:
the cycle is in the graph the document describes, not in the document's own
structure.

**Published references.** Resolving a published reference is `capability`
([core v1 §6](../../core/v1/spec.md#validation-layers)) precisely because it
needs the catalog. An
implementation MUST NOT reach the network during `parser`, `structural`, or
`semantic`, so a blueprint composed entirely of repo-local references validates
completely offline. A validator that resolved published references early would
let a document under review choose a host for it to contact.
