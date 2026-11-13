# Musher Blueprint Document Specification, version 2

**Status:** Stable
**Family:** `blueprint`
**Schema:** `https://specifications.musher.dev/blueprint/v2/blueprint.schema.json`

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) when, and only when, they
appear in all capitals, as shown here.

> **What is normative.** This document, together with the
> [Musher Document Core Specification](../../core/v2/spec.md) it applies,
> defines the complete behaviour of the blueprint family. The JSON Schema
> bundle is its executable form for structural validity, and the
> [conformance corpus](../../../docs/conformance.md) is its executable form for
> observable outcomes. Both are normative, and neither is permitted to disagree
> with this document or with the other. Schema `description` fields, examples,
> generated documentation, and validator message text are informative.
>
> A disagreement between two normative artifacts is a defect in this
> specification and blocks a release. Until it is fixed this document governs.
> That is how to read a broken specification, not a licence for the schema to
> be wrong.

---

## <a id="scope"></a>1. Scope

A **blueprint** is a graph of nodes. Each node deploys one
[component](../../component/v2/spec.md), with the compute, storage, exposure
and bindings that this use gives it, and the blueprint names every value a
deployment takes from outside the documents. The blueprint is the unit of
deployment.

**Out of scope for this document**

- One workload's own definition: the `component` family.
- Catalog presentation: the `listing` family.
- API request and response bodies, including the optimistic-lock row version
  carried by a declarative-apply call: the Musher API. A document a person
  writes into a repository does not carry a row version; see [§3](#identity).
- The `apiVersion: musher.dev/v1`, `kind: App` shape read by `musher deploy`.
  [ADR 0001](../../../docs/adr/0001-canonical-repository-architecture.md) §2
  declines to ratify it. It is superseded by a `blueprint` document paired with
  its `component` documents, which the item-local reference of
  [§4.1](#component-reference) makes expressible.

### <a id="terms"></a>1.1 Terms

- A **node** is a named use of one component inside a blueprint, together with
  the compute, storage, exposure and bindings this use gives it
  ([§4](#node-graph)). "Node" never means a host machine; this document says
  "host" for that.
- The **node graph** is a blueprint's nodes and the bindings between them
  ([§4](#node-graph)).
- A **document reference** is a node's `componentRef`: an **item-local
  reference**, a relative path to a component document in the same catalog
  item, or a **catalog reference**, a component's UUID with a revision, which
  resolves against the deploying organization's library and the catalog
  ([§4.1](#component-reference)). The name is the reference's form: the
  component it names need not be listed.
- A **binding** supplies one input of one node from an origin
  ([§4.2](#bindings)).
- An **origin** is where a value comes from. A binding's origin is a deployment
  parameter, an output of a node, or a literal value; a deployment parameter's
  origin is one of the six parameter kinds of [§5](#parameters).
- A **deployment** is one blueprint revision instantiated for an organization.
  Its **deployer** is the person who creates or changes it, and its **creator**
  is the person who created it.
- A **rollout** is one applied generation of a deployment: the workloads
  started from one resolution record. A rollout is **active** once every node
  it starts has reached the condition [§4.6](#start-order) defines.
- A **deployment parameter** is a named value the deployment takes from outside
  the documents ([§5](#parameters)).
- A **connection** is component's term
  ([component v2 §1.1](../../component/v2/spec.md#terms)). A binding supplies
  an input from an origin; a connection is one origin kind, reached through a
  connection parameter ([§5.3](#connections)).
- A **selection** is the connection that acquisition chose for one connection
  parameter. Its **selection kind** is `MANAGED`, supplied and operated by
  Musher, or `USER`, a complete set of members the deployer supplies. A managed
  selection is **granted**, access to a service that outlives the deployment,
  or **provisioned**, a service created for this deployment
  ([§5.3](#connections)).
- A **placement constraint** narrows the hosts eligible for a node's compute
  profile without changing it ([§4.4](#placement-constraints)).
- A **catalog value** is a value of a catalog vocabulary, such as a CPU
  architecture or a storage class, matching `^[a-z0-9][a-z0-9_-]*$` and at most
  64 characters.
  "Token" means only a credential token, such as a bearer token or a JWT.
- An **optional parameter** is a submitted parameter that a deployment can be
  created without: it carries a `default`, or every input it binds is optional
  ([§5.4](#deploy-form)).
- **Resolution** is the `resolution` phase of a deployment: the stages that pin
  each node's source, read every origin, build each git or upload source and
  produce the **resolution record**
  and the private **deployment snapshot** ([§5.2](#resolution-record)).
- The **deploy form** is the form a deployer fills to create a deployment
  ([§5.4](#deploy-form)).

### <a id="migration"></a>1.2 Migration from v1

v1 is retired: its releases stay recorded and served, and v2 supersedes it
([ADR 0038](../../../docs/adr/0038-v2-one-vocabulary-and-v1-retires.md)). A v1
blueprint becomes a v2 blueprint by the renames below. Old identifiers are
written plainly here because v2 declares none of them.

<!-- vale MusherSpecifications.Terms = NO -->

| v1 | v2 | Why |
|---|---|---|
| specVersion v1 | `specVersion: v2` | A new major version ([core v2 §3](../../core/v2/spec.md#compatibility)) |
| spec.components | `spec.nodes` | It holds nodes; a component is the definition a node deploys |
| resolution record components | `nodes` | The same reason |
| installationSnapshot | `deploymentSnapshot` | "Deployment" is the one lifecycle noun |
| deployment.installer.identity, .email, .name | `deployment.creator.identity`, `.email`, `.name` | The fact is captured once, when the deployment is created, and names its creator |
| access AUTHENTICATED | `access: RESTRICTED` | Only viewers who sign in and whom the deployment's access policy admits are forwarded; signing in alone is not enough |
| a component endpoint's accessExemptions: {paths, bearer} | `exemptibleRequests: {paths, bearerToken}`, read by the blueprint's `accessExemptions` | The component offers; the blueprint grants |
| record source IMAGE, GIT, EXTERNAL | adds `UPLOAD`, and the fields `uploadDigest`, `recipeDigest` and `builderDigest` | Uploaded source and the build recipe ([ADR 0040](../../../docs/adr/0040-source-and-build-recipe.md)) |
| record blueprintDigest and node digest, 64 hexadecimal digits | `sha256:` and 64 hexadecimal digits | Every digest in the record names its algorithm |
| record specifications admitting listing | `core`, `component` and `blueprint` only | A resolution depends on no listing release |
| resolution stages parameters to record | `sources` first, and `build` after `values` | A node's content is pinned before anything is read, and built once the values its build secrets read are resolved ([ADR 0040](../../../docs/adr/0040-source-and-build-recipe.md)) |
| connection protocols for language models only | any protocol component §6.4 defines | Connections for any protocol ([ADR 0039](../../../docs/adr/0039-provenance-is-chosen-at-deployment.md)) |
| BP-REF-001 | `BP-PLACEHOLDER-001` | A `${{ }}` is a placeholder; "reference" means a document reference. `BP-REF-002` and `BP-REF-003` keep their IDs |
| BP-CONN-002, BP-CONN-003 | `BP-BIND-002`, `BP-BIND-003` | They are binding rules; "connection" names the concept of [§5.3](#connections) |
| BP-PARAM-006, BP-PARAM-007 | `BP-BIND-006`, `BP-BIND-007` | They govern what a binding names |
| ERR_CONFLICTING_NODE_COMPUTE | `ERR_COMPUTE_REQUIRED` (missing) and `ERR_COMPUTE_FORBIDDEN` (on `EXTERNAL`) | One code per condition |
| ERR_UNKNOWN_INPUT, declared here | `ERR_UNKNOWN_INPUT`, declared once by component and reused | One code for naming an undeclared input |
| ERR_UNSATISFIED_REQUIRED_INPUT reported at an output | `ERR_INPUT_NOT_GUARANTEED` | The condition is an output forwarding an input that may be absent |
| ERR_INVALID_PARAMETER_SOURCE | `ERR_INVALID_PARAMETER_ORIGIN` | "Origin" is the one word for where a value comes from; "source" means a workload source |
| ERR_INVALID_HASH_SOURCE | `ERR_INVALID_HASHED_PARAMETER` | It names what is wrong: the parameter a hash names |
| ERR_SECRET_LITERAL | `ERR_SENSITIVE_LITERAL` | It fires for every sensitive value (component §11) |
| ERR_MALFORMED_REFERENCE, ERR_UNKNOWN_REFERENCE_NAMESPACE, ERR_REFERENCE_NOT_IN_SCOPE | `ERR_MALFORMED_PLACEHOLDER`, `ERR_UNKNOWN_PLACEHOLDER_NAMESPACE`, `ERR_NAMESPACE_NOT_PERMITTED` | Core's renames ([core v2 §1.4](../../core/v2/spec.md#migration)) |
| phase capability | phase `admission` | Core's rename |
| a connections member, a toNode or toInput binding | still rejected, as `ERR_UNKNOWN_FIELD` | The edge-shaped connection was retired before v1; the shape is named here and nowhere else |
| §4 Component graph | [§4 Node graph](#node-graph) | It is a graph of nodes |
| repo-local and published references | item-local and catalog references ([§4.1](#component-reference)) | They name where the document is |
| §5 Installation parameters | [§5 Deployment parameters](#parameters) | "Deployment" is the one lifecycle noun |
| §5.2 Supply and resolution | [§5.2 Origins and resolution](#origins) | "Origin" is the one word |
| §5.3 Atomic connections | [§5.3 Connections](#connections) | Atomicity stays in the definition |
| §5.4 Install-form presentation | [§5.4 Deploy form](#deploy-form) | The same reason as §5 |
| §6 Validation layers | [§6 Validation phases](#validation-phases) | Core's term |
| §9 Unsupported capabilities | [§9 Not supported in v2](#not-supported) | Each row says how it would close |
| installation, installer, placement pin, storage class term, logical schema, supplier | deployment, deployer, placement constraint, catalog value, value schema, origin | One term for each concept ([§1.1](#terms)). "Token" means only a credential token |
| the paragraph on never-submitted parameters under BP-PARAM-009 | [`BP-PARAM-013`](#BP-PARAM-013) | A rule a document can violate carries its own ID |
| the item-local reference's file and containment, under BP-REF-002 | [`BP-REF-004`](#BP-REF-004), [`BP-REF-005`](#BP-REF-005) | The same reason |
| the never-sensitive `value` binding and parameter `default`, stated in tables | [`BP-BIND-008`](#BP-BIND-008), [`BP-PARAM-014`](#BP-PARAM-014) | The same reason |
| catalog membership, region, placement and storage as admission prose | [`BP-NODE-009`](#BP-NODE-009) to [`BP-NODE-012`](#BP-NODE-012) | Every admission check carries an ID and a code |

<!-- vale MusherSpecifications.Terms = YES -->

Every requirement ID not listed keeps its number and its meaning. Every
section that was renamed keeps its v1 anchor beside its new one.

## <a id="envelope"></a>2. Document envelope

```yaml
specVersion: v2
kind: BLUEPRINT
metadata: { slug: …, revision: …, description: … }
spec: { parameters: {…}, nodes: {…} }
```

A blueprint is a Musher document as the
[Musher Document Core Specification](../../core/v2/spec.md) defines one, and
every rule of core v2 applies to it. This family fixes what
[core v2 §1.1](../../core/v2/spec.md#family-fixes) leaves to a family:

| Left to the family | This family |
|---|---|
| `kind` ([`CORE-ENV-002`](../../core/v2/spec.md#CORE-ENV-002)) | `BLUEPRINT` |
| `metadata` ([`CORE-ENV-003`](../../core/v2/spec.md#CORE-ENV-003)) | [§3](#identity) |
| Fields accepting `null` ([`CORE-ENV-007`](../../core/v2/spec.md#CORE-ENV-007)) | `spec.parameters.*.default`; `spec.nodes.*.bindings.*.value` and descendants permitted by receiving schemas ([§4.2](#bindings)) |
| Item document ([core v2 §4.1](../../core/v2/spec.md#item-directory)) | `blueprint.yaml` |

This specification narrows core v2 where it says so and relaxes it nowhere. It
cites core by its major version ("core v2 §N"), and the core release a
blueprint release was built and tested against is recorded with that release
([core v2 §9](../../core/v2/spec.md#core-releases)).

**Normative dependencies**

| Specification | Major version |
|---|---|
| [core](../../core/v2/spec.md) | v2 |
| [component](../../component/v2/spec.md) | v2 |

The compatibility guarantee of
[core v2 §3](../../core/v2/spec.md#compatibility) runs, for this family, from
`2.0.0`.

## <a id="identity"></a>3. Identity

`metadata` carries `slug`, `revision` and `description`, and nothing else. A
record identifier and a row version, the `id` and `rowVersion` an API
carries on a declarative apply, describe a row in a control plane, not a
document. They MUST NOT appear on a blueprint, and a validator MUST reject them
with `ERR_UNKNOWN_FIELD` like any other unknown property.

<a id="description"></a><a id="BP-ID-004"></a>**`BP-ID-004`**: A `description`
says what the blueprint deploys, in one or two sentences of plain text, 1 to
280 characters, the limit of a
[listing summary](../../listing/v2/spec.md#presentation). A consumer MUST NOT
render it as Markdown. Structural: an empty description, or one longer than
280 characters, is `ERR_INVALID_VALUE` at `/metadata/description`. The rule
binds a description that is present; whether one has to be present is
`BP-ID-005`.

<a id="BP-ID-005"></a>**`BP-ID-005`**: A published blueprint MUST carry a
`description`. Admission: one absent at publication is
[`ERR_DESCRIPTION_REQUIRED`](../../component/v2/spec.md#diagnostics) at
`/metadata`. The reasoning is
[component §4](../../component/v2/spec.md#COMP-DESC-003)'s and is not restated:
an unwritten description is a blueprint someone is still writing, and only a
publisher can tell that from one that is finished.

The description is for the people who deploy and operate the blueprint. It is
not catalog copy: that is the sibling listing's `summary`, and neither is
derived from the other.

**`revision` counts publications of the catalog item.** It is an integer, 1 or
greater, REQUIRED and never defaulted. Like a component's
([component §4](../../component/v2/spec.md#metadata)) it names a position in one
lineage and nothing more: nothing is derivable from the distance between 2 and
7, and nothing is promised about how one revision of an item behaves against
another. It orders, and that is the whole of its job.

**It is the item's only revision.** A blueprint is the one item document that
carries one: [listing §3](../../listing/v2/spec.md#identity) says why the
sibling listing carries none, and component §4 says why the component documents
beneath the item count something else. An item holding no blueprint therefore
has no item revision at all, and is ordered by the components it publishes.

Two rules bind the item together. Both are semantic, and both are measured
against the item root [§3.1](#item-directory) locates. The first is stated once
for every family in
[core v2 §4.2](../../core/v2/spec.md#item-identity):
[`CORE-ITEM-001`](../../core/v2/spec.md#CORE-ITEM-001) binds `metadata.slug` to
the item directory name. The second is this family's:

| ID | Rule | Phase | Diagnostic |
|---|---|---|---|
| <a id="BP-ID-003"></a>`BP-ID-003` | Every [component document of the item](../../core/v2/spec.md#component-documents) MUST be referenced by some node. | `semantic` | `ERR_UNREFERENCED_COMPONENT` at `/spec/nodes` |

Deciding which files are component documents reads every YAML file of the item
outside `media/`, and a file that does not parse is
[`CORE-ITEM-002`](../../core/v2/spec.md#CORE-ITEM-002)'s `ERR_INVALID_YAML`,
never a silently skipped file.

**An unreferenced component document is an error, not dead weight.** A
component nothing references is not deployed, not checked against any node,
and not visible to a reader working out what the item contains. Permitted, it
accumulates: last publication's `postgres.yaml` sitting beside the one actually
in use, with nothing in the directory saying which is live. The diagnostic
anchors at `/spec/nodes`, the mapping that should have named the file, because
a JSON Pointer addresses this document, and the file it is complaining about is
not in it.

**What v2 does not constrain.** An item holding a `blueprint.yaml` and no
`listing.yaml` is not rejected. Nothing in
[core v2 §4.2](../../core/v2/spec.md#item-identity) requires the sibling listing
[§3.1](#item-directory) shows: an item with no listing is one published to a
library and not listed in the catalog
([core v2 §1.3](../../core/v2/spec.md#terms)), deployable and not browsable,
rather than one that is malformed. Nothing orders
one item's revisions against another's either, and nothing checks a blueprint
revision against the lineage it extends: `minimum: 1` is the whole of the rule
before admission. Component §4 carries an admission rule for a component's
lineage ([`COMP-ID-001`](../../component/v2/spec.md#COMP-ID-001)), and this
family has no analogue of it. This family's admission rules are `BP-ID-005`,
about the description, [`BP-GRAPH-001`](#BP-GRAPH-001), about the graph, and
[`BP-NODE-009`](#BP-NODE-009) to [`BP-NODE-012`](#BP-NODE-012), about the
compute, placement and storage the platform offers. None is about the lineage.

### <a id="item-directory"></a>3.1 The item directory

A blueprint and its sibling listing are the item documents of one
[catalog item](../../core/v2/spec.md#item-directory).

```
<slug>/
  blueprint.yaml        this document
  listing.yaml          the sibling listing, once the item is in the catalog
  components/           the component documents the nodes reference
  media/                icon and screenshots
```

`blueprint.yaml` is this family's item document, so the directory containing it
is the **item root** [core v2 §4.1](../../core/v2/spec.md#item-directory)
defines. It is what §3's rules are measured against, what
[§4.1](#component-reference) means by containment, and what
[listing §5](../../listing/v2/spec.md#media) resolves a media path inside.

Only two names in that tree are fixed: `blueprint.yaml` and `listing.yaml`.
Component documents MAY sit anywhere under the root: `components/` is a
convention, and [§4.1](#component-reference) accepts a flat sibling equally.
`media/` is fixed too, but by the listing family rather than by this one.

A blueprint handed over with no directory has no item root, so
[core v2 §4.1](../../core/v2/spec.md#item-directory) forbids reporting any of
§3's item rules for it. [§4.1](#component-reference) draws the same line for the
item-local reference, for the same reason.

## <a id="node-graph"></a><a id="components"></a>4. Node graph

Nodes live in `spec.nodes`, keyed by a name in the
[DNS-label grammar](../../core/v2/spec.md#dns-label-grammar). Each node requires
`componentRef`, and a node whose component runs also requires `compute`
([§4.3](#node-compute)). `nodes` itself is REQUIRED, and structurally it MAY be
empty.

<a id="BP-GRAPH-001"></a>**`BP-GRAPH-001`**: A published blueprint MUST declare
at least one node. Admission: an empty `nodes` at publication is
`ERR_NODE_REQUIRED` at `/spec/nodes`. The reasoning is
[component §4](../../component/v2/spec.md#COMP-DESC-003)'s and is not restated:
an empty graph is a blueprint someone is still writing, and only a publisher
can tell that from one that is finished. A validator that stops before
admission therefore MUST NOT report `ERR_NODE_REQUIRED`.

```yaml
nodes:
  web:
    componentRef: ./components/web.yaml
    compute:
      profile: general.standard.small
      placement: { cpuDedication: dedicated }
    volumes:
      uploads: { sizeGiB: 20, storageClass: local-nvme }
    exposure: { web: PUBLIC }
    bindings:
      databaseURL: { node: db, output: url }
      siteTitle: { parameter: siteTitle }
```

| Member | Holds | Section |
|---|---|---|
| `componentRef`, `revision` | The component document the node deploys | [§4.1](#component-reference) |
| `bindings` | The origin of each input | [§4.2](#bindings) |
| `compute` | The compute profile and its placement constraints | [§4.3](#node-compute), [§4.4](#placement-constraints) |
| `volumes` | The storage allocated to each volume | [§4.3](#node-compute) |
| `exposure` | The exposure of each endpoint, and who may reach it | [§4.3](#node-compute), [§4.5](#access) |
| `startAfter` | The nodes this node waits for before it starts | [§4.6](#start-order) |

### <a id="component-reference"></a>4.1 Component reference

`componentRef` is a document reference in one of two forms:

- An **item-local reference** begins `./` or `../` and ends `.yaml` or `.yml`.
  It resolves relative to this blueprint, and its real path, including
  symbolic links, remains in the item root ([`BP-REF-005`](#BP-REF-005)). It
  takes its revision from the component document and forbids `revision` on the
  node.
- A **catalog reference** is a component's UUID, written in lowercase
  hexadecimal as `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`, and the node requires a
  positive integer `revision`. An uppercase UUID is no reference:
  `ERR_INVALID_VALUE` at `componentRef`, structural.

Which published components a catalog reference can name is platform policy,
not a rule of this document: the platform resolves one against the deploying
organization's library and the catalog
([core v2 §1.3](../../core/v2/spec.md#terms)), and never against another
organization's library. A component need not be listed to be referenced, and
the validation phases see only the components the context supplies
([`BP-REF-002`](#BP-REF-002)).

<a id="BP-REF-002"></a>**`BP-REF-002`**: Item-local and catalog components
undergo the same structural and semantic checks. Acquisition is separate: the
semantic phase MUST NOT fetch a dependency. Supplied catalog components are
keyed by identity and revision, with the document's bytes and their verified
SHA-256 digest. Semantic, at the node's `componentRef`: a catalog component the
context does not supply is deferred under this rule, and the result is
INCOMPLETE; a supplied component whose bytes do not match its digest, that is
not a valid component document, or whose `metadata.revision` is not the node's
`revision`, is `ERR_INVALID_DEPENDENCY`. Every rule that reads the component a
node deploys is deferred, not passed, while that component is unavailable.

<a id="BP-REF-004"></a>**`BP-REF-004`**: An item-local reference MUST name a
file that exists. Semantic: `ERR_COMPONENT_NOT_FOUND` at the node's
`componentRef`. A blueprint with no item root defers it under `BP-REF-002`.

<a id="BP-REF-005"></a>**`BP-REF-005`**: The real path of an item-local
reference, every symbolic link resolved, MUST lie inside the item root, whether
or not a file is there: a dangling link that resolves outside the root is an
escape too ([core v2 §11](../../core/v2/spec.md#security)). Semantic:
`ERR_REFERENCE_ESCAPE` at the node's `componentRef`, decided before
`BP-REF-004`, so an escaping reference is never reported as missing.

<a id="BP-REF-003"></a>**`BP-REF-003`**: The component a node deploys MUST meet
component's publication obligations
([component §5](../../component/v2/spec.md#publication-obligations)), whether it
is item-local or named by a catalog reference. A component may be stored unfinished, but a
node deploys it as it will run: one with no workload, source, endpoint, command
or output has nothing to run, and an input with no description gives the
deployer nothing to read ([§5.4](#deploy-form)). Semantic, in every validation
scope: a component that misses one is `ERR_INVALID_DEPENDENCY` at the node's
`componentRef`. The component's own `metadata.description`
([`COMP-DESC-003`](../../component/v2/spec.md#COMP-DESC-003)) is the one
exception: a node may deploy a component without one.

[`BP-ID-003`](#BP-ID-003) requires every component document in the item to be
referenced. That rule, like every item-scoped check, cannot complete for a
standalone document without an item root ([§3.1](#item-directory)).

### <a id="bindings"></a>4.2 Bindings

A **binding** at `nodes.<node>.bindings.<input>` supplies one input of that
node. The map key names an input of the node's component
([`BP-BIND-007`](#BP-BIND-007)). The key present in a binding names its origin:

| Key | Members | Origin |
|---|---|---|
| `parameter` | `parameter` | A named deployment parameter ([§5](#parameters)) |
| `node` | `node`, `output` | An output of another node |
| `node` | `node`, `connection` | A connection another node provides, for a connection input ([§5.3](#provided-connections)) |
| `value` | `value` | A logical literal value, never for a sensitive input ([`BP-BIND-008`](#BP-BIND-008)) |
| `template` | `template`, `format` | A string composed of literal text, parameters and node outputs ([§4.2.1](#templates)) |

<a id="BP-BIND-003"></a>**`BP-BIND-003`**: A binding names exactly one origin:
`parameter`, `node` with `output`, `node` with `connection`, `value`, or
`template` with `format`. Structural: a binding naming no origin is
`ERR_MISSING_FIELD` at the binding, and one carrying members of two origins is
`ERR_INVALID_VALUE` there. `node` goes with `output` or `connection`, and
`template` with `format`: `node` without `output` or `connection`, `output` or
`connection` without `node`, and `template` or `format` without the other are
each `ERR_MISSING_FIELD` at the binding. Duplicate input keys fail during
parsing, and there is no override priority between origins.

```yaml
bindings:
  region:
    parameter: region
  databaseURL:
    node: database
    output: url
  mode:
    value: production
```

<a id="BP-BIND-008"></a>**`BP-BIND-008`**: A `value` binding MUST NOT supply a
sensitive input, because an authored literal is published with the document.
Semantic: `ERR_SENSITIVE_LITERAL` at the binding's `value`. A sensitive input
takes its value from a parameter, or from another node's output.

**Values from outside the documents enter only through parameters.** A binding
wires what the documents contain: a parameter, another node's output, or a
literal. It never reads an organization variable, a deployment fact or a
connection itself; it names a parameter that does ([§5](#parameters)). The
receiving input's value schema constrains a value, and the key of its binding
names its origin. So an organization **has** connections, a connection
parameter **selects** one, and a binding **delivers** it to a node.

<a id="BP-BIND-002"></a>**`BP-BIND-002`**: The value-dependency graph MUST be
acyclic. An output whose origin is an `input` adds a dependency on that input,
and a `node` binding adds a dependency on the output it names. An output read
from an endpoint depends on an allocated address, not a running process, so a
discovery cycle is permitted. Semantic: a value cycle is `ERR_VALUE_CYCLE` at
`/spec/nodes`. Traversal MUST terminate.

Coverage by matching names is rejected: an input is supplied only by its own
binding, so adding an unrelated node MUST NOT change what an existing input
receives.

#### <a id="templates"></a>4.2.1 Templates

A **template** binding composes a string from literal text and placeholders
([core v2 §5.2](../../core/v2/spec.md#placeholder-grammar)), for the inputs that
take one string where the documents hold its parts: a connection URL with a
generated password inside it, or a value with a fixed prefix
([ADR 0056](../../../docs/adr/0056-a-binding-composes-a-string-and-encodes-what-it-interpolates.md)).
`format` says how each placeholder's value is written into the text:

```yaml
bindings:
  cacheURL:
    template: "redis://:${{ parameters.cachePassword }}@${{ nodes.cache.outputs.address }}/0"
    format: URL
  neo4jAuth:
    template: "neo4j/${{ parameters.graphPassword }}"
    format: TEXT
```

<a id="BP-BIND-009"></a>**`BP-BIND-009`**: A binding's `template` permits two
namespaces. `${{ parameters.<parameter> }}` names a deployment parameter, and
`${{ nodes.<node>.outputs.<output> }}` an output of a node; any other path in
them names neither explicitly. A placeholder yields the string form of a scalar
value: a string as it is, a number as its shortest round-trip JSON text, and a
boolean as `true` or `false`. Substitution is single-pass, as core says. A
template produces a string. Semantic, each at the binding's `template`:

| Condition | Diagnostic |
|---|---|
| A placeholder outside core's grammar, or naming a namespace other than these two | Core's code ([`CORE-PLACEHOLDER-001`](../../core/v2/spec.md#CORE-PLACEHOLDER-001) to [`CORE-PLACEHOLDER-003`](../../core/v2/spec.md#CORE-PLACEHOLDER-003)) |
| A `parameters` path that is not one declared parameter | `ERR_UNKNOWN_PARAMETER` |
| A `nodes` path whose node does not exist | `ERR_UNKNOWN_NODE` |
| A `nodes` path that is not `<node>.outputs.<output>`, or names no output of the node's component | `ERR_UNKNOWN_OUTPUT` |
| A connection parameter, which is not a value ([§5.3](#connections)) | `ERR_INVALID_CONNECTION_BINDING` |
| An output whose value schema is not a scalar's, or an input whose value schema is not a string's | `ERR_INCOMPATIBLE_TYPE` |
| A template without a placeholder supplying a sensitive input, which makes it a literal ([`BP-BIND-008`](#BP-BIND-008)) | `ERR_SENSITIVE_LITERAL` |

A template is a binding of each parameter it names: it counts for
[`BP-PARAM-001`](#BP-PARAM-001), and the input it supplies counts for whether a
parameter is optional ([`BP-PARAM-005`](#BP-PARAM-005),
[`BP-UI-005`](#BP-UI-005)) and for its sensitivity. It adds no value schema to
the parameter: [`BP-PARAM-002`](#BP-PARAM-002) intersects only the inputs a
`parameter` binding names, and a parameter only templates name is offered as
text. Each node output a template names is a value dependency of the input
([`BP-BIND-002`](#BP-BIND-002)). A template without a placeholder is a
statically known string, and is checked against the input as a literal is
([`BP-PARAM-008`](#BP-PARAM-008)).

<a id="BP-BIND-010"></a>**`BP-BIND-010`**: `format` is `URL` or `TEXT`, and is
REQUIRED: how a value is written is never inferred.

- `TEXT` writes each value's string form as it is.
- `URL` reads the template as an RFC 3986 absolute URI, its scheme literal text
  before the first placeholder. Each placeholder lies in one component, decided
  by the literal text around it: the user information before a literal `@` in
  the authority, the host and port after it, the path, the query or the
  fragment. A value in the user information, the path, the query or the
  fragment is percent-encoded, every UTF-8 octet but the unreserved characters
  (RFC 3986 §2.3), so no value can end its component, add one or be read two
  ways. A value in the host and port is written as it is, and holds only
  unreserved characters, `:`, `[` and `]`.

Semantic: a `URL` template whose scheme is not literal text before its first
placeholder, or whose literal text holds a character RFC 3986 does not, is
`ERR_INVALID_TEMPLATE` at the binding's `template`. Resolution, in the `values`
stage, at the binding: a placeholder whose value is not a scalar, and a host and
port value holding another character, are `ERR_VALUE_CONSTRAINT`, as is a
composed string the input's value schema rejects.

<a id="BP-BIND-011"></a>**`BP-BIND-011`**: A composed string is sensitive when
any value it interpolates is, or the input it supplies is, and it is concealed
wherever a sensitive value is ([§10](#security)). A diagnostic about a template
quotes its placeholders, never a value. When a value a template names is absent,
an optional parameter without a default, the input the template supplies is
absent too, as an unbound optional input is.

### <a id="node-compute"></a>4.3 Compute, storage and exposure

**Compute.** `compute` names the compute a node runs on: a compute `profile`,
and the `placement` constraints that narrow where that profile is placed
([§4.4](#placement-constraints)).

<a id="BP-NODE-001"></a>**`BP-NODE-001`**: A node whose component runs, a
`SERVICE`, `WORKER` or `JOB` ([component §5](../../component/v2/spec.md#type)),
MUST carry `compute`. Semantic: a node without it is `ERR_COMPUTE_REQUIRED` at
the node.

<a id="BP-NODE-002"></a>**`BP-NODE-002`**: A node whose component is `EXTERNAL`
([component §5.6](../../component/v2/spec.md#external)) MUST NOT carry `compute`.
Nothing runs, so there is nothing to size or place. Semantic: `compute` on one
is `ERR_COMPUTE_FORBIDDEN` at `compute`.

Both rules read the component's `type`, so they are decided against the
component the node deploys. While that component is unavailable they are
deferred and the result is INCOMPLETE, as [`BP-REF-002`](#BP-REF-002) states for
every rule that reads the component.

<a id="BP-NODE-003"></a>**`BP-NODE-003`**: `compute.profile` is REQUIRED within
`compute`, and names exactly one compute profile. Placement narrows only the
profile beside it. Structural: `compute` carrying placement and no profile is
`ERR_MISSING_FIELD` at `compute`.

A compute profile slug is `<compute family>.<tier>.<size>`, for example
`general.standard.small`. Compute families: general, compute, memory, storage,
gpu, accelerator. Tiers: economy, standard, performance, premium. Sizes: nano,
small, medium, large, xlarge. Initial resolution selects a version of the
profile and pins it in the resolution record; a redeploy uses that version.
Updating to the current catalog version is explicit.

<a id="BP-NODE-009"></a>**`BP-NODE-009`**: `compute.profile` MUST name a
profile the platform's compute catalog holds, available in the region the
admission is decided for. Admission: `ERR_COMPUTE_PROFILE_UNAVAILABLE` at
`/spec/nodes/<node>/compute/profile`. Without the catalog, the rule is deferred
and the result INCOMPLETE.

**Storage.** <a id="BP-NODE-004"></a>**`BP-NODE-004`**: `volumes.<name>.sizeGiB`
allocates each volume the component declares
([component §5.5](../../component/v2/spec.md#volumes)) explicitly, at or above
its `minSizeGiB`. Semantic: a declared volume with no allocation, an allocation
naming no declared volume, and an allocation below the minimum are
`ERR_INVALID_VOLUME_ALLOCATION` at the allocation. No storage default is
selected implicitly.

An allocation MAY also carry `storageClass`, a catalog value, and `minIOPS`, a
positive integer floor on provisioned IOPS. They describe the volume, not the
host, so they sit beside its size and never under `placement`, where they are
`ERR_UNKNOWN_FIELD`. Like a placement constraint, each narrows what may serve
the allocation and never changes it, and neither is silently ignored. Their
catalog values follow the same grammar and the same catalog rules as placement
values ([§4.4](#placement-constraints)). An allocation without `storageClass` is
served by the region's default storage class.

<a id="BP-NODE-011"></a>**`BP-NODE-011`**: A volume's storage MUST be one the
platform offers in the region the admission is decided for: its `storageClass`
names a class the storage catalog holds there, and its `minIOPS` is at most what
the class serving it provisions. Admission: `ERR_STORAGE_UNAVAILABLE` at
`/spec/nodes/<node>/volumes/<volume>/storageClass` for a class the catalog does
not hold, and at `/spec/nodes/<node>/volumes/<volume>/minIOPS` for a floor no
storage of that class meets.

<a id="BP-NODE-012"></a>**`BP-NODE-012`**: A volume's `sizeGiB` MUST be at
most the largest volume the storage class serving it allocates. Admission:
`ERR_VOLUME_TOO_LARGE` at `/spec/nodes/<node>/volumes/<volume>/sizeGiB`. It is
decided only for a class [`BP-NODE-011`](#BP-NODE-011) accepts.

Without the storage catalog, both rules are deferred and the result INCOMPLETE.

**Exposure.** <a id="BP-NODE-005"></a>**`BP-NODE-005`**: `exposure.<endpoint>`
is `PUBLIC` or `PRIVATE`, or the object form [§4.5](#access) defines, whose
`visibility` is one of the two. An endpoint left out is `PRIVATE`. Who can reach
a `PRIVATE` endpoint is [`BP-ACCESS-011`](#BP-ACCESS-011)'s to say. The rules
below read the endpoint's
visibility, whichever form states it, and the component constrains the choice:

| Condition | Diagnostic |
|---|---|
| The key names no endpoint of the component | `ERR_UNKNOWN_ENDPOINT` |
| A `WORKER` endpoint is `PUBLIC`: a worker is not request-driven, and its endpoints serve the platform and sibling nodes ([component `COMP-TYPE-003`](../../component/v2/spec.md#COMP-TYPE-003)) | `ERR_ENDPOINT_NOT_EXPOSABLE` |
| A `PUBLIC` URL-addressed endpoint (`HTTP`, `HTTPS`, `WS`, `GRPC`) of a `SERVICE` has no readiness probe, of any mechanism ([component `COMP-EP-003`](../../component/v2/spec.md#COMP-EP-003)) | `ERR_READINESS_REQUIRED` |
| An output the component derives from a public property of an endpoint (`publicHostname`, `publicPort`, `publicAddress` or `publicURL`, [component §5.2](../../component/v2/spec.md#endpoints)) reads an endpoint that is not `PUBLIC` | `ERR_ENDPOINT_NOT_PUBLIC` |

Semantic. Each diagnostic anchors at `exposure/<endpoint>`, except that
`ERR_ENDPOINT_NOT_PUBLIC` for an endpoint left out of `exposure` anchors at the
node's `componentRef`.

Exposure decides who reaches an endpoint, and the component decides how the
platform connects to it. Traffic for a `PUBLIC` endpoint reaches the workload
over the endpoint's `protocol` and trust policy, the same ones its probes use
([component `COMP-EP-007`](../../component/v2/spec.md#COMP-EP-007)), whatever
scheme the public used to reach the platform.

### <a id="placement-constraints"></a><a id="advanced-constraints"></a>4.4 Placement constraints

Placement constraints narrow the hosts eligible for the selected compute
profile. They do not substitute a different profile or grant extra resources.
Omitted placement, empty placement and an empty array impose no constraint.
An array cannot repeat a value.

| Constraint | Requirement on an eligible host |
|---|---|
| `cpuArchitectures` | One of the listed architectures |
| `cpuDedication` | `dedicated` requires dedicated vCPU; `shared` imposes no dedication constraint |
| `minAcceleratorMemoryGiB` | At least this accelerator memory |
| `acceleratorRuntimes` | All listed runtimes are supported |
| `acceleratorInterconnect` | The named interconnect is available |
| `acceleratorSKUClass` | The named SKU class is available |
| `networkClass` | The named network class is available |

Storage is constrained on the volume it describes, not here
([§4.3](#node-compute)).

Numeric constraints are positive integers. A constraint that is not numeric and
not `cpuDedication` takes catalog values ([§1.1](#terms)). Each catalog
vocabulary, and its mapping to providers, is versioned catalog context, not an
author-defined escape hatch. The resolution record pins the selected profile
version and the allocations. A future change to what a constraint means is a
specification change, even if its spelling still passes structural validation.

<a id="BP-NODE-010"></a>**`BP-NODE-010`**: A node's placement constraints MUST
be satisfiable together: some host of the node's compute profile, in the region
the admission is decided for, meets every constraint at once. A catalog value
the vocabulary does not hold is met by no host. Admission:
`ERR_PLACEMENT_UNSATISFIABLE` at `/spec/nodes/<node>/compute/placement`. It is
decided only for a profile [`BP-NODE-009`](#BP-NODE-009) accepts, never silently
ignored, and deferred, with the result INCOMPLETE, without the catalog.

### <a id="access"></a>4.5 Access and viewer identity

An exposure answers three questions. Can the endpoint be reached from outside
the deployment? Must the platform sign a viewer in, and admit them, before
forwarding a request? And does the workload learn who the viewer is, and how?
The bare form answers only the first; the object form answers all three, and
says which facts about the viewer the workload receives and which requests pass
without a viewer:

```yaml
exposure:
  web:
    visibility: PUBLIC
    access: RESTRICTED
    viewerIdentity: HEADER
```

| Member | Values | Absent |
|---|---|---|
| `visibility` | `PUBLIC`, `PRIVATE` | REQUIRED |
| `access` | `OPEN`: every request is forwarded. `RESTRICTED`: only viewers who sign in and whom the deployment's access policy admits | `OPEN` |
| `viewerIdentity` | `NONE`: nothing is forwarded about the viewer. `HEADER`: the viewer's identity, in a request header. `ASSERTION`: a signed token naming the viewer, in a request header. `OIDC`: the workload signs viewers in itself, as an OpenID Connect client of the platform | `NONE` |
| `viewerClaims` | A unique, non-empty list of `EMAIL`, the viewer's verified email address, `NAME`, their display name, and `ROLE`, their standing in the organization ([role claims](#role-claims)) | Only the identity |
| `accessExemptions` | A unique, non-empty list of `PATHS` and `BEARER`: the requests, among those the component's `exemptibleRequests` offers, that pass without a viewer ([`BP-NODE-008`](#BP-NODE-008)) | None |
| `apiKey` | The generated parameter whose value the platform checks as a bearer token ([API keys](#api-keys)) | No key |
| `mount` | The public endpoint whose host serves this one, and the path it is served under ([§4.7](#public-hosts)) | A host of its own |

Bare `PUBLIC` is `{ visibility: PUBLIC }`, and so
`{ visibility: PUBLIC, access: OPEN, viewerIdentity: NONE }`; bare `PRIVATE` is
`{ visibility: PRIVATE }`. Public does not mean anonymous, and private does not
mean restricted: `RESTRICTED` protects a workload that never reads an identity,
and a `PRIVATE` endpoint serves the platform and sibling nodes, which the
platform's sign-in is not in front of.

<a id="BP-NODE-006"></a>**`BP-NODE-006`**: The object form is closed, and
requires `visibility`. Structural:

| Condition | Diagnostic |
|---|---|
| `visibility` is absent | `ERR_MISSING_FIELD` at the endpoint's exposure |
| An unknown member | `ERR_UNKNOWN_FIELD` at the endpoint's exposure |
| `access`, `viewerIdentity`, `viewerClaims`, `accessExemptions` or `mount` under `PRIVATE`: every member but `visibility` applies only to `PUBLIC` | `ERR_INVALID_VALUE` at that member |
| A `viewerIdentity` other than `NONE` without `access: RESTRICTED` | `ERR_INVALID_VALUE` at `viewerIdentity` |
| `accessExemptions` without `access: RESTRICTED` | `ERR_INVALID_VALUE` at `accessExemptions` |
| `viewerClaims` without a `viewerIdentity` other than `NONE`: a claim needs a mode to travel in | `ERR_INVALID_VALUE` at `viewerClaims` |
| An empty or repeating list | `ERR_INVALID_VALUE` at the list |

Every identity mode requires `RESTRICTED` because an identity the platform has
not verified is one the caller supplied, and because the platform keeps
refusing a revoked viewer only while it stands in front of the workload
([`BP-ACCESS-005`](#BP-ACCESS-005)).

<a id="BP-NODE-007"></a>**`BP-NODE-007`**: The component constrains access as
it constrains exposure. Semantic:

| Condition | Diagnostic |
|---|---|
| `access: RESTRICTED` on an endpoint that is not HTTP-routed (`HTTP`, `HTTPS`, `WS`): a sign-in and a request header exist only there | `ERR_ENDPOINT_NOT_HTTP` at `exposure/<endpoint>/access` |
| An output the component derives from a viewer identity property ([component §5.2](../../component/v2/spec.md#viewer-identity)) reads an endpoint whose `viewerIdentity` is not the property's mode, or, for `viewerEmailHeader` and `viewerNameHeader`, whose `viewerClaims` lacks `EMAIL` or `NAME` | `ERR_VIEWER_IDENTITY_NOT_FORWARDED`, anchored as `ERR_ENDPOINT_NOT_PUBLIC` is: at `exposure/<endpoint>`, or at the node's `componentRef` for an endpoint left out of `exposure` |

<a id="BP-NODE-008"></a>**`BP-NODE-008`**: The component declares what a node
may select beyond sign-in. Semantic:

| Condition | Diagnostic |
|---|---|
| `viewerIdentity: OIDC` on an endpoint that declares no `oidc` ([component §5.2](../../component/v2/spec.md#oidc)) | `ERR_ENDPOINT_NOT_OIDC_CLIENT` at `exposure/<endpoint>/viewerIdentity` |
| `PATHS` in `accessExemptions`, and the endpoint's `exemptibleRequests` ([component §5.2](../../component/v2/spec.md#exemptible-requests)) declares no `paths` | `ERR_EXEMPTION_NOT_DECLARED` at that list entry |
| `BEARER` in `accessExemptions`, and the endpoint's `exemptibleRequests` does not declare `bearerToken: true` | `ERR_EXEMPTION_NOT_DECLARED` at that list entry |

The component offers the requests that may pass without a viewer, and the
blueprint grants them. Without the component's statement that every route
checks its tokens, a node could open a workload that checks nothing.

A workload that needs the values binds the outputs that read them back into its
own inputs. That is a discovery dependency on allocated facts, not a value
cycle ([`BP-BIND-002`](#BP-BIND-002)):

```yaml
nodes:
  web:
    componentRef: ./components/web.yaml
    compute: { profile: general.standard.small }
    exposure:
      web: { visibility: PUBLIC, access: RESTRICTED, viewerIdentity: HEADER }
    bindings:
      identityHeader: { node: web, output: identityHeader }
      trustedProxies: { node: web, output: trustedProxies }
```

<a id="BP-ACCESS-001"></a>**`BP-ACCESS-001`**: The public routing facts of an
endpoint allocation
([component §5.2](../../component/v2/spec.md#endpoints)) carry a viewer identity
property only when that endpoint's exposure selects the property's mode, and,
for `viewerEmailHeader` and `viewerNameHeader`, its claim: `viewerIdentityHeader`
and `trustedProxyCIDRs` under `HEADER`, the header of each released claim under
`HEADER`, and the four `viewerAssertion*` facts under `ASSERTION`. Every header
name is a lowercase field name of 1 to 128 characters, RFC 9110 `tchar`s only,
and never `authorization`, `connection`, `content-length`, `cookie`,
`forwarded`, `host`, `keep-alive`, `origin`, `proxy-authorization`,
`proxy-connection`, `te`, `trailer`, `transfer-encoding`, `upgrade`,
`x-real-ip` or a name beginning `x-forwarded-`, and no two facts of one endpoint
name the same header. The CIDRs are a non-empty list without repeats, each an
IPv4 prefix in dotted decimal without leading zeros or an IPv6 prefix in
RFC 5952 text, with a prefix length of at least 1 and no host bits set: a list
that trusts every address is not a trust decision. `viewerAssertionKeysURL` is
an absolute `https` URL without credentials, query or fragment, and
`viewerAssertionIssuer` and `viewerAssertionAudience` are non-empty strings of
at most 512 characters. An endpoint whose mode is `OIDC` has, beside its routing
facts and never among them, a client registration: an opaque `identity` and
`version`, the `issuerURL`, an absolute `https` URL as above, the `clientID`,
and the `secret`, the last two non-empty strings of at most 512 characters. It
is private deployment state, like a generated credential. A fact on another
endpoint, or one breaking this grammar, is `ERR_INVALID_RESOLUTION_CONTEXT` in
the `allocation` stage. A fact the context does not supply leaves the value that
reads it unresolved, and resolution INCOMPLETE; no implementation supplies a
fallback.

The rest of this section is what the platform does for an endpoint, most of it
for one whose access is `RESTRICTED`. No document phase observes a forwarded
request, so these requirements are verified against implementations, not
documents, and each is listed with the reason in the conformance runner's
coverage exceptions ([conformance](../../../docs/conformance.md#requirements)).

<a id="BP-ACCESS-002"></a>**`BP-ACCESS-002`**: The platform MUST authenticate
the viewer, and admit them under the deployment's access policy, before it
forwards any request an exemption does not cover
([`BP-ACCESS-009`](#BP-ACCESS-009), [`BP-ACCESS-010`](#BP-ACCESS-010)), on HTTP
requests and WebSocket upgrades alike. The access policy belongs to the
deployment and is managed through the platform API: a v2 document names no
principal, role or policy, and v2 defines no default membership
([§9](#not-supported)). When the authentication or authorization state it needs
is missing, unknown or unavailable, the platform MUST refuse the request and
MUST NOT forward it. An implementation that does not understand `RESTRICTED`
MUST reject the exposure rather than treat it as `OPEN`. Probes are sent by the
platform's probing host, not through viewer authentication, with the headers
[component `COMP-EP-017`](../../component/v2/spec.md#COMP-EP-017) states.

<a id="BP-ACCESS-003"></a>**`BP-ACCESS-003`**: Under `viewerIdentity: HEADER`
or `ASSERTION`, the platform MUST remove every inbound copy of each header the
endpoint's facts name, and of `Forwarded`, `X-Forwarded-*` and `X-Real-IP`,
before it sets its own, on HTTP requests and WebSocket upgrades alike. The
identity it sets is a stable, opaque identifier of the authenticated viewer,
never an email address and never a credential. Under `HEADER` it sets the header
of each released claim too, and omits the email header for a viewer without a
verified email address. A claim header's value is the claim's UTF-8 text with
every octet outside visible ASCII, and every `%`, percent-encoded (RFC 3986
§2.1), so that no value can end a header or be read two ways. It MUST preserve
the validated `Host`, the `Origin`, and the request's own `Authorization` header
and application cookies, and MUST NOT forward its own session credential to the
workload. Under `viewerIdentity: NONE` and `OIDC` it forwards no identity
header.

This paragraph is informative. The header names are the platform's choice,
and no document depends on them. A platform does best to name them without the
`X-` prefix (RFC 6648), and under one prefix it owns, such as
`<platform>-viewer-id`, so that it removes inbound copies by that prefix rather
than by a list of names that can miss one.

<a id="BP-ACCESS-004"></a>**`BP-ACCESS-004`**: `trustedProxyCIDRs` MUST cover
every address the workload observes as the peer of traffic the platform
forwards to it, and no address from which another workload, another tenant or
the public can open a network connection to it. The values are allocated before
the workload starts ([`BP-RESOLVE-001`](#BP-RESOLVE-001)), and a change to them
is a change of allocation, so a new snapshot and a new record.

<a id="BP-ACCESS-005"></a>**`BP-ACCESS-005`**: The platform MUST bound how long
a network connection it admitted, such as an upgraded WebSocket, may outlive the
authorization that admitted it, after a sign-out, an expiry or a withdrawn
permission, and MUST document that bound.

<a id="BP-ACCESS-006"></a>**`BP-ACCESS-006`**: One person has one subject in one
deployment. The identity a `HEADER` forwards, the `sub` of an assertion and of
an OpenID Connect ID token, and `deployment.creator.identity`
([`BP-PARAM-011`](#BP-PARAM-011)) MUST be the same string for the same person
in the same deployment, and MAY differ between deployments. A released `EMAIL`
is an address the platform has verified for the viewer.

<a id="BP-ACCESS-007"></a>**`BP-ACCESS-007`**: Under `ASSERTION`, the platform
MUST set, on every request and WebSocket upgrade it forwards, a JWS compact
serialization of a JWT signed with RS256, whose protected header names its key
in `kid`. Its claims are `iss` and `aud`, equal to the endpoint's
`viewerAssertionIssuer` and `viewerAssertionAudience`; `sub`; `iat`; `exp`, at
most 600 seconds after `iat`; and each released claim, as `email` with
`email_verified` and as `name`. The audience MUST be unique to one endpoint of
one deployment. The key set at `viewerAssertionKeysURL` MUST hold every key
whose tokens have not yet expired, so a retired key stays published until the
last token it signed expires.

<a id="BP-ACCESS-008"></a>**`BP-ACCESS-008`**: Under `OIDC`, the platform MUST
register one confidential client per endpoint of the deployment, whose redirect
URIs are exactly the endpoint's `publicURL` followed by each of its
`redirectPaths`, compared exactly (RFC 9700 §2.1). A reallocation that changes
`publicURL` re-registers them. The issuer MUST support the authorization code
flow with PKCE (`S256`), MUST issue a code only to a viewer the deployment's
access policy admits ([`BP-ACCESS-002`](#BP-ACCESS-002)), and releases in the
ID token and user information only the subject and the released claims; a scope
asking for more is not refused, and gets no more. Rotating the client secret is
a change of allocation. Deleting the deployment MUST revoke the client.

<a id="access-exemptions"></a><a id="BP-ACCESS-009"></a>**`BP-ACCESS-009`**: Under
`PATHS`, the platform MUST forward a request whose path lies under one of the
paths the component's `exemptibleRequests` names as it would under
`access: OPEN`: without authenticating a viewer, with no identity, claim or
assertion header, and with inbound copies of them removed as
[`BP-ACCESS-003`](#BP-ACCESS-003) says. A path lies under an exempt path when it
equals it, or begins with it followed by `/`, so `/webhook` covers
`/webhook/abc` and never `/webhooks`. The query takes no part in matching. The
platform matches the path after decoding percent-encoded unreserved characters
and removing dot segments (RFC 3986 §6.2.2), forwards the path it matched, and
MUST NOT exempt a request whose path holds `;`, an encoded `/` or `\`, a `\`, a
NUL or an empty segment. The platform serves its own sign-in under `/.musher`
on an endpoint whose access is `RESTRICTED`, and no exemption reaches it. An
exempt path is exempt only once [`BP-ACCESS-012`](#BP-ACCESS-012) lets it be.

<a id="BP-ACCESS-010"></a>**`BP-ACCESS-010`**: Under `BEARER`, the platform MUST
forward a request that carries no valid viewer session and an `Authorization`
header of the `Bearer` scheme, with no identity, claim or assertion header, for
the workload to judge. A request that carries a valid session is authenticated,
admitted and identified as any other is, whatever else it carries. The
exemption takes effect only once [`BP-ACCESS-012`](#BP-ACCESS-012) lets it.

<a id="BP-ACCESS-012"></a>**`BP-ACCESS-012`**: An exemption on a `RESTRICTED`
endpoint, `PATHS` or `BEARER`, MUST take effect only once a rollout that carries
it is active ([`BP-ORDER-005`](#BP-ORDER-005)): every `SERVICE` and `WORKER`
node ready, and every ordered job succeeded, such as a job that claims the
application's first administrator account. Until the deployment's first rollout
is active, and, for an exemption a later rollout adds, until that rollout is,
the platform MUST authenticate and admit every request on the endpoint as
[`BP-ACCESS-002`](#BP-ACCESS-002) says, an exempt one included. An exemption an
active rollout carries stays in effect while a later rollout that keeps it
starts. Endpoints without an exemption are unaffected: a `RESTRICTED` one
signs every viewer in from the start, and an `OPEN` one is reachable as soon as
its node is ready
([ADR 0055](../../../docs/adr/0055-a-node-starts-after-the-nodes-it-names.md)
§4).

<a id="private-endpoints"></a><a id="BP-ACCESS-011"></a>**`BP-ACCESS-011`**: The
platform MUST make a `PRIVATE` endpoint reachable only from the nodes of the
same deployment and from the platform's own probing host, and from nothing
else: not from another deployment, another organization or the public.
Isolation holds at the network level, whatever a name resolves to in DNS: a
peer that learns or guesses the endpoint's private hostname or address still
cannot open a network connection to it. Two deployments of one blueprint in one
organization are as separate as two organizations are: a private endpoint is
private to its deployment, not to its blueprint or its owner.

<a id="role-claims"></a>**Role claims.** A node may also release the
viewer's standing, so that an app can grant its own administrator role
without matching an email address. `viewerClaims` takes `ROLE` beside `EMAIL`
and `NAME`
([ADR 0060](../../../docs/adr/0060-role-claims-and-client-secret-rotation-for-oidc-apps.md)):

```yaml
exposure:
  web: { visibility: PUBLIC, access: RESTRICTED, viewerIdentity: OIDC, viewerClaims: [EMAIL, ROLE] }
```

<a id="BP-ACCESS-013"></a>**`BP-ACCESS-013`**: `ROLE` is released only under
`viewerIdentity: ASSERTION` or `OIDC`, whose token carries it. Structural:
`ROLE` in the `viewerClaims` of an exposure whose `viewerIdentity` is `HEADER`
is `ERR_INVALID_VALUE` at that list entry. Every other rule of
[`BP-NODE-006`](#BP-NODE-006) applies to it as to any claim.

<a id="BP-ACCESS-014"></a>**`BP-ACCESS-014`**: Under a released `ROLE`, the
platform MUST set two claims in every viewer assertion
([`BP-ACCESS-007`](#BP-ACCESS-007)), and in the ID token and user information
it issues for the endpoint's client ([`BP-ACCESS-008`](#BP-ACCESS-008)),
whatever scope the client asks for:

| Claim | Value |
|---|---|
| `musher_role` | The viewer's role in the organization that owns the deployment when the token is issued: `owner`, `admin`, `member` or `viewer`. Absent for a viewer the access policy admits who holds no role in that organization |
| `musher_deployment_creator` | The JSON boolean `true` when the viewer is the deployment's creator, whose identity is `deployment.creator.identity` ([`BP-PARAM-011`](#BP-PARAM-011)), and `false` otherwise |

Each value is the fact when the token is issued. A changed role reaches an
assertion within its lifetime and a client at the viewer's next sign-in; this
specification does not require an app to revoke the sessions it holds.

<a id="BP-ACCESS-015"></a>**`BP-ACCESS-015`**: The platform MUST apply a
rotated client secret of an endpoint whose mode is `OIDC` as a rollout of the
deployment, as it applies an update: every node that reads `oidcClientSecret`
starts with the new secret, and every `JOB` without a `schedule` runs again
([component `COMP-JOB-001`](../../component/v2/spec.md#COMP-JOB-001)). The
issuer MUST keep accepting the previous secret until that rollout has
completed, and MUST NOT accept it afterwards. An app that stores its client,
rather than reading it from its environment, registers it again from such a
`JOB`.

<a id="api-keys"></a>**API keys the platform checks.** A machine client
has no viewer session, and the `BEARER` exemption passes its token on
unchecked, which is safe only for a workload that checks every token itself.
An exposure whose access is `RESTRICTED` may instead name, in `apiKey`, a
generated parameter whose value the platform checks
([ADR 0061](../../../docs/adr/0061-a-platform-checked-api-key-and-exact-exempt-paths.md)):

```yaml
parameters:
  apiKey: { generator: { byteLength: 32 }, ui: { label: API key } }
nodes:
  api:
    componentRef: ./components/api.yaml
    compute: { profile: general.standard.small }
    exposure:
      api: { visibility: PUBLIC, access: RESTRICTED, apiKey: { parameter: apiKey } }
```

<a id="BP-ACCESS-016"></a>**`BP-ACCESS-016`**: `apiKey` is closed and requires
`parameter`, which names a generated parameter of the blueprint. It belongs
only to an exposure whose access is `RESTRICTED`, and never beside a `BEARER`
exemption, which answers the same bearer token another way. Structural, at
the exposure's `apiKey`: `ERR_INVALID_VALUE` under `PRIVATE`, without
`access: RESTRICTED` and beside `BEARER` in `accessExemptions`;
`ERR_MISSING_FIELD` without `parameter`; `ERR_UNKNOWN_FIELD` for another
member. Semantic, at `apiKey/parameter`: `ERR_UNKNOWN_PARAMETER` for a
parameter the blueprint does not declare, and
`ERR_INVALID_API_KEY_PARAMETER` for one that is not generated.

A parameter an `apiKey` names is used, so it needs no binding of its own
([`BP-PARAM-001`](#BP-PARAM-001)), and the resolution record lists it among
its credentials as it lists a bound generated parameter
([§5.2](#resolution-record)). A `ui` on it lets the people who manage the
deployment read the key ([`BP-PARAM-012`](#BP-PARAM-012)).

<a id="BP-ACCESS-017"></a>**`BP-ACCESS-017`**: Under `PATHS`, an exempt path
the component gives as `{ exact: <path> }` covers a request only when the
request's path, normalised as [`BP-ACCESS-009`](#BP-ACCESS-009) says, equals
it; one given as `{ prefix: <path> }`, or as the bare path, covers a request
as [`BP-ACCESS-009`](#BP-ACCESS-009) says, so `/status` covers `/status` and
`/status/x` and never `/status-page`. The platform MUST match case-sensitively,
and the query takes no part in matching. Every other rule of
[`BP-ACCESS-009`](#BP-ACCESS-009) holds for both forms: a path it refuses to
exempt is not exempt, whichever form names it, and no exempt path reaches
`/.musher`. Either form takes effect only once
[`BP-ACCESS-012`](#BP-ACCESS-012) lets it.

<a id="BP-ACCESS-018"></a>**`BP-ACCESS-018`**: Under `apiKey`, the platform MUST
forward a request that carries no valid viewer session and an `Authorization`
header of the `Bearer` scheme whose token equals the value of the current
rotation generation of the named parameter, compared in constant time. It
forwards it as an exempt request: without authenticating a viewer, with no
identity, claim or assertion header, with inbound copies of them removed as
[`BP-ACCESS-003`](#BP-ACCESS-003) says, and with the `Authorization` header it
checked removed. It MUST refuse, without forwarding, any other request that
carries no valid viewer session and that no `PATHS` exemption covers, one
with a wrong key included. A request that carries a valid session is
authenticated, admitted and identified as any other is.

### <a id="start-order"></a>4.6 Start order

A node may wait for other nodes before it starts. `startAfter` lists the nodes
it waits for, each with the condition it waits on
([ADR 0055](../../../docs/adr/0055-a-node-starts-after-the-nodes-it-names.md)):

```yaml
nodes:
  db:
    componentRef: ./components/postgres.yaml
    compute: { profile: general.standard.small }
  migrate:
    componentRef: ./components/migrate.yaml
    compute: { profile: general.economy.nano }
    startAfter: [{ node: db, condition: READY }]
  web:
    componentRef: ./components/web.yaml
    compute: { profile: general.standard.small }
    startAfter:
      - { node: db, condition: READY }
      - { node: migrate, condition: SUCCEEDED }
  claim-admin:
    componentRef: ./components/claim-admin.yaml
    compute: { profile: general.economy.nano }
    startAfter: [{ node: web, condition: READY }]
```

| Condition | Holds once | Names |
|---|---|---|
| `READY` | The node has a ready replica in the rollout: its readiness probe passes or, without one, its startup probe has succeeded or, without either, its workload has started ([component §5.4](../../component/v2/spec.md#health)) | A `SERVICE` or a `WORKER` |
| `SUCCEEDED` | The node's run in the rollout has completed successfully | A `JOB` without `schedule` |

<a id="BP-ORDER-001"></a>**`BP-ORDER-001`**: `startAfter` is a non-empty list
without repeats, and each entry is closed and requires `node` and `condition`.
Structural: `ERR_MISSING_FIELD` at an entry without one of them,
`ERR_UNKNOWN_FIELD` at one with another member, and `ERR_INVALID_VALUE` at an
empty or repeating list and at a `condition` outside the table.

<a id="BP-ORDER-002"></a>**`BP-ORDER-002`**: Each entry MUST name a node of
the blueprint that its condition fits, and only a node a rollout starts MAY
wait. Semantic:

| Condition | Diagnostic |
|---|---|
| `node` names no node | `ERR_UNKNOWN_NODE` at `startAfter/<i>/node` |
| `READY` names a node that is not a `SERVICE` or a `WORKER`, or `SUCCEEDED` one that is not a `JOB` without `schedule` | `ERR_INVALID_START_ORDER` at `startAfter/<i>/condition` |
| `startAfter` on an `EXTERNAL` node, which runs nothing, or on a `JOB` with `schedule`, which its schedule starts and a rollout does not | `ERR_INVALID_START_ORDER` at `startAfter` |

Both read the component a node deploys, and are deferred while it is
unavailable ([`BP-REF-002`](#BP-REF-002)).

<a id="BP-ORDER-003"></a>**`BP-ORDER-003`**: The **start graph**, the nodes and
the edges their `startAfter` draws, MUST be acyclic, and a node that names
itself is a cycle. Semantic: `ERR_START_CYCLE` at `/spec/nodes`. Traversal MUST
terminate. The start graph is not the value-dependency graph of
[`BP-BIND-002`](#BP-BIND-002): a value dependency is on allocated addresses and
resolved values, which exist before any workload starts, so it orders no start,
and a start order adds no value dependency.

<a id="BP-ORDER-004"></a>**`BP-ORDER-004`**: In each rollout, the platform MUST
NOT start a node's workload until every condition its `startAfter` names holds
in that rollout, and MUST report a node that waits as waiting, never as failed
or degraded. A condition that can no longer hold, because the `JOB` it names
failed, leaves the node not started and the rollout failed, as the platform API
reports; v2 defines no retry. Ordering governs only when a node starts: a node
that later stops being ready neither stops nor restarts the nodes that waited
for it. A `JOB` without `schedule` that neither carries `startAfter` nor is
named by one keeps
[component `COMP-JOB-001`](../../component/v2/spec.md#COMP-JOB-001)'s meaning,
ordered against no other node; `startAfter` is the exception that rule names,
and how a blueprint orders one.
Platform obligation; no document breaks it.

<a id="BP-ORDER-005"></a>**`BP-ORDER-005`**: A rollout is **active** once every
`SERVICE` and `WORKER` node it runs is `READY` and every **ordered job**, a
`JOB` without `schedule` that carries `startAfter`, has `SUCCEEDED` in it. The
platform MUST NOT report a deployment active before its rollout is. A `JOB`
without `startAfter` does not hold activation: its outcome is recorded, and
blocks nothing. Platform obligation; no document breaks it.

### <a id="public-hosts"></a>4.7 Public hosts

Each `PUBLIC` endpoint is reached at a public host, and a deployment may have
more than one: a node may expose more than one endpoint, and more than one node may
expose one
([ADR 0057](../../../docs/adr/0057-a-deployment-has-many-public-hosts-and-one-sign-in.md)).
An HTTP-routed endpoint may instead be served under a path of another
endpoint's host, by `mount`:

```yaml
nodes:
  app:
    exposure:
      web: { visibility: PUBLIC, access: RESTRICTED }
  realtime:
    exposure:
      socket:
        visibility: PUBLIC
        access: RESTRICTED
        mount: { node: app, endpoint: web, path: /socket.io }
```

<a id="BP-HOST-001"></a>**`BP-HOST-001`**: The platform MUST allocate each
`PUBLIC` endpoint that carries no `mount` a public hostname of its own, distinct
from that of every other endpoint of every deployment, however many such
endpoints a node or a deployment has. Platform obligation; no document breaks
it.

<a id="BP-HOST-002"></a>**`BP-HOST-002`**: `mount` is closed, and requires
`node`, `endpoint` and `path`. `path` is an absolute path of one or more
segments of unreserved characters (RFC 3986 §2.3), without a trailing `/`, of at
most 256 characters. Structural: `ERR_MISSING_FIELD` at a `mount` without one of
them, `ERR_UNKNOWN_FIELD` at one with another member, and `ERR_INVALID_VALUE` at
a `path` outside the grammar and at a `mount` under `PRIVATE`.

<a id="BP-HOST-003"></a>**`BP-HOST-003`**: A mount MUST name a host that can
serve it, and no two mounts on one host may claim the same request. Semantic:

| Condition | Diagnostic |
|---|---|
| `mount.node` names no node | `ERR_UNKNOWN_NODE` at `mount/node` |
| `mount.endpoint` names no endpoint of that node's component | `ERR_UNKNOWN_ENDPOINT` at `mount/endpoint` |
| The mounted endpoint or the host endpoint is not HTTP-routed (`HTTP`, `HTTPS`, `WS`); the host endpoint is not `PUBLIC`, is itself mounted, or is the mounted endpoint | `ERR_INVALID_MOUNT` at `mount` |
| `path` holds a `.` or `..` segment, or lies under `/.musher`, where the platform serves its own sign-in ([`BP-ACCESS-009`](#BP-ACCESS-009)) | `ERR_INVALID_MOUNT` at `mount` |
| Two mounts on one host whose paths are equal, or one lies under the other as [`BP-ACCESS-009`](#BP-ACCESS-009) defines it | `ERR_INVALID_MOUNT` at the `mount` read second, in node then endpoint order |

The checks that read a component are deferred while it is unavailable
([`BP-REF-002`](#BP-REF-002)).

<a id="BP-HOST-004"></a>**`BP-HOST-004`**: The platform MUST forward a request
to a host whose path lies under a mount's `path` to the mounted endpoint, with
the path unchanged, and every other request to the host endpoint. A mounted
endpoint's `publicHostname` and `publicPort` are its host endpoint's, and its
`publicURL` is the host endpoint's followed by `path`. Its own `access`,
`viewerIdentity`, `viewerClaims` and `accessExemptions` apply to the requests it
receives, and an exempt path is matched against the whole request path.
Platform obligation; no document breaks it.

<a id="BP-HOST-005"></a>**`BP-HOST-005`**: A viewer signed in on any public
host of a deployment MUST be signed in on every `RESTRICTED` endpoint of that
deployment, whatever its host, without signing in again, and on no endpoint of
another deployment. A request or WebSocket upgrade from one of the
deployment's hosts to another carries that sign-in. Signing out on one host
signs the viewer out on all of them, within the bound
[`BP-ACCESS-005`](#BP-ACCESS-005) documents. Platform obligation; no document
breaks it.

## <a id="parameters"></a><a id="deployment-parameters"></a>5. Deployment parameters

`spec.parameters` lists every value a deployment takes from outside the
documents: values a person submits, generated credentials and their hashes,
organization variables, facts about the deployment, and connections. A binding
wires only what the documents contain ([§4.2](#bindings)), so a value from
outside enters as a deployment parameter, and a node reaches it by naming the
parameter. A parameter is a named deployment value, independent of how a form
presents it.

A parameter has exactly one origin, and the keys present say which. The six
kinds are the submitted, generated, hash, variable, deployment-fact and
connection parameter:

| Parameter | Declared by | Value |
|---|---|---|
| Submitted parameter | No `generator`, `hash` or `from`; optional `default` | The value submitted at deployment, else `default` |
| Generated parameter | `generator` | A persisted random credential ([§5.2](#origins)) |
| Hash parameter | `hash` | A persisted password hash of a generated parameter ([§5.2](#origins)) |
| Variable parameter | `from: "${{ variables.<path> }}"` | One organization variable ([§5.2](#origins)) |
| Deployment-fact parameter | `from: "${{ deployment.<path> }}"` | One fact about the deployment, captured when it is created ([§5.2](#origins)) |
| Connection parameter | `from: "${{ connections.<path> }}"` | One connection ([§5.3](#connections)) |

```yaml
parameters:
  siteTitle: { ui: { label: Site title }, default: My site }
  dbPassword: { generator: { byteLength: 32, encoding: BASE64URL } }
  dbPasswordHash: { hash: { parameter: dbPassword, algorithm: BCRYPT } }
  region: { from: "${{ variables.cloud.region }}" }
  adminEmail: { from: "${{ deployment.creator.email }}" }
  llm: { from: "${{ connections.llm.default }}", ui: { label: Language model } }
```

The node in [§4](#node-graph)'s example reaches `siteTitle` through its
`bindings`, and [§5.3](#connections) shows a connection reaching a node the
same way. A node never names a variable, a deployment fact or a connection
directly.

<a id="BP-PARAM-010"></a>**`BP-PARAM-010`**: A parameter carries at most one of
`default`, `generator`, `hash` and `from`. `hash` requires `parameter` and
`algorithm`. A hash is never offered in a form. Structural:

| Condition | Diagnostic |
|---|---|
| A `default` beside `generator` or `from` | `ERR_INVALID_VALUE` at `default` |
| A `from` beside `generator` | `ERR_INVALID_VALUE` at `from` |
| A `default`, `generator`, `from` or `ui` beside `hash` | `ERR_INVALID_VALUE` at that member |

A parameter MAY also carry `ui` ([§5.4](#deploy-form)). Parameters declare no
schema of their own; the inputs bound to them own the value schema
([§5.1](#recipients)).

### <a id="recipients"></a><a id="coverage"></a><a id="derivation"></a><a id="merge"></a><a id="authored-parameters"></a>5.1 Recipients

<a id="BP-PARAM-001"></a>**`BP-PARAM-001`**: Every parameter MUST be named by at
least one `parameter` binding. Semantic: otherwise `ERR_UNBOUND_PARAMETER` at
the parameter. The one exception is a generated parameter that carries `ui` and
that a hash names: it reaches the deployer through disclosure
([`BP-PARAM-012`](#BP-PARAM-012)) without a binding of its own.

<a id="BP-PARAM-002"></a><a id="intersection"></a>**`BP-PARAM-002`**: A
parameter's value MUST satisfy the value schema of every input it binds, so the
parameter's value schema is their **intersection**. Inputs that declare
different schemas MAY share a parameter, a consumer stricter than its producer
among them, as long as some value satisfies them all
([ADR 0054](../../../docs/adr/0054-a-parameter-satisfies-every-input-it-binds.md)).
Semantic: `ERR_CONFLICTING_INPUT_SCHEMA` at `/spec/parameters/<name>` when the
intersection is empty by one of these conditions, each decided keyword by
keyword and through `items` and `properties`:

| Condition | Keywords it names |
|---|---|
| Two inputs declare different types, other than `integer` beside `number`, whose intersection is `integer` | `type` |
| No member of an input's `enum` satisfies every other input's schema | `enum` |
| The greatest lower bound exceeds the least upper bound, meets it where either is exclusive, or, for `integer`, leaves no integer between them | The two bounds |
| The greatest `minLength` exceeds the least `maxLength` | `minLength`, `maxLength` |
| The greatest `minItems` exceeds the least `maxItems`, or the arrays must hold an item and their `items` intersect to nothing | `minItems`, `maxItems`, or the item's keywords |
| An input requires a property another does not declare, which no closed object can hold, or a required property's schemas intersect to nothing | `required`, `properties`, or the property's keywords |
| A generated parameter whose inputs declare different schemas can produce a value, among those [`BP-PARAM-004`](#BP-PARAM-004)'s output language holds, that fails one of them | The keywords that value fails |

`pattern` is compared with nothing but the members of an `enum` and a
generator's output language: whether two patterns share a string is not decided
before resolution, and a resolved value that misses one is
`ERR_VALUE_CONSTRAINT` ([`BP-PARAM-008`](#BP-PARAM-008)). The diagnostic carries
one `related` location for each input the parameter binds, whose `artifact` is
that node's `componentRef` and whose `path` is
`/spec/contract/inputs/<input>/schema`, and its message SHOULD name the
keywords whose constraints cannot hold together, such as `minLength` and
`maxLength`.

Two value schemas are the same schema when they differ only in mapping order or
in the order of a set: `required` and `enum` are sets. Descriptions, targets and
input defaults are not part of a value schema, and do not make inputs
different. Sensitivity is the union of the receiving inputs and the value
supplied.

<a id="BP-PARAM-003"></a>**`BP-PARAM-003`**: An input without a binding uses its
component default, remains absent if optional, or is unsatisfied. Semantic: a
required input with neither a binding nor a default is
`ERR_UNSATISFIED_REQUIRED_INPUT` at the node's `componentRef`. A bound origin
that is unavailable never selects the input default.

<a id="BP-BIND-006"></a>**`BP-BIND-006`**: A `node` binding MUST name an
existing node and an output its component declares. Semantic: otherwise
`ERR_UNKNOWN_NODE` at the binding's `node`, or `ERR_UNKNOWN_OUTPUT` at its
`output`.

<a id="BP-BIND-007"></a>**`BP-BIND-007`**: Every binding MUST name an input of
its node's component, and every `parameter` binding a declared parameter.
Semantic: otherwise
[`ERR_UNKNOWN_INPUT`](../../component/v2/spec.md#diagnostics), component's
code, at the binding, or `ERR_UNKNOWN_PARAMETER` at the binding's `parameter`.

### <a id="value-sources"></a><a id="origins"></a>5.2 Origins and resolution

<a id="BP-PARAM-004"></a>**`BP-PARAM-004`**: A generator produces a sensitive
string, which is never submitted: a submitted value for a generated parameter
is `ERR_PARAMETER_NOT_SUBMITTABLE` ([`BP-PARAM-013`](#BP-PARAM-013)).
`byteLength` is an integer from 16 to 64, default 32. The platform generates
that many cryptographically secure random bytes. `encoding` defaults to `HEX`
(lowercase); `BASE64` uses the standard padded alphabet; `BASE64URL` uses the
URL-safe alphabet without padding. Custom alphabets are not supported. The
generated string must satisfy every receiving value schema; failing a
constraint must not regenerate it.

A generator's **output language** is every string of its encoded length,
`2 × byteLength` characters in `HEX`, `4 × ⌈byteLength / 3⌉` in `BASE64` and
`⌈4 × byteLength / 3⌉` in `BASE64URL`, whose characters are drawn from its
encoding's alphabet, with `BASE64`'s `=` padding in its fixed last positions.
It is a superset of what the encoding can emit, and it is what
[`BP-PARAM-002`](#BP-PARAM-002) and [`BP-PARAM-017`](#BP-PARAM-017) compare,
so that every implementation decides them alike.

<a id="BP-PARAM-017"></a>**`BP-PARAM-017`**: Every string in a generator's
output language SHOULD satisfy the value schema of every input the parameter
binds. Where those inputs declare different schemas, `BP-PARAM-002` makes this
a MUST. Where they declare one schema, a generator whose output language holds
a string that fails it is reported in the semantic phase as
`WARN_GENERATOR_OUTSIDE_SCHEMA` at `/spec/parameters/<name>/generator`, whose
message SHOULD name the keywords such a string fails. It is a warning, not an
error, because 2.1.0 and 2.2.0 accepted such a document, and validation never becomes
stricter within a major version
([core v2 §3](../../core/v2/spec.md#compatibility)). A generated value that
fails at resolution is still `ERR_VALUE_CONSTRAINT`.

<a id="BP-PARAM-012"></a>**`BP-PARAM-012`**: A `hash` names, in `parameter`, a
generated parameter of the same blueprint. bcrypt reads at most 72 bytes and
ignores the rest, so a `BCRYPT` hash requires the parameter it hashes to encode
to 72 characters or fewer: a `byteLength` of at most 36 in `HEX`, and of at most
54 in `BASE64` or `BASE64URL`. Like a generated value, a hash is a string that
must satisfy every receiving value schema. Semantic:

| Condition | Diagnostic |
|---|---|
| `hash.parameter` names no declared parameter | `ERR_UNKNOWN_PARAMETER` at `hash/parameter` |
| `hash.parameter` names a parameter that is not generated | `ERR_INVALID_HASHED_PARAMETER` at `hash/parameter` |
| A `BCRYPT` hash of a parameter that encodes to more than 72 characters | `ERR_INVALID_HASHED_PARAMETER` at `hash/algorithm` |
| A receiver whose value schema is not a string | `ERR_VALUE_CONSTRAINT` at `hash` |

`algorithm` fixes the whole format:

| Algorithm | Value |
|---|---|
| `BCRYPT` | `$2b$12$`, then 53 characters of the bcrypt alphabet: salt and hash |
| `ARGON2ID` | The PHC string `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`, with a 16-byte salt and a 32-byte hash in unpadded standard base64 |

A hash is computed once, with a fresh random salt, when the parameter it hashes
is generated, and again only when that parameter rotates, in the same atomic
step. It is stored as a credential of its own, with its own identity and the
rotation generation of the parameter it hashes, and it is sensitive. It is
never submitted. A stored hash that does not have its algorithm's format is
`ERR_INVALID_RESOLUTION_CONTEXT`.

A generated parameter that carries `ui` MAY be disclosed to the people who
manage the deployment, through a private channel, and never in a published
artifact, a public response, a preview or a diagnostic. That is how an item that
binds only a hash stays usable: whoever deployed it can read the password the
hash was made from.

<a id="BP-PARAM-005"></a>**`BP-PARAM-005`**: Parameter defaults are logical
literals, without interpolation. A submitted value replaces the default.
Resolution, in the `parameters` stage: a submitted value naming an undeclared
parameter is `ERR_UNKNOWN_PARAMETER` at `/spec/parameters`, reported before
defaults are applied, so a misspelling cannot be silently ignored; a submitted
parameter that a binding reads, with no submitted value and no default, is
`ERR_MISSING_PARAMETER_VALUE` at `/spec/parameters/<name>`, unless it is an
[optional parameter](#terms), whose receiving inputs are then absent.

<a id="BP-PARAM-014"></a>**`BP-PARAM-014`**: A parameter `default` MUST NOT
reach a sensitive input, because a default is an authored literal published with
the document. Semantic: `ERR_SENSITIVE_LITERAL` at
`/spec/parameters/<name>/default`, once for each sensitive input the parameter
binds.

<a id="BP-PARAM-008"></a>**`BP-PARAM-008`**: Every statically known value MUST
satisfy the inputs that receive it, and dynamic values are checked after
resolution, before execution. The output and input a `node` binding joins MUST
have matching logical types, except that an integer may supply a number.
Semantic: otherwise `ERR_INCOMPATIBLE_TYPE` at the binding's `output`.
Resolution, in the `values` stage: a resolved value that does not satisfy the
input receiving it is `ERR_VALUE_CONSTRAINT` at the binding that supplies it,
`/spec/nodes/<node>/bindings/<input>`, or at `/spec/nodes/<node>/componentRef`
for an input the node leaves unbound. This is
conservative type compatibility, not proof of schema containment.

<a id="BP-PLACEHOLDER-001"></a>**`BP-PLACEHOLDER-001`**: `from` is exactly one
whole placeholder under
[core's placeholder grammar](../../core/v2/spec.md#placeholder-grammar), in a
namespace this position permits: `variables`, `deployment` or `connections`.
The namespace says what the placeholder names: `variables` one value,
`deployment` one fact about the deployment, `connections` one connection. A
`from` cannot concatenate, interpolate other text, hold two placeholders, select
a component or fall back. Semantic, each at the parameter's `from`:

| Condition | Diagnostic |
|---|---|
| A `${{` that does not begin a well-formed placeholder ([`CORE-PLACEHOLDER-001`](../../core/v2/spec.md#CORE-PLACEHOLDER-001)) | `ERR_MALFORMED_PLACEHOLDER` |
| Well-formed placeholders, but not exactly one whole placeholder | `ERR_INVALID_PARAMETER_ORIGIN` |
| A namespace core does not reserve, such as `config` | `ERR_UNKNOWN_PLACEHOLDER_NAMESPACE` |
| A reserved namespace other than `variables`, `deployment` and `connections` ([core v2 §5.2](../../core/v2/spec.md#placeholder-grammar)) | `ERR_NAMESPACE_NOT_PERMITTED` |

A blueprint never names a component's endpoints: component defines them, and a
node consumes them only through the outputs a component names explicitly.

<a id="BP-PARAM-009"></a>**`BP-PARAM-009`**: A variable parameter takes one
organization variable. Its dotted path is an exact key, not object traversal
or a catalog type. A variable resolves against the configuration visible to
the environment the deployment reads variable values from: organization values,
which an environment MAY override. Acquisition supplies its identity, version,
logical value and sensitivity. Resolution, in the `parameters` stage, at
`/spec/parameters/<name>/from`, once per parameter however many bindings name
it:

| Condition | Outcome |
|---|---|
| The variable is unavailable | INCOMPLETE, deferred under this rule |
| The deployment may not read the variable | `ERR_VARIABLE_NOT_AUTHORIZED` |
| The variable has no identity or version | `ERR_INVALID_RESOLUTION_CONTEXT` |

No network lookup occurs during the semantic phase.

<a id="BP-PARAM-013"></a>**`BP-PARAM-013`**: A generated, hash, variable,
deployment-fact or connection parameter MUST NOT be given a submitted value.
Resolution, in the `parameters` stage: a submitted value for any of them is
`ERR_PARAMETER_NOT_SUBMITTABLE` at `/spec/parameters/<name>`. A connection is
replaced whole through acquisition instead ([§5.3](#connections)).

<a id="BP-PARAM-011"></a>**`BP-PARAM-011`**: A deployment-fact parameter takes
one fact about the creator of the deployment. The `deployment` namespace
defines exactly three paths. Semantic: any other path is
`ERR_UNKNOWN_DEPLOYMENT_FACT` at `from`.

| Path | Fact |
|---|---|
| `deployment.creator.identity` | The creator's stable, opaque identifier, the same one the deployment's endpoints forward for them ([`BP-ACCESS-006`](#BP-ACCESS-006)) |
| `deployment.creator.email` | The creator's verified email address |
| `deployment.creator.name` | The creator's display name |

A fact is captured once, when the deployment is created, and kept in its
private snapshot, so a redeploy, an update or an action by another deployer
never changes it. It is sensitive: personal data, not a secret, kept out of
public inspection, previews and diagnostics all the same. Resolution, in the
`parameters` stage, at `/spec/parameters/<name>/from`:

| Condition | Outcome |
|---|---|
| Acquisition has not supplied the fact | INCOMPLETE |
| The platform knows it lacks the fact, such as the display name of a creator who never set one; waiting would never supply it | `ERR_DEPLOYMENT_FACT_UNAVAILABLE` |
| The fact is malformed | `ERR_INVALID_RESOLUTION_CONTEXT` |

<a id="BP-PARAM-015"></a>**`BP-PARAM-015`**: A deployment created with an
organization API key has a creator: the user who created the key.
`deployment.creator.*` resolves to that user's facts, captured when the
deployment is created as any creator's are, and revoking or deleting the key
later changes none of them. A key whose creator the platform no longer knows,
such as a user removed from the organization, supplies no fact, and each fact a
blueprint reads is then `ERR_DEPLOYMENT_FACT_UNAVAILABLE`
([ADR 0053](../../../docs/adr/0053-an-organization-api-key-deploys-as-the-user-who-created-it.md)).
Platform obligation; no document breaks it.

<a id="BP-PARAM-016"></a>**`BP-PARAM-016`**: A `deployment`-scope validation
treats its caller as the creator of the deployment it describes: the person who
calls or, for an organization API key, the user who created the key. It
resolves every deployment fact the blueprint reads from that caller, in the
`resolution` phase at stage `parameters`, at `/spec/parameters/<name>/from`,
under the table above. A fact the caller lacks is
`ERR_DEPLOYMENT_FACT_UNAVAILABLE`, not a deferred obligation, so a validation
the deploy call would refuse for that reason is never INCOMPLETE without a
diagnostic. The rest of resolution stays deferred under
[`BP-RESOLVE-001`](#BP-RESOLVE-001). A validation at any narrower scope has no
caller to read, and reports no deployment fact.

<a id="BP-RESOLVE-001"></a>**`BP-RESOLVE-001`**: Resolution MUST complete these
stages, in this order ([core v2 §6.4](../../core/v2/spec.md#resolution-stages)),
before any workload starts:

| Stage | What it does here |
|---|---|
| `sources` | Pins the content each running node is made from, and builds nothing. An `image` source with only a tag resolves its reference to an image digest. A `git` source resolves its `ref` to a full commit: the head of the branch, the commit the tag names, the head of the default branch when `ref` is omitted, or the named commit, which must exist. An `upload` source requires the platform to hold an archive whose SHA-256 is `upload.digest` and that extracts under [`COMP-SRC-007`](../../component/v2/spec.md#COMP-SRC-007). A buildpacks `builderImage` resolves to an image digest |
| `parameters` | Reads every parameter's origin: submitted values, generated credentials and hashes, variables and deployment facts |
| `allocation` | Selects compute, storage and exposure, and allocates endpoint addresses and identity facts |
| `connections` | Acquires each connection parameter's selection ([§5.3](#connections)) |
| `values` | Evaluates value dependencies, and validates every input and output against its value schema |
| `build` | Builds each `git` or `upload` source, from exactly the content the `sources` stage pinned, with its build recipe and the pinned builder, into one image digest. Its build secrets are read from the values the `values` stage resolved |
| `environment` | Encodes each node's environment variables |
| `record` | Produces the resolution record and the deployment snapshot |

Incomplete or invalid resolution forbids execution. A missing required
submitted value is invalid; missing external context is incomplete.

The `sources` stage reads a `git.repositoryURL`, an image reference and a
builder image as acquisition by the authorized resolver under platform policy,
which admits `https` alone, no `file:` and no address in a private, loopback or
link-local range ([core v2 §6](../../core/v2/spec.md#validation-phases)). No
validation phase fetches them.

In the `sources` stage, an archive not yet uploaded, a commit not yet resolved,
and an image or builder digest not yet resolved leave resolution INCOMPLETE.
Evidence that contradicts the component, such as an archive whose bytes have
another digest than `upload.digest`, an archive that
[`COMP-SRC-007`](../../component/v2/spec.md#COMP-SRC-007) rejects, a commit
other than the one `ref` names, or an image or builder digest other than the
one a reference pins, is `ERR_INVALID_RESOLUTION_CONTEXT` at
`/spec/nodes/<node>/componentRef`, with a related location at the component's
`/spec/workload/source`, or at its `/spec/workload/build` for a builder.

The `build` stage runs after `values`, because a recipe that names secrets reads
the values of those inputs. They resolve through the node's bindings and the
deployment's parameters like every other value, and a failure resolving them is
reported in the `parameters` or `values` stage, not in `build`. An image not yet
built leaves resolution INCOMPLETE. A build reported against another recipe than
the component's, by a `recipeDigest` that is not the one recomputed from its
`workload.build`, is `ERR_INVALID_RESOLUTION_CONTEXT` at
`/spec/nodes/<node>/componentRef`, with a related location at the component's
`/spec/workload/build`. A failed build is reported by the platform API, and
resolution does not complete without the image. Whether the platform builds
again or reuses an image it built before is its caching policy, outside this
specification: the record pins the image digest either way.

An output can forward an optional input only when that input is guaranteed, so
an output forwarding an input that may be absent is rejected before resolution,
with [`ERR_INPUT_NOT_GUARANTEED`](../../component/v2/spec.md#diagnostics).

Generated credentials are created once per deployment identity, parameter
identity and non-negative rotation generation. Atomic, durable get-or-create
persists them before use. Retries and updates reuse them. Rotation explicitly
increments the generation. Renaming an identity requires an explicit migration
or a new credential; reconciliation cannot silently rotate it.

#### <a id="resolution-record"></a>Generated resolution record

Resolution produces a **resolution record**. It is generated, not an authored
override layer, and its version is 1. Its executable shape is
`#/$defs/BlueprintResolutionRecord` in the self-contained blueprint bundle. It is
a generated JSON artifact, not another Musher document kind, and unknown record
fields are rejected. It is read by software, not written by people, so each of
its nodes keeps a `source` tag where an authored document names a source by the
key present.

**What it records.** The record contains:

- the blueprint digest;
- the exact specification releases and dependency releases;
- in `nodes`, each node's component identity, revision and artifact digest;
- what the `sources` and `build` stages pinned for every running node, below;
- compute identity (the profile slug) and version;
- allocated volumes and exposure;
- variable identity and version pairs, keyed by variable path in `variables`;
- credential identity and rotation references, for generated parameters and
  their hashes.

Each node records its `source` as `IMAGE`, `GIT`, `UPLOAD` or `EXTERNAL`, and
these fields:

| Field | Pattern | `IMAGE` | `GIT` | `UPLOAD` | `EXTERNAL` |
|---|---|---|---|---|---|
| `imageDigest` | `^sha256:[0-9a-f]{64}$` | required | required | required | forbidden |
| `gitCommit` | `^[0-9a-f]{40}$` or `^[0-9a-f]{64}$` | forbidden | required | forbidden | forbidden |
| `uploadDigest` | `^sha256:[0-9a-f]{64}$` | forbidden | forbidden | required | forbidden |
| `recipeDigest` | `^sha256:[0-9a-f]{64}$` | forbidden | required | required | forbidden |
| `builderDigest` | `^sha256:[0-9a-f]{64}$` | forbidden | required for buildpacks | required for buildpacks | forbidden |
| `compute` | identity and version | required | required | required | forbidden |

Every digest in the record, `blueprintDigest` and each node's artifact `digest`
included, is `sha256:` followed by 64 lowercase hexadecimal digits. An
`EXTERNAL` node has empty volume and exposure maps. A built node's `gitCommit`
or `uploadDigest` is its
[source content key](../../component/v2/spec.md#source), and `uploadDigest` is
the component's `upload.digest`. `builderDigest` is the digest the `sources`
stage resolved the recipe's `buildpacks.builderImage` to, present exactly when
the recipe is a buildpacks recipe. `recipeDigest` is `sha256:` followed by the
lowercase hexadecimal SHA-256 of the
[RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) canonical JSON of the
effective build recipe: the component's `workload.build` object with `context`
present, `.` when it was omitted, `arguments` as written, and each secret as its
ID and input name only, after removing every member whose value is an empty
object or an empty array. Two equal recipes have one digest, so a recipe that
writes `arguments: {}` has the digest of one that omits it. No secret
plaintext, and no hash of secret content, is included.

<a id="deployment-snapshot"></a><a id="installation-snapshot"></a>**The deployment snapshot.**
The required `deploymentSnapshot` pins the private
state behind the record by an opaque identity and an immutable version.
That private snapshot uses format version 1. It persists submitted parameter
values, selected variable values and their identity and version pairs, captured
deployment facts, credential references and rotation generations for generated
credentials and their hashes, endpoint allocations with any OpenID Connect
client registration, and any connection selections, including the revision of
the organization configuration that answered each one. Its physical storage
format is implementation-defined. Its sensitive values are private and never
hashed into the public record, and no public secret-derived hash stands in for
its identity. Reusing an identity and version for changed state is forbidden:
any change to a selected value, dependency, rotation or allocation produces a
new snapshot version and a new record. The snapshot is persisted before
materialization.

**Accepting a record.** Acceptance parses and validates the record's blueprint
and the component documents it references, resolves its pinned component
artifacts, and reconciles the exact node set, identities, revisions, artifact
digests, workload sources and their kinds, compute identities, volumes,
exposure and allocation choices, acquired dependencies and specification
release graph. A pinned image digest and an authored Git commit must agree with
the record. An `uploadDigest` that is not the pinned component's
`upload.digest`, a `recipeDigest` that is not the digest recomputed from its
`workload.build`, a `builderDigest` on a node whose recipe is not a buildpacks
recipe or missing from one whose recipe is, or a `builderDigest` other than the
digest a digest-pinned `builderImage` names, is
`ERR_INVALID_RESOLUTION_CONTEXT` in the `record` stage. The
`variables` map and the `credentials` map must match the variable and generated
parameters the blueprint binds, the hash parameters it binds and the generated
parameters they hash, and the private snapshot. A hash carries an identity of
its own and the rotation of the parameter it hashes. Required endpoint
allocation identities must be present. Replaying the snapshot, with the sources
the record pins, must resolve the blueprint without unpersisted selections.
Exact specification dependency manifests must name all declared dependencies
and agree on shared releases; missing dependencies fail, and so do extra
unrelated families, which the record's schema already rejects by admitting only
`core`, `component` and `blueprint`. Schema validity alone is insufficient. The same accepted record MUST
identify the same effective values, not identical behaviour from external
services.

A Git commit alone does not establish build reproducibility; the resulting
image digest is required. A redeploy uses the existing record, builds nothing,
and fails when a pinned dependency is unavailable. An update produces a new
record explicitly. Operational eligibility can change independently, but
cannot rewrite the record.

### <a id="connections"></a><a id="atomic-connections"></a>5.3 Connections

A **connection parameter** is a parameter whose `from` is
`${{ connections.<path> }}`. It names one connection
([component v2 §6.4](../../component/v2/spec.md#members),
[ADR 0030](../../../docs/adr/0030-atomic-named-connections.md),
[ADR 0039](../../../docs/adr/0039-provenance-is-chosen-at-deployment.md)), not
a scalar lookup. It fills a connection input
([component §6.4](../../component/v2/spec.md#connection-requirements)) through an
ordinary `parameter` binding. The component that declares the input is an
`EXTERNAL` node standing for the database, cache, object store or model API, and
the nodes that use it wire their inputs to its outputs. The dotted path after
`connections.` is an exact key naming one connection the organization has
configured, for example `postgres.default`; it is not object traversal and not
a selector.

A blueprint never says who provides a connection. The organization's
connection configuration answers the parameter with a managed offering or with
a service the organization runs, and a deployer may replace it with a complete
`USER` selection. The blueprint, the component and the record's node
`source: EXTERNAL` are the same in every case.

```yaml
parameters:
  db: { from: "${{ connections.postgres.default }}", ui: { label: Database } }
nodes:
  db:
    componentRef: ./components/postgres.yaml
    bindings:
      postgres: { parameter: db }
  app:
    componentRef: ./components/app.yaml
    compute: { profile: general.standard.small }
    bindings:
      databaseURL: { node: db, output: url }
```

A language-model connection is wired the same way: an `EXTERNAL` node with an
`OPENAI_CHAT_COMPLETIONS` or `ANTHROPIC_MESSAGES` input, whose `baseURL`,
`apiKey` and `model` outputs the calling node binds. So is a messaging
connection: an `EXTERNAL` node with a `TELEGRAM_BOT`, `SLACK_APP` or
`DISCORD_BOT` input, whose outputs hand the bot's members to the node that
runs it. A bot that receives events at a webhook does so at that node's own
`PUBLIC` endpoint, exempted with `accessExemptions: [PATHS]`
([§4.5](#access),
[component v2 §6.4](../../component/v2/spec.md#event-delivery)).

<a id="BP-CONNECTION-001"></a>**`BP-CONNECTION-001`**: A connection input MUST be
bound only by a `parameter` binding naming a connection parameter, or by a
`node` binding naming a provided connection
([`BP-CONNECTION-004`](#BP-CONNECTION-004)), and a connection parameter MUST
bind only connection inputs. Semantic, each
`ERR_INVALID_CONNECTION_BINDING`:

| Condition | At |
|---|---|
| A `value` or `template` binding, or a `node` binding naming an `output`, to a connection input | The binding |
| A `node` binding naming a `connection`, to a value input | The binding |
| A `template` naming a connection parameter | The binding's `template` |
| A `parameter` binding to a connection input naming a parameter that is not a connection parameter | The binding's `parameter` |
| A `parameter` binding to a value input naming a connection parameter | The binding's `parameter` |

A binding naming no parameter is `ERR_UNKNOWN_PARAMETER`
([`BP-BIND-007`](#BP-BIND-007)), and nothing else. A connection input is always
required, so one left unbound is `ERR_UNSATISFIED_REQUIRED_INPUT`
([`BP-PARAM-003`](#BP-PARAM-003)). A connection input declares no value schema,
so [`BP-PARAM-002`](#BP-PARAM-002) does not compare it. The parameter's `from`
must satisfy [`BP-PLACEHOLDER-001`](#BP-PLACEHOLDER-001). There is no implicit
sharing by input name or protocol. A variable parameter holds one value, and
separate variables cannot assemble a connection.

<a id="BP-CONNECTION-002"></a>**`BP-CONNECTION-002`**: A deployment acquires one
immutable, authorized selection per deployment identity and connection
parameter. Every consumer of that parameter uses a protocol view of that same
selection. Resolution, in the `connections` stage, at
`/spec/parameters/<name>` or, for a view, at the binding. Each acquisition has
one **acquisition status**, the `status` of its evidence:

| Acquisition outcome | Status | Result |
|---|---|---|
| Not acquired | `NOT_ACQUIRED`, or no evidence | INCOMPLETE |
| Authoritatively not found | `NOT_FOUND` | `ERR_CONNECTION_NOT_FOUND` |
| Denied | `DENIED` | `ERR_CONNECTION_DENIED` |
| Nothing configured is compatible with the parameter | `INCOMPATIBLE` | `ERR_CONNECTION_INCOMPATIBLE` |
| A selection with no view of the input's protocol, or lacking a capability the input requires | `SELECTED` | `ERR_CONNECTION_INCOMPATIBLE` |
| A `USER` selection missing a required member of its protocol, or the credential that supplies one | `SELECTED` | `ERR_CONNECTION_INCOMPATIBLE`; it is never completed from a managed selection |
| A member that does not satisfy the receiving input | `SELECTED` | `ERR_VALUE_CONSTRAINT` |
| Malformed evidence, below | Any | `ERR_INVALID_RESOLUTION_CONTEXT` |

Only a `SELECTED` acquisition carries a selection, and it is persisted
([`BP-CONNECTION-003`](#BP-CONNECTION-003)).

No other provider is ever selected as a fallback. Values enter the ordinary
input and environment pipeline, and no input, output or environment value is
released on incomplete or invalid resolution, including when only one of
two or more connection parameters fails.

A selection carries an identity and version, the deployment and parameter it
answers, the acquisition request it answers, its selection kind and, for a
managed one, whether it is granted or provisioned, its cost owner, one scoped
credential with an identity and a rotation generation, and a view per protocol.
A `REDIS` server that requires no authentication has no credential, so a
selection of one carries none. The credential's `value` supplies each view's
credential member, and its **credential secrets**, `credential.secrets`, hold
exactly the secret members of its views' protocols, such as the `SLACK_APP`
`appToken` and `signingSecret`, by member; a selection whose protocols define
none carries no `secrets`. A view carries the locator and parameter
members of its protocol
([component v2 §6.4](../../component/v2/spec.md#protocol-registry)), never the
credential member or a secret member, which the credential supplies, and never
a derived member such as `url`. It omits an optional member it does not hold. A
language-model view also carries its capabilities:

<!-- BEGIN GENERATED protocol-views: `task docs` writes this table from component's protocol registry -->

| Protocol | Credential member | View members | Optional view members |
|---|---|---|---|
| `OPENAI_CHAT_COMPLETIONS`, `ANTHROPIC_MESSAGES` | `apiKey` | `baseURL`, `model`, `capabilities` | none |
| `OPENAI_EMBEDDINGS` | `apiKey` | `baseURL`, `model`, `dimensions` | none |
| `POSTGRES` | `password` | `host`, `port`, `database`, `username`, `sslMode` | none |
| `REDIS` | `password`, when the server requires authentication | `host`, `port`, `tls` | `database`, `username` |
| `S3` | `secretAccessKey` | `endpointURL`, `region`, `bucket`, `accessKeyID` | `pathStyle` |
| `TELEGRAM_BOT` | `botToken` | none | `baseURL` |
| `SLACK_APP` | `botToken`, and `appToken` and `signingSecret` in `secrets` | none | `baseURL` |
| `DISCORD_BOT` | `botToken` | `applicationID`, `publicKey` | `baseURL` |

<!-- END GENERATED protocol-views -->

The input a view fills receives every member its protocol defines: the view's
own, the default of each optional member the view omits, the credential member,
the secret members, and, for `POSTGRES` and `REDIS`, the `url` that resolution
composes from them
([component v2 §6.4](../../component/v2/spec.md#derived-urls)). An optional
member without a default that the view omits is absent.

The evidence is malformed, `ERR_INVALID_RESOLUTION_CONTEXT`, when any of these
fails:

- The request the selection answers equals the connection parameter's `from`,
  including for a complete `USER` replacement. It identifies the acquisition
  request, not the provider selected.
- A managed credential identity is not reused across distinct connection
  parameters.
- Every required member, a secret member included, is present in a managed
  selection. Every member a view or the credential's `secrets` carries is
  non-empty and of the type, range and value set its protocol fixes
  ([component v2 §6.4](../../component/v2/spec.md#members)): `host` a host name
  or address without a port, `port` an integer from 1 to 65535, the `REDIS`
  `database` a non-negative integer, `tls` and `pathStyle` booleans, and
  `sslMode` one of PostgreSQL's `sslmode` values. A view carries no member its
  protocol does not define, and no credential, secret or derived member. The
  credential's `secrets` holds no member that is not a secret member of one of
  its views' protocols; a `USER` selection whose `secrets` lacks one is
  `ERR_CONNECTION_INCOMPATIBLE`, as one missing a required member is.
- A selection without a credential has only views of protocols whose
  credential member is optional, `REDIS` alone, and none of them carries
  `username`.
- A view of an HTTP-based protocol, one with a locator such as `baseURL` or the
  `S3` `endpointURL`, carries a locator that is an absolute HTTPS URL without
  user information, query or fragment. The URL the input receives, which is the
  view's locator or, when the view omits an optional one, its default, is one
  of the credential's `permittedBaseURLs`, which a selection with an HTTP-based
  view always carries.

Context is trusted acquisition evidence, not an authored mechanism for granting
permission. Offline evaluation performs no network access and issues no
credential. The evidence of this stage has the shape of the
[connection-evidence schema](interfaces/connection-evidence.schema.json), which
is generated from component's protocol registry, and evidence that schema
rejects is malformed. How a behavioural fixture spells a selection, and the
evidence of every other stage, is the fixture format's
([conformance](../../../docs/conformance.md#behavioural-cases)).

<a id="BP-CONNECTION-003"></a>**`BP-CONNECTION-003`**: The complete selection and
its scoped credential MUST be persisted before materialization. Retry and
redeploy reuse the selected identity, version and credential. A change to an
organization's defaults affects only new deployments. An explicit update
replaces the complete selection and produces a new private snapshot and
resolution record. Rotation is durable and idempotent; a clone is a new
deployment with a distinct scoped credential. Revocation denies use
immediately, whatever an existing record says. A failed attempt MUST NOT leave
more than one active credential, or silently change provider on retry.

A **provisioned** selection is created at the first acquisition for its
deployment and connection parameter, and persisted with its scoped credential
before materialization, like any selection. Retry, redeploy and update reuse
it, and an update that selects something else does not release it. It is
released only when the deployment is deleted; what is retained after deletion,
and for how long, belongs to the platform API. Rotating its credential keeps
the service. A clone provisions its own. A **granted** selection is access to a
service that outlives the deployment, and only the access ends with it.

A `USER` selection carries its own members and credential, complete: partial
merging with a managed selection is forbidden. It arrives through acquisition,
never as a submitted parameter value ([`BP-PARAM-013`](#BP-PARAM-013)). Managed
credentials are scoped to the deployment, the connection parameter and the
service permitted, never an organization's unrestricted provider key.
Credential plaintext and its hashes MUST NOT appear in published artifacts,
forms, public responses, previews or diagnostics. Deployment interfaces disclose
the selected connection and its cost owner. Existing organization policy may
authorize automated selection without repeated prompts.

Gateway base paths, upstream providers, default models, offerings, plans,
versions, regions, quotas, spending limits, current authorization and durable
persistence are platform responsibilities. A real client integration must
verify client paths, authentication, streaming, tool calls and errors. Synthetic
fixture credentials establish no production access.

<a id="provided-connections"></a>**Connections a node provides.** A node
whose component serves a connection
([component v2 §6.5](../../component/v2/spec.md#provided-connections)) can fill
a sibling's connection input in place of a connection parameter. The binding
names the node and, in `connection`, the provided connection, as a binding
naming an output names the node and the `output`
([ADR 0059](../../../docs/adr/0059-an-embeddings-protocol-and-connections-a-node-provides.md)):

```yaml
nodes:
  tei:
    componentRef: ./components/tei.yaml
    compute: { profile: gpu.standard.small }
  embedder:
    componentRef: ./components/embeddings.yaml
    bindings:
      embeddings: { node: tei, connection: embeddings }
  app:
    componentRef: ./components/app.yaml
    compute: { profile: general.standard.small }
    bindings:
      embeddingsURL: { node: embedder, output: baseURL }
```

`embedder` is the same `EXTERNAL` node a blueprint fills with
`${{ connections.embeddings.default }}` when the organization's connection
answers instead.

<a id="BP-CONNECTION-004"></a>**`BP-CONNECTION-004`**: A binding carries
`connection` only beside `node`, and never beside `output`. It names a
provided connection of the node's component whose protocol is the input's,
and which declares every capability the input requires. The input then
depends on each output the provided connection maps, for
[`BP-BIND-002`](#BP-BIND-002). Structural: `ERR_INVALID_VALUE` at a binding
with both `output` and `connection`, and `ERR_MISSING_FIELD` at one with
`connection` and no `node`. Semantic:

| Condition | Diagnostic |
|---|---|
| `node` names no node | `ERR_UNKNOWN_NODE` at the binding's `node` |
| `connection` names no provided connection of that node's component | `ERR_UNKNOWN_PROVIDED_CONNECTION` at the binding's `connection` |
| The provided connection's protocol is not the input's, or it lacks a capability the input requires | `ERR_INVALID_CONNECTION_BINDING` at the binding's `connection` |

<a id="BP-CONNECTION-005"></a>**`BP-CONNECTION-005`**: In the `values` stage,
an input bound to a provided connection receives each member the provided
connection maps, the value of its output on the providing node; the default of
each optional member it does not map; and, for `POSTGRES` and `REDIS`, the
`url` composed from them
([component v2 §6.4](../../component/v2/spec.md#derived-urls)). Every member
MUST satisfy its protocol's value schema, except that a locator MAY be an
absolute `http` URL as well as an `https` one, without user information,
query or fragment. Resolution: a member that does not is `ERR_VALUE_CONSTRAINT`
at the binding.

The locator may be `http` because it reads an endpoint of the providing node
([component `COMP-CONNECTION-005`](../../component/v2/spec.md#COMP-CONNECTION-005)),
which only nodes of the same deployment reach
([`BP-ACCESS-011`](#BP-ACCESS-011)). There is no acquisition: no selection, no
scoped credential, no `permittedBaseURLs` and nothing persisted in the
snapshot. The members are the provider's outputs, pinned by the provider node,
and they change only when its outputs do. A member's sensitivity is its
output's.

### <a id="deploy-form"></a><a id="install-form"></a>5.4 Deploy form

<a id="BP-UI-001"></a>**`BP-UI-001`**: `ui` is optional. One that is supplied
requires `label`, a non-empty string, and is closed. Structural, at the
parameter's `ui`: `ERR_MISSING_FIELD` without `label` and `ERR_UNKNOWN_FIELD`
for an unknown property; `ERR_INVALID_VALUE` at `ui/label` when it is empty.

<a id="BP-UI-002"></a>**`BP-UI-002`**: `prominence` is `PRIMARY` (the default) or
`SECONDARY`. Structural: any other value is `ERR_INVALID_VALUE` at
`ui/prominence`.

<a id="BP-UI-003"></a>**`BP-UI-003`**: `enumLabels` names only string
representations of scalar enum members, or of string-array item enum members.
Arrays and objects in a whole-value enum have no `enumLabels` keys. Semantic: a
key naming no member is `ERR_UNKNOWN_ENUM_MEMBER` at
`/spec/parameters/<name>/ui/enumLabels/<key>`.

<a id="BP-UI-004"></a>**`BP-UI-004`**: A deploy form offers each parameter that
declares `ui`, except a generated, variable or deployment-fact parameter: none
is ever an editable field. A form MAY show a deployment fact, read-only, to the
person it describes. A hash parameter declares no `ui` and is never offered. A
connection parameter with `ui` is offered as one control choosing a whole
selection, never as its members. A connection parameter without `ui` is not
offered: the deployment acquires its default selection without a form field.

For any other parameter, a form conceals sensitive values first; then offers
enum choices, string-array item choices, boolean controls, structured JSON
editing, or scalar text entry, in that order. UI examples are never submitted.

<a id="BP-UI-005"></a>**`BP-UI-005`**: A submitted parameter that declares
neither `ui` nor `default` MUST NOT bind a required input. The form never offers
it, so a deployment created through the form could never supply it. Semantic:
`ERR_PARAMETER_NOT_OFFERED` at `/spec/parameters/<name>`.

A submitted parameter without `ui` is supplied only through the platform API,
and that is legitimate only for an [optional parameter](#terms): one with a
`default`, which a form deployment takes, or one whose every receiving input is
optional, which a form deployment leaves absent.

Fields are ordered by ascending `ui.order`, unspecified orders last, then by
parameter name in UTF-8 order. For a parameter bound to more than one input, help
text is the description of the first receiver by node name then input name;
this ordering does not affect validation. A form validates a value against the
intersection of its receivers' schemas ([`BP-PARAM-002`](#BP-PARAM-002)), and
chooses its control from it: an `enum` any receiver declares offers the members
every receiver accepts, in the order of the first receiver that declares one.
Clients validate logical values; server admission MUST validate them
independently as well. Labels and descriptions do not override value schemas.

<a id="options"></a>**Options.** A form can offer a submitted parameter's
likely values without closing the value schema of the inputs it binds.
`ui.options` lists them, each a `value` and the `label` a form shows, and
`ui.editable: true` lets the deployer type a value that is not among them
([ADR 0062](../../../docs/adr/0062-a-parameter-offers-options-and-a-generated-secret-can-be-disclosed.md)):

```yaml
parameters:
  model:
    default: "llama3.2:1b"
    ui:
      label: Model
      options:
        - { value: "llama3.2:1b", label: Llama 3.2 1B }
        - { value: "qwen2.5:0.5b", label: Qwen 2.5 0.5B }
      editable: true
```

<a id="BP-UI-006"></a>**`BP-UI-006`**: `options` is a non-empty list of at most
256 closed objects, each requiring `value`, a logical value, and `label`, a
non-empty string, with no two options sharing a value. `editable` is a
boolean, and requires `options`. Neither belongs to the `ui` of a generated
parameter or one with `from`, and `options` never sits beside `enumLabels`.
Structural, under the parameter's `ui`: `ERR_INVALID_VALUE` at `options` or
`editable` on a generated parameter or one with `from`, at `options` beside
`enumLabels`, at an empty, overlong or repeating list, and at an empty
`label`; `ERR_MISSING_FIELD` at an option without `value` or `label`, and
at `ui` with `editable` and without `options`; `ERR_UNKNOWN_FIELD` at an
option with another member. Semantic: `ERR_VALUE_CONSTRAINT` at
`ui/options/<index>/value` of an option whose value, compared as JSON, an
earlier option already has.

<a id="BP-UI-007"></a>**`BP-UI-007`**: Every option's `value` MUST satisfy the
value schema of every input the parameter binds, and the `default` of a
parameter whose options are not `editable` MUST be one of their values.
Semantic: `ERR_VALUE_CONSTRAINT` at `ui/options/<index>/value`, and at the
parameter's `default`.

<a id="BP-UI-008"></a>**`BP-UI-008`**: A deploy form MUST offer a parameter
that declares `options` as a choice among their labels, in their order, and
when it is `editable` MUST also accept a value typed in. A value outside
options that are not `editable` MUST NOT be submitted. Resolution, in the
`parameters` stage: a submitted value that is not one of the values of
options that are not `editable` is `ERR_VALUE_CONSTRAINT` at
`/spec/parameters/<name>`.

Options belong to the form, not the value schema: the receiving inputs keep
their own schemas, and an `editable` value is held to them as any submitted
value is. A schema `enum` is labelled with `enumLabels` instead. A form
conceals a sensitive value first, so it never offers options for one.

<a id="disclosure"></a>**Disclosure.** A generated parameter whose `ui` sets
`disclosed: true` holds a value the deployer is expected to keep, such as a key
that encrypts data a backup holds.

<a id="BP-UI-009"></a>**`BP-UI-009`**: `disclosed` is a boolean, and belongs
only to the `ui` of a generated parameter. Structural: `ERR_INVALID_VALUE` at
`ui/disclosed` on any other parameter. The platform MUST disclose the value of
a parameter whose `ui` sets `disclosed: true` to the people who manage the
deployment, behind an explicit reveal, apart from the deploy form, and say
that it is to be kept. The privacy rules of
[`BP-PARAM-012`](#BP-PARAM-012)'s disclosure apply to it.

## <a id="validation-phases"></a><a id="validation-layers"></a>6. Validation phases

Core's phases, validation scopes and statuses apply
([core v2 §6](../../core/v2/spec.md#validation-phases)). Structural-only success
does not claim publication or deployment validity. Item-local and catalog
components share the semantic checks; acquisition is a separate authorized
operation. The `publication` scope completes the publication obligations of
the blueprint and its components, [`BP-ID-005`](#BP-ID-005),
[`BP-GRAPH-001`](#BP-GRAPH-001) and the compute, placement and storage checks [`BP-NODE-009`](#BP-NODE-009) to
[`BP-NODE-012`](#BP-NODE-012) among them. The `deployment` scope decides those
checks again, for the region the deployment runs in, and additionally completes
resolution ([§5.2](#origins)) and authorization.

## <a id="diagnostics"></a>7. Diagnostics

Core and component diagnostics apply, with these additions:

| Code | Phase | Meaning |
|---|---|---|
| `ERR_COMPONENT_NOT_FOUND` | `semantic` | An item-local component file is absent. |
| `ERR_REFERENCE_ESCAPE` | `semantic` | An item-local reference escapes the item root. |
| `ERR_INVALID_DEPENDENCY` | `semantic` | A supplied component document is invalid, fails identity or digest verification, or misses a component publication obligation. |
| `ERR_COMPUTE_REQUIRED` | `semantic` | A node whose component runs carries no compute. |
| `ERR_COMPUTE_FORBIDDEN` | `semantic` | A node whose component is `EXTERNAL` carries compute. |
| `ERR_UNKNOWN_NODE` | `semantic` | A binding names no node. |
| `ERR_NODE_REQUIRED` | `admission` | Publication requires a node this blueprint does not declare. |
| `ERR_COMPUTE_PROFILE_UNAVAILABLE` | `admission` | A node's compute profile is not in the platform's compute catalog, or not available in the region. |
| `ERR_PLACEMENT_UNSATISFIABLE` | `admission` | No host of the node's compute profile meets its placement constraints together. |
| `ERR_STORAGE_UNAVAILABLE` | `admission` | A volume names a storage class the platform does not offer, or an IOPS floor its class cannot meet. |
| `ERR_VOLUME_TOO_LARGE` | `admission` | A volume is larger than its storage class allocates. |
| `ERR_UNKNOWN_OUTPUT` | `semantic` | A binding names no output of the node's component. |
| `ERR_UNKNOWN_PARAMETER` | `semantic`, `resolution` | A binding, a hash or a submitted value names no parameter. |
| `ERR_INCOMPATIBLE_TYPE` | `semantic` | An output's type cannot supply the input a binding joins it to. |
| `ERR_UNREFERENCED_COMPONENT` | `semantic` | The item contains a component document no node references. |
| `ERR_CONFLICTING_INPUT_SCHEMA` | `semantic` | No value satisfies every input one parameter binds. |
| `ERR_UNBOUND_PARAMETER` | `semantic` | No binding names the parameter. |
| `ERR_UNSATISFIED_REQUIRED_INPUT` | `semantic` | A required input has no binding or default. |
| `ERR_ENDPOINT_NOT_PUBLIC` | `semantic` | An output reads a public property of an endpoint the blueprint does not expose. |
| `ERR_VIEWER_IDENTITY_NOT_FORWARDED` | `semantic` | An output reads a viewer identity property of an endpoint whose exposure does not forward that property's mode or claim. |
| `ERR_INVALID_MOUNT` | `semantic` | A mount names a host that cannot serve it, or overlaps another mount on its host. |
| `ERR_EXEMPTION_NOT_DECLARED` | `semantic` | An exposure lets through requests without a viewer that the component does not offer in `exemptibleRequests`. |
| `ERR_INVALID_API_KEY_PARAMETER` | `semantic` | An exposure's `apiKey` names a parameter that is not generated. |
| `ERR_UNKNOWN_ENUM_MEMBER` | `semantic` | A UI label names no enum member. |
| `ERR_PARAMETER_NOT_OFFERED` | `semantic` | A submitted parameter with neither `ui` nor `default` binds a required input, so no form can supply it. |
| `ERR_INVALID_PARAMETER_ORIGIN` | `semantic` | A parameter's `from` is not one whole placeholder. |
| `ERR_UNKNOWN_DEPLOYMENT_FACT` | `semantic` | A parameter's `from` names a `deployment` path the namespace does not define. |
| `ERR_INVALID_HASHED_PARAMETER` | `semantic` | A hash names a parameter that is not generated, or one too long for its algorithm. |
| `ERR_INVALID_VOLUME_ALLOCATION` | `semantic` | A volume allocation is absent, unknown or below the minimum. |
| `ERR_READINESS_REQUIRED` | `semantic` | A public URL-addressed service endpoint has no readiness probe. |
| `ERR_VALUE_CYCLE` | `semantic` | Value dependencies contain a cycle. |
| `ERR_START_CYCLE` | `semantic` | The start graph contains a cycle. |
| `ERR_INVALID_START_ORDER` | `semantic` | A start condition does not fit the node it names, or a node a rollout does not start waits for another. |
| `ERR_INVALID_CONNECTION_BINDING` | `semantic` | A connection input is bound by something other than a connection parameter or a provided connection of its protocol and capabilities, or a connection parameter or provided connection binds a value input, or a connection parameter is named by a template. |
| `ERR_UNKNOWN_PROVIDED_CONNECTION` | `semantic` | A binding names no provided connection of the node's component. |
| `ERR_INVALID_TEMPLATE` | `semantic` | A `URL` template is not an absolute URI with a literal scheme. |
| `ERR_PARAMETER_NOT_SUBMITTABLE` | `resolution` | A submitted value names a generated, hash, variable, deployment-fact or connection parameter. |
| `ERR_MISSING_PARAMETER_VALUE` | `resolution` | A required submitted value is absent. |
| `ERR_VARIABLE_NOT_AUTHORIZED` | `resolution` | The deployment cannot read the organization variable. |
| `ERR_DEPLOYMENT_FACT_UNAVAILABLE` | `resolution` | The platform knows it has no value for a deployment fact the deployment reads. |
| `ERR_INVALID_RESOLUTION_CONTEXT` | `resolution` | Resolution context is malformed, contradicts the documents, or lacks a required identity or version. |
| `ERR_CONNECTION_NOT_FOUND` | `resolution` | Authorized acquisition confirms no selected default exists. |
| `ERR_CONNECTION_DENIED` | `resolution` | Acquisition denies permission to use the connection. |
| `ERR_CONNECTION_INCOMPATIBLE` | `resolution` | The selection cannot satisfy the required protocol, capabilities or members. |

### <a id="warnings"></a>7.1 Warnings

These codes are reported at `WARNING` ([core v2 §7](../../core/v2/spec.md#diagnostics)).
Each reports a SHOULD the document does not meet. A warning never changes a
result's status, so no document is rejected for one.

| Code | Requirement | Phase | Meaning |
|---|---|---|---|
| `WARN_GENERATOR_OUTSIDE_SCHEMA` | [`BP-PARAM-017`](#BP-PARAM-017) | `semantic` | A generator can produce a value the one schema its inputs declare rejects. Reported at the parameter's `generator`. |

## <a id="conformance"></a>8. Conformance

An implementation claims a validation scope and runs its family and dependency
fixtures ([conformance](../../../docs/conformance.md)). The resolution behaviour
suite includes sensitivity, absence, encoding, source pinning and credential
lifecycle observations. A skipped case is never a passed one.

## <a id="not-supported"></a><a id="known-debt"></a>9. Not supported in v2

Each row is rejected today, and each closes by a relaxation: accepting
something v2 rejects. Adding one requires defined semantics and conformance
evidence.

| Not supported | How it would close |
|---|---|
| Component instances shared across deployments | A new origin kind for a binding |
| Reaching another deployment's `PRIVATE` endpoint, in the same organization | An export and an import, [draft](#draft-exports) below |
| Conditional node sets, including swapping a self-hosted `SERVICE` for a connection at deployment ([ADR 0019](../../../docs/adr/0019-external-component-node.md)) | A new optional field on a node |
| Outputs produced by a job at run time | A new output origin, in component |
| Recursive templates, and provider-specific maps | A new optional field |
| Functions in a template, such as trimming a suffix or taking a URL's origin | A placeholder expression, [core v2 §10](../../core/v2/spec.md#not-supported) |
| A component output template that reads the component's own inputs | A new `self` path in component's `template` |
| A document naming the principals, roles or policy a `RESTRICTED` endpoint admits, or a default membership; the policy is the deployment's, managed through the platform API | A new optional member of the exposure object |
| `RESTRICTED` access to a `GRPC`, `TCP` or `UDP` endpoint | Permit `RESTRICTED` on those protocols |
| Group claims, or a role beyond the viewer's standing in the deployment's organization | A new `viewerClaims` value |
| A viewer identity mode under `access: OPEN` | Permit the combination |
| More than one platform-checked API key on an exposure, or keys scoped to some paths | A new optional member of `apiKey` |
| Exemptions by request method | A new `accessExemptions` value |
| Hashes of submitted values, and other hash algorithms or parameters | A new `hash.algorithm` value, or permit a submitted parameter under `hash` |
| `deployment` facts beyond the creator's | A new path in the `deployment` namespace |
| Choosing a plan or size for a provisioned connection | A new optional field on the connection parameter |
| `capabilities` for a protocol other than a language model's | Permit `capabilities` on that protocol, in component |
| Registering an endpoint's URL with a messaging service, such as a Telegram webhook or a Slack request URL | A new optional member of the exposure object |

### <a id="draft-exports"></a>9.1 Draft: exported endpoints

> **Draft, not normative.** This subsection records the shape
> [ADR 0058](../../../docs/adr/0058-a-deployment-exports-a-private-endpoint-to-a-named-consumer.md)
> decides, so that implementations can plan for it. It declares no requirement
> ID, and no validator applies it: a document using any of it is rejected
> today, as [`BP-ACCESS-011`](#BP-ACCESS-011) and the schema require.

A deployment would reach another deployment's `PRIVATE` endpoint only through
both sides declaring it. The exporting blueprint names the endpoint it exports
and the consumers it admits, each by a stable identity the organization assigns.
The consuming blueprint declares a parameter whose `from` names the export, and
binds the private host, port and address it yields to its nodes like any other
parameter. Acquiring an import would be authorized, persisted and recorded as a
connection selection is ([§5.3](#connections)): a deployment that is not a named
consumer is denied, and revoking an export denies new connections at once. Both
deployments belong to one organization. Isolation would still hold at the
network level, for the exported endpoint alone.

Open before this becomes normative: whether an import is a connection protocol
whose provider is a deployment, or a parameter kind of its own; how a consumer
identity is named; and what a consumer sees when the exporting deployment is
redeployed or deleted.

## <a id="security"></a>10. Security considerations

Treat documents and dependency artifacts as untrusted. Verify containment,
digests, parser bounds and component contracts before resolution. Variable and
connection placeholders select organization data the deployment is authorized
to read; they never grant access by themselves. No validation phase fetches a
document-chosen URL, and the `sources` stage acquires a repository or an image
only under the platform policy of [core v2 §6](../../core/v2/spec.md#validation-phases).
Resolved secrets remain in private materialization channels
and cannot appear in diagnostics or exported resolution records.

A `PUBLIC` endpoint whose access is `OPEN` is reachable by anyone with its
address, and an identity header on one would be whatever the caller wrote. That
is why a component that reads the viewer identity properties cannot be deployed
without the `viewerIdentity` mode those properties belong to
([`BP-NODE-007`](#BP-NODE-007)), and why the platform refuses, rather than
forwards, a request it cannot authorize ([`BP-ACCESS-002`](#BP-ACCESS-002)). A
`PRIVATE` endpoint carries no sign-in at all, which is safe only because nothing
outside its deployment can reach it ([`BP-ACCESS-011`](#BP-ACCESS-011)).

A released claim is personal data that the workload stores and may send on, and
the platform cannot take it back. That is why a blueprint names each one in
`viewerClaims`, why a deployment fact is bound through a parameter
([`BP-PARAM-011`](#BP-PARAM-011)) that a reviewer reads, and why neither is
ever released by default.

An exemption opens part of a restricted endpoint to anyone who can reach it.
`PATHS` opens only the routes a component names, and the platform never exempts
a path it could read two ways ([`BP-ACCESS-009`](#BP-ACCESS-009)). `BEARER`
opens every route to any request that presents a bearer token, valid or not, so
the endpoint is then exactly as strong as the workload's own token check. Prefer
`PATHS`. A cross-origin preflight to a route that is not exempt carries no
credentials, and is refused.

An application that hands ownership to whoever completes its first-run setup is
exposed from the moment its setup route is reachable without a viewer. A
blueprint closes that window with an ordered job that claims the instance over
the node's private endpoint ([§4.6](#start-order)): no exemption takes effect
until the job has succeeded ([`BP-ACCESS-012`](#BP-ACCESS-012)). An `OPEN`
endpoint has no such window to close, because it is reachable as soon as its
node is ready, so its setup route belongs behind `RESTRICTED`.

A hash is not the secret, but it can be attacked offline, so it is sensitive
and never published ([§5.2](#origins)). The generated parameter a hash is
made from is disclosed only to the people who manage the deployment.

A build secret reaches the build and nothing else: the resolution record names a
recipe by its digest, which covers each secret's ID and input name and never its
value ([component §5.1](../../component/v2/spec.md#build)).
