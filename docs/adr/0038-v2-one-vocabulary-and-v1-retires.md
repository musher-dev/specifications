# ADR 0038: v2: one vocabulary for the Musher documents, and v1 retires

- **Status:** Accepted
- **Date:** 2026-10-24
- **Relies on:** [ADR 0033](0033-inputs-are-the-only-way-into-a-component.md) §5, the reset that is spent
- **Relies on:** [ADR 0005](0005-platform-divergence-reconciliation.md) §1, what a breaking change requires
- **Refines:** [ADR 0021](0021-repository-organized-around-the-family-version.md) §2, a released major with no directory
- **Refines:** [ADR 0023](0023-published-bytes-are-immutable-release-assets.md) §3, §7, a retired major's ledger and URLs
- **Refines:** [ADR 0022](0022-the-musher-document-core-specification.md) §7, core releases and their dependents
- **Refines:** [ADR 0003](0003-controlled-vocabulary-placement.md) §3, membership is an `admission` rule
- **Refines:** [ADR 0007](0007-naming-conventions.md) §4, one name per identifier, held by term records
- **Refines:** [ADR 0027](0027-a-reference-names-a-fact-the-document-cannot-contain.md) §2, §3, placeholders and namespaces
- **Refines:** [ADR 0034](0034-access-and-viewer-identity-are-part-of-exposure.md) §1, `RESTRICTED` access
- **Refines:** [ADR 0035](0035-how-identity-and-credentials-reach-a-workload.md) §5, the creator facts
- **Closes:** [#176](https://github.com/musher-dev/specifications/issues/176)
- **Closes:** [#177](https://github.com/musher-dev/specifications/issues/177)
- **Closes:** [#184](https://github.com/musher-dev/specifications/issues/184)
- **Closes:** [#185](https://github.com/musher-dev/specifications/issues/185)

## Context

Every family has released v1: core `v1.1.1`, component `v1.6.1`, blueprint
`v1.7.2` and listing `v1.0.1`. The platform, the CLI, the SDKs and the catalog
build on them, and each of those restates the documents' words in its own
code, its own glossary and its own customer copy. A word that is wrong here is
wrong in all of them.

We read every sentence of the four specifications, the schema sources and
[docs/conformance.md](../conformance.md) against three measures:

- **ISO 704 and ISO 1087.** A term is transparent, consistent, appropriate,
  economical and derivable, and one term names one concept in one context. A
  definition gives a genus and a differentia, and passes the substitution test:
  put it in place of the term in a real sentence of the specification and the
  sentence still says the same thing.
- **Prior art in about 25 ecosystems**, among them Kubernetes, Compose, Helm,
  Nomad, Terraform, OAM, Score, Radius, Backstage, Render, Railway, Heroku,
  CNAB and Porter, Crossplane, servicebinding.io, Cloud Foundry, Dapr and
  Airflow.
- **The organization's own vocabularies**: the platform's customer glossary
  (`terms.json` and `banned-terms.json`, which feed its Vale styles), the
  Pelorus ubiquitous language (`ubiquitous-language.json`, generated from the
  context maps), and the engineering conventions' `terminology/global.yml`.

The reading found about sixty defects. They fall into four groups.

**Homonyms: one word, several concepts.** "profile" has seven senses: the YAML
profile, the Markdown profile, the value-schema profile, the compute profile,
core's validation profiles, the conformance profiles and the behavioural
fixture profiles. "reference" has six: the `${{ }}` substitution, a
`componentRef`, an OCI image reference, an "endpoint reference", the connection
"source reference" and the reference grammar. "capability" has four: a phase,
a connection's `capabilities`, a Linux capability a runtime may withhold, and
the "Unsupported capabilities" sections. "admission" has four, and "publish"
four: an output "publishes" a value, a component is published to the catalog,
a release is published, and a listing is shown on the storefront.

**Synonyms: one concept, several words.** Where a value comes from is called
its origin, its supplier, its supply, its source and its `from`. A major
version is a "compatibility family", a "line", a "major line" and a "release
line". A placement constraint is also a "pin", and a storage class token is a
"term".

**Wrong names.** `spec.components` holds nodes, not components: a node deploys
a component, and the key names the thing it is not.
`ERR_VERSION_NOT_MONOTONIC` is reported on `revision`, and
[ADR 0007](0007-naming-conventions.md) §3 says `version` names a specification
release. `ERR_SECRET_LITERAL` fires for any sensitive input, secret or not.
`ERR_ENDPOINT_NOT_HTTP` covers three different protocol sets. Component reports
an unknown input as `ERR_UNKNOWN_INPUT_REFERENCE` and blueprint the same
condition as `ERR_UNKNOWN_INPUT`. `ERR_OUTPUT_NOT_PRODUCIBLE`,
`ERR_INPUT_NOT_GUARANTEED` and, at an output, `ERR_UNSATISFIED_REQUIRED_INPUT`
are one condition under three codes. Blueprint's binding section still carries
the anchor `#connections` and the rule IDs `BP-CONN-002` and `BP-CONN-003`,
from a retired model in which a connection was the edge.

**Model gaps.** Diagnostics are reported in a `resolution` phase that
[core v1 §6](https://github.com/musher-dev/specifications/blob/core/v1.1.1/specifications/core/v1/spec.md#validation-layers)
never declared. Core names validation profiles `structural`, `document`,
`publication` and `deployment`, while docs/conformance.md names conformance
profiles `parser`, `structural`, `offline` and `platform`, two lattices for one
idea. Listing leaves two gaps that only a narrowing can close: media size and
dimensions are unbounded, and an SPDX licence identifier is checked for shape
and never for membership. And the catalog item a listing describes as
`itemType: COMPONENT` may hold any number of components.

Nine open issues belong to the same work, because each needs a name this
reading settles: [#176](https://github.com/musher-dev/specifications/issues/176),
[#177](https://github.com/musher-dev/specifications/issues/177),
[#184](https://github.com/musher-dev/specifications/issues/184),
[#185](https://github.com/musher-dev/specifications/issues/185), and
issues #190 to #194, which
[ADR 0040](0040-source-and-build-recipe.md) decides. Connections for any
protocol are [ADR 0039](0039-provenance-is-chosen-at-deployment.md).

### Why a v2, and why now

Almost every fix above renames a field, a value, a code or a requirement ID,
so a document valid under v1 is rejected, or reports a different code, under
the fix.
[Core v1 §3](https://github.com/musher-dev/specifications/blob/core/v1.1.1/specifications/core/v1/spec.md#compatibility)
and
[governance](../governance.md#compatibility-review) make that a new major.
[ADR 0033](0033-inputs-are-the-only-way-into-a-component.md) §5 used the one
exception that could have avoided it, and said so: the reset is spent, and the
next narrowing is a v2 on the ordinary terms.

The platform is still before its first customers, and every document that
depends on these specifications lives in an organization repository pinned to
an exact release. A major now costs one coordinated migration. The same major
after customers have authored documents costs every one of them a migration,
and a vocabulary that has shipped into customer copy is close to impossible to
change.

## Decision

### 1. Term records are the authority for document vocabulary

The vocabulary of the Musher documents is held as data, in one hand-edited
file, `docs/terminology.yaml`, whose shape is `docs/terminology.schema.json`.
`docs/terminology.md` is generated from it by `task docs`, committed, and held
fresh by `task check:docs`. The paths are declared in `tools/src/lib/layout.ts`,
and the repository root does not change.

One **term record** names one concept in one context. A homonym across
contexts is two records, as in the Pelorus ubiquitous language. A record
carries:

| Field | Meaning | Borrowed from |
|---|---|---|
| `id` | `<context>.<concept>`, such as `blueprint.node` | engineering conventions |
| `display_name` | The term as prose writes it | engineering conventions |
| `context` | `core`, `component`, `blueprint`, `listing` or `conformance` | Pelorus |
| `definition` or `authority` | A genus-and-differentia definition, or a link to the outside authority that defines it. Exactly one | engineering conventions |
| `shortDefinition` | One line, for tooltips and glossaries | platform glossary |
| `kind_of`, `part_of`, `associated: [{relation, term}]` | The concept system | ISO 704 |
| `identifiers: {fields, codes}` | JSON Pointers and diagnostic codes that spell the concept | this repository |
| `verbs`, `example`, `confusables` | How the term is used, and what it is mistaken for | ISO 1087 |
| `aliases: [{text, status, scope, suggest, note}]` | `status` is `banned` or `discouraged`, `scope` is `prose` or `identifier` | engineering conventions |
| `deprecated: {note, replaced_by}` | A retired term | engineering conventions |
| `related`, `seeAlso`, `source` | `source` names the specification section and the ADR | platform glossary |
| `stability`, `status`, `tags` | `status: approved` only after review | engineering conventions |

Field names match the engineering conventions' `terminology.schema.json`
wherever the two overlap. The engineering conventions do not mirror platform
domain nouns, so these records live here, and this repository is the authority
for what the document vocabulary means. The platform glossary and Pelorus link
to these records instead of restating them.

`task check:terms` (`tools/src/policy/terms.ts`) enforces the records in four
scopes:

1. **Records.** The shape, unique ids, every relation target exists,
   `definition` and `authority` are exclusive, and no definition is circular or
   begins "is when".
2. **Identifiers.** Every schema property, enum value, `$defs` key, diagnostic
   code, requirement ID prefix, reserved namespace and `x-musher-grammar` value
   is claimed by a record, and none is a banned alias. The glossary is
   exhaustive by construction.
3. **Defined terms.** Every term a `spec.md` bold-defines has a record whose
   `source` names that section, and the anchor exists. `spec.md` stays
   normative: a record quotes it and may not disagree with it.
4. **Prose.** A Vale style generated from the records,
   `.config/markdown/styles/MusherSpecifications/{Terms,Discouraged}.yml` under
   `.config/markdown/vale.ini`, runs over every `spec.md`, the documentation
   except accepted ADRs, changelogs and generated files, and the schema
   `description` strings. Vale is pinned in `.config/mise/config.toml`, its
   configuration complies with the engineering conventions' copy rules, and
   `.config/README.md` indexes it.

A definition is checked in review by the substitution test. Before a record
becomes `status: approved`, two readers outside the work, a platform engineer
and a catalog author, name the concept from its definition and then define the
term; a mismatch becomes a `confusables` entry.

### 2. Lifecycle: deployment replaces installation

| v1 | v2 |
|---|---|
| installation (the noun) | **deployment**: one blueprint revision instantiated for an organization |
| installer (the role) | **deployer** |
| blueprint §5 "Installation parameters" | "Deployment parameters", anchor `#parameters` kept |
| `installationSnapshot`, the private "installation snapshot" | `deploymentSnapshot`, the "deployment snapshot" |
| `deployment.installer.{identity,email,name}` | `deployment.creator.{identity,email,name}` |
| blueprint §5.4 "Install-form presentation" | "Deploy form", with `#deploy-form` beside the kept `#install-form` |
| fixture and context field `installation`; case `connection-wrong-installation` | `deployment`; `connection-wrong-deployment` |
| "running instance" | **replica** |

**Why deployment.** The `${{ deployment.* }}` namespace already said it, and so
do the platform glossary and Pelorus. "Install" describes putting a package
onto a machine. CNAB and Porter do say "installation", so prior art is split,
and the organization's own vocabulary decides it.

**Why creator.** The fact is captured once, when the deployment is created
([ADR 0035](0035-how-identity-and-credentials-reach-a-workload.md) §5), and a
later deployer who redeploys or updates it does not change it. "deployer" would
name whoever acted last. Pelorus renames `Installer` to `Creator` to match.

**Kept.** "rollout" stays, defined as one applied generation of a deployment;
its record notes that Pelorus calls the same thing `Release`. The reserved
`environment` namespace is defined as the environment a deployment reads
variable values from. "replica" replaces "instance" because the platform
glossary bans "instance".

### 3. The composition graph: nodes

| v1 | v2 |
|---|---|
| blueprint `spec.components`; the record's `components` | **`spec.nodes`**; `nodes` |
| a component as "a definition of one graph node" | "a reusable, versioned definition that a blueprint node deploys" |
| blueprint §4 "Component graph" | "Node graph", anchor `#components` kept |
| "repo-local" and "published" component references | **item-local** and **catalog** references |
| "registry" | **catalog** |
| "deployable application", "composition", "app" | **blueprint**. "stack" is admitted in customer copy; "application", "app" and "composition" are discouraged aliases |

**Why nodes.** A node is a named use of one component in a blueprint, with the
compute, storage, exposure and bindings that use gives it. Two nodes may
deploy one component, so the map is keyed by node, and naming it `components`
named the thing it is not. Kubernetes and Nomad use "node" for a host machine;
these specifications say "host" for that, and the record lists it as a
confusable.

### 4. Placeholders and document references

| v1 | v2 |
|---|---|
| a `${{ }}` "reference"; the "reference grammar" | **placeholder**; the "placeholder grammar", anchor `#reference-grammar` kept |
| `CORE-REF-001`..`003`, `COMP-REF-001`, `BP-REF-001` | `CORE-PLACEHOLDER-001`..`003`, `COMP-PLACEHOLDER-001`, `BP-PLACEHOLDER-001` |
| `ERR_MALFORMED_REFERENCE` | `ERR_MALFORMED_PLACEHOLDER` |
| `ERR_UNKNOWN_REFERENCE_NAMESPACE` | `ERR_UNKNOWN_PLACEHOLDER_NAMESPACE` |
| `ERR_REFERENCE_NOT_IN_SCOPE` | `ERR_NAMESPACE_NOT_PERMITTED` |
| component `ERR_UNKNOWN_INPUT_REFERENCE`, blueprint `ERR_UNKNOWN_INPUT` | `ERR_UNKNOWN_INPUT`, declared once in component; blueprint reuses it through its dependency and drops its own row |
| reserved namespace `output` | `nodes` |
| "a family admits a namespace" | "a family permits a namespace" |
| "endpoint reference"; the connection "source reference" | "a field naming an endpoint"; the "requested path" |

`BP-REF-002` and `BP-REF-003` keep their IDs, because they are about document
references (`componentRef`), which is what "reference" now means alone. An "OCI
image reference" keeps OCI's own term.

**Why placeholder.** The syntax substitutes a value into a slot and evaluates
nothing: no operator, no function, no fallback. GitHub Actions calls its
`${{ }}` an expression, and that would promise an expression language. A
placeholder is what format strings, SQL and message catalogs call a slot
filled from outside, which is exactly what the grammar does.

### 5. Validation phases and one scope lattice

There are five phases, declared in core §6, in the conformance fixture `phase`
enum and in the case trees:

| Phase | Enforces | Where it runs |
|---|---|---|
| `parser` | The Musher YAML profile | Client and server, never the network |
| `structural` | The family's JSON Schema bundle | Client and server, never the network |
| `semantic` | Rules a schema cannot express, over the document, its item and its pinned dependencies | Client and server, never the network |
| `admission` | Rules that need the platform's own state: publication obligations, revision order, catalog membership, the vocabularies the platform pins, account, region and quota | Server only |
| `resolution` | Resolving a deployment against acquired context. Each diagnostic names its stage: `sources`, `parameters`, `allocation`, `connections`, `values`, `environment` or `record` | Server only; fixtures use synthetic context |

`admission` is the v1 `capability` phase renamed; the case-tree directories
`capability/` become `admission/`, and case ids follow. `resolution` is
declared for the first time, with the stages already in use; `sources` is new
and first ([ADR 0040](0040-source-and-build-recipe.md) §6). "stage" means only
a resolution step. The health "stages" are **probes**, and the path segment
`/spec/workload/health/<stage>/` becomes `<probe>`.

**Why admission.** Kubernetes uses "admission" for the server's checks before
it accepts an object, which is exactly this phase. "capability" was already a
connection field, a Linux privilege and a section title. The privilege sense
becomes "privilege".

One lattice replaces both v1 lattices:

```
parser ⊂ structural ⊂ document ⊂ publication ⊂ deployment
```

| Scope | Requires |
|---|---|
| `parser` | `parser` |
| `structural` | `parser`, `structural` |
| `document` | `structural` and `semantic`, with the item and dependency context the document needs |
| `publication` | `document` and the `admission` rules of publication |
| `deployment` | `publication`, the `admission` rules of deployment, and `resolution` |

The result field `validationProfile` becomes **`validationScope`**, and its
values are the scope names. A conformance claim names a scope from the same
lattice: the v1 `offline` profile is `document`, and `platform` is
`publication` or `deployment`, whichever the implementation reaches. The
behavioural fixtures' `profile` (`normalization`, `resolution`, `rendering`,
`lifecycle`) becomes **`suite`**, a "behaviour suite".

A bare "profile" is never written. It is always the YAML profile, the Markdown
profile, the value-schema profile or the compute profile. "Validation layers"
becomes "Validation phases", with `#validation-layers` kept. Core §1.1
"Bindings" becomes "What a family fixes", its column "Core parameter" becomes
"Left to the family", and core §1.2 "Admission" becomes "What belongs in core",
which frees "binding", "parameter" and "admission" for the concepts that use
them. `CORE-ADMISSION-001` keeps its ID, because it already meant admission in
the phase's sense.

### 6. Releases, revisions and publishing

| v1 | v2 |
|---|---|
| `ERR_VERSION_NOT_MONOTONIC` | `ERR_REVISION_NOT_INCREASING` |
| "edition"; "dependency editions" | **core release**; "dependency releases". Core §9 "Editions" becomes "Core releases", anchor `#editions` kept |
| "compatibility family", "line", "major line", "release line" | **major version** |
| an output "publishes" a value; "republishes its own inputs" | an output **produces** a value; it **forwards** an input |
| "counts releases of the item" | "counts publications" |

"release" means only a release of a specification, and "publish" only putting
an item into the catalog. Protobuf and Rust use "edition" for an epoch of
semantics, which is not what a core release is. `family.tier.size` is kept, and
always written "compute family". Task names such as `check:editions` are
tooling, not document vocabulary, and this record does not rename them.

### 7. Values, bindings and parameters

| v1 | v2 |
|---|---|
| origin, supplier, supply, source, all for where a value comes from | **origin**. "source" means only a workload source |
| `ERR_INVALID_PARAMETER_SOURCE` | `ERR_INVALID_PARAMETER_ORIGIN` |
| `ERR_INVALID_HASH_SOURCE` | `ERR_INVALID_HASHED_PARAMETER` |
| `BP-CONN-002`, `BP-CONN-003`, `BP-PARAM-006`, `BP-PARAM-007` | `BP-BIND-002`, `BP-BIND-003`, `BP-BIND-006`, `BP-BIND-007` |
| Submitted, Generated, Hash, Variable, Deployment fact and Connection | submitted, generated, hash, variable, deployment-fact and connection **parameter** |
| "logical schema", "value shape" | **value schema**. Component §6.3 becomes "Value schemas", anchor `#value-schema` kept. A "logical value" stays the value before encoding |
| "contract" for the contract, the specification, supplied documents and sensitive inputs | **component contract** only; "this specification"; "supplied component documents"; "sensitive inputs" |
| `target.envVarKey`; `ERR_CONFLICTING_ENV_KEY` | `target.envVar`; `ERR_CONFLICTING_ENV_VAR` |
| `ERR_OUTPUT_NOT_PRODUCIBLE`; `ERR_UNSATISFIED_REQUIRED_INPUT` at an output (`BP-RESOLVE-001`) | `ERR_INPUT_NOT_GUARANTEED` |
| `ERR_CONFLICTING_NODE_COMPUTE` | `ERR_COMPUTE_REQUIRED` when a running node names no compute, `ERR_COMPUTE_FORBIDDEN` when an `EXTERNAL` node names one |
| `ERR_SECRET_LITERAL` | `ERR_SENSITIVE_LITERAL` |

**sensitive** is the property; a **secret** is a sensitive credential. The code
fires for every sensitive input, so it names the property. "organization
variable" is kept, and "shared variable" is admitted in customer copy.

### 8. Endpoints and exposure

| v1 | v2 |
|---|---|
| "address family" (`COMP-EP-004`) | **URL-addressed** (`HTTP`, `HTTPS`, `WS`, `GRPC`) and **port-addressed** (`TCP`, `UDP`), each a defined term |
| `ERR_ENDPOINT_NOT_HTTP` for `publicURL` and `publicHostname` | `ERR_ENDPOINT_NOT_URL_ADDRESSED` |
| `ERR_ENDPOINT_NOT_HTTP` otherwise | kept, only for **HTTP-routed** endpoints (`HTTP`, `HTTPS`, `WS`) and HTTP probes (`HTTP`, `HTTPS`) |
| `ERR_ENDPOINT_NOT_L4` | `ERR_ENDPOINT_NOT_PORT_ADDRESSED` |
| `ERR_UNKNOWN_ADDRESS_PROPERTY` | `ERR_UNKNOWN_ENDPOINT_PROPERTY` |
| "HTTP-family"; "edge port", "edge address" | "HTTP-routed"; "public port", "public address" |
| `access: AUTHENTICATED` | **`access: RESTRICTED`** |
| component `accessExemptions: {paths, bearer}` | **`exemptibleRequests: {paths, bearerToken}`** |
| a bare "connection" meaning a TCP connection (`COMP-EP-007`, `BP-ACCESS-004`, `BP-ACCESS-005`) | **network connection** |

**Why RESTRICTED.** The rule admits only viewers who sign in *and* whom the
deployment's access policy admits. "Authenticated" states half of that, and a
reader takes it to mean that any signed-in person gets in. "Restricted" is the
word general-access settings such as Google Drive's use for the same rule, and
the value set reads `OPEN | RESTRICTED`.

**Why `exemptibleRequests`.** The component *offers* the requests that may skip
sign-in, and the blueprint *grants* the exemption. One word for both made the
offer and the grant indistinguishable in review. Blueprint keeps
`accessExemptions: [PATHS, BEARER]`, the grant. Probe `auth.bearer` is a
different field and keeps its name.

`viewer`, `viewerIdentity`, `viewerClaims` and the `presentationHint` values
`ENDPOINT_URL` and `CONNECTION_STRING` are kept; their records list the
`confusables`.

### 9. Catalog and listing

| v1 | v2 |
|---|---|
| listing `spec.description` (Markdown), the "description Markdown profile" | **`spec.overview`**, the "overview Markdown profile", anchor `#description-markdown` kept |
| `sourceRepoURL` | `sourceRepositoryURL` |
| catalog item: "one directory holding one deployable thing" | "a directory the catalog publishes as one unit: a blueprint item or a component item" |
| "storefront" and "catalog" as synonyms | **catalog**: the published collection; **storefront**: the browsing interface |
| the "label" grammar; `x-musher-grammar: label` | the **DNS-label grammar**; `x-musher-grammar: dns-label` |
| placement "pins"; a storage class "term" | **constraint**; **catalog value**. "pin" means only fixing a version or a digest, "term" now means a term record, and "token" means only a credential token, such as a bearer token or a JWT |
| "Every Musher specification document"; "Component Document" | "Every Musher document"; lowercase |

**Why overview.** Every input, output and `metadata` object carries a plain-text
`description`. The listing's long Markdown body is a different thing, and
naming it the same made "description" mean plain text in one place and
rendered Markdown in another.

### 10. Connection and binding keep their names, and the leftovers go

In v2, a **binding** is the authored edge that supplies one input of one node,
`nodes.<node>.bindings.<input>: {parameter} | {node, output} | {value}`. A
**connection** is a stored, organization-configured set of one protocol's
members, named by `${{ connections.<path> }}`, selected per deployment, and
delivered through a connection parameter into a connection input. An
organization has connections, a parameter selects one, and a binding delivers
it to a node.

Prior art splits the two concepts the same way:

| Ecosystem | The stored, attachable thing | The act or edge of attaching it |
|---|---|---|
| Cloud Foundry | service instance, managed or user-provided | service binding |
| servicebinding.io | provisioned service | `ServiceBinding` |
| Airflow, n8n, Make | connection, a named credential set | a task or step uses it |
| Crossplane | connection details of a composed resource | a claim writes them to a secret |
| Radius | resource | connection, the edge from container to resource |
| Dapr | none | "bindings" are event triggers, unrelated |

Musher's pair matches Cloud Foundry, servicebinding.io, Airflow and
Crossplane. Only Radius uses "connection" for the edge. The confusion in v1
came from leftovers of the retired model in which a connection was the edge,
and v2 removes each of them:

- `BP-CONN-*` becomes `BP-BIND-*` (§7).
- The anchor `#connections` moves from blueprint §4.2 to §5.3, where the
  concept lives; `#bindings` stays on §4.2.
- The sentence rejecting "a `connections` member, a `toNode` or `toInput`
  binding" moves to the migration notes.
- Core §1.1 is retitled (§5), and the TCP sense is "network connection" (§8).
- Pelorus retires its definition of a connection as a blueprint edge.

The records pin the triad: *a binding supplies an input from an origin; a
connection is one kind of origin, reached through a connection parameter*.

### 11. `EXTERNAL` stays

`type` answers "what does the platform run", and `EXTERNAL` answers "nothing":
the node stands in the graph for something whose values arrive from outside
the graph, which is external to the graph and not to Musher. `CONNECTOR` would
name a role instead, and mix a second axis into `type`. In Kafka Connect,
Airbyte, n8n and Zapier a connector is code that runs. An external node fed
only value inputs connects nothing. Kubernetes `ExternalName`, Backstage and
Pelorus already say "external". "connector" is a discouraged prose alias, and
the specification says an external node "stands in for a connection or an
outside service". [ADR 0039](0039-provenance-is-chosen-at-deployment.md)
defines `type` exactly.

### 12. What stays on purpose

Each of these was tested and kept, and each record lists its `confusables`:
`kind` and `type`, `specVersion`, `spec`, `metadata`, `slug`, `revision`,
`lineage`, `SERVICE` (beside the Kubernetes Service), `WORKER`, `JOB` and
`schedule`, `workload`, `endpoint`, `targetPort`, `exposure`, `visibility`,
`binding`, `connection`, `parameter`, `output`, compute profile, `volume`,
`listing`, `viewer`, `diagnostic`, `allocation`, `acquisition`, `selection`,
`view`, `materialization`, `obligation`, `fact`, resolution record, lifecycle
stage `SUNSET`, and selection kind `USER`.

**blueprint** stays despite Render, whose Blueprint is a `render.yaml` that
describes a set of services. The two mean nearly the same thing, so the
collision costs a reader little, and every other candidate collided worse:
"stack" is CloudFormation's and Compose's, "application" is everyone's, and
"composition" is taken by Crossplane.

**`specVersion` stays REQUIRED**, and a v2 document declares `specVersion: v2`.
The envelope is how a reader, a validator and a dispatcher know which major a
document was written against, and a document that says nothing cannot be told
apart from one written against a major that does not exist yet.

### 13. Platform obligations

Two platform behaviours that v1 left unsaid become requirements, each with a
requirement ID pinned by a behavioural case or explained by a runner
exclusion, as `task check:conformance` requires.

**Probes are attributable (#184).** Component §5.4 states once, and §11 and
blueprint cite, that an HTTP probe carries no viewer identity and carries
`Forwarded: for=<address>` ([RFC 7239](https://www.rfc-editor.org/rfc/rfc7239))
and `X-Forwarded-For: <address>`, the two naming the same non-loopback address
of the probing host, as the platform's proxy does for viewer traffic. On an
endpoint exposed with `viewerIdentity: HEADER`, the probe MUST also arrive from
a peer inside the endpoint's `trustedProxyCIDRs`; under every other mode its
peer is unconstrained. Probes are sent by the platform's probing host, not
through viewer authentication. A health path MUST answer such a request. A
workload that requires proxied requests to carry a client address then accepts
its probes, and the strongest probe stays available to a workload behind a
trusted proxy. The host agent sends these headers.

**A private endpoint stays inside its deployment (#177).** Blueprint §4.5,
beside `BP-NODE-005`, states that a `PRIVATE` endpoint MUST NOT be reachable
from another deployment, from another organization or from the public
internet: only the nodes of its deployment and the platform's probing host
reach it, at the network level, whatever DNS resolves. v1 said a private
endpoint "serves the platform and sibling nodes"
and never said who else is kept out, so two platforms could draw the boundary
in two places.

### 14. Listing: getting started, and one component per component item

**`spec.gettingStarted` (#185).** An optional Markdown field, in the overview
Markdown profile, of at most 5 000 characters. It says what a person does right
after the deployment is running, such as creating the first account at a path.
It MAY name a parameter by its `ui.label`, and SHOULD NOT hold a value. The
media and link rules that bind `overview` bind it, with the same diagnostics.
An assistant that hands a running deployment to a person reads it instead of
mining the overview's marketing copy.

**`LIST-ITEM-002`.** A catalog item whose listing declares
`itemType: COMPONENT` holds exactly one component document. Any other number is
`ERR_COMPONENT_COUNT` at `/spec/itemType`, semantic. A component item is one
component published on its own; more than one is a blueprint item without the
blueprint that would say how they fit.

### 15. Every core release re-releases its dependents (#176)

[docs/publication.md](../publication.md#the-dependency-gate) gains one rule:
**a core release is released together with a release of every kind family that
depends on it, each recording that core release.** A family with no other
change is released as a patch whose only change is the recorded core release.
No two released kind families of one major version then record different core
releases, and a consumer that vendors several families, as platform-api does,
never has to wait for one of them to catch up. The v2 release set is the first
to follow it, with all four families on core `2.0.0`.

### 16. The gaps only a narrowing could close are closed now

v2 leaves no gap that only a narrowing could close.

**Media bounds.** Listing §5 bounds each media file:

| Bound | Rule | Phase | Diagnostic |
|---|---|---|---|
| The icon is at most 1 MiB, and each screenshot at most 5 MiB | File size, read from the filesystem, never by decoding | `semantic` | `ERR_MEDIA_TOO_LARGE` |
| The icon is square and at least 256 px per side, and a screenshot at most 4096 px per side | Dimensions, read from the image header | `admission` | `ERR_MEDIA_DIMENSIONS` |

A Markdown image in `overview` or `gettingStarted` is held to the screenshot
bounds. A file whose header gives no dimensions in the format its extension
names is `ERR_MEDIA_DIMENSIONS`. Listing §10 changes from "MUST NOT decode" to
"MUST NOT decode in the `parser`, `structural` or `semantic` phases, and reads
only the image header at `admission`".

**SPDX membership.** Each identifier in `license` MUST be on the SPDX License
List release the platform pins, and an identifier after `WITH` on that
release's exception list. Identifiers compare case-insensitively, as SPDX
defines, and `LicenseRef-<idstring>` is accepted without lookup. Otherwise
`ERR_UNKNOWN_LICENSE` at `/spec/license`, in the `admission` phase, which
[ADR 0003](0003-controlled-vocabulary-placement.md) §3 already gave membership
rules.

**The category set is reviewed once.** Removing a category is a major and
adding one is a minor, so the set is reviewed now against
[governance → Changing a controlled vocabulary](../governance.md#changing-a-controlled-vocabulary),
and every removal or merge it finds lands in v2. The candidates are `GAMING`,
and `AI_ML` beside `AGENTS`. The reviewed set is the enum the listing v2 schema
carries at `2.0.0`, and each value it drops is a row of the listing migration
table. The review also adds the shelves that would otherwise have had to split
an existing token later: `MODELS`, `DATABASES` and `OBSERVABILITY` are new in
`2.0.0`. Any addition after `2.0.0`, such as a hypothetical `EDUCATION` shelf,
stays a minor.

**Not supported in v2.** Each family's "Unsupported capabilities" or "Known
debt" section becomes "Not supported in v2", anchor `#known-debt` kept, as a
table whose rows each say how the gap would close. Every row MUST close by a
relaxation: accepting something v2 rejects. A gap that could close only by
rejecting something v2 accepts is decided in v2 itself, as the two above are.

### 17. A retired major

A **retired major** is a major version of a family that is recorded and tagged
but has no directory on `main`. v1 of all four families becomes one: the v2
directories are moved from v1 with `git mv`, so history follows, and nothing named
`specifications/<family>/v1/` remains.

- **Its released bytes stay.** Its tags, its immutable GitHub Releases, its
  ledger entries in `published.json` and its pinned URLs do not change. The
  site keeps serving every released v1 path from verified release assets,
  including the alias `/<family>/v1/<family>.schema.json`, which serves the
  newest v1 release and never `main`.
- **It is history, not a candidate.** `check:compat` never replays a retired
  major against anything on `main`, and `check:published`, `check:editions`,
  `site:fetch` and the traceability page treat its entries as released history.
  A tool reading a retired major reads it at its tag, where every path the
  layout names exists.
- **Nothing on main changes it.** A retired major takes no further release.
  Its release-please package is removed, and correcting it would need its
  directory back, which is a decision for a new ADR.

The family READMEs say that v1 is retired and that v2 supersedes it.

### 18. Release as 2.0.0, declared breaking

All four families release `2.0.0`, under `specifications/<family>/v2`, in the
order core, then component, then blueprint and listing. Documents declare
`specVersion: v2`. Schema `$id`s and bundle URLs are under `/<family>/v2/`, and
a family cites core as "core v2 §N", always as a link. The release-please
packages become `specifications/<family>/v2` with `initial-version: 2.0.0`,
and the v1 packages leave the configuration and the manifest.

The change is declared breaking twice: by `BREAKING CHANGE:` footers in the
pull request's `BEGIN_COMMIT_OVERRIDE` block, as
[CONTRIBUTING](../../.github/CONTRIBUTING.md#squash-merges-and-overrides)
requires and with its exception for core, and in each v2 `spec.md`, whose
scope section ends with a **"Migration from v1"** subsection. That subsection
is a table mapping every renamed v1 field, value, diagnostic code and
requirement ID to its v2 form, each with one line saying why.

Each v2 specification also gets a short "Terms" section that bold-defines its
concepts once, which `check:terms` reads. Every rule takes one form: the ID,
one normative sentence, then its phase, code and path, either as a row of a
rule table or as an inline trailer after the sentence. Requirement numbers are
kept except where a prefix is renamed, and every renamed section keeps its old
anchor beside the new one.

### 19. Downstream moves to v2

v1 support is dropped, not run in parallel. The catalog migrates every
document to v2 and enforces one component per component item; the platform and
platform-api adopt `RESTRICTED`, the creator facts, the scope names and the
protocol views; Pelorus renames `Installer` to `Creator`, retires its
connection-edge definition and records `Release` as its name for a rollout; the
host agent sends the probe forwarding headers; the CLI fixes its `kind: App`
drift; and the SDKs regenerate. The platform glossary and Pelorus link to the
term records for document vocabulary.

## Alternatives considered

**A second v1 baseline reset.** Withdraw every v1 release from `check:compat`
again and ship the renames as minors, as
[ADR 0033](0033-inputs-are-the-only-way-into-a-component.md) §5 did. Rejected:
that record said the reset was spent, and a second one would make the
guarantee of core v1 §3 mean "until the maintainers need otherwise". A v2 says
what happened: the documents changed incompatibly.

**Aliases in v1.** Accept both spellings, `components` and `nodes`,
`AUTHENTICATED` and `RESTRICTED`, for the rest of v1, and remove the old ones
in a later major. Rejected: every alias doubles a rule in the schema, the
validator and the corpus, the old word keeps being written because it keeps
working, and the narrowing that removes it is still a major. It pays twice for
one rename.

**v1 beside v2 on main.** Keep `specifications/<family>/v1/` and release fixes
on it while v2 starts. Rejected: it doubles the validator surface, the corpus
and the review load for a major no one outside the project depends on, and
every downstream repository is migrating anyway. A retired major keeps
everything a pinned reader needs, which is its released bytes.

**An omitted `specVersion` meaning the latest major.** It would spare an author
one line. Rejected: a document's meaning would change, silently, the day a v3
is released, which is the failure
[core §2](../../specifications/core/v2/spec.md#envelope) exists to prevent.

**Keeping "installation".** CNAB and Porter use it. Rejected: the
organization's own vocabularies and the existing `deployment` namespace say
deployment, and a term the platform has to translate at every boundary is
wrong for this repository.

**`CONNECTOR` for `EXTERNAL`, `inputs` for bindings, "resource", "service" or
"credential" for connection.** Rejected for the reasons in §10 and §11: each
either mixes two axes, puts declaration and supply under one word, or collides
with compute resources, `type: SERVICE` or a narrower concept.

**Term records in the engineering conventions.** Rejected: their charter keeps
platform domain nouns out, and document vocabulary is decided where the
documents are.

## Consequences

**Every document migrates.** The catalog's documents, every fixture and every
example change. 401 case metadata files are touched, about 171 of them for
`components:` and about 133 for `envVarKey`.

**One word per concept, held by a check.** A banned alias fails
`check:terms`, and a new identifier no record claims fails it too, so a future
homonym is caught when it is written rather than in a review like this one.

**Pinned v1 readers are unaffected.** Released v1 bytes, URLs and ledger
entries stay. What changes is that nothing new is released on v1.

**Stricter listings.** An oversized or undersized image and an unpublished
licence identifier are now rejected, at the phases above. That is what makes
every later listing change a relaxation.

**Two platform requirements.** Probes carry forwarding headers, and private
endpoints are fenced per deployment. Both need platform work, and both are
tracked downstream.

**Out of scope.** The repository's own name, which predates the organization's
naming grammar and is waived under REPO-08
([#149](https://github.com/musher-dev/specifications/issues/149)), is not
document vocabulary. It stays with the engineering-conventions upgrade and the
organization's renames, and this record does not change it.
