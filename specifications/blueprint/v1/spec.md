# Musher Blueprint Document — Specification v1

**Status:** Stable
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
application: which components participate, what compute each runs on, how they
are wired to one another, and what the installation takes from outside the
documents.

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
metadata: { slug: …, revision: …, description: … }
spec: { parameters: {…}, components: {…} }
```

A Blueprint Document is a Musher document as the
[Musher Document Core Specification](../../core/v1/spec.md) defines one, and
every rule of core v1 applies to it. This family binds the parameters
[core v1 §1.1](../../core/v1/spec.md#bindings) leaves to a family:

| Core parameter | This family |
|---|---|
| `kind` ([`CORE-ENV-002`](../../core/v1/spec.md#CORE-ENV-002)) | `BLUEPRINT` |
| `metadata` ([`CORE-ENV-003`](../../core/v1/spec.md#CORE-ENV-003)) | [§3](#identity) |
| Fields accepting `null` ([`CORE-ENV-007`](../../core/v1/spec.md#CORE-ENV-007)) | `spec.parameters.*.default`; `spec.components.*.bindings.*.value` and descendants permitted by receiving schemas ([§4.2](#bindings)) |
| Item document ([core v1 §4.1](../../core/v1/spec.md#item-directory)) | `blueprint.yaml` |

This specification narrows core v1 where it says so and relaxes it nowhere. It
cites core by its line ("core v1 §N"), and the core edition a release was
built and tested against is recorded with that release
([core v1 §9](../../core/v1/spec.md#editions)).

**Normative dependencies**

| Specification | Line |
|---|---|
| [core](../../core/v1/spec.md) | v1 |
| [component](../../component/v1/spec.md) | v1 |

The compatibility guarantee of
[core v1 §3](../../core/v1/spec.md#compatibility) runs, for this family, from
`v1.3.0`:
[ADR 0033](../../../docs/adr/0033-inputs-are-the-only-way-into-a-component.md)
§5 withdrew `v1.0.0` to `v1.2.0` from it, once, before anyone outside the
project had adopted them.

## <a id="identity"></a>3. Identity

`metadata` carries `slug`, `revision` and `description`, and nothing else. A
record identifier and a concurrency token, the `id` and `rowVersion` an API
carries on a declarative apply, describe a row in a control plane, not a
document. They MUST NOT appear on a blueprint document, and a validator MUST
reject them with `ERR_UNKNOWN_FIELD` like any other unknown property.

<a id="description"></a><a id="BP-ID-004"></a>**`BP-ID-004`**: `description` says
what the deployable application is, in one or two sentences of plain text, 1 to
280 characters, the limit of a
[listing summary](../../listing/v1/spec.md#presentation). A consumer MUST NOT
render it as Markdown. An empty description, or one longer than 280 characters,
is `ERR_INVALID_VALUE` at `/metadata/description`. These are structural rules,
and they bind a description that is present. Whether one has to be present is
`BP-ID-005`.

<a id="BP-ID-005"></a>**`BP-ID-005`**: A published blueprint MUST carry a
`description`. One absent at publication is rejected in the `capability` phase
with [`ERR_DESCRIPTION_REQUIRED`](../../component/v1/spec.md#diagnostics) at
`/metadata`. The reasoning is
[component §4](../../component/v1/spec.md#COMP-DESC-003)'s and is not restated:
an unwritten description is a blueprint someone is still writing, and only a
publisher can tell that from one that is finished.

The description is for the people who install and operate the application. It
is not storefront copy: that is the sibling listing's `summary`, and neither is
derived from the other.

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
anchors at `/spec/components`, the mapping that should have named the file,
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
lineage ([`COMP-ID-001`](../../component/v1/spec.md#COMP-ID-001)), and this
family has no analogue of it. This family's `capability` rules are `BP-ID-005`,
about the description, and [`BP-GRAPH-001`](#BP-GRAPH-001), about the graph.
Neither is about the lineage.

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
defines. It is what §3's rules are measured against, what
[§4.1](#component-reference) means by containment, and what
[listing §5](../../listing/v1/spec.md#media) resolves a media path inside.

Only two names in that tree are fixed: `blueprint.yaml` and `listing.yaml`.
Component documents MAY sit anywhere under the root: `components/` is a
convention, and [§4.1](#component-reference) accepts a flat sibling equally.
`media/` is fixed too, but by the listing family rather than by this one.

A blueprint handed over with no directory has no item root, so
[core v1 §4.1](../../core/v1/spec.md#item-directory) forbids reporting any of
§3's item rules for it. [§4.1](#component-reference) draws the same line for the
component reference, for the same reason.

## <a id="components"></a>4. Component graph

Nodes live in `spec.components`, keyed by a core label. Each node requires
`componentRef`, and a node whose component runs also requires `compute`
([§4.3](#node-compute)). `components` itself is REQUIRED, and structurally it
MAY be empty.

<a id="BP-GRAPH-001"></a>**`BP-GRAPH-001`**: A published blueprint MUST declare
at least one node. An empty `components` at publication is rejected in the
`capability` phase with `ERR_NODE_REQUIRED` at `/spec/components`. The
reasoning is [component §4](../../component/v1/spec.md#COMP-DESC-003)'s and is
not restated: an empty graph is a blueprint someone is still writing, and only a
publisher can tell that from one that is finished. An offline validator
therefore MUST NOT report `ERR_NODE_REQUIRED`.

```yaml
components:
  web:
    componentRef: ./components/web.yaml
    compute:
      profile: general.standard.small
      placement: { cpuDedication: dedicated }
    volumes:
      uploads: { sizeGiB: 20, storageClass: local-nvme }
    exposure: { web: PUBLIC }
    bindings:
      databaseURL: { node: db, output: connectionString }
      siteTitle: { parameter: siteTitle }
```

| Member | Holds | Section |
|---|---|---|
| `componentRef`, `revision` | The component document the node deploys | [§4.1](#component-reference) |
| `bindings` | The supplier of each input | [§4.2](#bindings) |
| `compute` | The compute profile and its placement pins | [§4.3](#node-compute), [§4.4](#placement-constraints) |
| `volumes` | The storage allocated to each volume | [§4.3](#node-compute) |
| `exposure` | The exposure of each endpoint | [§4.3](#node-compute) |

### <a id="component-reference"></a>4.1 Component reference

`componentRef` takes one of two forms:

- A **repo-local** reference begins `./` or `../` and ends `.yaml` or `.yml`. It
  resolves relative to this blueprint, and its real path, including symlinks,
  MUST remain in the item root. It takes its revision from the component
  document and forbids `revision` on the node.
- A **published** reference is a UUID, and the node requires a positive integer
  `revision`.

<a id="BP-REF-002"></a>**`BP-REF-002`**: Local and published contracts undergo the
same structural and semantic checks. Acquisition is separate: the semantic
evaluator MUST NOT fetch dependencies. Supplied published contracts are keyed by
identity and revision, with the document's bytes and their verified SHA-256
digest. Missing context yields INCOMPLETE; a missing local file, malformed
supplied contract or digest mismatch is INVALID. Every rule that reads the
component a node deploys is deferred, not passed, while that component is
unavailable.

<a id="BP-REF-003"></a>**`BP-REF-003`**: The component a node deploys MUST meet
component's publication obligations
([component §5](../../component/v1/spec.md#publication-obligations)), whether it
is published or repo-local. A component may be stored unfinished, but a node
deploys it as it will run: one with no workload, source, endpoint, command or
output has nothing to run, and an input with no description gives the installer
nothing to read ([§5.4](#install-form)). A component that misses one is
`ERR_INVALID_DEPENDENCY` at the node's `componentRef`, semantic, in every
profile, as it was while those obligations were structural rules. The
component's own `metadata.description`
([`COMP-DESC-003`](../../component/v1/spec.md#COMP-DESC-003)) is the one
exception: a node has deployed a component without one since component v1.1.0
made it optional, and v1 keeps accepting it.

[`BP-ID-003`](#BP-ID-003) requires every component document in the item to be
referenced. That rule, like every item-scoped check, cannot complete for a
standalone document without an item root ([§3.1](#item-directory)).

### <a id="bindings"></a><a id="connections"></a>4.2 Explicit bindings

Each input's supplier lives at `components.<node>.bindings.<input>`. The map
key MUST name an input of the consuming component. The key present in a binding
says where the value comes from:

| Key | Members | Supplier |
|---|---|---|
| `parameter` | `parameter` | A named installation parameter ([§5](#parameters)) |
| `node` | `node`, `output` | An output of another node |
| `value` | `value` | A non-secret logical JSON value |

<a id="BP-CONN-003"></a>**`BP-CONN-003`**: A binding names exactly one supplier:
`parameter`, `node` with `output`, or `value`. A binding naming no supplier is
`ERR_MISSING_FIELD` at the binding, and one carrying members of two suppliers is
`ERR_INVALID_VALUE` there. `node` and `output` go together: `node` without
`output` and `output` without `node` are both `ERR_MISSING_FIELD` at the binding.
These are structural rules. Duplicate input keys fail during parsing, and there
is no override priority between suppliers.

```yaml
bindings:
  region:
    parameter: region
  databaseURL:
    node: database
    output: connectionString
  mode:
    value: production
```

**Values from outside the documents enter only through parameters.** A binding
wires what the documents contain: a parameter, another node's output, or a
literal. It never reads an organization variable or a connection itself; it
names a parameter that does ([§5](#parameters)). A logical schema constrains a
value, and the key of its binding selects its supply.

<a id="BP-CONN-002"></a>**`BP-CONN-002`**: The value-dependency graph MUST be
acyclic. An output whose `from` is `input` adds a dependency on that input, and
a `node` binding adds a dependency on the producer output it names. Endpoint
outputs depend on allocated addresses, not running processes, so discovery
cycles are permitted. A value cycle fails with `ERR_VALUE_CYCLE`. Traversal MUST
terminate.

A `connections` member, a `toNode` or `toInput` binding, and coverage by
matching names are rejected. Adding an unrelated node MUST NOT change existing recipients.

### <a id="node-compute"></a>4.3 Compute, storage and exposure

**Compute.** `compute` names the compute a node runs on: a compute `profile`,
and the `placement` pins that narrow where that profile is placed
([§4.4](#placement-constraints)).

<a id="BP-NODE-001"></a>**`BP-NODE-001`**: A node whose component runs, a
`SERVICE`, `WORKER` or `JOB` ([component §5](../../component/v1/spec.md#type)),
MUST carry `compute`. A node without it is `ERR_CONFLICTING_NODE_COMPUTE` at the
node.

<a id="BP-NODE-002"></a>**`BP-NODE-002`**: A node whose component is `EXTERNAL`
([component §5.6](../../component/v1/spec.md#external)) MUST NOT carry `compute`.
Nothing runs, so there is nothing to size or place. `compute` on one is
`ERR_CONFLICTING_NODE_COMPUTE` at `compute`.

Both rules are `semantic`: the category belongs to the component, so they are
decided against the contract the node deploys. While that contract is
unavailable, they are deferred and the result is INCOMPLETE, as
[`BP-REF-002`](#BP-REF-002) states for every rule that reads the component.

<a id="BP-NODE-003"></a>**`BP-NODE-003`**: `compute.profile` is REQUIRED within
`compute`, and names exactly one compute profile. Placement narrows only the
profile beside it, so `compute` carrying placement and no profile is
`ERR_MISSING_FIELD` at `compute`, a structural rule.

A compute profile slug is `family.tier.size`, for example
`general.standard.small`. Families: general, compute, memory, storage, gpu,
accelerator. Tiers: economy, standard, performance, premium. Sizes: nano, small,
medium, large, xlarge. Catalog membership and regional availability are
capability checks. Initial resolution selects a version of the profile and pins
it; redeploy uses that version. Updating to the current catalog version is
explicit.

**Storage.** <a id="BP-NODE-004"></a>**`BP-NODE-004`**: `volumes.<name>.sizeGiB`
allocates each volume the component declares
([component §5.5](../../component/v1/spec.md#volumes)) explicitly, at or above
its `minSizeGiB`. A declared volume with no allocation, an allocation naming no
declared volume, and an allocation below the minimum fail with
`ERR_INVALID_VOLUME_ALLOCATION`, a semantic rule. No storage default is selected
implicitly.

An allocation MAY also pin `storageClass`, a storage class term, and `minIOPS`,
a positive integer floor on provisioned IOPS. They describe the volume, not the
host, so they sit beside its size and never under `placement`, where they are
`ERR_UNKNOWN_FIELD`. Like a placement pin, each narrows what may serve the
allocation and never changes it: an unsupported term, or no storage able to meet
the floor, rejects capability admission, and neither is silently ignored. Their
terms follow the same grammar and the same catalog rules as placement terms
([§4.4](#placement-constraints)).

**Exposure.** <a id="BP-NODE-005"></a>**`BP-NODE-005`**: `exposure.<endpoint>`
is `PUBLIC` or `PRIVATE`, and an endpoint left out is `PRIVATE`. The component
constrains the choice:

- A key naming no endpoint of the component fails with `ERR_UNKNOWN_ENDPOINT`.
- A `WORKER` endpoint MUST NOT be `PUBLIC`: a worker is not request-driven, and
  its endpoints serve the platform and sibling nodes
  ([component `COMP-TYPE-003`](../../component/v1/spec.md#COMP-TYPE-003)).
  `PUBLIC` on one fails with `ERR_ENDPOINT_NOT_EXPOSABLE`.
- A `PUBLIC` HTTP-family endpoint of a `SERVICE` requires the component to
  declare a readiness probe
  ([component §5.4](../../component/v1/spec.md#health)), otherwise
  `ERR_READINESS_REQUIRED`.
- An output the component derives from a public property of an endpoint
  (`publicHostname`, `publicPort`, `publicAddress` or `publicURL`,
  [component §5.2](../../component/v1/spec.md#endpoints)) requires that endpoint
  to be `PUBLIC`, otherwise `ERR_ENDPOINT_NOT_PUBLIC`.

Each diagnostic anchors at `exposure/<endpoint>`, except that
`ERR_ENDPOINT_NOT_PUBLIC` for an endpoint left out of `exposure` anchors at the
node's `componentRef`. These are semantic rules.

Exposure decides who reaches an endpoint, and the component decides how the
platform connects to it. Traffic for a `PUBLIC` endpoint reaches the workload
over the endpoint's `protocol` and trust policy, the same ones its probes use
([component `COMP-EP-007`](../../component/v1/spec.md#COMP-EP-007)), whatever
scheme the public used to reach the platform.

### <a id="placement-constraints"></a><a id="advanced-constraints"></a>4.4 Placement constraints

Placement constraints narrow the hosts eligible for the selected compute
profile. They do not substitute a different profile or grant extra resources.
Omitted placement, empty placement and empty array pins impose no additional
constraint. Arrays cannot repeat terms.

| Pin | Requirement on an eligible host |
|---|---|
| cpuArchitectures | One of the listed architectures |
| cpuDedication | dedicated requires dedicated vCPU; shared imposes no dedication constraint |
| minAcceleratorMemoryGiB | At least this accelerator memory |
| acceleratorRuntimes | All listed runtimes are supported |
| acceleratorInterconnect | The named interconnect is available |
| acceleratorSKUClass | The named SKU class is available |
| networkClass | The named network class is available |

Storage is pinned on the volume it describes, not here
([§4.3](#node-compute)).

Numeric pins are positive integers. Terms use the schema's lowercase-token
grammar. Catalog terms and their provider mappings are versioned context, not
author-defined escape hatches. Missing context is INCOMPLETE. An unsupported
term or no eligible host rejects capability admission; neither is silently
ignored. The selected profile version and allocations are pinned by the
resolution record. A future meaning change to a pin is a specification change,
even if its spelling still passes structural validation.

## <a id="parameters"></a>5. Installation parameters

`spec.parameters` lists everything an installation takes from outside the
documents: values a person submits, generated credentials, organization
variables and connections. Node bindings only wire what the documents contain
([§4.2](#bindings)), so a value from outside enters as a parameter, and a node
reaches it by naming the parameter. Parameters are named installation values,
independent of form presentation.

A parameter is supplied in exactly one way, and the keys present say which:

| Supply | Declared by | Value |
|---|---|---|
| Submitted | No `generator` and no `from`; optional `default` | The value submitted at installation, else `default` |
| Generated | `generator` | A persisted random credential ([§5.2](#value-sources)) |
| Variable | `from: "${{ variables.<path> }}"` | One organization variable ([§5.2](#value-sources)) |
| Connection | `from: "${{ connections.<path> }}"` | One atomic connection ([§5.3](#atomic-connections)) |

```yaml
parameters:
  siteTitle: { ui: { label: Site title }, default: My site }
  dbPassword: { generator: { byteLength: 32, encoding: BASE64URL } }
  region: { from: "${{ variables.cloud.region }}" }
  llm: { from: "${{ connections.llm.default }}", ui: { label: Language model } }
```

The node in [§4](#components)'s example reaches `siteTitle` through its
`bindings`, and [§5.3](#atomic-connections) shows a connection reaching a node
the same way. A node never names a variable or a connection directly.

<a id="BP-PARAM-010"></a>**`BP-PARAM-010`**: A parameter carries at most one of
`default`, `generator` and `from`. A `default` beside `generator` or `from` is
`ERR_INVALID_VALUE` at `default`, and a `from` beside `generator` is
`ERR_INVALID_VALUE` at `from`. These are structural rules.

A parameter MAY also carry `ui` ([§5.4](#install-form)). Parameters declare no
schema of their own; the inputs bound to them own the value contract
([§5.1](#recipients)).

### <a id="recipients"></a><a id="coverage"></a><a id="derivation"></a><a id="merge"></a><a id="authored-parameters"></a>5.1 Recipients

<a id="BP-PARAM-001"></a>**`BP-PARAM-001`**: Every parameter MUST be named by at
least one `parameter` binding; otherwise `ERR_UNBOUND_PARAMETER`.

<a id="BP-PARAM-002"></a>**`BP-PARAM-002`**: Shared parameters require equal
logical schemas, ignoring mapping order. Otherwise `ERR_CONFLICTING_INPUT_SCHEMA`.
Descriptions, target locations and input defaults do not define shared identity.
Sensitivity is the union of the receiving contracts and the supplied value.

<a id="BP-PARAM-003"></a>**`BP-PARAM-003`**: Without a binding, an input uses its
component default, remains absent if optional, or fails with
`ERR_UNSATISFIED_REQUIRED_INPUT`. A bound but unavailable supplier never selects
the input default.

<a id="BP-PARAM-006"></a>**`BP-PARAM-006`**: A `node` binding names an existing
node (`ERR_UNKNOWN_NODE`) and an output its component declares
(`ERR_UNKNOWN_OUTPUT`).

<a id="BP-PARAM-007"></a>**`BP-PARAM-007`**: Every binding names an existing
input (`ERR_UNKNOWN_INPUT`), and every `parameter` binding names a
declared parameter (`ERR_UNKNOWN_PARAMETER`).

### <a id="value-sources"></a>5.2 Supply and resolution

<a id="BP-PARAM-004"></a>**`BP-PARAM-004`**: A generator produces a sensitive
string, which is never submitted: a submitted value for a generated parameter
fails with `ERR_PARAMETER_NOT_SUBMITTABLE` ([`BP-PARAM-009`](#BP-PARAM-009)).
`byteLength` is an integer from 16 to 64, default 32. Generate that many
cryptographically secure random bytes. `encoding` defaults to HEX (lowercase);
BASE64 uses the standard padded alphabet; BASE64URL uses the URL-safe alphabet
without padding. Custom alphabets are unsupported. The generated string must
satisfy every receiving schema; failing a constraint must not regenerate it.

<a id="BP-PARAM-005"></a>**`BP-PARAM-005`**: Parameter defaults are logical
literals, without interpolation. A submitted value replaces the default. Unknown
submitted parameter keys fail with `ERR_UNKNOWN_PARAMETER` before defaults are
applied, so a misspelling cannot be silently ignored. A submitted parameter with
no submitted value and no default is `ERR_MISSING_PARAMETER_VALUE` at
installation.

<a id="BP-PARAM-008"></a>**`BP-PARAM-008`**: Every statically known supplied
value must satisfy the inputs that receive it. Dynamic values are checked after
resolution, before execution. Producer and consumer logical types must match,
except that an integer may supply a number. This is conservative type
compatibility, not proof of schema containment.

<a id="BP-REF-001"></a>**`BP-REF-001`**: `from` is exactly one whole reference
under [core's grammar](../../core/v1/spec.md#reference-grammar), in the
`variables` or the `connections` namespace. The namespace says what kind of entry
the reference names: `variables` one value, `connections` one atomic connection.
It cannot concatenate, interpolate other text, hold two references, select a
component or fall back. A `from` that breaks this fails with:

- `ERR_MALFORMED_REFERENCE` when a `${{` does not begin a well-formed reference
  ([`CORE-REF-001`](../../core/v1/spec.md#CORE-REF-001));
- `ERR_INVALID_PARAMETER_SOURCE` when its references are well formed but it is
  not exactly one whole reference;
- `ERR_UNKNOWN_REFERENCE_NAMESPACE` when the namespace is one core does not
  reserve, such as `config`;
- `ERR_REFERENCE_NOT_IN_SCOPE` when the namespace is reserved but is neither
  `variables` nor `connections`
  ([core v1 §5.2](../../core/v1/spec.md#reference-grammar)).

All anchor at the parameter's `from` and are semantic rules. A blueprint never
references a component's endpoints: component defines them, and a node consumes
them only through the outputs a component names explicitly.

<a id="BP-PARAM-009"></a>**`BP-PARAM-009`**: A parameter whose `from` is in the
`variables` namespace takes one organization variable. Its dotted path is an
exact key, not object traversal or a registry type. A variable resolves against
the configuration visible to the environment the installation deploys into:
organization values, which an environment MAY override. Acquisition supplies
its identity, version, logical value and sensitivity. An unavailable variable
is INCOMPLETE; a variable the installation may not read is
`ERR_VARIABLE_NOT_AUTHORIZED`; a variable without identity or version is
`ERR_INVALID_RESOLUTION_CONTEXT`. Each is reported once per parameter, however
many bindings name it, at `/spec/parameters/<name>/from` in the `parameters`
stage of the `resolution` phase, and an unavailable variable is deferred there
under this rule. No network lookup occurs during semantic validation.

A parameter carrying `from`, like a generated one, is never submitted. A
submitted value for either is `ERR_PARAMETER_NOT_SUBMITTABLE` at
`/spec/parameters/<name>`, in the `resolution` phase. A connection is replaced
whole through acquisition instead ([§5.3](#atomic-connections)).

<a id="BP-RESOLVE-001"></a>**`BP-RESOLVE-001`**: Resolution completes these steps
before any workload starts: validate pinned contracts; select compute, storage
and exposure; allocate endpoint addresses; obtain submitted values, variables,
connections and persisted generated values; evaluate value dependencies;
validate every input and output; encode workload environment values. Incomplete
or invalid resolution forbids execution. A missing required installation
parameter is invalid; missing external context is incomplete. An output
forwarding an absent optional input fails with `ERR_UNSATISFIED_REQUIRED_INPUT`
at the output.

Generated credentials are created once per installation identity, parameter
identity and non-negative rotation generation. Atomic durable get-or-create
persists them before use. Retries and updates reuse them. Rotation explicitly
increments the generation. Renaming an identity requires an explicit migration
or a new credential; reconciliation cannot silently rotate it.

#### <a id="resolution-record"></a>Generated resolution record

Resolution produces a **resolution record**. It is generated, not an authored
override layer, and its version is 1. Its executable shape is
`#/$defs/BlueprintResolutionRecord` in the self-contained blueprint bundle. It is
a generated JSON artifact, not another Musher document kind, and unknown record
fields are rejected. It is read by software, not written by people, so it keeps
its `source` tag where an authored document names a source by the key present.

**What it records.** The record contains:

- the blueprint digest;
- exact specification releases and dependency editions;
- each node's component identity, revision and artifact digest;
- the image digest for every running node, and the resolved Git commit for Git
  builds;
- compute identity (the profile slug) and version;
- allocated volumes and exposure;
- variable identity/version pairs, keyed by variable path in `variables`;
- credential identity/rotation references.

Each component records source IMAGE, GIT or EXTERNAL. External nodes forbid
image, commit and compute fields and have empty volume and exposure maps. All
other nodes require an image digest and compute identity/version; GIT
additionally requires the full commit object ID. No secret plaintext or
secret-content hashes are included.

**The installation snapshot.** The required `installationSnapshot` pins the
private state behind the record by an opaque identity and an immutable version.
That private snapshot uses formatVersion 1. It persists submitted parameter
values, selected variable values and their identity/version pairs, credential
references and rotation generations for generated credentials, endpoint
allocations, and any connection selections, including source-policy revisions.
Its physical storage format is implementation-defined. Its sensitive values are
private and never hashed into the public record, and no public secret-derived
hash stands in for its identity. Reusing an identity/version for changed state is
forbidden: any change to a selected value, dependency, rotation or allocation
produces a new snapshot version and a new record. Persist the snapshot before
materialization.

**Accepting a record.** Acceptance parses and validates the record's blueprint
and referenced contracts, resolves its pinned component artifacts, and
reconciles the exact node set, identities, revisions, artifact digests, workload
sources and their kinds, compute identities, volumes, exposure and allocation
choices, acquired dependencies and specification release graph. Pinned image
digests and authored Git commits must agree. The `variables` map and the
`credentials` map must match the variable and generated parameters the blueprint
binds, and the private snapshot. Required endpoint allocation identities must be
present. Replaying the snapshot must successfully resolve the blueprint without
unpersisted selections. Exact specification dependency manifests must name all
declared dependencies and agree on shared editions; missing dependencies or
extra unrelated families fail. Schema validity alone is insufficient. The same
accepted record MUST identify the same effective values, not identical behavior
from external services.

A Git commit alone does not establish build reproducibility; the resulting
image digest is required. Redeploy uses the existing record and fails when a
pinned dependency is unavailable. Updating produces a new record explicitly.
Operational eligibility can change independently, but cannot rewrite the record.

### <a id="atomic-connections"></a>5.3 Atomic connections

A **connection parameter** is a parameter whose `from` is
`${{ connections.<path> }}`. It names one atomic connection
([ADR 0030](../../../docs/adr/0030-atomic-named-connections.md)): an endpoint, a
credential and a model acquired together, not a scalar lookup. It fills a
connection input ([component §6.4](../../component/v1/spec.md#connection-requirements))
through an ordinary `parameter` binding. The component that declares the input
is an external node standing for the model API, and the nodes that call the
model wire their inputs to its outputs, as they would to a managed database's.
The dotted path after `connections.` is an exact key naming one connection the
organization has configured, for example `llm.default`; it is not object
traversal and not a selector.

```yaml
parameters:
  llm: { from: "${{ connections.llm.default }}", ui: { label: Language model } }
components:
  llm:
    componentRef: ./components/openai-chat.yaml
    bindings:
      llm: { parameter: llm }
  assistant:
    componentRef: ./components/assistant.yaml
    compute: { profile: general.standard.small }
    bindings:
      llmBaseURL: { node: llm, output: baseURL }
      llmAPIKey: { node: llm, output: apiKey }
      llmModel: { node: llm, output: model }
```

<a id="BP-CONNECTION-001"></a>**`BP-CONNECTION-001`**: A connection input MUST be
bound only by a `parameter` binding naming a connection parameter, and a
connection parameter MUST bind only connection inputs. Each of these fails with
`ERR_INVALID_CONNECTION_BINDING`:

- a `value` or `node` binding to a connection input, at the binding;
- a `parameter` binding to a connection input naming a parameter that is not a
  connection parameter, at the binding's `parameter`;
- a `parameter` binding to a value input naming a connection parameter, at the
  binding's `parameter`.

A binding naming no parameter is `ERR_UNKNOWN_PARAMETER`
([`BP-PARAM-007`](#BP-PARAM-007)), and nothing else. A connection input is always
required, so one left unbound is `ERR_UNSATISFIED_REQUIRED_INPUT`
([`BP-PARAM-003`](#BP-PARAM-003)). A connection input declares no schema, so
[`BP-PARAM-002`](#BP-PARAM-002) does not compare it. The parameter's `from` must
satisfy [`BP-REF-001`](#BP-REF-001). There is no implicit sharing by input name
or protocol. A `variables` parameter holds one value, and separate variables
cannot assemble a connection.

<a id="BP-CONNECTION-002"></a>**`BP-CONNECTION-002`**: Installation acquires one
immutable, authorized selection per installation identity and connection
parameter. All consumers of that parameter use protocol views of that same
selection. Each view MUST satisfy the requested protocol, capabilities, and
individual input schemas. Failure is `ERR_CONNECTION_INCOMPATIBLE` or
`ERR_VALUE_CONSTRAINT`; never select another provider as fallback. Values enter
the existing input/environment pipeline. No input, output or environment values
are released on incomplete or invalid resolution, including when only one of
several connection parameters fails.

Acquisition distinguishes NOT_ACQUIRED (INCOMPLETE), authoritative NOT_FOUND
(ERR_CONNECTION_NOT_FOUND), DENIED (ERR_CONNECTION_DENIED), INCOMPATIBLE
(ERR_CONNECTION_INCOMPATIBLE), and SELECTED. The synthetic context represents a
SELECTED result with persisted: true and a selection containing identity,
version, installation, parameter, source reference/identity/version, kind
MANAGED or USER, costOwner, credential identity/rotation/value/permittedBaseURLs,
and protocol-keyed views. The source reference MUST equal the connection
parameter's `from`, including for a complete USER replacement. It identifies the
acquisition request, not the selected provider. Managed credential identities
MUST NOT be reused across distinct connection parameters. Each view has baseURL,
model and capabilities. Endpoints are absolute HTTPS URLs without user
information, query or fragment. Every view URL must belong to the credential's
permittedBaseURLs. Context is trusted acquisition evidence, not an authored
mechanism for granting permission. Offline evaluation performs no network or
credential issuance. Malformed evidence is ERR_INVALID_RESOLUTION_CONTEXT.

<a id="BP-CONNECTION-003"></a>**`BP-CONNECTION-003`**: Persist the complete selection
and scoped credential before materialization. Retry and redeploy reuse the selected
identity/version and credential. Changes to organization defaults affect only new
installations. An explicit update replaces the complete selection and produces a
new private snapshot and resolution record. Rotation is durable and idempotent;
clone creates a new installation and distinct scoped credential. Revocation denies
use immediately, regardless of an existing record. Failed attempts must not leave
multiple active credentials or silently change provider on retry.

Overrides use a complete USER selection with its own endpoint, credential and
model; missing members fail. Partial merging with a managed selection is
forbidden. An override arrives through acquisition, never as a submitted
parameter value ([`BP-PARAM-009`](#BP-PARAM-009)). Managed credentials are
scoped to installation, connection parameter and permitted service, not
unrestricted organization provider keys. Credential plaintext and its hashes
MUST NOT appear in published artifacts, forms, public responses, previews or
diagnostics. Installation interfaces disclose the selected connection and cost
owner. Existing organization policy may authorize automated selection without
repeated prompts.

Gateway base paths, upstream providers, default models, quotas, spending limits,
current authorization and durable persistence are platform responsibilities.
Real SDK integration must verify client paths, authentication, streaming, tool
calls and errors. Synthetic fixture credentials establish no production access.

### <a id="install-form"></a>5.4 Install-form presentation

<a id="BP-UI-001"></a>**`BP-UI-001`**: `ui` is optional; when supplied it
requires `label` and rejects unknown properties.

<a id="BP-UI-002"></a>**`BP-UI-002`**: `prominence` is PRIMARY (default) or
SECONDARY.

<a id="BP-UI-003"></a>**`BP-UI-003`**: `enumLabels` names only string
representations of scalar enum members, or of string-array item enum members.
Arrays and objects in a whole-value enum have no `enumLabels` keys.

<a id="BP-UI-004"></a>**`BP-UI-004`**: A form offers each parameter that declares
`ui`, except a generated parameter and a variable parameter: neither is ever an
editable field. A connection parameter with `ui` is offered as one control
choosing a whole selection, never as its endpoint, credential or model. A
connection parameter without `ui` is not offered: installation acquires its
default selection without a form field.

For any other parameter, conceal sensitive values first; then offer enum
choices, string-array item choices, boolean controls, structured JSON editing,
or scalar text entry, in that order. UI examples are never submitted. Optional
parameters without UI may be supplied by an installation API.

Order fields by ascending `ui.order`, unspecified orders last, then parameter
name in UTF-8 order. For shared parameters, help text is the description of the first
receiver by node name then input name; this ordering does not affect validation.
Clients validate logical values; server admission MUST independently validate
them as well. Labels and descriptions do not override contracts.

## <a id="validation-layers"></a>6. Validation layers

Core's explicit profiles and statuses apply. Structural-only success does not
claim publication or deployment validity. Local and published dependencies share
offline semantic checks; acquisition is a separate authorized operation.
Publication completes contract and catalog obligations, [`BP-ID-005`](#BP-ID-005)
and [`BP-GRAPH-001`](#BP-GRAPH-001) among them. Deployment additionally completes
installation resolution, authorization and current capability checks.

## <a id="diagnostics"></a>7. Diagnostics

Core and component diagnostics apply, with these additions:

| Code | Phase | Meaning |
|---|---|---|
| `ERR_COMPONENT_NOT_FOUND` | `semantic` | Local component file is absent. |
| `ERR_REFERENCE_ESCAPE` | `semantic` | Component reference escapes the item. |
| `ERR_INVALID_DEPENDENCY` | `semantic` | Supplied contract is invalid, fails identity/digest verification, or misses a component publication obligation. |
| `ERR_CONFLICTING_NODE_COMPUTE` | `semantic` | A node whose component runs carries no compute, or an external node carries some. |
| `ERR_UNKNOWN_NODE` | `semantic` | Binding names no node. |
| `ERR_NODE_REQUIRED` | `capability` | Publication requires a node this blueprint does not declare. |
| `ERR_UNKNOWN_OUTPUT` | `semantic` | Binding names no producer output. |
| `ERR_UNKNOWN_INPUT` | `semantic` | Binding names no receiver input. |
| `ERR_UNKNOWN_PARAMETER` | `semantic`, `resolution` | Binding or submitted value names no parameter. |
| `ERR_INCOMPATIBLE_TYPE` | `semantic` | Producer type cannot supply consumer. |
| `ERR_UNREFERENCED_COMPONENT` | `semantic` | Item contains an unused component. |
| `ERR_CONFLICTING_INPUT_SCHEMA` | `semantic` | Shared parameter receivers disagree. |
| `ERR_UNBOUND_PARAMETER` | `semantic` | No binding names the parameter. |
| `ERR_UNSATISFIED_REQUIRED_INPUT` | `semantic`, `resolution` | Required input has no binding or default. |
| `ERR_ENDPOINT_NOT_PUBLIC` | `semantic` | Output requires exposure not selected by the blueprint. |
| `ERR_UNKNOWN_ENUM_MEMBER` | `semantic` | UI label names no enum member. |
| `ERR_INVALID_PARAMETER_SOURCE` | `semantic` | A parameter's `from` is not one whole reference. |
| `ERR_INVALID_VOLUME_ALLOCATION` | `semantic` | Volume allocation is absent, unknown or below minimum. |
| `ERR_READINESS_REQUIRED` | `semantic` | Public HTTP-family service has no readiness probe. |
| `ERR_VALUE_CYCLE` | `semantic` | Value dependencies contain a cycle. |
| `ERR_INVALID_CONNECTION_BINDING` | `semantic` | A connection input is bound by something other than a connection parameter, or a connection parameter binds a value input. |
| `ERR_PARAMETER_NOT_SUBMITTABLE` | `resolution` | A submitted value names a generated, variable or connection parameter. |
| `ERR_MISSING_PARAMETER_VALUE` | `resolution` | Required submitted value is absent. |
| `ERR_VARIABLE_NOT_AUTHORIZED` | `resolution` | Installation cannot read the organization variable. |
| `ERR_INVALID_RESOLUTION_CONTEXT` | `resolution` | Resolution context lacks a required identity or version. |
| `ERR_CONNECTION_NOT_FOUND` | `resolution` | Authorized acquisition confirms no selected default exists. |
| `ERR_CONNECTION_DENIED` | `resolution` | Acquisition denies permission to use the connection. |
| `ERR_CONNECTION_INCOMPATIBLE` | `resolution` | Selection cannot satisfy required protocol or capabilities. |

## <a id="conformance"></a>8. Conformance

An implementation declares profiles and runs their family and dependency
fixtures. The resolution profile includes sensitivity, absence, encoding and
credential lifecycle observations. A skipped case is never passed.

## <a id="known-debt"></a>9. Unsupported capabilities

Cross-installation component instances, conditional node sets, runtime job
outputs, startup dependency graphs, recursive templates and arbitrary provider
maps are unsupported. Their declarations are rejected.

## <a id="security"></a>10. Security considerations

Treat documents and dependency artifacts as untrusted. Verify containment,
digests, parser bounds and contracts before resolution. Variable and connection
references select organization data the installation is authorized to read;
they never grant access by themselves. No validation phase fetches a
document-chosen URL. Resolved secrets remain in private materialization channels
and cannot appear in diagnostics or exported resolution records.
