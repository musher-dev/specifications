# Musher Component Document Specification, version 2

**Status:** Stable
**Family:** `component`
**Schema:** `https://specifications.musher.dev/component/v2/component.schema.json`

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) when, and only when, they
appear in all capitals, as shown here.

> **What is normative.** This document, together with the
> [Musher Document Core Specification](../../core/v2/spec.md) it applies,
> defines the complete behaviour of the component family. The JSON Schema
> bundle is its executable form for structural validity, and the
> [conformance corpus](../../../docs/conformance.md) is its executable form for
> observable outcomes; both are normative, and neither is permitted to disagree
> with this document or with the other. Schema `description` fields, examples,
> generated documentation, and validator message text are informative.
>
> A disagreement between two normative artifacts is a defect in this
> specification and blocks a release. Until it is fixed this document governs.
> That is how to read a broken specification, not a licence for the schema
> to be wrong.

---

## <a id="scope"></a>1. Scope

A **component** is a reusable, versioned definition that a blueprint node
deploys. Its `type` says what the platform runs for it ([§5](#workload)): a
workload, with where its image comes from, how it runs and how its health is
determined, or nothing at all, for an `EXTERNAL` component that stands in the
graph for a connection or an outside service. Every component states, in its
component contract ([§6](#contract)), the inputs it consumes and the outputs it
produces.

A component document does not describe a deployment. A
[blueprint](../../blueprint/v2/spec.md) composes components into a node graph,
and a blueprint is what gets deployed.

**Out of scope for this document**

- Placing components as nodes of a node graph: the `blueprint` family
- Catalog presentation: the `listing` family
- Runtime state, replicas and allocated endpoints: the Musher API

Rules in this document take one form. A requirement ID, then one normative
sentence, then the phase that decides it, and, when a document can break it,
the diagnostic code and the JSON Pointer it is reported at. A path written
relative, such as `from/input`, is relative to the object the rule is about.

### <a id="terms"></a>1.1 Terms

- A **component** is a reusable, versioned definition that a blueprint node
  deploys ([§4](#metadata), [§5](#workload)).
- A **workload** is what the platform runs for a `SERVICE`, `WORKER` or `JOB`:
  its source, build recipe, command, endpoints, probes, volumes and schedule
  ([§5](#workload)).
- A **source** is where a workload's content comes from: an image, a Git
  commit or an uploaded archive ([§5.1](#source)).
- A **build recipe** is how the platform builds an image from a Git or upload
  source: a build context, exactly one of a Dockerfile and a buildpacks
  builder, build arguments and build secrets ([§5.1](#build)).
- An **endpoint** is a named port a workload listens on, with the protocol the
  platform speaks to it ([§5.2](#endpoints)).
- A **probe** is an HTTP request the platform sends to a named endpoint to
  decide whether a workload has started, is ready or is alive
  ([§5.4](#health)).
- The **component contract** is the inputs a component consumes and the
  outputs it produces ([§6](#contract)).
- An **input** is a value input, which declares a value schema, or a
  connection input, which declares a protocol ([§6.1](#inputs)).
- An **output** is a named value the component produces, with exactly one
  origin ([§6.2](#outputs)).
- An **origin** is where a value comes from. For an output it is a literal, one
  of the component's own inputs, an endpoint property or a template
  ([§6.2](#outputs)).
- A **value schema** is the bounded JSON Schema subset an input or output
  declares for its logical value ([§6.3](#value-schema)).
- A **connection** is the members of one protocol, acquired together for one
  connection parameter of one deployment ([§6.4](#connection-requirements)).
  Each member is required, optional with a default, or optional without one,
  and the `url` of `POSTGRES` and `REDIS` is derived ([§6.4](#members)).
- **Sensitive** is the property of a value that is never supplied as an
  authored literal and never shown. A **secret** is a sensitive credential
  ([§11](#security)).

### <a id="migration"></a>1.2 Migration from v1

v1 is retired: its releases stay recorded and served, and v2 supersedes it
([ADR 0038](../../../docs/adr/0038-v2-one-vocabulary-and-v1-retires.md)). A v1
document becomes a v2 document by the renames below. Old identifiers are
written plainly here because v2 declares none of them.

<!-- vale MusherSpecifications.Terms = NO -->

| v1 | v2 | Why |
|---|---|---|
| specVersion v1 | `specVersion: v2` | A new major version ([§3](#compatibility)) |
| workload.source.git.build | `workload.build`, beside the source | Source and build recipe are two concepts, and an upload is built with the same recipe ([ADR 0040](../../../docs/adr/0040-source-and-build-recipe.md)) |
| build.dockerfile, relative to the repository root | `build.dockerfile`, relative to `build.context` | A monorepo builds each component from its own directory. `context` defaults to `.`, so a v1 path stays valid |
| (none) | `workload.source.upload`, `build.context`, `build.secrets` | New: uploaded source, the build context and build secrets |
| (none) | `git.ref.tag` | New: a tag is requested like a branch |
| git.ref.commit, any non-empty string | `git.ref.commit`, a full 40- or 64-digit commit object ID | An abbreviation can become ambiguous as the repository grows |
| git.repositoryURL, any non-empty string | `git.repositoryURL`, an absolute `https` URL without userinfo, query or fragment | Acquisition admits `https` alone, and a document never carries a credential |
| target, required on a workload input | `target`, optional, with `ERR_UNUSED_INPUT` for an input nothing reads | An input may exist only to feed a build secret, a probe or an output |
| target.envVarKey | `target.envVar` | The field names an environment variable, not a key |
| accessExemptions: {paths, bearer} on an endpoint | `exemptibleRequests: {paths, bearerToken}` | The component offers; the blueprint's `accessExemptions` grants |
| connection protocols OPENAI_CHAT_COMPLETIONS, ANTHROPIC_MESSAGES | adds `POSTGRES`, `REDIS`, `S3` | Connections for any protocol ([ADR 0039](../../../docs/adr/0039-provenance-is-chosen-at-deployment.md)) |
| an output forwarding a sensitive member, sensitive by propagation | the output declares `sensitive: true` | The component contract shows the sensitivity |
| ERR_UNKNOWN_INPUT_REFERENCE | `ERR_UNKNOWN_INPUT` | One code for naming an input the component does not declare; blueprint reuses it |
| ERR_OUTPUT_NOT_PRODUCIBLE | `ERR_INPUT_NOT_GUARANTEED` | The same condition as for a probe or trust bundle: an input that may be absent |
| ERR_CONFLICTING_ENV_KEY | `ERR_CONFLICTING_ENV_VAR` | Follows `target.envVar` |
| ERR_SECRET_LITERAL | `ERR_SENSITIVE_LITERAL` | It fires for every sensitive value, not only secrets |
| ERR_ENDPOINT_NOT_HTTP for publicURL and publicHostname | `ERR_ENDPOINT_NOT_URL_ADDRESSED` | `ERR_ENDPOINT_NOT_HTTP` now means only HTTP-routed and HTTP probe protocols |
| ERR_ENDPOINT_NOT_L4 | `ERR_ENDPOINT_NOT_PORT_ADDRESSED` | Names the protocol set ([§5.2](#endpoints)) |
| ERR_UNKNOWN_ADDRESS_PROPERTY | `ERR_UNKNOWN_ENDPOINT_PROPERTY` | The table holds endpoint properties, not only addresses |
| ERR_VERSION_NOT_MONOTONIC | `ERR_REVISION_NOT_INCREASING` | The rule is about `revision` |
| COMP-REF-001 | `COMP-PLACEHOLDER-001` | A `${{ }}` is a placeholder; "reference" means a document reference |
| phase capability | phase `admission` | The server's checks before it accepts a document |
| health "stages", /spec/workload/health/&lt;stage&gt;/ | probes, `/spec/workload/health/<probe>/` | "stage" means only a resolution stage |
| §6.3 Logical schemas | [§6.3 Value schemas](#value-schema) | One name for the concept |
| §10 Unsupported capabilities | [§10 Not supported in v2](#not-supported) | Each row says how it would close |
| x-musher-grammar: label | `x-musher-grammar: dns-label` | The DNS-label grammar, by its name |

<!-- vale MusherSpecifications.Terms = YES -->

Every requirement ID not listed keeps its number and its meaning.

## <a id="envelope"></a>2. Document envelope

```yaml
specVersion: v2
kind: COMPONENT
metadata: { … }
spec: { … }
```

A component document is a Musher document as the
[Musher Document Core Specification](../../core/v2/spec.md) defines one, and
every rule of core v2 applies to it. This family fixes what
[core v2 §1.1, What a family fixes](../../core/v2/spec.md#family-fixes), leaves to
a family:

| Left to the family | This family |
|---|---|
| `kind` ([`CORE-ENV-002`](../../core/v2/spec.md#CORE-ENV-002)) | `COMPONENT` |
| `metadata` ([`CORE-ENV-003`](../../core/v2/spec.md#CORE-ENV-003)) | [§4](#metadata) |
| Fields accepting `null` ([`CORE-ENV-007`](../../core/v2/spec.md#CORE-ENV-007)) | `spec.contract.inputs.*.default`; `spec.contract.outputs.*.from.value`; `spec.contract.*.*.schema.enum` and logical payload descendants permitted by their schemas |
| Item document ([core v2 §4.1](../../core/v2/spec.md#item-directory)) | No, it sits inside an item |

This specification narrows core v2 where it says so and relaxes it nowhere. It
cites core by its major version ("core v2 §N"), and the core release a release
of this family was built and tested against is recorded with that release
([core v2 §9](../../core/v2/spec.md#core-releases)).

**Normative dependencies**

| Specification | Major version |
|---|---|
| [core](../../core/v2/spec.md) | v2 |

## <a id="compatibility"></a>3. Version compatibility

Stated once for every family in
[core v2 §3](../../core/v2/spec.md#compatibility), and applies without
narrowing. For this family it runs from `2.0.0`. v1 is a retired major
version: it is recorded and tagged, its released bytes are still served, and
nothing in v2 is compatible with it by promise
([ADR 0038](../../../docs/adr/0038-v2-one-vocabulary-and-v1-retires.md) §17).
[§1.2](#migration) maps every v1 name to its v2 form.

## <a id="metadata"></a>4. Metadata

`metadata` carries `revision` and `description`, and nothing else. A component
document has no `slug`: a [blueprint](../../blueprint/v2/spec.md#identity) and
its listing each name the item they are two halves of, and a component is not
the item. The name a component answers to is the stem of the file that holds
it, which an item-local reference spells out in full
([blueprint §4.1](../../blueprint/v2/spec.md#component-reference)). Any other
property is `ERR_UNKNOWN_FIELD`, as
[core v2 §2](../../core/v2/spec.md#envelope) requires at every level.

<a id="description"></a><a id="COMP-DESC-002"></a>**`COMP-DESC-002`**: A
`description`, when present, is plain text of 1 to 280 characters, the limit of
a [listing summary](../../listing/v2/spec.md#presentation), and a consumer MUST
NOT render it as Markdown. Structural: an empty or longer one is
`ERR_INVALID_VALUE` at `/metadata/description`.

<a id="COMP-DESC-003"></a>**`COMP-DESC-003`**: A published component MUST carry
a `description`. Admission: `ERR_DESCRIPTION_REQUIRED` at `/metadata`.

The description says what the component is, in one or two sentences, for the
person composing a blueprint. It is not catalog copy: that is the listing's
`summary`. A published component is reused by items that know nothing about
it, so the document describes itself.

The rule is an `admission` rule because *absent* and *not written yet* are the
same bytes, and only the publisher can tell them apart. A component with no
description is one an author is still writing, and every other rule still
decides it. An offline validator MUST NOT report `ERR_DESCRIPTION_REQUIRED`,
and an editor may say the field is empty without calling the document invalid.

`revision` is an integer, 1 or greater. It is REQUIRED and never defaulted.
Exact deployment identity additionally requires the generated artifact digest.

**The revision names a position in one component's lineage.** It is not a SemVer
triple and carries no compatibility meaning: nothing is derivable from the
distance between 2 and 7, and nothing is promised about how one revision behaves
against another. It orders, and that is the whole of its job.

**Two reference forms pin it, and only one writes it down.**

| Reference form | What pins the revision |
|---|---|
| Item-local | The referenced document's own `metadata.revision`. The node's `revision` MUST NOT be present. |
| Catalog | `revision` on the node. |

<a id="COMP-ID-001"></a>**`COMP-ID-001`**: Each publication of a component MUST
carry a revision strictly greater than the highest already published for that
component. Admission: `ERR_REVISION_NOT_INCREASING` at `/metadata/revision`.

Gaps are permitted: publishing 1 and then 7 is not an error. Reuse is the case
the rule exists for. `revision: 3` on a catalog reference selects that
component revision, and a catalog that let 3 mean two different documents would
make the pin name nothing. The item-local form has the same problem one step
removed: a blueprint that deployed revision 3 last month and revision 3 today,
with different bytes behind it, has no way to say so. The rule is `admission`
because deciding it needs the catalog's lineage, which
[core v2 §6](../../core/v2/spec.md#validation-phases) forbids the earlier
phases to require. A client validating a file it has just written cannot see
the lineage and MUST NOT report this rule.

Whether the catalog treats an identical re-submission as a no-op rather than as
a publication is outside this specification. It orders publications; it does
not define when two YAML files are the same document.

**The revision is not the item's revision.** The item's is the blueprint's
([blueprint §3](../../blueprint/v2/spec.md#identity)), and it is pinned to no
component beneath it. An item's revision counts publications of the item, a
component's counts publications of the component, and through catalog
references one component is deployed by many items at once.

A publication of a component an item deploys SHOULD be accompanied by a
publication of the item, because the item's listing describes what a deployment
would run, and a component that has moved makes that description stale. It is
a SHOULD and carries no diagnostic: the disagreement is visible only across two
revisions, and a validator is handed one.

Nothing orders one component's revisions against another's: two components in
the same item sitting at 4 and 11 mean nothing worth reading into. Offline, the
`minimum: 1` of the schema is the whole of the rule about a revision.

## <a id="workload"></a><a id="type"></a>5. What the platform runs

`spec` holds `type`, `workload` and `contract`. The type says what the platform
runs, the workload says how it runs it, and the component contract
([§6](#contract)) says what the component consumes and produces. The `spec`
of the smallest service that can be published holds only a type, an image and
one endpoint, and publishing it also takes the `revision` and `description` of
[§4](#metadata):

```yaml
spec:
  type: SERVICE
  workload:
    source:
      image: nginx:1.29.4-alpine
    endpoints:
      web:
        targetPort: 8080
        protocol: HTTP
```

<a id="COMP-TYPE-001"></a>**`COMP-TYPE-001`**: `spec.type` is REQUIRED and is
one of `SERVICE`, `WORKER`, `JOB` and `EXTERNAL`. Structural:
`ERR_MISSING_FIELD` at `/spec` when absent, `ERR_INVALID_VALUE` at `/spec/type`
for any other value.

| Type | What the platform runs | Endpoints |
|---|---|---|
| `SERVICE` | Its workload, long-running and request-driven | At least one |
| `WORKER` | Its workload, long-running and not request-driven | Optional, never `PUBLIC` |
| `JOB` | Its workload, to completion ([§5.7](#jobs)) | None |
| `EXTERNAL` | Nothing: the node stands in the graph for a connection or an outside service ([§5.6](#external)) | None |

<a id="COMP-EXT-001"></a>**`COMP-EXT-001`**: An `EXTERNAL` component MUST NOT
carry a `workload`. Structural: `ERR_INVALID_VALUE` at `/spec/workload`.

<a id="COMP-TYPE-006"></a>**`COMP-TYPE-006`**: A published `SERVICE`, `WORKER`
or `JOB` MUST carry a `workload`. Admission: `ERR_WORKLOAD_REQUIRED` at
`/spec`.

The type decides which workload fields apply:

| Field | `SERVICE` | `WORKER` | `JOB` |
|---|---|---|---|
| `source` | Required to publish | Required to publish | Required to publish |
| `build` | Beside a `git` or `upload` source only | Beside a `git` or `upload` source only | Beside a `git` or `upload` source only |
| `command` | Optional | Optional | Required to publish |
| `endpoints` | At least one to publish | Optional | Forbidden |
| `health` | Optional | Optional | Forbidden |
| `schedule` | Forbidden | Forbidden | Optional |
| `volumes` | Optional | Optional | Optional |

Forbidden means absent. Empty mappings and null are not alternative spellings.
A forbidden field is `ERR_INVALID_VALUE` at its own path, and an unknown field
is `ERR_UNKNOWN_FIELD`, both structural.

<a id="publication-obligations"></a>**What publication requires.** "Required to
publish" is not a structural rule. A component with a type and nothing else is
one someone is still writing, for the reason [`COMP-DESC-003`](#COMP-DESC-003)
gives, so it validates, an editor can store it, and each of these is checked in
the `admission` phase when it is published:

| Obligation | Rule | Code | Path |
|---|---|---|---|
| A runnable component carries a `workload` | [`COMP-TYPE-006`](#COMP-TYPE-006) | `ERR_WORKLOAD_REQUIRED` | `/spec` |
| A workload carries a `source` | [`COMP-SRC-004`](#COMP-SRC-004) | `ERR_SOURCE_REQUIRED` | `/spec/workload` |
| A `SERVICE` declares an endpoint | [`COMP-TYPE-002`](#COMP-TYPE-002) | `ERR_ENDPOINT_REQUIRED` | `/spec/workload`, or `/spec/workload/endpoints` when empty |
| A `JOB` carries a `command` | [`COMP-TYPE-007`](#COMP-TYPE-007) | `ERR_COMMAND_REQUIRED` | `/spec/workload` |
| An `EXTERNAL` component produces an output | [`COMP-EXT-003`](#COMP-EXT-003) | `ERR_OUTPUT_REQUIRED` | The object that lacks it, or `/spec/contract/outputs` when empty |
| Every input and output is described | [`COMP-DESC-004`](#COMP-DESC-004) | `ERR_DESCRIPTION_REQUIRED` | The input or output |

An absent field is reported at the object that lacks it, and a field that is
present and empty at itself. An offline validator MUST NOT report any of them.
Everything that constrains a field that *is* present stays structural.

<a id="COMP-TYPE-002"></a>**`COMP-TYPE-002`**: A published `SERVICE` MUST
declare at least one endpoint, because it is request-driven and a service
nothing can reach serves nothing. Admission: `ERR_ENDPOINT_REQUIRED` at
`/spec/workload` when `endpoints` is absent, and at `/spec/workload/endpoints`
when it is empty.

<a id="COMP-TYPE-003"></a>**`COMP-TYPE-003`**: A `WORKER` MAY declare endpoints
and probes, and its endpoints serve the platform and sibling nodes, never the
public. Semantic: an output of a `WORKER` that reads a `public*` or viewer
identity property of its own endpoints, through an `endpoint` origin or a
`template`, is `ERR_ENDPOINT_NOT_EXPOSABLE` at the output's `from` or
`from/template`. A blueprint that exposes a `WORKER` endpoint `PUBLIC` fails
with the same code ([blueprint §4.3](../../blueprint/v2/spec.md#node-compute)).

<a id="COMP-TYPE-004"></a>**`COMP-TYPE-004`**: A `JOB` MUST NOT declare
`endpoints` or `health`, because it runs to completion and serves nothing.
Structural: `ERR_INVALID_VALUE` at the field.

<a id="COMP-TYPE-007"></a>**`COMP-TYPE-007`**: A published `JOB` MUST carry
`command`, because it has nothing to run to completion without one. Admission:
`ERR_COMMAND_REQUIRED` at `/spec/workload`.

<a id="COMP-TYPE-005"></a>**`COMP-TYPE-005`**: Only a `JOB` MAY declare
`schedule`; a schedule is a property of a job, not a type of its own.
Structural: `ERR_INVALID_VALUE` at `/spec/workload/schedule`.

<a id="command"></a>**Command.** <a id="COMP-CMD-001"></a>**`COMP-CMD-001`**:
`command` is a non-empty list of strings in exec form, each item one argument
passed to the process verbatim, which no shell parses, splits or expands.
Structural: a string is `ERR_INVALID_TYPE` and an empty list
`ERR_INVALID_VALUE`, at `/spec/workload/command`.

`command` replaces the image's `CMD` and keeps its `ENTRYPOINT`, which is what
`command` means in Docker and Compose. Where `command` is omitted, the image's
own `CMD` runs. A workload that needs a shell names one, as in
`["/bin/sh", "-c", "…"]`.

### <a id="source"></a>5.1 Source and build recipe

`source` says where the workload's content comes from, and the key that is
present says which: `image` for an image that already exists, `git` for a
commit of a repository, and `upload` for an archive uploaded to the platform.
A `git` or `upload` source has no image until one is built, so beside it
`build`, the **build recipe**, says how.

```yaml
workload:
  source:
    git:
      repositoryURL: https://github.com/musher-dev/examples
      ref: { branch: main }
  build:
    context: services/api
    dockerfile: Dockerfile
    arguments: { NODE_ENV: production }
    secrets:
      NPM_TOKEN: { input: npmToken }
```

<a id="COMP-SRC-001"></a>**`COMP-SRC-001`**: `source` MUST hold exactly one of
`image`, `git` and `upload`; a `git` source requires `repositoryURL`, and its
`ref`, when present, holds exactly one of `branch`, `tag` and `commit`.
Structural:
naming none is `ERR_MISSING_FIELD` and naming two or more is
`ERR_INVALID_VALUE`, at the object holding them.

<a id="COMP-SRC-004"></a>**`COMP-SRC-004`**: A published workload MUST carry a
`source`. Admission: `ERR_SOURCE_REQUIRED` at `/spec/workload`.

<a id="COMP-SRC-002"></a>**`COMP-SRC-002`**: `image` is an OCI image reference:
a name, then optionally a tag, then optionally a SHA-256 digest. Structural: a
reference outside that grammar is `ERR_INVALID_VALUE` at
`/spec/workload/source/image`.

A name without a tag means the tag `latest`, as it does in Docker, and every
tag is accepted. A tag is an author's request, and a tag such as `latest` moves;
only a resolved digest identifies immutable content.

An omitted Git `ref` requests the repository's default branch. A `branch` and a
`tag` are requests, not pins: a branch moves, and a tag can be moved. A `commit`
identifies the repository content, not every build input or the resulting
image.

<a id="COMP-SRC-006"></a>**`COMP-SRC-006`**: `git.repositoryURL` MUST be an
absolute `https` URL without userinfo, query or fragment, and `ref.commit` MUST
be a full commit object ID: 40 lowercase hexadecimal digits for SHA-1, or 64 for
SHA-256, never an abbreviation. Structural: `ERR_INVALID_VALUE` at
`/spec/workload/source/git/repositoryURL` or at
`/spec/workload/source/git/ref/commit`.

A document never names a Git credential. A repository that needs one is reached
through the platform's source connection, which the organization configures
outside the document ([§10](#not-supported)). The platform reads
`repositoryURL`, and every image reference, as acquisition under its own policy
([core v2 §6](../../core/v2/spec.md#validation-phases)), never as a fetch by a
validation phase.

<a id="COMP-SRC-005"></a>**`COMP-SRC-005`**: `upload.digest` is REQUIRED and is
`sha256:` followed by 64 lowercase hexadecimal digits, the SHA-256 of the
archive's bytes exactly as uploaded. Structural: `ERR_MISSING_FIELD` at
`/spec/workload/source/upload` when absent, `ERR_INVALID_VALUE` at
`/spec/workload/source/upload/digest` otherwise.

A digest is a pin, where a URL would be a request. The archive is a POSIX tar
archive, in the ustar or pax format, optionally gzip-compressed, and
`upload.digest` is the SHA-256 of the bytes uploaded, compressed or not. Its
size limit and the upload API belong to the platform.

<a id="COMP-SRC-007"></a>**`COMP-SRC-007`**: The platform MUST extract an upload
archive with the archive root as the source root, and MUST reject the whole
archive, extracting nothing, when it is not such a tar archive, or when an entry
has an absolute path or a `..` segment, two entries name one path, an entry is a
device, a FIFO or a hard link, or a symbolic link's target resolves outside the
archive root. Platform obligation; no document breaks it. Blueprint resolution
reports a rejected archive as `ERR_INVALID_RESOLUTION_CONTEXT` in the `sources`
stage ([blueprint §5.2](../../blueprint/v2/spec.md#BP-RESOLVE-001)).

The **source root** is the repository's root at the resolved commit for `git`,
and the archive root for `upload`. The **source content key** of a `git` or
`upload` source names exactly the content a build reads: the resolved commit for
`git`, and `upload.digest` for `upload`.

<a id="build"></a>**The build recipe.**

| Field | Meaning |
|---|---|
| `context` | The directory, relative to the source root, that is the whole build context. Default `.` |
| `dockerfile` | Build with the Dockerfile at this path, relative to `context` |
| `buildpacks.builderImage` | Build with this Cloud Native Buildpacks builder, an OCI image reference, pinned to a digest before the build ([blueprint §5.2](../../blueprint/v2/spec.md#BP-RESOLVE-001)) |
| `arguments` | Build-time values keyed by name, each a non-sensitive literal string |
| `secrets` | Build secrets keyed by ID, each `{input}`, read from one of the component's own inputs |

<a id="COMP-BUILD-001"></a>**`COMP-BUILD-001`**: A workload whose source is
`git` or `upload` MUST carry `build`, and one whose source is `image` MUST NOT.
Structural: `ERR_MISSING_FIELD` at `/spec/workload` when it is missing, and
`ERR_INVALID_VALUE` at `/spec/workload/build` beside an image. A workload with
no source yet may carry a build.

<a id="COMP-BUILD-002"></a>**`COMP-BUILD-002`**: `build` holds exactly one of
`dockerfile` and `buildpacks`, and `context` and `dockerfile` are canonical
relative paths of at most 512 characters. Structural: naming neither recipe is
`ERR_MISSING_FIELD` and naming both `ERR_INVALID_VALUE`, at
`/spec/workload/build`; a path outside the grammar is `ERR_INVALID_VALUE` at
its field.

A canonical relative path is one or more segments joined by `/`, with no
leading or trailing `/`, no empty segment and no segment made only of dots, so
never `.` or `..`, and no `\` or control character. `context` may also be `.`
alone, the source root; `dockerfile` may not, because `.` is not a file.

<a id="COMP-BUILD-003"></a>**`COMP-BUILD-003`**: An `arguments` key and a
`secrets` ID match the environment-variable grammar of [§5.3](#env-vars), and an
argument's value is a string. Structural: `ERR_INVALID_VALUE` at the key, and
`ERR_INVALID_TYPE` at a value that is not a string.

Arguments configure the build only; runtime configuration rides on inputs
([§6.1](#inputs)). An argument is recorded in the image history and the build
provenance, so it is never a secret ([§11](#security)): a value that must stay
secret is a build secret.

<a id="COMP-BUILD-004"></a>**`COMP-BUILD-004`**: A build secret's `input` MUST
name a value input of the component that exists, is a string, is
`sensitive: true` and is always supplied, and its ID MUST NOT also be an
`arguments` key. Semantic, at `/spec/workload/build/secrets/<ID>/input`:
`ERR_UNKNOWN_INPUT` for an input that does not exist, `ERR_VALUE_CONSTRAINT`
for one that is not a sensitive string, and `ERR_INPUT_NOT_GUARANTEED` for one
that may be absent; and `ERR_CONFLICTING_ENV_VAR` at
`/spec/workload/build/secrets/<ID>` for an ID that is also an argument, because
a buildpacks build receives both through one environment.

A sensitive input carries no default ([§6.1](#inputs)), so an input a build
secret reads is a required one.

<a id="COMP-BUILD-005"></a>**`COMP-BUILD-005`**: An implementation MUST build
with `context` as the whole build context, the Docker build context of a
Dockerfile build and the application directory of a buildpacks build, and the
build MUST NOT read any file of the source outside `context`, including through
a symbolic link that resolves outside it. Platform obligation; no document
breaks it.

This is the property the platform relies on to decide which components a change
touched: **a change to a Git source touches a component exactly when a changed
path lies under its `context`.** One repository can hold more than one component,
and a platform tracking a branch rebuilds only those whose context a push
touched. When it does so, and whether a push releases anything at all, is
continuous delivery, which belongs to the platform. The path grammar keeps the
Dockerfile inside the context too, because the recipe file is an input to the
build like any other.

<a id="COMP-BUILD-006"></a>**`COMP-BUILD-006`**: A Dockerfile build MUST receive
each build secret as a BuildKit secret whose `id` is the secret ID, read by
`RUN --mount=type=secret,id=<ID>`; a buildpacks build MUST receive it as the
file `<platform>/env/<ID>`, read by the detect and build steps only; and the
platform MUST NOT write a build secret's value, or any hash of it, into an image
layer, the build provenance, the build log, the launch environment or the
resolution record. Platform obligation; no document breaks it.

Provenance MAY name a secret's ID. A secret's value is not part of the build
recipe, so rotating a token does not change the recipe's digest.

<a id="COMP-BUILD-007"></a>**`COMP-BUILD-007`**: A build recipe is always named
by the document, and an implementation MUST NOT infer one: not by finding a
Dockerfile, not by choosing between a Dockerfile and buildpacks, and not by
assuming a default path. Structural, through [`COMP-BUILD-001`](#COMP-BUILD-001)
and [`COMP-BUILD-002`](#COMP-BUILD-002): a `git` or `upload` source without a
recipe is rejected, never completed.

A buildpacks builder's own detect step, which chooses buildpacks inside the
named builder, is part of the named recipe. A tool MAY write a recipe into the
document before publication, such as a step that inspects a repository and
writes `workload.build`; what is published is then a named recipe like any
other.

### <a id="endpoints"></a>5.2 Endpoints

Each named endpoint requires `targetPort`, an integer from 1 to 65535, and
`protocol`.

<a id="COMP-EP-018"></a>**`COMP-EP-018`**: An endpoint name matches
`^[a-z][a-z0-9]{0,19}$`: a lowercase letter, then up to nineteen lowercase
letters or digits. Structural: `ERR_INVALID_VALUE` at
`/spec/workload/endpoints`.

`targetPort` is the port the workload listens on, where traffic for the
endpoint is forwarded. It is never the public port, which the platform
allocates. A `targetPort` below 1024 is structurally valid.

<a id="COMP-EP-019"></a>**`COMP-EP-019`**: Where the platform's runtime cannot
bind a port below 1024 for a workload, a `targetPort` below 1024 MUST be
rejected, because binding one needs a privilege that runtime does not grant.
Admission, against the platform's runtime: `ERR_PRIVILEGED_PORT` at
`/spec/workload/endpoints/<name>/targetPort`. A runtime that binds every port
rejects none.

<a id="protocol-sets"></a>**Protocol sets.** `protocol` is one of `HTTP`,
`HTTPS`, `WS`, `GRPC`, `TCP` and `UDP`. Every rule about protocols names one of
these sets:

| Set | Protocols | What it decides |
|---|---|---|
| **URL-addressed** | `HTTP`, `HTTPS`, `WS`, `GRPC` | A public URL can address it: `publicURL` and `publicHostname`, and the readiness probe a `PUBLIC` one requires |
| **Port-addressed** | `TCP`, `UDP` | It is reached at a host and port with no URL: `publicAddress` and `publicPort` |
| **HTTP-routed** | `HTTP`, `HTTPS`, `WS` | The platform's proxy routes it per request: sign-in, viewer identity properties, `oidc` and `exemptibleRequests` |
| **HTTP probe protocols** | `HTTP`, `HTTPS` | A probe can be sent to it ([§5.4](#health)) |

Components declare endpoints, never exposure. A blueprint node selects public
exposure, and an endpoint it does not expose is private. A `WORKER`'s endpoints
are never public ([`COMP-TYPE-003`](#COMP-TYPE-003)).

<a id="COMP-EP-001"></a>**`COMP-EP-001`**: Every field naming an endpoint MUST
name a declared one, including on a single-endpoint workload: no endpoint is
implied. Semantic: `ERR_UNKNOWN_ENDPOINT` at the field.

<a id="endpoint-properties"></a>**Endpoint properties.** The platform allocates
these before workloads start; they do not assert readiness.

| Property | Logical type | Meaning |
|---|---|---|
| privateHostname | string | Allocated internal DNS hostname of the named endpoint |
| privatePort | integer | Named endpoint's target port |
| privateAddress | string | Internal hostname, colon, decimal target port |
| publicURL | string | Allocated URL of a URL-addressed endpoint, without a trailing slash |
| publicHostname | string | Hostname portion of that URL |
| publicAddress | string | Allocated public address of a port-addressed endpoint, `host:port`, with an IPv6 host bracketed |
| publicPort | integer | Allocated public port of a port-addressed endpoint |
| viewerIdentityHeader | string | Lowercase name of the request header carrying the signed-in viewer's identity |
| trustedProxyCIDRs | array of string | CIDRs covering every address the workload observes as the immediate peer of forwarded traffic |
| viewerEmailHeader | string | Lowercase name of the request header carrying the viewer's verified email address |
| viewerNameHeader | string | Lowercase name of the request header carrying the viewer's display name |
| viewerAssertionHeader | string | Lowercase name of the request header carrying the signed viewer assertion |
| viewerAssertionIssuer | string | The assertion's `iss` |
| viewerAssertionAudience | string | The assertion's `aud`, unique to this endpoint of this deployment |
| viewerAssertionKeysURL | string | HTTPS URL of the JSON Web Key Set that verifies the assertion |
| oidcIssuerURL | string | Issuer URL of the OpenID Connect provider the endpoint is a client of |
| oidcClientID | string | Client identifier the platform registered for the endpoint |
| oidcClientSecret | string, sensitive | Client secret of that registration |

<a id="COMP-EP-004"></a>**`COMP-EP-004`**: A public property is read only from
an endpoint in its protocol set: `publicURL` and `publicHostname` from a
URL-addressed endpoint, and `publicAddress` and `publicPort` from a
port-addressed one. Semantic, at the reading output's `from`, or `from/template`
for a template: `ERR_ENDPOINT_NOT_URL_ADDRESSED` and
`ERR_ENDPOINT_NOT_PORT_ADDRESSED` respectively. The private properties apply to
every protocol.

Public properties require explicit `PUBLIC` exposure in the blueprint. A
public property read from a private endpoint fails with
`ERR_ENDPOINT_NOT_PUBLIC` in blueprint
([blueprint §4.3](../../blueprint/v2/spec.md#node-compute)). The allocation
context supplies the public URL scheme and routing address; a validator MUST NOT
invent them.

<a id="viewer-identity"></a>**Viewer identity.** A blueprint can expose an
endpoint so that the platform signs its viewers in and tells the workload who
each viewer is ([blueprint §4.5](../../blueprint/v2/spec.md#access)), in one of
three ways, and each way needs facts only the platform has:

| Blueprint `viewerIdentity` | What the workload receives | Properties it reads |
|---|---|---|
| `HEADER` | The viewer's identity in a plain request header | `viewerIdentityHeader`, `trustedProxyCIDRs` |
| `ASSERTION` | A signed JWT in a request header | `viewerAssertionHeader`, `viewerAssertionIssuer`, `viewerAssertionAudience`, `viewerAssertionKeysURL` |
| `OIDC` | Nothing per request: the workload signs viewers in as an OpenID Connect client | `oidcIssuerURL`, `oidcClientID`, `oidcClientSecret` |

The identity is a stable, opaque identifier of the viewer, never an email
address and never a credential, and it is the same in every mode. A blueprint
may also release the viewer's `EMAIL` and `NAME`. Under `HEADER` each released
claim travels in a header of its own, named by `viewerEmailHeader` or
`viewerNameHeader`; under the other two modes it travels inside the token. The
addresses in `trustedProxyCIDRs` are the ones the workload itself observes as
the peer of a network connection, which need not be any public address.

<a id="COMP-EP-012"></a>**`COMP-EP-012`**: The viewer identity properties,
every property from `viewerIdentityHeader` to `oidcClientSecret` in the table
above, are read only from an HTTP-routed endpoint, and `trustedProxyCIDRs` only
into an array of strings. Semantic, anchored as
[`COMP-EP-004`](#COMP-EP-004)'s diagnostics are: `ERR_ENDPOINT_NOT_HTTP` for
another protocol; `ERR_ENDPOINT_NOT_EXPOSABLE` for a `WORKER`, as
[`COMP-TYPE-003`](#COMP-TYPE-003) says; and `ERR_VALUE_CONSTRAINT` at the
output's `schema` when an output reading `trustedProxyCIDRs` does not declare an
`array` whose `items` are `string`, and at `from/template` when a template reads
it, because a template produces a string.

Reading a property requires the blueprint to select, on that endpoint, the mode
the table names, and the claim for `viewerEmailHeader` and `viewerNameHeader`,
otherwise `ERR_VIEWER_IDENTITY_NOT_FORWARDED` in blueprint. A workload that
trusts what the platform forwards obtains these values through such outputs,
never from a literal or an input's `default`, so that no node can deploy it
where the header or the token is not the platform's ([§11](#security)).

`oidcClientSecret` is the one sensitive property. An output or a template that
reads it is sensitive wherever its value travels.

<a id="oidc"></a>**OpenID Connect clients.** An OIDC client needs redirect URIs,
and only the component knows its routes, so an endpoint that can be one
declares them:

```yaml
endpoints:
  web:
    targetPort: 8080
    protocol: HTTP
    oidc:
      redirectPaths: [/oauth/oidc/callback]
```

The platform registers exactly the endpoint's `publicURL` followed by each
path. A workload that needs the whole redirect URI builds it with a template,
`"${{ self.endpoints.web.publicURL }}/oauth/oidc/callback"`.

<a id="COMP-EP-013"></a>**`COMP-EP-013`**: `oidc` belongs only to an
HTTP-routed endpoint, is closed, and requires `redirectPaths`, a unique list of
1 to 8 [endpoint paths](#endpoint-paths). Structural: `ERR_INVALID_VALUE` at
the endpoint's `oidc` on another protocol, `ERR_MISSING_FIELD` there without
`redirectPaths`.

<a id="COMP-EP-014"></a>**`COMP-EP-014`**: `oidcIssuerURL`, `oidcClientID` and
`oidcClientSecret` are read only from an endpoint that declares `oidc`.
Semantic: `ERR_ENDPOINT_NOT_OIDC_CLIENT`, anchored as
[`COMP-EP-004`](#COMP-EP-004)'s diagnostics are.

<a id="access-exemptions"></a><a id="exemptible-requests"></a>**Exemptible
requests.** A blueprint can put an endpoint behind sign-in, and a machine
client, such as a webhook sender or an API client, never has a viewer session.
A component offers, in `exemptibleRequests`, the requests its endpoint can
safely take without one, and a blueprint node grants the exemption with its
`accessExemptions`
([blueprint §4.5](../../blueprint/v2/spec.md#access-exemptions)):

```yaml
endpoints:
  web:
    targetPort: 5678
    protocol: HTTP
    exemptibleRequests:
      paths: [/webhook, /webhook-test]
      bearerToken: true
```

`paths` lists the routes that serve machines. `bearerToken: true` states that
every route of the endpoint checks the bearer token a request carries, so that
a request presenting one can be left for the workload to judge.

<a id="COMP-EP-015"></a>**`COMP-EP-015`**: `exemptibleRequests` belongs only to
an HTTP-routed endpoint, is closed, and offers something: it carries `paths`, a
unique list of 1 to 32 [endpoint paths](#endpoint-paths), or
`bearerToken: true`, or both. `bearerToken` is a boolean, and `false` offers
nothing, so `bearerToken: false` without `paths` is no offer. Structural:
`ERR_INVALID_VALUE` at the endpoint's `exemptibleRequests` on another
protocol, when it is empty, and when it carries neither `paths` nor
`bearerToken: true`.

<a id="endpoint-paths"></a><a id="COMP-EP-016"></a>**`COMP-EP-016`**: An
endpoint path begins with `/`, holds at most 256 characters, and is made of
`/`-separated segments of RFC 3986 unreserved characters and the sub-delimiters
other than `;`, plus `:` and `@`, with no empty segment, no segment `.` or
`..`, and never `/` alone, `/.musher` or a path under it. Structural:
`ERR_INVALID_VALUE` at the path.

So a path has no `//`, no trailing `/`, and no `%`, `;`, `?`, `#` or `\`. An
exempt path in `exemptibleRequests` covers a request by blueprint's rule
([`BP-ACCESS-009`](../../blueprint/v2/spec.md#BP-ACCESS-009)): after the
request path is normalised, it equals the exempt path or continues it with `/`.
A redirect path in `oidc` is compared exactly
([`BP-ACCESS-008`](../../blueprint/v2/spec.md#BP-ACCESS-008)). `/` alone is not
a path, because a list that covers every request is not an exemption. The
platform serves its own sign-in under `/.musher` on an endpoint that requires
one.

An authoritative endpoint allocation has opaque `identity` and `version`, an
optional `privateHostname`, and optional public routing facts: `hostname`,
`port`, `scheme` and `path`, and, on an endpoint that tells its workload who
the viewer is, the facts of that mode
([blueprint `BP-ACCESS-001`](../../blueprint/v2/spec.md#BP-ACCESS-001)). An
endpoint whose mode is `OIDC` also has a private client registration beside its
routing facts, never among them. Public routing requires `PUBLIC` exposure. The
public scheme is http, https, ws or wss, and the port is 1 to 65535. Hostnames
cannot carry credentials, a port, a path, query or fragment. Paths start with
`/` and carry no query, fragment, whitespace or backslash. A port-addressed
endpoint requires an allocated public port.

The endpoint properties are derived from those facts. The private port comes
only from the component's `targetPort`. An address joins hostname and port,
bracketing an IPv6 host. A public URL joins the supplied scheme, host, optional
port and path, with no trailing slash. Missing allocation context cannot make a
declared private port incomplete. Redundant address properties are rejected, so
an independently supplied public URL, hostname or port cannot disagree with
these facts. Inconsistent or malformed facts fail with blueprint's
`ERR_INVALID_RESOLUTION_CONTEXT`.

<a id="tls"></a>**The hop to the workload.** `protocol` is what the platform
speaks to `targetPort`: its proxy, forwarding traffic to an endpoint a blueprint
exposes, and its probes ([§5.4](#health)). How the public reaches the platform,
including public TLS, is the platform's concern and is unaffected. `HTTPS` is
the only protocol that is TLS on this hop in v2; `HTTP`, `WS` and `GRPC` are
cleartext on it.

```yaml
endpoints:
  web:
    targetPort: 6901
    protocol: HTTPS
    tls:
      verify: BUNDLE
      serverName: kasm.example.internal
      trustBundle: { input: caBundle }
```

<a id="COMP-EP-005"></a>**`COMP-EP-005`**: `tls`, the endpoint's trust policy,
belongs only to an `HTTPS` endpoint; `verify` is `SYSTEM`, `BUNDLE` or `NONE`,
default `SYSTEM`; `BUNDLE` requires `trustBundle` and `serverName`, and no
other mode takes a `trustBundle`; and `serverName` is a lowercase DNS name of at
most 253 characters whose last label starts with a letter, so never an IP
literal. Structural: `ERR_INVALID_VALUE` at the endpoint's `tls` on another
protocol; `ERR_MISSING_FIELD` at `tls` when `BUNDLE` lacks either field;
`ERR_INVALID_VALUE` at `tls/trustBundle` under another mode, and at a
`serverName` outside the grammar.

<a id="COMP-EP-006"></a>**`COMP-EP-006`**: `trustBundle.input` MUST name one of
the component's own string inputs that is always supplied, whose value is one
or more PEM `CERTIFICATE` blocks. Semantic, at `tls/trustBundle/input`:
`ERR_UNKNOWN_INPUT` for an input that does not exist, `ERR_VALUE_CONSTRAINT`
for one whose schema is not a string, and `ERR_INPUT_NOT_GUARANTEED` for an
optional one with no default, because the trust policy cannot fall back when
its roots are absent.

A CA certificate is not a secret. One baked into the image is an input with a
`default`, and one the deployer brings is a required input, which may be the
same input the workload reads its own certificate from.

<a id="COMP-EP-007"></a>**`COMP-EP-007`**: Every network connection the
platform makes to the endpoint, forwarded traffic and every probe alike, MUST
use the endpoint's trust policy, and an implementation MUST NOT fall back from
`SYSTEM` or `BUNDLE` to `NONE`, from `HTTPS` to `HTTP`, or from a declared
policy to an implicit one. Platform obligation; no document breaks it.

- `SYSTEM`: the certificate chain MUST end at a root the implementation
  publicly trusts, and the certificate MUST be valid for the server name.
- `BUNDLE`: as `SYSTEM`, except that the roots are exactly the certificates in
  `trustBundle`. A bundle holding no certificate is a configuration error.
- `NONE`: neither the chain nor the name is verified. This is an explicit
  exception for one endpoint whose workload serves a certificate nothing can
  verify, such as one it generated at startup. It gives up the platform's
  ability to tell the workload from anything else answering on that port.

The policy does not bind other nodes, which reach the endpoint through its
private address with clients of their own. The server name is `serverName` when
present, and is what the network connection sends in SNI. Without one, the
certificate MUST be valid for the host the platform connects to, which this
specification does not fix, so an endpoint that verifies SHOULD name its
`serverName`. The server name never changes the address connected to or the
HTTP `Host` header. Under `NONE`, `serverName` sets SNI only. A policy an
implementation cannot honour is a configuration error, reported as one, and
never a failed probe.

### <a id="env-vars"></a>5.3 Environment variables

A workload's environment is exactly its inputs' targets. An input of a workload
component may name, in `target.envVar`, the variable its value is written to
([§6.1](#inputs)), and nothing else writes the environment.

<a id="COMP-ENVVAR-004"></a>**`COMP-ENVVAR-004`**: An environment-variable
name matches `^[A-Z_][A-Z0-9_]*$` and holds 1 to 128 characters. Structural:
`ERR_INVALID_VALUE` at the input's `target/envVar`.

A value that does not vary between deployments is still an input: one with a
`default`, which a blueprint may leave unbound or override
([blueprint §4.2](../../blueprint/v2/spec.md#bindings)). The deploy form is
authored separately in the blueprint, so a default asks the deployer nothing. A
value that must never be overridden belongs in the image.

```yaml
inputs:
  pgdata:
    description: Directory PostgreSQL keeps its data files in.
    schema: { type: string }
    default: /var/lib/postgresql/data/pgdata
    target: { envVar: PGDATA }
```

<a id="COMP-ENVVAR-002"></a>**`COMP-ENVVAR-002`**: Two inputs MUST NOT claim one
`envVar`. Semantic: `ERR_CONFLICTING_ENV_VAR` at the later claiming input's
`target/envVar`, input names compared in UTF-8 order.

An input's value is encoded into its environment variable after logical
validation:

- Strings are unchanged.
- Booleans are lowercase.
- Numbers use ECMAScript JSON number serialization, and negative zero becomes
  zero.
- Null is `null`.
- Arrays and objects use compact JSON, with object keys sorted recursively by
  Unicode code point and array order preserved.

<a id="COMP-ENVVAR-003"></a>**`COMP-ENVVAR-003`**: An input's encoded value
MUST NOT contain NUL. Resolution, in the `environment` stage:
`ERR_ENV_ENCODING` at the binding that supplies the input,
`/spec/nodes/<node>/bindings/<input>`, or at `/spec/nodes/<node>/componentRef`
for an input the node leaves unbound.

An absent optional input, and an input with no target, add no environment
entry.

### <a id="health"></a>5.4 Health probes

A `SERVICE` or a `WORKER` may declare probes; a `JOB` may not
([`COMP-TYPE-004`](#COMP-TYPE-004)). `health` holds up to three probes, each
named by its role:

| Probe | Role |
|---|---|
| `startup` | Initialization gate. Until it succeeds, readiness and liveness are suspended, and exhausting its failure threshold restarts the workload |
| `readiness` | Traffic gate. Failure stops forwarding to the replica, without a restart |
| `liveness` | Restart on failure |

A probe names its mechanism by the key that is present, beside the timing
fields.

<a id="COMP-EP-002"></a>**`COMP-EP-002`**: A probe requires `http`, which names
an `endpoint` with an HTTP probe protocol and an absolute HTTP `path`.
Structural: `ERR_MISSING_FIELD` without `http`, and `ERR_UNKNOWN_FIELD` for any
other mechanism key. Semantic, at `/spec/workload/health/<probe>/http/endpoint`:
`ERR_UNKNOWN_ENDPOINT` for an undeclared endpoint, and `ERR_ENDPOINT_NOT_HTTP`
for one whose protocol is not `HTTP` or `HTTPS`.

`http` is the only mechanism in v2. A `WS` or `GRPC` workload may declare a
separate HTTP endpoint for health. A probe is a `GET` of `path`, sent over the
named endpoint's protocol and trust policy ([`COMP-EP-007`](#COMP-EP-007)); a
probe has no TLS settings of its own, and a health check needing a different
protocol names a different endpoint. HTTP status 200 to 399 succeeds; transport
failure, timeout or another status fails. A redirect is a status like any
other: it is evaluated as returned and never followed. Failure thresholds count
consecutive failures; success thresholds count consecutive successes.

Defaults: initialDelaySeconds 10, periodSeconds 10, timeoutSeconds 5,
successThreshold 1, failureThreshold 3. Initial delay is non-negative; every
other numeric probe field is a positive integer.

<a id="probe-requests"></a><a id="COMP-EP-017"></a>**`COMP-EP-017`**: A probe
request MUST carry no viewer identity, and MUST carry
`Forwarded: for=<address>`
([RFC 7239](https://www.rfc-editor.org/rfc/rfc7239)) and
`X-Forwarded-For: <address>`, the two naming the same address, a non-loopback
address of the platform's probing host, as the platform's proxy does for viewer
traffic. On an endpoint a blueprint exposes with `viewerIdentity: HEADER`, the
probe MUST also arrive from a peer address inside the endpoint's
`trustedProxyCIDRs`, so that a workload that trusts only its proxies can tell
it from any other request. Under every other mode, and on an endpoint no
exposure signs viewers in to, the probe carries the same headers and its peer
address is unconstrained. Platform obligation; no document breaks it.

An IPv6 address in `Forwarded` is bracketed and quoted, as RFC 7239 requires:
`for="[2001:db8::1]"`. A health path MUST answer such a request. A workload
that requires every proxied request to carry a client address then accepts its
probes, and the strongest probe stays available to a workload behind a trusted
proxy. A workload MUST NOT read a probe as a signed-in viewer: the platform
removes inbound identity headers from what it forwards, and a probe sets none.
This section states the probe's headers once; [§11](#security) and blueprint
cite it.

```yaml
readiness:
  http:
    endpoint: web
    path: /
    expectedStatuses: [200]
    auth:
      basic:
        username: { value: kasm_user }
        password: { input: vncPassword }
```

<a id="COMP-EP-008"></a>**`COMP-EP-008`**: `expectedStatuses`, when present,
replaces the 200 to 399 range for one probe with a non-empty list of unique
integers from 200 to 599, and the probe succeeds on a status in the list and on
no other. Structural: `ERR_INVALID_VALUE`, or `ERR_INVALID_TYPE` for a member
that is not an integer, at `expectedStatuses` or the member. A 1xx status is
never the answer to a request.

<a id="COMP-EP-009"></a>**`COMP-EP-009`**: `auth` holds exactly one mechanism,
`basic`, which requires `username` and `password`, or `bearer`, which requires
`token`, and each credential holds exactly one origin: a literal `value`, a
non-empty string, or `input`, one of the component's own inputs. Structural:
naming neither is `ERR_MISSING_FIELD` and naming both `ERR_INVALID_VALUE`, at
the object holding them.

<a id="COMP-EP-010"></a>**`COMP-EP-010`**: A password or token MUST come from an
`input`, and a credential `input` MUST name one of the component's own string
inputs that is always supplied and, for a password or token, is `sensitive`.
Semantic: `ERR_SENSITIVE_LITERAL` at a password or token's `value`; and, at the
credential's `input`, `ERR_UNKNOWN_INPUT` for an input that does not exist,
`ERR_VALUE_CONSTRAINT` for one that is not a string or not sensitive, and
`ERR_INPUT_NOT_GUARANTEED` for an optional one with no default.

A probe missing a credential would test something other than what it declares,
and an insensitive input could be supplied upstream as a literal.

<a id="COMP-EP-011"></a>**`COMP-EP-011`**: Probe credentials MUST be sent on the
probe's request only, never added to traffic the platform forwards to the
endpoint, and are sensitive wherever they travel ([§11](#security)). Platform
obligation; no document breaks it.

A probe says what it proves, so prefer the strongest one the workload allows:
a health path that answers without credentials, then an authenticated probe of
a real page. A workload behind a login that offers neither can still be probed
with `expectedStatuses: [401]`, which is valid but proves only that the login
answers, not that what is behind it works. A listing whose readiness rests on
such a probe SHOULD say so.

<a id="COMP-EP-003"></a>**`COMP-EP-003`**: A URL-addressed endpoint a blueprint
exposes `PUBLIC` requires a readiness probe. Blueprint checks it against the
component contract when a node exposes the endpoint
([blueprint §4.3](../../blueprint/v2/spec.md#node-compute)).

### <a id="volumes"></a>5.5 Volumes

Each volume requires `mountPath` and a positive integer `minSizeGiB`, the
smallest allocation the component can run with. Names use core's
[DNS-label grammar](../../core/v2/spec.md#dns-label-grammar). `readOnly` and
`shared` both default to false.

```yaml
volumes:
  data:
    mountPath: /var/lib/postgresql/data
    minSizeGiB: 10
```

v2 defines no replica count, so `shared` is stated as what a deployment can
observe.

<a id="COMP-VOL-002"></a>**`COMP-VOL-002`**: With `shared: false` the volume
MUST be mounted into at most one replica of the workload at a time, so a
workload with a non-shared volume runs one replica at a time, including while it
is replaced. With `shared: true` every replica mounts the same storage
concurrently, which requires storage that supports concurrent read-write
mounts. Platform obligation; no document breaks it.

A blueprint node allocates each volume at or above its minimum
([blueprint `BP-NODE-004`](../../blueprint/v2/spec.md#BP-NODE-004)), and the
largest size a provider allocates is an admission rule of the blueprint
([blueprint `BP-NODE-012`](../../blueprint/v2/spec.md#BP-NODE-012)), separate
from intrinsic validity.

<a id="COMP-VOL-001"></a>**`COMP-VOL-001`**: A `mountPath` MUST be a canonical
absolute POSIX path, with no dot segment, duplicate separator or trailing slash
except root, and no two mounts may be equal or ancestor and descendant.
Structural: a path that does not begin with `/` is `ERR_INVALID_VALUE` at the
`mountPath`. Semantic: any other breach is `ERR_INVALID_MOUNT` at the later
`mountPath`, in document order.

### <a id="external"></a>5.6 External components

<a id="COMP-EXT-002"></a>**`COMP-EXT-002`**: An `EXTERNAL` component's inputs
MUST NOT carry a `target`, because the platform runs nothing to receive one.
Structural: `ERR_INVALID_VALUE` at the input's `target`.

`type: EXTERNAL` declares a component the platform runs nothing for: the node
stands in the graph for a connection or an outside service, whose values arrive
from outside the graph. That is external to the graph, not to Musher: a
PostgreSQL database Musher provides and one the organization runs are the same
external node, and the deployment's connection decides which
([§6.4](#connection-requirements)). It has no workload
([`COMP-EXT-001`](#COMP-EXT-001)), and it is the only kind of component that
declares a connection input ([`COMP-CONNECTION-002`](#COMP-CONNECTION-002)).

<a id="COMP-EXT-003"></a>**`COMP-EXT-003`**: A published `EXTERNAL` component
MUST produce at least one output, because it exists to produce values another
node consumes. Admission: `ERR_OUTPUT_REQUIRED` at `/spec` when `contract` is
absent, at `/spec/contract` when `outputs` is absent, and at
`/spec/contract/outputs` when it is empty.

<a id="COMP-EXT-004"></a>**`COMP-EXT-004`**: An `EXTERNAL` component has no
endpoints, so no output of one reads an endpoint. Semantic:
`ERR_UNKNOWN_ENDPOINT` at an `endpoint` origin's `from`, or at `from/template`.

An external component may still produce literals or forward its own inputs:

```yaml
spec:
  type: EXTERNAL
  contract:
    inputs:
      host:
        description: Hostname of a database server the organization runs.
        schema: { type: string }
    outputs:
      host:
        description: Hostname a client connects to.
        schema: { type: string }
        from: { input: host }
```

There is no `resourceType` at node or value scope; what an external component
stands for does not select how it is supplied. A database, a cache, an object
store or a language model reached through a connection is an external
component with one connection input ([§6.4](#connection-requirements)), whose
outputs hand the members to the nodes that use them.

### <a id="jobs"></a>5.7 Jobs and schedules

<a id="COMP-JOB-001"></a>**`COMP-JOB-001`**: A `JOB` without `schedule` MUST run
to completion once per rollout of the deployment that runs it, at creation, at
each update and at each redeploy, ordered against no other node, and its
outcome MUST be recorded for the deployment. Platform obligation; no document
breaks it.

It may run before, after or beside any other node's rollout, so a job that
needs another node ready waits for it itself. v2 defines no automatic retry: a
failed run is not started again until the next rollout. A failed run neither
blocks nor fails the rollout of any other node, which is what ordering against
nothing means.

```yaml
spec:
  type: JOB
  workload:
    source:
      image: ghcr.io/musher-dev/backup:1.0.2
    command: [/bin/backup, --verify]
    schedule:
      cron: "0 3 * * *"
```

<a id="COMP-JOB-002"></a>**`COMP-JOB-002`**: `schedule.cron` makes a `JOB`
recur, and is a cron expression of exactly five fields separated by one or more
spaces or tabs: minute, hour, day of month, month and day of week. Structural:
any other field count, such as a seconds or year field, or a macro such as
`@daily`, is `ERR_INVALID_VALUE` at `/spec/workload/schedule/cron`. Semantic: a
field outside the grammar below, or a number outside its field's range, is
`ERR_INVALID_SCHEDULE` there.

Each field is a comma-separated list of one or more elements. An element is `*`,
a number `n` or a range `a-b` with `a` not greater than `b`, each optionally
followed by a step `/s` where `s` is a positive number. A step keeps the first
value of what it follows and every value `s` apart after it: `*/15` in the
minute field is 0, 15, 30 and 45, and `n/s` means `n-max/s`, where `max` is the
top of the field's range. Fields take numbers only, never month or day names.
The ranges are:

| Field | Range |
|---|---|
| Minute | 0 to 59 |
| Hour | 0 to 23 |
| Day of month | 1 to 31 |
| Month | 1 to 12 |
| Day of week | 0 to 6, where 0 is Sunday |

A run falls due at every minute whose five values each match their field. When
both day of month and day of week are restricted (neither is `*`), a day
matches when either of them matches, as POSIX `crontab` defines.

<a id="COMP-JOB-003"></a>**`COMP-JOB-003`**: A schedule is evaluated in UTC, so
`0 3 * * *` runs at 03:00 UTC wherever the deployment runs. Structural: there
is no time-zone field, and one is `ERR_UNKNOWN_FIELD`.

<a id="COMP-JOB-004"></a>**`COMP-JOB-004`**: A scheduled run that falls due
while the previous run of the same job is still executing MUST be skipped,
neither queued nor started beside the running one, and the next run falls due
at the schedule's next time. Platform obligation; no document breaks it.

A scheduled `JOB` runs only when its schedule falls due; a rollout does not
start one.

## <a id="contract"></a>6. Component contract

`contract.inputs` and `contract.outputs` are named maps. The component contract
is the single place a value a component consumes or produces is declared and
explained.

<a id="COMP-CONTRACT-001"></a>**`COMP-CONTRACT-001`**: An input or output name
matches `^[a-z][a-zA-Z0-9]{0,63}$`: lowerCamelCase of 1 to 64 characters.
Structural: `ERR_INVALID_VALUE` at `/spec/contract/inputs` or
`/spec/contract/outputs`.

<a id="COMP-DESC-001"></a>**`COMP-DESC-001`**: A `description` on an input or
output, when present, is non-empty, and every value input and every output
declares a value schema. Structural: `ERR_INVALID_VALUE` at an empty
`description`, `ERR_MISSING_FIELD` at an output without `schema`.

<a id="COMP-DESC-004"></a>**`COMP-DESC-004`**: A published component MUST
describe every input and output. Admission: `ERR_DESCRIPTION_REQUIRED` at the
input or output.

The description is the single place a value is explained, and a blueprint
parameter shows it rather than carrying its own
([ADR 0026](../../../docs/adr/0026-a-component-declares-requirements.md) §2).
It is an `admission` rule for the reason [`COMP-DESC-003`](#COMP-DESC-003)
gives.

### <a id="inputs"></a>6.1 Inputs

An input is a **value input**, which declares `schema`, or a **connection
input**, which declares `connection` ([§6.4](#connection-requirements)). The
key that is present says which. Structural: declaring neither is
`ERR_MISSING_FIELD` and declaring both `ERR_INVALID_VALUE`, at the input.

A value input declares `schema`, a `description` it needs before it is
published ([`COMP-DESC-004`](#COMP-DESC-004)), and optionally `required`
(default true), `default`, `sensitive` (default false), `presentationHint` and
`target`. An input of a workload component may name `target.envVar`, the
environment variable its value is written to ([§5.3](#env-vars)); an input of
an `EXTERNAL` component never has a target ([`COMP-EXT-002`](#COMP-EXT-002)).

```yaml
inputs:
  postgresPassword:
    description: Password the database superuser is created with.
    schema: { type: string }
    sensitive: true
    target: { envVar: POSTGRES_PASSWORD }
```

<a id="COMP-INPUT-001"></a>**`COMP-INPUT-001`**: An input of a `SERVICE`,
`WORKER` or `JOB` with no `target` MUST be read by a build secret, a probe
credential, a trust bundle or an output. Semantic: `ERR_UNUSED_INPUT` at
`/spec/contract/inputs/<name>`.

An input with no target is never written to the launch environment. A build
token is the case this exists for: it is read by a build secret and must not
also become a launch variable, which is the leak a build secret prevents. An
input with a target is used by definition, and an `EXTERNAL` component's inputs
are read by its outputs or by nothing the platform runs, so the rule does not
apply to them.

When a blueprint binds nothing to an input, the input takes its default; with no
default, an optional input is absent and a required one fails. A present binding
is the input's only origin: when it fails, the input does not fall back to its
default. Defaults are
logical values, and are null only when their schema permits it. A sensitive
input carries no default ([`COMP-VAL-005`](#COMP-VAL-005)).

An input is **guaranteed** when it always has a value at resolution: it is
required, or it carries a `default`. The default of `required` is true, so an
input that says nothing is guaranteed.

### <a id="outputs"></a>6.2 Outputs

<a id="COMP-OUT-001"></a>**`COMP-OUT-001`**: Every output declares `from`, which
holds exactly one origin, named by the keys present:

| Keys | Origin |
|---|---|
| `value` | A logical literal |
| `input`, optional `member` | One of the component's own inputs, or one member of a connection input, forwarded with its sensitivity |
| `endpoint`, `property` | One endpoint property ([§5.2](#endpoint-properties)) |
| `template` | Single-pass string substitution over the component's own endpoints |

Structural, at `from`: no origin is `ERR_MISSING_FIELD`, as is a `property`
without its `endpoint`, an `endpoint` without its `property`, or a `member`
without an `input`; two origins are `ERR_INVALID_VALUE`.

```yaml
outputs:
  address:
    description: Internal host and port clients reach the database at.
    schema: { type: string }
    from: { endpoint: primary, property: privateAddress }
```

<a id="COMP-OUT-002"></a>**`COMP-OUT-002`**: An `input` origin MUST name one of
the component's own inputs, whose logical type fits the output's schema.
Semantic, at `from/input`: `ERR_UNKNOWN_INPUT` for an input that does not exist,
`ERR_VALUE_CONSTRAINT` for a type that does not fit.

An input of integer type fits a number schema. An input the blueprint binds to
another node's output may be forwarded, and blueprint rejects the cycles that
can form ([blueprint `BP-BIND-002`](../../blueprint/v2/spec.md#BP-BIND-002)).

<a id="COMP-OUT-003"></a>**`COMP-OUT-003`**: Every declared output must be
produced, so an `input` origin MUST name a guaranteed input ([§6.1](#inputs)),
and its `member`, when it has one, a member every connection holds: a
required, derived or defaulted one ([§6.4](#members)). Semantic:
`ERR_INPUT_NOT_GUARANTEED` at `from/input`, or at `from/member` for an optional
member without a default, such as the `REDIS` `username` and `password`.

The code is not `ERR_UNKNOWN_INPUT`, because the input exists and naming it was
not the mistake. An output whose only origin can be absent is a promise the
component contract cannot keep, and a consuming node would discover that at
deployment rather than here. A `default` closes it, because a default is a
value.

<a id="COMP-OUT-004"></a>**`COMP-OUT-004`**: An `input` origin naming a
connection input MUST carry a `member` its protocol defines
([§6.4](#members)), of a type that fits the output, and an output forwarding a
sensitive member MUST declare `sensitive: true`; one naming a value input MUST
NOT carry `member`.

| Condition | Phase | Code | Path |
|---|---|---|---|
| `member` is no member of any protocol | `structural` | `ERR_INVALID_VALUE` | `from/member` |
| `member` is a member of another protocol, not the input's | `semantic` | `ERR_UNKNOWN_CONNECTION_MEMBER` | `from/member` |
| A connection input is named without `member` | `semantic` | `ERR_UNKNOWN_INPUT` | `from/input` |
| A value input is named with `member` | `semantic` | `ERR_UNKNOWN_INPUT` | `from/member` |
| The member's type does not fit the output's schema | `semantic` | `ERR_VALUE_CONSTRAINT` | `from/input` |
| A sensitive member is forwarded by an output not declared `sensitive: true` | `semantic` | `ERR_VALUE_CONSTRAINT` | `from/member` |

A forwarded integer member, `port` or the `REDIS` `database`, needs an integer
or number schema; a boolean member, `tls` or `pathStyle`, a boolean schema; and
every other member a string schema. The component contract then shows a credential's sensitivity
instead of leaving it to propagation.

<a id="COMP-PLACEHOLDER-001"></a>**`COMP-PLACEHOLDER-001`**: A `template`
permits only core's `self` namespace, and a `self` path is exactly
`endpoints.<endpoint>.<property>`, as in
`${{ self.endpoints.web.publicHostname }}`. Semantic, at `from/template`: a
path of any other shape names no endpoint explicitly and is
`ERR_UNKNOWN_ENDPOINT`, as an undeclared endpoint is; a declared endpoint
followed by a property outside [§5.2](#endpoint-properties)'s table is
`ERR_UNKNOWN_ENDPOINT_PROPERTY`; and a placeholder outside the grammar, or in
another namespace, carries core's code
([core v2 §5.2](../../core/v2/spec.md#placeholder-grammar)).

That includes the property-first order, `${{ self.publicHostname.web }}`. There
is no implicit endpoint selection. Escapes and non-recursive substitution
follow [core](../../core/v2/spec.md#placeholder-grammar). A template produces a
string. An `endpoint` origin reading `privatePort` or `publicPort` produces an
integer, one reading `trustedProxyCIDRs` produces an array of strings, and one
reading any other property produces a string. Values are checked against output
schemas: an origin whose type does not fit is `ERR_VALUE_CONSTRAINT` at the
output's `schema`. Values produced by a job at run time are not supported
([§10](#not-supported)).

### <a id="value-schema"></a>6.3 Value schemas

A **value schema** is the bounded profile of JSON Schema 2020-12 an input or
output declares for its logical value, the value before any encoding.

<a id="COMP-VAL-001"></a>**`COMP-VAL-001`**: `schema.type` is one of `string`,
`integer`, `number`, `boolean`, `null`, `array` and `object`. Structural:
`ERR_INVALID_VALUE` at `schema/type`.

<a id="COMP-VAL-002"></a>**`COMP-VAL-002`**: A value schema uses only the
keywords of its type, and an `enum`, at any level, is non-empty with unique
members. Structural: `ERR_INVALID_VALUE` at the keyword.

| Type | Keywords in addition to type and non-empty enum |
|---|---|
| string | minLength, maxLength, pattern |
| integer, number | minimum, maximum, exclusiveMinimum, exclusiveMaximum |
| boolean, null | none |
| array | items (required), minItems, maxItems, uniqueItems |
| object | properties (required), required, additionalProperties (required false) |

<a id="COMP-VAL-003"></a>**`COMP-VAL-003`**: A value schema MUST NOT use
unknown or inapplicable keywords, schema references, composition or
conditionals; an object's `required` names only declared properties; and depth
is at most 16. Structural or semantic, by where it is caught:
`ERR_UNKNOWN_FIELD` or `ERR_INVALID_VALUE` structurally, and
`ERR_INVALID_VALUE_SCHEMA` at the `schema` otherwise. Integer means a
mathematically integral JSON number; no coercion occurs.

<a id="COMP-VAL-004"></a>**`COMP-VAL-004`**: `presentationHint`, outside the
value schema, is one of `EMAIL`, `URI`, `ENDPOINT_URL`, `CONNECTION_STRING`,
`HOSTNAME` and `TIMEZONE`, and makes no assertion about the value. Structural:
`ERR_INVALID_VALUE` at `presentationHint`.

These are interface annotations. Defaults and sensitivity also belong outside
the value schema; JSON Schema annotation processing never inserts values.

<a id="COMP-VAL-005"></a>**`COMP-VAL-005`**: Defaults and statically known
values MUST satisfy their value schemas, and a sensitive input or output MUST
NOT be supplied by an authored literal. Semantic: `ERR_INVALID_VALUE_SCHEMA` at
a defective `schema`, `ERR_VALUE_CONSTRAINT` at a value that does not satisfy
it, and `ERR_SENSITIVE_LITERAL` at a literal supplying a sensitive value.

Resolved dynamic values are checked before encoding or workload execution, and
fail there with `ERR_VALUE_CONSTRAINT` in the `values` stage of the `resolution`
phase. A
placeholder-free `template` is a statically known string after escape
processing, and follows the same rules as a literal.

<a id="COMP-VAL-006"></a>**`COMP-VAL-006`**: An array value MUST satisfy its
`items` schema in every member; an `items` enum constrains members and an array
enum constrains whole arrays. Semantic: `ERR_VALUE_CONSTRAINT` at the value.
There is no special string-list transport type.

<a id="COMP-VAL-007"></a>**`COMP-VAL-007`**: A value schema's `pattern` MUST
lie in the value-schema pattern profile: printable ASCII regular-expression
atoms, classes, anchors and quantifiers, without groups, alternation,
lookaround, backreferences or Unicode-property and word-boundary escapes, and at
most 256 characters; at most one quantified atom, in a pattern that begins with
`^`; and no numeric repetition bound above 1024. Semantic:
`ERR_INVALID_VALUE_SCHEMA` at the `schema` that holds it.

The profile prevents combinatorial backtracking. Matching is Unicode-aware, case-sensitive, without
implicit anchors. Implementations MUST bound execution. Logical values share
core's depth, byte and scalar limits. Numbers use finite binary64 values, with
integers restricted to the inclusive safe-integer range. Unsupported numeric
values are rejected, never silently rounded.

### <a id="connection-requirements"></a>6.4 Connection inputs

A **connection** is the members of one protocol, acquired together for one
connection parameter of one deployment: all of them or none
([ADR 0030](../../../docs/adr/0030-atomic-named-connections.md),
[ADR 0039](../../../docs/adr/0039-provenance-is-chosen-at-deployment.md)). A
connection input declares `description` and `connection`, which requires
`protocol`. The protocol is the wire contract a client speaks, independent of
vendor, and it fixes the members, their types, their sensitivity and which of
them every connection holds. The
component that declares one is an external node standing for the database,
cache, object store or model API, and its outputs hand the members on:

```yaml
spec:
  type: EXTERNAL
  contract:
    inputs:
      postgres:
        description: PostgreSQL database this node stands for.
        connection: { protocol: POSTGRES }
    outputs:
      url:
        description: Connection URL, composed from the members and credential.
        schema: { type: string }
        sensitive: true
        from: { input: postgres, member: url }
      port:
        description: Port the database listens on.
        schema: { type: integer }
        from: { input: postgres, member: port }
```

A component never says who provides what it stands for. The organization's
connection configuration answers the blueprint's connection parameter with a
Musher-managed offering or with a service the organization runs, and a deployer
may supply a complete set of members instead
([blueprint §5.3](../../blueprint/v2/spec.md#connections)). The
component document is the same in every case.

<a id="members"></a>**Members.** Each protocol fixes its members. A **required**
member is present in every connection and non-empty. An **optional** member may
be absent: one with a **default** then takes it, and one without a default is
absent. A **derived** member is never supplied: resolution composes it from the
others ([derived URLs](#derived-urls)). Sensitive members are in bold.

| Protocol | Member | Type | Presence |
|---|---|---|---|
| `OPENAI_CHAT_COMPLETIONS`, `ANTHROPIC_MESSAGES` | `baseURL` | string | required |
| | **`apiKey`** | string | required |
| | `model` | string | required |
| `POSTGRES` | `host` | string | required |
| | `port` | integer | required |
| | `database` | string | required |
| | `username` | string | required |
| | **`password`** | string | required |
| | `sslMode` | string | required |
| | **`url`** | string | derived |
| `REDIS` | `host` | string | required |
| | `port` | integer | required |
| | `tls` | boolean | required |
| | `database` | integer | optional, default `0` |
| | `username` | string | optional, no default |
| | **`password`** | string | optional, no default |
| | **`url`** | string | derived |
| `S3` | `endpointURL` | string | required |
| | `region` | string | required |
| | `bucket` | string | required |
| | `accessKeyID` | string | required |
| | **`secretAccessKey`** | string | required |
| | `pathStyle` | boolean | optional, default `false` |

- `host` is a DNS name or an IPv4 address, in letters, digits, `-`, `_` and
  `.`, or an IPv6 address written without brackets. It never carries a port.
- `port` is an integer from 1 to 65535.
- The `POSTGRES` `sslMode` is one of PostgreSQL's `sslmode` values: `disable`,
  `allow`, `prefer`, `require`, `verify-ca` and `verify-full`.
- The `REDIS` `tls` says whether the client uses TLS, and `database` is the
  non-negative database index the client selects. A `REDIS` connection without
  `password` is to a server that requires no authentication, and has no
  `username` either. With `password` and without `username`, the client
  authenticates as the server's default user.
- The `S3` `endpointURL` is the service URL a client sends requests to, and
  never includes the bucket. The client composes the bucket into each request:
  in the hostname, virtual-hosted style, when `pathStyle` is false, and as the
  first path segment when it is true. `endpointURL` is not a component
  endpoint.
- `baseURL` and `endpointURL` are HTTPS URLs; blueprint holds a connection to
  that ([blueprint §5.3](../../blueprint/v2/spec.md#connections)).

TLS is fixed by members and never left to a client default: by the HTTPS
scheme of `baseURL` and `endpointURL`, by `sslMode` for `POSTGRES` and by `tls`
for `REDIS`.

An output reads only a member every connection holds: a required, derived or
defaulted one ([`COMP-OUT-003`](#COMP-OUT-003)). Adding an optional member with
a default to a protocol is therefore a relaxation: every existing connection
still resolves, taking the default, and no existing output reads the new
member.

<a id="derived-urls"></a>**Derived URLs.** Resolution composes the `url` of a
`POSTGRES` or `REDIS` connection from its other members, the credential
included, each time it resolves the connection. A `url` therefore always
agrees with the members beside it, and rotating the credential cannot leave it
stale. The composition is canonical, in this order:

1. The scheme: `postgresql://` for `POSTGRES`; for `REDIS`, `rediss://` when
   `tls` is true and `redis://` when it is false.
2. The userinfo and `@`. For `POSTGRES` it is `username`, `:` and `password`.
   For `REDIS` it is `username`, or nothing without one, then `:` and
   `password`; a `REDIS` connection without `password` has no userinfo and no
   `@`.
3. The `host`, lowercased, with an IPv6 address in brackets; `:`; and `port`
   in decimal, written even when it is the protocol's usual port.
4. `/` and the database: `database` for `POSTGRES`, and the decimal `database`
   index for `REDIS`, `0` when the connection names none.
5. For `POSTGRES` only, `?sslmode=` and `sslMode`.

`username`, `password` and the `POSTGRES` `database` are percent-encoded: each
byte of their UTF-8 encoding outside RFC 3986's unreserved characters (`A-Z`,
`a-z`, `0-9`, `-`, `.`, `_` and `~`) becomes `%` and two uppercase hexadecimal
digits. So `username` `app user`, `password` `p@ss`, `host` `2001:DB8::1`,
`port` 5432, `database` `app` and `sslMode` `verify-full` compose
`postgresql://app%20user:p%40ss@[2001:db8::1]:5432/app?sslmode=verify-full`,
and a `REDIS` connection with `tls` true, no `password` and no `database`, at
`cache.example` port 6380, composes `rediss://cache.example:6380/0`.

<a id="COMP-CONNECTION-002"></a>**`COMP-CONNECTION-002`**: A connection input
declares only `description` and `connection`, is always required, and is
declared only by an `EXTERNAL` component; its `protocol` is one of the five
above, and its members are exactly those the table fixes for that protocol.
Structural: `ERR_INVALID_VALUE` at `schema`, `default`, `required`,
`sensitive`, `presentationHint` or `target` on a connection input, at the
`connection` of one on a `SERVICE`, `WORKER` or `JOB`, and at a `protocol`
outside the five; `ERR_MISSING_FIELD` at `connection` without `protocol`.

<a id="COMP-CONNECTION-003"></a>**`COMP-CONNECTION-003`**: `capabilities`, a
unique list of `STREAMING` and `TOOL_CALLS`, is permitted only on the
language-model protocols, `OPENAI_CHAT_COMPLETIONS` and `ANTHROPIC_MESSAGES`.
Structural: `ERR_INVALID_VALUE` at `connection/capabilities` on another
protocol, and at an unknown or repeated capability.

`STREAMING` requires incremental protocol-native response events and
termination; `TOOL_CALLS` requires protocol-native tool requests and
tool-result continuation. Omitting `capabilities` requests only ordinary
non-streaming text conversation. An unknown capability is rejected, not
ignored.

A blueprint fills a connection input with a connection parameter
([blueprint §5.3](../../blueprint/v2/spec.md#connections)), and the nodes
that use it bind ordinary inputs to the external node's outputs. A workload
never declares a connection input. It receives a connection's members as
ordinary values, like any other value from outside the blueprint
([§5.6](#external)).

Credentials are whole values, never templates or concatenated strings.
Sensitivity propagation and the prohibitions on authored sensitive literals
apply ([§11](#security)).

## <a id="validation-layers"></a><a id="validation-phases"></a>7. Validation phases

Core's phases and validation scopes apply
([core v2 §6](../../core/v2/spec.md#validation-phases)). Components are
structurally validated before semantic checks, and the `document` scope runs
both. Publication requires the `publication` scope, which adds the `admission`
rules of this document: [`COMP-ID-001`](#COMP-ID-001), because the lineage is a
fact the catalog holds, and [`COMP-DESC-003`](#COMP-DESC-003),
[`COMP-DESC-004`](#COMP-DESC-004) and the obligations
[§5](#publication-obligations) lists, because an unwritten field is only a
defect in a component someone is trying to publish. One `admission` rule reads
the platform's runtime rather than an unwritten field:
[`COMP-EP-019`](#COMP-EP-019), a port below 1024 that runtime cannot bind.
Running a workload additionally requires blueprint resolution, the `deployment`
scope, in which `ERR_ENV_ENCODING` and resolved `ERR_VALUE_CONSTRAINT` are
reported.

The platform obligations of this document, [`COMP-BUILD-005`](#COMP-BUILD-005),
[`COMP-BUILD-006`](#COMP-BUILD-006), [`COMP-EP-007`](#COMP-EP-007),
[`COMP-EP-011`](#COMP-EP-011), [`COMP-EP-017`](#COMP-EP-017),
[`COMP-VOL-002`](#COMP-VOL-002), [`COMP-JOB-001`](#COMP-JOB-001) and
[`COMP-JOB-004`](#COMP-JOB-004), bind what the platform does with a valid
document, and the workload obligations, [`COMP-SEC-001`](#COMP-SEC-001) and
[`COMP-SEC-002`](#COMP-SEC-002), bind what a workload does with what the
platform forwards. No document breaks them, and no validation phase reports
them.

## <a id="diagnostics"></a>8. Diagnostics

Core diagnostics also apply.

| Code | Phase | Meaning |
|---|---|---|
| `ERR_CONFLICTING_ENV_VAR` | `semantic` | Two inputs claim one environment variable, or a build secret ID is also a build argument. |
| `ERR_UNKNOWN_ENDPOINT` | `semantic` | A field names an endpoint that is not declared, or names none explicitly. |
| `ERR_ENDPOINT_NOT_URL_ADDRESSED` | `semantic` | `publicURL` or `publicHostname` is read from an endpoint that is not URL-addressed. |
| `ERR_ENDPOINT_NOT_PORT_ADDRESSED` | `semantic` | `publicAddress` or `publicPort` is read from an endpoint that is not port-addressed. |
| `ERR_ENDPOINT_NOT_HTTP` | `semantic` | A probe names an endpoint without an HTTP probe protocol, a viewer identity property is read from an endpoint that is not HTTP-routed, or a blueprint selects `access: RESTRICTED` on an endpoint that is not HTTP-routed ([blueprint `BP-NODE-007`](../../blueprint/v2/spec.md#BP-NODE-007)). |
| `ERR_UNKNOWN_ENDPOINT_PROPERTY` | `semantic` | A template reads a property [§5.2](#endpoint-properties) does not define. |
| `ERR_ENDPOINT_NOT_EXPOSABLE` | `semantic` | A `WORKER` endpoint is exposed `PUBLIC`, or a `WORKER` output reads a public or viewer identity property. |
| `ERR_ENDPOINT_NOT_OIDC_CLIENT` | `semantic` | An OpenID Connect client property is read from, or `OIDC` selected for, an endpoint that declares no `oidc`. |
| `ERR_INVALID_SCHEDULE` | `semantic` | A cron field is outside [§5.7](#jobs)'s grammar or range. |
| `ERR_UNKNOWN_INPUT` | `semantic` | A field names an input the component does not declare, or an output names a connection input without a `member` or a value input with one. |
| `ERR_UNKNOWN_CONNECTION_MEMBER` | `semantic` | An output reads a member the input's protocol does not define. |
| `ERR_INPUT_NOT_GUARANTEED` | `semantic` | An output, trust bundle, probe credential or build secret reads an input that may be absent, or an output reads a connection member that may be absent. |
| `ERR_UNUSED_INPUT` | `semantic` | A workload input has no target and nothing reads it. |
| `ERR_INVALID_MOUNT` | `semantic` | A mount path is not canonical or overlaps another. |
| `ERR_INVALID_VALUE_SCHEMA` | `semantic` | A value schema is outside [§6.3](#value-schema)'s profile or invalid. |
| `ERR_VALUE_CONSTRAINT` | `semantic`, `resolution` | A known value, or the input or member an origin names, violates the component contract. |
| `ERR_SENSITIVE_LITERAL` | `semantic` | An authored literal supplies a sensitive value. |
| `ERR_REVISION_NOT_INCREASING` | `admission` | A published component's revision is not greater than every earlier one. |
| `ERR_PRIVILEGED_PORT` | `admission` | A `targetPort` below 1024 on a platform whose runtime cannot bind one. |
| `ERR_DESCRIPTION_REQUIRED` | `admission` | Publication requires a description this document, or one of its inputs or outputs, does not carry. |
| `ERR_WORKLOAD_REQUIRED` | `admission` | Publication requires a workload of a `SERVICE`, `WORKER` or `JOB`. |
| `ERR_SOURCE_REQUIRED` | `admission` | Publication requires a workload source. |
| `ERR_ENDPOINT_REQUIRED` | `admission` | Publication requires an endpoint of a `SERVICE`. |
| `ERR_COMMAND_REQUIRED` | `admission` | Publication requires a command of a `JOB`. |
| `ERR_OUTPUT_REQUIRED` | `admission` | Publication requires an output of an `EXTERNAL` component. |
| `ERR_ENV_ENCODING` | `resolution` | A value cannot be encoded into an environment variable. |

## <a id="conformance"></a>9. Conformance

Implementations declare the validation scope they reach and run the
corresponding family and core fixtures. Skipped obligations are never counted
as passed. The normalization, resolution and lifecycle behaviour suites test
implementation outcomes as defined in
[the fixture format](../../../docs/conformance.md).

## <a id="known-debt"></a><a id="not-supported"></a>10. Not supported in v2

Each row is rejected today, and each closes by a relaxation: accepting
something v2 rejects. Adding one requires defined semantics and conformance
evidence.

| Not supported | How it would close |
|---|---|
| Outputs produced by a workload at run time | A new origin |
| Arbitrary expressions or recursive substitution in a template | A new origin kind beside `template` |
| Provider-specific configuration maps | A new optional field |
| Health mechanisms other than HTTP | A new mechanism key beside `http` |
| TLS on the hop to a `WS` or `GRPC` workload | Permit `tls` on those protocols |
| Probe request headers other than credentials | A new optional field on `http` |
| Forwarded viewer roles or scopes | A new claim value |
| Viewer assertions signed with an algorithm other than RS256 | A new optional field |
| OpenID Connect post-logout redirects | A new optional field on `oidc` |
| Schedule time zones | A new optional field on `schedule` |
| Ordering a job against other nodes | A new optional field |
| `capabilities` for a protocol other than a language model's | Permit `capabilities` on that protocol, with new values |
| A connection member its protocol does not define | A new optional member with a default ([§6.4](#members)): every existing connection takes the default |
| Choosing a plan or size for a provisioned connection | A new optional field on the connection parameter, in blueprint |
| Swapping a self-hosted `SERVICE` for a connection at deployment | Conditional topology ([ADR 0019](../../../docs/adr/0019-external-component-node.md)) |
| Watch paths outside `context`, a Dockerfile target stage, a build platform or architecture | A new optional field on `build` |
| Git submodules and Git LFS content | A new optional field on `git` |
| A Git credential named by the document; private repository access is the platform's source connection | A new optional field on `git` |
| A build secret delivered as an environment variable of a Dockerfile step | A new optional field on a secret |

## <a id="security"></a>11. Security considerations

A published component document carries no secret plaintext, in its defaults
and build arguments included. A sensitive input rejects an authored literal
([`COMP-VAL-005`](#COMP-VAL-005)), and a value that a build needs secretly is a
build secret ([§5.1](#build)), which reaches the build and nothing else
([`COMP-BUILD-006`](#COMP-BUILD-006)). A validator cannot discover every
unmarked secret, and that does not authorize embedding one.

Sensitivity follows the value through binding, forwarding, formatting and
storage. Effective sensitivity is origin OR destination sensitivity.

<a id="COMP-SEC-003"></a>**`COMP-SEC-003`**: Diagnostics, logs, events, previews
and public plans MUST NOT expose a sensitive value, a substring of one, or a
hash of its content. Materialization is a private channel. Platform obligation;
no document breaks it, and the resolution suite observes its public inspection.

An endpoint with `verify: NONE` ([`COMP-EP-007`](#COMP-EP-007)) is reached over
TLS that authenticates nothing: whatever answers on its port is trusted, and a
probe credential sent to it goes to that peer. Declare it only for a workload
whose certificate cannot be verified, and prefer `BUNDLE` wherever the
certificate is known in advance. Probe credentials are sent on probes only
([`COMP-EP-011`](#COMP-EP-011)), so an endpoint's own authentication still
guards the traffic the platform forwards to it.

<a id="COMP-SEC-001"></a>**`COMP-SEC-001`**: A workload that reads a viewer's
identity from `viewerIdentityHeader` ([§5.2](#viewer-identity)) MUST accept that
header, and the headers `viewerEmailHeader` and `viewerNameHeader` name, only on
a network connection whose peer address is in `trustedProxyCIDRs`. Workload
obligation; no document breaks it.

Anything else that can reach the port can set those headers. A released claim header's value is UTF-8 text in which every
octet outside visible ASCII, and every `%`, is percent-encoded, so a workload
percent-decodes it before use. The component reads the header names and
`trustedProxyCIDRs` through its own outputs, and a literal or a default in their
place goes stale when the platform's proxies move, and deploys wherever a
blueprint forgets to forward identity.

A probe carries no viewer identity, names the probing host in `Forwarded` and
`X-Forwarded-For`, and, under `HEADER`, arrives from a peer inside
`trustedProxyCIDRs` ([`COMP-EP-017`](#COMP-EP-017)). A workload that trusts its
proxies therefore sees a probe as an unauthenticated proxied request, never as a
viewer, and its health path answers it as §5.4 requires.

<a id="COMP-SEC-002"></a>**`COMP-SEC-002`**: A workload that reads the viewer
from `viewerAssertionHeader` MUST verify the token's RS256 signature against a
key from `viewerAssertionKeysURL`, and MUST check that its `iss` is
`viewerAssertionIssuer`, that its `aud` is `viewerAssertionAudience`, and that
it has not expired. Workload obligation; no document breaks it.

The audience is unique
to one endpoint of one deployment, so a token another workload received is
refused here. A verified assertion needs no peer check.

A workload that signs viewers in through `oidcIssuerURL` keys its accounts on
the ID token's `sub`, never on `email`: an email address can change owner, and
the subject cannot. The client secret is sensitive, and the platform MAY rotate
it, which is a new allocation and a restart with the new value.

An exempt path covers a request only by blueprint's rule
([`BP-ACCESS-009`](../../blueprint/v2/spec.md#BP-ACCESS-009)), which decodes
only unreserved characters, removes dot segments, and never exempts a path
holding `;`, an encoded `/` or an empty segment; a redirect path is compared
exactly. A workload whose router treats other spellings as the same route, such
as a trailing `;` parameter, a percent-encoded slash or a differently cased
path, exposes those spellings only through sign-in. Declare every route a machine
calls, and nothing a viewer uses.

A build reads nothing outside its `context` ([`COMP-BUILD-005`](#COMP-BUILD-005)),
so a symbolic link in the source that points outside it is not followed into
the build. An uploaded archive is pinned by its digest
([`COMP-SRC-005`](#COMP-SRC-005)), so the bytes built are the bytes named, and
extracting it can write nothing outside its own root
([`COMP-SRC-007`](#COMP-SRC-007)). A repository URL carries no credential
([`COMP-SRC-006`](#COMP-SRC-006)), so none reaches a published document.
