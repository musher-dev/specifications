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
| Fields accepting `null` ([`CORE-ENV-007`](../../core/v1/spec.md#CORE-ENV-007)) | `size` — [§4.3](#node-compute); `spec.parameters.*.default`; `spec.components.*.bindings.*.value` and descendants permitted by receiving schemas — [§5.2](#value-sources) |
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

Nodes live in `spec.components`, keyed by a core label. Each requires
`componentRef` and `size`; at least one node is required.

### <a id="component-reference"></a>4.1 Component reference

A repo-local reference begins ./ or ../ and ends .yaml or .yml. Resolve it
relative to this blueprint; its real path, including symlinks, MUST remain in
the item root. It takes its revision from the component and forbids node
`revision`. A published reference is a UUID and requires positive integer
`revision`.

<a id="BP-REF-002"></a>**`BP-REF-002`** — Local and published contracts undergo the
same structural and semantic checks.
Acquisition is separate: the semantic evaluator MUST NOT fetch dependencies.
Supplied published contracts are keyed by identity and revision, with source
bytes and verified SHA-256 digest. Missing context yields INCOMPLETE; a missing
local file, malformed supplied contract or digest mismatch is INVALID.

All component documents in an item MUST be referenced. A standalone document
without an item root cannot complete item-scoped checks.

### <a id="connections"></a>4.2 Explicit bindings

Each input supplier lives at `components.<node>.bindings.<input>`.
The map key MUST name an input of the consuming component.

| type | Required members | Source |
|---|---|---|
| PARAMETER | parameter | Named installation parameter |
| OUTPUT | node, output | Named component instance output |
| LITERAL | value | Non-secret logical JSON value |
| CONFIG_REF | source | One whole authorized organization configuration reference |

Each branch forbids members of other branches. Duplicate input keys fail during
parsing. There is no override priority between suppliers.

```yaml
bindings:
  llmBaseUrl:
    type: CONFIG_REF
    source: "${{ config.llm.baseUrl }}"
  apiKey:
    type: PARAMETER
    parameter: stripeKey
  databaseUrl:
    type: OUTPUT
    node: database
    output: connectionString
```

`resourceType` is removed. A logical schema constrains values; a source reference
selects supply. The `config` namespace denotes organization configuration
authorized for this installation. Its dotted path is an exact key, not object
traversal or a registry type. Acquisition supplies its identity, version, logical
value and sensitivity. An unavailable value is incomplete; a denied lookup is
invalid. No network lookup occurs during semantic validation.

<a id="BP-CONN-002"></a>**`BP-CONN-002`** — The value-dependency graph MUST be acyclic.
INPUT outputs add dependencies on their named input; OUTPUT bindings add
dependencies on their producer output. Endpoint outputs depend on allocated
addresses, not running processes. Discovery cycles are therefore permitted.
A value cycle fails with `ERR_VALUE_CYCLE`. Traversal MUST terminate.

Old `connections`, `toNode`, `toInput` and name-based coverage are rejected.
Adding an unrelated node MUST NOT change existing recipients.

### <a id="node-compute"></a>4.3 Compute, storage and exposure

<a id="BP-NODE-001"></a>**`BP-NODE-001`** — Every node requires `size`.
<a id="BP-NODE-002"></a>**`BP-NODE-002`** — A workload requires a compute-profile
slug; an external component requires `size: null`.
<a id="BP-NODE-003"></a>**`BP-NODE-003`** — Placement is forbidden on external nodes.

A compute slug is family.tier.size. Families: general, compute, memory, storage,
gpu, accelerator. Tiers: economy, standard, performance, premium. Sizes: nano,
small, medium, large, xlarge. Catalog membership and regional availability are
capability checks. Initial resolution selects a version and pins it; redeploy
uses that version. Updating to the current catalog version is explicit.

`volumes.<name>.sizeGiB` allocates every component volume explicitly, at or above
its positive integer minimum. Unknown or missing allocations fail with
`ERR_INVALID_VOLUME_ALLOCATION`. No storage default is selected implicitly.

`exposure.<endpoint>` is PUBLIC or PRIVATE; omission means PRIVATE.
Unknown names fail with `ERR_UNKNOWN_ENDPOINT`. Public HTTP-family exposure
requires component readiness, otherwise `ERR_READINESS_REQUIRED`.

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
| storageClass | The named storage class is available |
| minStorageIOPS | At least this provisioned IOPS |
| networkClass | The named network class is available |

Numeric pins are positive integers. Terms use the schema's lowercase-token
grammar. Catalog terms and their provider mappings are versioned context, not
author-defined escape hatches. Missing context is INCOMPLETE. An unsupported
term or no eligible host rejects capability admission; neither is silently
ignored. The selected profile version and allocations are pinned by the
resolution record. A future meaning change to a pin is a specification change,
even if its spelling still passes structural validation.

## <a id="parameters"></a>5. Installation parameters

Parameters are named installation values, independent of form presentation.
They declare optional `default`, `generator`, and `ui`.
Default and generator are mutually exclusive. Parameters declare no independent
schema; their explicitly bound receiving inputs own the value contract.

### <a id="coverage"></a><a id="derivation"></a><a id="merge"></a><a id="authored-parameters"></a>5.1 Recipients

<a id="BP-PARAM-001"></a>**`BP-PARAM-001`** — Every parameter must be referenced by
at least one PARAMETER binding; otherwise `ERR_UNBOUND_PARAMETER`.
<a id="BP-PARAM-002"></a>**`BP-PARAM-002`** — Shared parameters require equal
logical schemas, ignoring mapping order. Otherwise `ERR_CONFLICTING_INPUT_SCHEMA`.
Descriptions, target locations and input defaults do not define shared identity.
Sensitivity is the union of the receiving contracts and the supplied value.

<a id="BP-PARAM-003"></a>**`BP-PARAM-003`** — Without a binding, an input uses its
component default, remains absent if optional, or fails with
`ERR_UNSATISFIED_REQUIRED_INPUT`. A bound but unavailable source never selects
the input default.

<a id="BP-PARAM-006"></a>**`BP-PARAM-006`** — OUTPUT bindings name an existing node.
<a id="BP-PARAM-007"></a>**`BP-PARAM-007`** — Every binding names an existing input;
PARAMETER and OUTPUT sources name existing declarations.

### <a id="value-sources"></a>5.2 Supply and resolution

<a id="BP-PARAM-004"></a>**`BP-PARAM-004`** — A generator produces a sensitive
string. Submitted overrides fail with `ERR_GENERATED_OVERRIDE`.
`byteLength` is an integer from 16 to 64, default 32. Generate that many
cryptographically secure random bytes. `encoding` defaults to HEX (lowercase);
BASE64 uses the standard padded alphabet; BASE64URL uses the URL-safe alphabet
without padding. Custom alphabets are unsupported. The generated string must
satisfy every receiving schema; failing a constraint must not regenerate it.

<a id="BP-PARAM-005"></a>**`BP-PARAM-005`** — Parameter defaults are logical literals,
without interpolation. Submitted values override parameter defaults. Unknown submitted parameter keys
are rejected before defaults are applied; a misspelling cannot be silently ignored. Unknown submitted keys fail with
`ERR_UNKNOWN_PARAMETER` before defaults are applied. No submitted
value and no parameter default is `ERR_MISSING_PARAMETER_VALUE` at installation.
<a id="BP-PARAM-008"></a>**`BP-PARAM-008`** — All statically known supply values must
satisfy receivers. Dynamic values are checked after resolution, before execution.
Producer and consumer logical types must match, except integer may supply number.
This is conservative type compatibility, not proof of schema containment.

<a id="BP-REF-001"></a>**`BP-REF-001`** — CONFIG_REF.source contains exactly one whole
`config` reference under core's grammar. It cannot concatenate, interpolate
other values, select a component or fall back. Component endpoint references
are defined by component and consumed through explicitly named outputs.

<a id="BP-RESOLVE-001"></a>**`BP-RESOLVE-001`** — Resolution completes these steps
before any workload starts: validate pinned contracts; select compute, storage
and exposure; allocate endpoint addresses; obtain submitted/configured/persisted
generated values; evaluate value dependencies; validate every input and output;
encode workload environment values. Incomplete or invalid resolution forbids
execution. A missing required installation parameter is invalid; missing
external context is incomplete. An output forwarding an absent optional input
fails with `ERR_UNSATISFIED_REQUIRED_INPUT` at the output.

Generated credentials are created once per installation identity, parameter
identity and non-negative rotation generation. Atomic durable get-or-create
persists them before use. Retries and updates reuse them. Rotation explicitly
increments the generation. Renaming an identity requires an explicit migration
or a new credential; reconciliation cannot silently rotate it.

#### <a id="resolution-record"></a>Generated resolution record

The record is generated, not an authored override layer. Its version is 1.
The private installation snapshot uses formatVersion 1 and an immutable opaque
identity/version. It persists submitted parameter values, selected configuration
values and identity/version pairs, credential references and rotation generations,
endpoint allocations, and any selected connections. Its sensitive values are
private and never hashed into the public record. Reusing an identity/version for
changed state is forbidden; any selected value or dependency change produces a
new snapshot version and a new record. A record pins the snapshot identity/version.

Record acceptance parses and validates its blueprint, resolves its pinned
component artifacts, and verifies exact node sets, identities, revisions,
artifact digests, source kinds, compute identities, volumes and exposure choices.
Pinned image digests and authored Git commits must agree. Selected configuration
and generated-credential maps must match their declarations and the private
snapshot. Required endpoint allocation identities must be present. Replaying the
snapshot must successfully resolve the blueprint without unpersisted selections.
Exact specification dependency manifests must name all declared dependencies and
agree on shared editions; missing dependencies or extra unrelated families fail.

Its executable shape is `#/$defs/BlueprintResolutionRecord` in the self-contained
blueprint bundle. It is a generated JSON artifact, not another Musher document
kind. Unknown record fields are rejected.
It contains blueprint digest; exact specification releases and dependency
editions; node component identity, revision and artifact digest; image digest
for every running node; resolved Git commit for Git builds; compute identity
and version; allocated volumes and exposure; configuration identity/version
pairs and credential identity/rotation references. Each component records source
IMAGE, GIT or EXTERNAL. External nodes forbid
image/commit/compute fields and have empty volume/exposure maps. All other nodes
require image digest and compute identity/version; GIT additionally requires the
full commit object ID. No secret plaintext or secret-content hashes are included.

The required installationSnapshot contains an opaque identity and immutable
version of private state. That private snapshot has formatVersion 1 and covers
submitted parameters, configuration versions, generated credentials, endpoint
allocations and connection selections, including source-policy revisions. Its
physical storage format is implementation-defined. No public secret-derived hash
stands in for that identity. Changing a selected value, rotation or allocation
requires a new snapshot version and record. Persist before materialization.
Before accepting a record, validate the blueprint and referenced contracts and
reconcile the exact node set, identities/revisions/digests, workload sources,
allocation choices, acquired dependencies and specification release graph.
Schema validity alone is insufficient. The same accepted record MUST identify
the same effective configuration, not identical behavior from external services.

A Git commit alone does not establish build reproducibility; the resulting
image digest is required. Redeploy uses the existing record and fails when a
pinned dependency is unavailable. Updating produces a new record explicitly.
Operational eligibility can change independently, but cannot rewrite the record.

### <a id="atomic-connections"></a>5.3 Atomic connection slots

`spec.connectionSources` maps slot names to `{ source: "${{ config.llm.default }}" }`.
Each source is one whole config reference identifying a connection, not a scalar
lookup. Slot and requirement names use the input-name grammar. Each node's
`connectionBindings` maps component requirement names to `{ source: slotName }`.

<a id="BP-CONNECTION-001"></a>**`BP-CONNECTION-001`** — Every component connection
requirement MUST have exactly one explicit slot binding. Unknown slots or
requirements, unused slots, or ordinary bindings to group-owned inputs fail with
`ERR_INVALID_CONNECTION_BINDING`. A source reference must satisfy BP-REF-001.
There is no implicit sharing by input name or protocol. Ordinary CONFIG_REF
bindings remain independent scalar lookups and cannot assemble a connection.

<a id="BP-CONNECTION-002"></a>**`BP-CONNECTION-002`** — Installation acquires one
immutable, authorized selection per installation identity and named slot. All
consumers of that slot use protocol views of that same selection. Each view MUST
satisfy the requested protocol, capabilities, and individual input schemas.
Failure is `ERR_CONNECTION_INCOMPATIBLE` or `ERR_VALUE_CONSTRAINT`; never select
another provider as fallback. Values enter the existing input/environment pipeline.
No input, output or environment values are released on incomplete or invalid
resolution, including when only one of several slots fails.

Acquisition distinguishes NOT_ACQUIRED (INCOMPLETE), authoritative NOT_FOUND
(ERR_CONNECTION_NOT_FOUND), DENIED (ERR_CONNECTION_DENIED), INCOMPATIBLE
(ERR_CONNECTION_INCOMPATIBLE), and SELECTED. The synthetic context represents a
SELECTED result with persisted: true and a selection containing identity, version,
installation, slot, source reference/identity/version, kind MANAGED or USER, costOwner,
credential identity/rotation/value/permittedBaseUrls, and protocol-keyed views.
The source reference MUST equal the authored slot source, including for a complete
USER replacement. It identifies the acquisition request, not the selected provider.
Managed credential identities MUST NOT be reused across distinct slots.
Each view has baseUrl, model and capabilities. Endpoints are absolute HTTPS URLs
without user information, query or fragment. Every view URL must belong to the
credential's permittedBaseUrls. Context is trusted acquisition evidence, not an
authored mechanism for granting permission. Offline evaluation performs no network
or credential issuance. Malformed evidence is ERR_INVALID_RESOLUTION_CONTEXT.

<a id="BP-CONNECTION-003"></a>**`BP-CONNECTION-003`** — Persist the complete selection
and scoped credential before materialization. Retry and redeploy reuse the selected
identity/version and credential. Changes to organization defaults affect only new
installations. An explicit update replaces the complete selection and produces a
new private snapshot and resolution record. Rotation is durable and idempotent;
clone creates a new installation and distinct scoped credential. Revocation denies
use immediately, regardless of an existing record. Failed attempts must not leave
multiple active credentials or silently change provider on retry.

Overrides use a complete USER selection with its own endpoint, credential and
model; missing members fail. Partial merging with a managed selection is forbidden.
Managed credentials are scoped to installation, slot and permitted service, not
unrestricted organization provider keys. Credential plaintext and its hashes MUST
NOT appear in published artifacts, forms, public responses, previews or diagnostics.
Installation interfaces disclose the selected connection and cost owner. Existing
organization policy may authorize automated selection without repeated prompts.

Gateway base paths, upstream providers, default models, quotas, spending limits,
current authorization and durable persistence are platform responsibilities.
Real SDK integration must verify client paths, authentication, streaming, tool
calls and errors. Synthetic fixture credentials establish no production access.

### <a id="install-form"></a>5.4 Install-form presentation

<a id="BP-UI-001"></a>**`BP-UI-001`** — UI is optional; when supplied it requires
label and rejects unknown properties.
<a id="BP-UI-002"></a>**`BP-UI-002`** — Prominence is PRIMARY (default) or SECONDARY.
<a id="BP-UI-003"></a>**`BP-UI-003`** — enumLabels names only string representations
of scalar enum members, or of string-array item enum members.
Arrays/objects in a whole-value enum have no enumLabels keys.

A form shows parameters with UI and no generator. Conceal sensitive values first;
then offer enum choices, string-array item choices, boolean controls, structured
JSON editing, or scalar text entry, in that order. UI examples are never submitted.
Optional parameters without UI may be supplied by an installation API.
Generated values are never editable form fields.

Order fields by ascending ui.order, unspecified orders last, then parameter name
in UTF-8 order. For shared parameters, help text is the description of the first
receiver by node name then input name; this ordering does not affect validation.
Clients validate logical values; server admission MUST independently validate
them as well. Labels and descriptions do not override contracts.

## <a id="validation-layers"></a>6. Validation layers

Core's explicit profiles and statuses apply. Structural-only success does not
claim publication or deployment validity. Local and published dependencies share
offline semantic checks; acquisition is a separate authorized operation.
Publication completes contract and catalog obligations. Deployment additionally
completes installation resolution, authorization and current capability checks.

## <a id="diagnostics"></a>7. Diagnostics

Core and component diagnostics apply, with these additions:

| Code | Phase | Meaning |
|---|---|---|
| `ERR_COMPONENT_NOT_FOUND` | `semantic` | Local component file is absent. |
| `ERR_REFERENCE_ESCAPE` | `semantic` | Component reference escapes the item. |
| `ERR_INVALID_DEPENDENCY` | `semantic` | Supplied contract is invalid or fails identity/digest verification. |
| `ERR_CONFLICTING_NODE_COMPUTE` | `semantic` | Compute does not match workload presence. |
| `ERR_UNKNOWN_NODE` | `semantic` | Binding names no node. |
| `ERR_UNKNOWN_OUTPUT` | `semantic` | Binding names no producer output. |
| `ERR_UNKNOWN_INPUT` | `semantic` | Binding names no receiver input. |
| `ERR_UNKNOWN_PARAMETER` | `semantic`, `resolution` | Binding or submitted value names no parameter. |
| `ERR_INCOMPATIBLE_TYPE` | `semantic` | Producer type cannot supply consumer. |
| `ERR_UNREFERENCED_COMPONENT` | `semantic` | Item contains an unused component. |
| `ERR_CONFLICTING_INPUT_SCHEMA` | `semantic` | Shared parameter receivers disagree. |
| `ERR_UNBOUND_PARAMETER` | `semantic` | Parameter has no explicit recipient. |
| `ERR_UNSATISFIED_REQUIRED_INPUT` | `semantic`, `resolution` | Required input has no binding or default. |
| `ERR_ENDPOINT_NOT_PUBLIC` | `semantic` | Output requires exposure not selected by the blueprint. |
| `ERR_UNKNOWN_ENUM_MEMBER` | `semantic` | UI label names no enum member. |
| `ERR_INVALID_CONFIG_REFERENCE` | `semantic` | Config source is not one whole permitted reference. |
| `ERR_INVALID_VOLUME_ALLOCATION` | `semantic` | Volume allocation is absent, unknown or below minimum. |
| `ERR_READINESS_REQUIRED` | `semantic` | Public HTTP-family service has no readiness probe. |
| `ERR_VALUE_CYCLE` | `semantic` | Value dependencies contain a cycle. |
| `ERR_GENERATED_OVERRIDE` | `resolution` | Submitted value attempts to replace generated supply. |
| `ERR_MISSING_PARAMETER_VALUE` | `resolution` | Required submitted value is absent. |
| `ERR_CONFIG_NOT_AUTHORIZED` | `resolution` | Installation cannot access configuration. |
| `ERR_INVALID_RESOLUTION_CONTEXT` | `resolution` | Resolution context lacks a required identity or version. |

| `ERR_INVALID_CONNECTION_BINDING` | `semantic` | Unknown, missing, unused or conflicting grouped supplier. |
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
digests, parser bounds and contracts before resolution. Configuration references
select authorized organization data; they never grant access by themselves.
No validation phase fetches a document-chosen URL. Resolved secrets remain in
private materialization channels and cannot appear in diagnostics or exported
resolution records.
