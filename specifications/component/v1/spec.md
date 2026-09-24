# Musher Component Document — Specification v1

**Status:** Stable
**Family:** `component`
**Schema:** `https://specifications.musher.dev/component/v1/component.schema.json`

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

A **Component Document** defines one reusable, versioned graph node of one
category ([§5](#workload)). Most are a workload this platform runs: where its
image comes from, how it runs and how its health is determined. An `EXTERNAL`
component is one it does not run, addressed elsewhere. Every component says what
configuration it consumes and produces.

A Component Document does not describe a deployment. It is composed into a
[Blueprint Document](../../blueprint/v1/spec.md), which is what gets deployed.

**Out of scope for this document**

- Composition of multiple components → `blueprint` family
- Storefront presentation → `listing` family
- Runtime state, instances, and endpoints → the Musher API

## <a id="envelope"></a>2. Document envelope

```yaml
specVersion: v1
kind: COMPONENT
metadata: { … }
spec: { … }
```

A Component Document is a Musher document as the
[Musher Document Core Specification](../../core/v1/spec.md) defines one, and
every rule of core v1 applies to it. This family binds the parameters
[core v1 §1.1](../../core/v1/spec.md#bindings) leaves to a family:

| Core parameter | This family |
|---|---|
| `kind` ([`CORE-ENV-002`](../../core/v1/spec.md#CORE-ENV-002)) | `COMPONENT` |
| `metadata` ([`CORE-ENV-003`](../../core/v1/spec.md#CORE-ENV-003)) | [§4](#metadata) |
| Fields accepting `null` ([`CORE-ENV-007`](../../core/v1/spec.md#CORE-ENV-007)) | `spec.contract.inputs.*.default`; `spec.contract.outputs.*.from.value`; `spec.contract.*.*.schema.enum` and logical payload descendants permitted by their schemas |
| Item document ([core v1 §4.1](../../core/v1/spec.md#item-directory)) | No — it sits inside an item |

This specification narrows core v1 where it says so and relaxes it nowhere. It
cites core by its line ("core v1 §N"), and the core edition a release was
built and tested against is recorded with that release
([core v1 §9](../../core/v1/spec.md#editions)).

**Normative dependencies**

| Specification | Line |
|---|---|
| [core](../../core/v1/spec.md) | v1 |

## <a id="compatibility"></a>3. Version compatibility

Stated once for every family in
[core v1 §3](../../core/v1/spec.md#compatibility), and applies without
narrowing. For this family it runs from `v1.2.0`:
[ADR 0033](../../../docs/adr/0033-inputs-are-the-only-way-into-a-component.md)
§5 withdrew `v1.0.0` and `v1.1.0` from it, once, before anyone outside the
project had adopted them.

## <a id="metadata"></a>4. Metadata

`metadata` carries `revision` and `description`, and nothing else. A component
document has no `slug`: a [blueprint](../../blueprint/v1/spec.md#identity) and
its listing each name the item they are two halves of, and a component is not
the item. The name a component answers to is the stem of the file that holds
it, which a repo-local reference spells out in full
([blueprint §4.1](../../blueprint/v1/spec.md#component-reference)). Any other
property is `ERR_UNKNOWN_FIELD`, as
[core v1 §2](../../core/v1/spec.md#envelope) requires at every level.

<a id="description"></a><a id="COMP-DESC-002"></a>**`COMP-DESC-002`**: `description`
says what the component is, in one or two sentences of plain text, 1 to 280
characters, the limit of a
[listing summary](../../listing/v1/spec.md#presentation). A consumer MUST NOT
render it as Markdown. An empty description, or one longer than 280 characters,
is `ERR_INVALID_VALUE` at `/metadata/description`. These are structural rules,
and they bind a description that is present. Whether one has to be present is
`COMP-DESC-003`.

<a id="COMP-DESC-003"></a>**`COMP-DESC-003`**: A published component MUST carry
a `description`. One absent at publication is rejected in the `capability` phase
with `ERR_DESCRIPTION_REQUIRED` at `/metadata`.

A component's file stem is its only other name, and a published component is
reused by items that know nothing about it, so the document describes itself.
The description is for the person composing a blueprint. It is not storefront
copy: that is the listing's `summary`.

**Why the phase is `capability`, and it is not the reason `COMP-ID-001` has.**
That rule is `capability` because deciding it needs the catalog, which needs the
network. This one needs neither: a validator holding the file can see the field
is absent. It is `capability` because *absent* and *not written yet* are the same
bytes, and only the publisher can tell them apart. A component with no
description is readable. Its `kind`, its `specVersion` and its `revision` all
parse, and every rule in this document still decides, so it is a component an
author is still writing, and refusing to store it makes them describe the thing
before the thing exists. Publication is where being unfinished stops being
allowed, so publication is where the obligation falls.

An offline validator therefore MUST NOT report `ERR_DESCRIPTION_REQUIRED`, and
an editor is free to say the field is empty in whatever way editors say that.
What it MUST NOT do is call the document invalid, because under this contract it
is not.

`revision` is an integer, 1 or greater. It is REQUIRED and never defaulted.
Exact deployment identity additionally requires the generated artifact digest.

**The revision names a position in one component's lineage.** It is not a SemVer
triple and carries no compatibility meaning: nothing is derivable from the
distance between 2 and 7, and nothing is promised about how one revision behaves
against another. It orders, and that is the whole of its job.

**Two reference forms pin it, and only one writes it down.**

| Reference form | What pins the revision |
|---|---|
| Repo-local | The referenced document's own `metadata.revision`. The node's `revision` MUST NOT be present. |
| Published | `revision` on the node. |

<a id="COMP-ID-001"></a>**`COMP-ID-001`**: A revision is used once. Each
publication of a component MUST carry a revision strictly greater than the
highest already published for that component. Gaps are permitted: 1 to 7 is a
release and not an error. A revision that does not increase is rejected in the
`capability` phase with `ERR_VERSION_NOT_MONOTONIC`.

Reuse is the case the rule exists for. `revision: 3` on a published node
selects that component revision, and a registry that let 3 mean two
different documents would make the pin name nothing. The repo-local form has the
same problem one step removed: a blueprint that deployed revision 3 last month
and revision 3 today, with different bytes behind it, has no way to say so.

**Why the phase is `capability`.** Deciding the rule needs to know what was
published before, which needs the catalog, which needs the network, and
[core v1 §6](../../core/v1/spec.md#validation-layers) forbids the `parser`,
`structural` and `semantic` phases from requiring it. A client validating a
file it has just written cannot see the lineage and MUST NOT report this rule.
Offline validation is therefore exactly as strict as it was.

Whether a registry treats an identical re-submission as a no-op rather than as a
publication is outside this contract. This document orders publications; it does
not define when two YAML files are the same document.

**The revision is not the item's revision.** The item's is the blueprint's
([blueprint §3](../../blueprint/v1/spec.md#identity)), and it is pinned to no
component beneath it. The two numbers count different things: an item's revision
counts releases of the item, a component's counts releases of the component, and
in the published form one component is deployed by many items at once.

A release of a component an item deploys SHOULD be accompanied by a release of
the item, because the item's listing describes what would be installed and a
component that has moved makes that description stale. It is a SHOULD and
carries no diagnostic: the disagreement is visible only across two revisions,
and a validator is handed one.

**What v1 does not constrain.** Nothing orders one component's revisions against
another's: two components in the same item sitting at 4 and 11 mean nothing
worth reading into. Nothing checks a revision offline at all: `minimum: 1` is the
whole of the `structural` rule about it, and every other statement here about
the revision is either `capability` or a SHOULD.

## <a id="workload"></a><a id="type"></a>5. The component's shape

`spec` holds `type`, `workload` and `contract`. The type says what kind of
node the component is, the workload says how the platform runs it, and the
contract ([§6](#contract)) says what configuration it consumes and produces. The
smallest service that can be published needs only a type, an image and one
endpoint:

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

<a id="COMP-TYPE-001"></a>**`COMP-TYPE-001`**: `spec.type` is REQUIRED and names
the component's category: `SERVICE`, `WORKER`, `JOB` or `EXTERNAL`. An absent
type is `ERR_MISSING_FIELD` at `/spec`, and any other value is
`ERR_INVALID_VALUE`. These are structural rules.

The categories split by lifecycle and by whether the workload serves traffic:

| Type | Lifecycle | Endpoints |
|---|---|---|
| `SERVICE` | Long-running, request-driven | At least one |
| `WORKER` | Long-running, not request-driven | Optional, never `PUBLIC` |
| `JOB` | Runs to completion ([§5.7](#jobs)) | None |
| `EXTERNAL` | Not run by this platform ([§5.6](#external)) | None |

<a id="COMP-EXT-001"></a>**`COMP-EXT-001`**: `spec.workload` MUST be absent when
the type is `EXTERNAL`. A workload on an `EXTERNAL` component is
`ERR_INVALID_VALUE` at `/spec/workload`, structural.

<a id="COMP-TYPE-006"></a>**`COMP-TYPE-006`**: A published `SERVICE`, `WORKER`
or `JOB` MUST carry a `workload`. One without is rejected in the `capability`
phase with `ERR_WORKLOAD_REQUIRED` at `/spec`.

The type decides which workload fields apply:

| Field | `SERVICE` | `WORKER` | `JOB` |
|---|---|---|---|
| `source` | Required to publish | Required to publish | Required to publish |
| `command` | Optional | Optional | Required to publish |
| `endpoints` | At least one to publish | Optional | Forbidden |
| `health` | Optional | Optional | Forbidden |
| `schedule` | Forbidden | Forbidden | Optional |
| `volumes` | Optional | Optional | Optional |

Forbidden means absent. Empty mappings and null are not alternative spellings.
A forbidden field is `ERR_INVALID_VALUE` at its own path. Unknown fields are
rejected. These are structural rules. The rules that follow say why each type
allows what it does.

<a id="publication-obligations"></a>**What publication requires.** "Required to
publish" is not a structural rule. A component with a type and nothing else is a
component someone is still writing, for the reason
[`COMP-DESC-003`](#COMP-DESC-003) gives: *absent* and *not written yet* are the
same bytes, and only the publisher can tell them apart. So an unfinished
component validates, an editor can store it, and each of these is checked when
it is published:

| Obligation | Rule | Code | Path |
|---|---|---|---|
| A runnable component carries a `workload` | [`COMP-TYPE-006`](#COMP-TYPE-006) | `ERR_WORKLOAD_REQUIRED` | `/spec` |
| A workload carries a `source` | [`COMP-SRC-004`](#COMP-SRC-004) | `ERR_SOURCE_REQUIRED` | `/spec/workload` |
| A `SERVICE` declares an endpoint | [`COMP-TYPE-002`](#COMP-TYPE-002) | `ERR_ENDPOINT_REQUIRED` | `/spec/workload`, or `/spec/workload/endpoints` when empty |
| A `JOB` carries a `command` | [`COMP-TYPE-007`](#COMP-TYPE-007) | `ERR_COMMAND_REQUIRED` | `/spec/workload` |
| An `EXTERNAL` component publishes an output | [`COMP-EXT-003`](#COMP-EXT-003) | `ERR_OUTPUT_REQUIRED` | The object that lacks it, or `/spec/contract/outputs` when empty |
| Every input and output is described | [`COMP-DESC-004`](#COMP-DESC-004) | `ERR_DESCRIPTION_REQUIRED` | The input or output |

An absent field is reported at the object that lacks it, and a field that is
present and empty at itself. Each is `capability`, and an offline validator
MUST NOT report any of them. Everything that constrains a field that *is*
present stays structural.

<a id="COMP-TYPE-002"></a>**`COMP-TYPE-002`**: A published `SERVICE` MUST declare
at least one endpoint. It is request-driven, and a service nothing can reach
serves nothing. One without is rejected in the `capability` phase with
`ERR_ENDPOINT_REQUIRED`, at `/spec/workload` when `endpoints` is absent and at
`/spec/workload/endpoints` when it is empty.

<a id="COMP-TYPE-003"></a>**`COMP-TYPE-003`**: A `WORKER` MAY declare endpoints
and health probes. Its endpoints serve the platform and sibling nodes, for
example a health check, metrics or an internal API, and never the public. A
blueprint that exposes one `PUBLIC` fails with `ERR_ENDPOINT_NOT_EXPOSABLE`
([blueprint §4.3](../../blueprint/v1/spec.md#node-compute)). Because a `WORKER`
endpoint is never public, an output of a `WORKER` that reads a `public*`
property of one of its own endpoints, through an `endpoint` origin or a
`template`, could never resolve. It fails with `ERR_ENDPOINT_NOT_EXPOSABLE` at
the output's `from` or `from/template`, semantic.

<a id="COMP-TYPE-004"></a>**`COMP-TYPE-004`**: A `JOB` MUST NOT declare
`endpoints` or `health`. It runs to completion and serves nothing, so there is
nothing to route to or probe.

<a id="COMP-TYPE-007"></a>**`COMP-TYPE-007`**: A published `JOB` MUST carry
`command`, because it runs to completion and has nothing to run without one. One
without is rejected in the `capability` phase with `ERR_COMMAND_REQUIRED` at
`/spec/workload`.

<a id="COMP-TYPE-005"></a>**`COMP-TYPE-005`**: Only a `JOB` MAY declare
`schedule`. A schedule is a property of a job, not a category of its own.

<a id="command"></a>**Command.** <a id="COMP-CMD-001"></a>**`COMP-CMD-001`**:
`command` is a non-empty list of strings in exec form. Each item is one
argument, passed to the process verbatim, and no shell parses, splits or expands
it. A string is `ERR_INVALID_TYPE` and an empty list `ERR_INVALID_VALUE`. These
are structural rules.

`command` replaces the image's `CMD` and keeps its `ENTRYPOINT`, which is what
`command` means in Docker and Compose. Where `command` is omitted, the image's
own `CMD` runs. A workload that needs a shell names one, as in
`["/bin/sh", "-c", "…"]`.

### <a id="source"></a>5.1 Source

`source` says where the workload image comes from, and the key that is present
says which: `image` for an image that already exists, `git` for a repository the
platform builds into one.

```yaml
source:
  git:
    repositoryURL: https://github.com/musher-dev/examples
    ref: { branch: main }
    build:
      dockerfile: Dockerfile
      arguments: { NODE_ENV: production }
```

<a id="COMP-SRC-001"></a>**`COMP-SRC-001`**: `source` MUST hold exactly one of
`image` and `git`. A Git source requires `repositoryURL` and `build`; its `ref`,
when present, holds exactly one of `branch` and `commit`, and its `build` holds
exactly one of `dockerfile` and `buildpacks`. In each of these, naming neither
is `ERR_MISSING_FIELD` and naming both is `ERR_INVALID_VALUE`. These are
structural rules.

<a id="COMP-SRC-004"></a>**`COMP-SRC-004`**: A published workload MUST carry a
`source`. One without is rejected in the `capability` phase with
`ERR_SOURCE_REQUIRED` at `/spec/workload`.

<a id="COMP-SRC-002"></a>**`COMP-SRC-002`**: `image` is an OCI image reference:
a name, then optionally a tag, then optionally a SHA-256 digest. A name without
a tag means the tag `latest`, as it does in Docker, and every tag is accepted.
A reference outside that grammar is `ERR_INVALID_VALUE`, structural. A tag is
an author request, and a tag such as `latest` moves; only a resolved digest
identifies immutable content.

An omitted Git `ref` requests the repository's default branch. A `branch` is a
request, not a pin: the branch moves. A `commit` identifies the repository
content, not every build input or the resulting image.

`build.dockerfile` is the path of a Dockerfile relative to the repository root.
`build.buildpacks.builderImage` names a Cloud Native Buildpacks builder.
`build.arguments` applies to either strategy: build-time values keyed by name,
using the environment-variable grammar of [§5.3](#env-vars). They configure the
build only; runtime configuration rides on inputs ([§6.1](#inputs)).

### <a id="endpoints"></a>5.2 Endpoints

Each named endpoint requires `targetPort` (integer 1–65535) and `protocol`
(HTTP, HTTPS, WS, GRPC, TCP or UDP). Endpoint names match
`^[a-z][a-z0-9]{0,19}$`.

`targetPort` is the port the workload listens on, where traffic for the
endpoint is forwarded. It is never the public port, which the platform
allocates. A `targetPort` below 1024 is structurally valid; admission MAY reject
it as a capability check, because binding a privileged port needs a capability
the runtime may not grant.

Components declare endpoints, never exposure. A blueprint node selects public
exposure, and an endpoint it does not expose is private. A `WORKER`'s endpoints
are never public ([`COMP-TYPE-003`](#COMP-TYPE-003)).

<a id="COMP-EP-001"></a>**`COMP-EP-001`**: Every endpoint reference MUST name its
endpoint, including on a single-endpoint workload. There is no primary endpoint.
An unknown name fails with `ERR_UNKNOWN_ENDPOINT`.

Component owns the following address properties. Addresses are allocated before
workloads start; they do not assert readiness.

| Property | Logical type | Meaning |
|---|---|---|
| privateHostname | string | Allocated internal DNS hostname of the named endpoint |
| privatePort | integer | Named endpoint's target port |
| privateAddress | string | Internal hostname, colon, decimal target port |
| publicURL | string | Allocated URL, without a trailing slash, for HTTP/HTTPS/WS/GRPC |
| publicHostname | string | Hostname portion of that URL |
| publicAddress | string | Allocated TCP/UDP host:port, with IPv6 hosts bracketed |
| publicPort | integer | Allocated TCP/UDP edge port |

<a id="COMP-EP-004"></a>**`COMP-EP-004`**: A public property is read only from an
endpoint whose protocol has that address family. `publicURL` and
`publicHostname` require HTTP, HTTPS, WS or GRPC, and otherwise fail with
`ERR_ENDPOINT_NOT_HTTP`; `publicAddress` and `publicPort` require TCP or UDP,
and otherwise fail with `ERR_ENDPOINT_NOT_L4`. The private properties apply to
every protocol. Each diagnostic anchors at the reading output's `from`, or at
`from/template` for a template, and these are semantic rules.

Public properties require explicit `PUBLIC` exposure at composition time. A
public address read from a private endpoint fails with `ERR_ENDPOINT_NOT_PUBLIC`
in blueprint ([blueprint §4.3](../../blueprint/v1/spec.md#node-compute)). The
allocation context supplies the public URL scheme and routing address; a
validator MUST NOT invent them.

An authoritative endpoint allocation has opaque `identity` and `version`, an
optional `privateHostname`, and optional public routing facts: `hostname`,
`port`, `scheme` and `path`. Public routing requires `PUBLIC` exposure. The
public scheme is http, https, ws or wss, and the port is 1–65535. Hostnames
cannot carry credentials, a port, a path, query or fragment. Paths start with
`/` and carry no query, fragment, whitespace or backslash. TCP and UDP require
an allocated public port.

The address properties are derived from those facts. The private port comes
only from the component's `targetPort`. An address joins hostname and port,
bracketing an IPv6 host. A public URL joins the supplied scheme, host, optional
port and path, with no trailing slash. Missing allocation context cannot make a
declared private port incomplete. Redundant address properties are rejected, so
an independently supplied public URL, hostname or port cannot disagree with
these facts. Inconsistent or malformed facts fail with blueprint's
`ERR_INVALID_RESOLUTION_CONTEXT`.

### <a id="env-vars"></a>5.3 Environment variables

A workload's environment is exactly its inputs' targets. Each input of a
workload component names, in `target.envVarKey`, the variable its value is
written to ([§6.1](#inputs)), and nothing else writes the environment. Names
match `^[A-Z_][A-Z0-9_]*$` and contain 1–128 characters.

A value that does not vary between installations is still an input: one with a
`default`, which a blueprint may leave unwired or override
([blueprint §4.2](../../blueprint/v1/spec.md#bindings)). The install form is
authored separately in the blueprint, so a default asks the installer nothing.
A value that must never be overridden belongs in the image.

```yaml
inputs:
  pgdata:
    description: Directory PostgreSQL keeps its data files in.
    schema: { type: string }
    default: /var/lib/postgresql/data/pgdata
    target: { envVarKey: PGDATA }
```

<a id="COMP-ENVVAR-002"></a>**`COMP-ENVVAR-002`**: Two inputs MUST NOT claim one
`envVarKey`. Failure: `ERR_CONFLICTING_ENV_KEY` at the claiming input's
`target/envVarKey`; input names are compared in UTF-8 order to select the later
declaration.

An input's value is encoded into its environment variable after logical
validation:

- Strings are unchanged.
- Booleans are lowercase.
- Numbers use ECMAScript JSON number serialization, and negative zero becomes
  zero.
- Null is `null`.
- Arrays and objects use compact JSON, with object keys sorted recursively by
  Unicode code point and array order preserved.

An encoded string containing NUL fails with `ERR_ENV_ENCODING`. An absent
optional input adds no environment entry.

### <a id="health"></a>5.4 Health probes

A `SERVICE` or a `WORKER` may declare probes; a `JOB` may not
([`COMP-TYPE-004`](#COMP-TYPE-004)). A probe names its mechanism by the key that
is present, beside the timing fields.

<a id="COMP-EP-002"></a>**`COMP-EP-002`**: A probe requires `http`, which names an
`endpoint` and an absolute HTTP `path`. Unknown endpoints fail with
`ERR_UNKNOWN_ENDPOINT`, and protocols other than HTTP or HTTPS with
`ERR_ENDPOINT_NOT_HTTP`, both at `/spec/workload/health/<stage>/http/endpoint`.
WS and GRPC workloads may declare a separate HTTP health endpoint. `http` is the
only mechanism in v1, and any other key is an unknown field.

The stages are startup (initialization gate), readiness (traffic gate without
restart), and liveness (restart on failure). Until startup succeeds, readiness
and liveness checks are suspended. HTTP status 200–399 succeeds; transport
failure, timeout or another status fails. Failure thresholds count consecutive
failures; success thresholds count consecutive successes. Exhausting startup's
failure threshold restarts the workload.

Defaults: initialDelaySeconds 10, periodSeconds 10, timeoutSeconds 5,
successThreshold 1, failureThreshold 3. Initial delay is non-negative; every
other numeric probe field is a positive integer.

<a id="COMP-EP-003"></a>**`COMP-EP-003`**: Public HTTP-family exposure requires a
readiness probe. Blueprint checks it against the component contract when a node
exposes an endpoint ([blueprint §4.3](../../blueprint/v1/spec.md#node-compute)).

### <a id="volumes"></a>5.5 Volumes

Each volume requires `mountPath` and a positive integer `minSizeGiB`, the
smallest allocation the component can run with. Names use core's label grammar.
`readOnly` and `shared` both default to false.

```yaml
volumes:
  data:
    mountPath: /var/lib/postgresql/data
    minSizeGiB: 10
```

v1 defines no replica count, so `shared` is stated as what an installation can
observe. With `shared: false` the volume is mounted into at most one running
instance of the workload at a time, and an implementation MUST NOT mount it into
two instances concurrently: a workload with a non-shared volume runs one
instance at a time, including while it is replaced. With `shared: true` every
running instance mounts the same storage concurrently, which requires storage
that supports concurrent read-write mounts.

The blueprint MUST allocate each volume at or above its minimum
([blueprint §4.3](../../blueprint/v1/spec.md#node-compute)).

Paths MUST be canonical absolute POSIX paths: no dot segments, duplicate
separators or trailing slash except root. Duplicate and ancestor/descendant
mounts fail with `ERR_INVALID_MOUNT`. Provider size limits are capability
policy, separate from intrinsic validity.

### <a id="external"></a>5.6 External components

<a id="COMP-EXT-002"></a>**`COMP-EXT-002`**: `type: EXTERNAL` declares a
component the platform does not run, addressed elsewhere: a managed database,
for example, whose address and credentials another node consumes. It has no workload
([`COMP-EXT-001`](#COMP-EXT-001)), and its inputs have no environment `target`,
because nothing runs to receive one. A target on one is `ERR_INVALID_VALUE` at
its `target`, structural. It is the only kind of component that declares a
connection input ([`COMP-CONNECTION-002`](#COMP-CONNECTION-002)).

<a id="COMP-EXT-003"></a>**`COMP-EXT-003`**: A published `EXTERNAL` component
MUST publish at least one output. It exists to publish values another node
consumes, so one publishing nothing is a node nothing can need. One without is
rejected in the `capability` phase with `ERR_OUTPUT_REQUIRED`: at `/spec` when
`contract` is absent, at `/spec/contract` when `outputs` is absent, and at
`/spec/contract/outputs` when it is empty.

<a id="COMP-EXT-004"></a>**`COMP-EXT-004`**: An `EXTERNAL` component has no
endpoints, so an `endpoint` origin, or a template reading one, fails with
`ERR_UNKNOWN_ENDPOINT`, semantic. An external component may still publish
literals or republish its own inputs.

```yaml
spec:
  type: EXTERNAL
  contract:
    inputs:
      host:
        description: Hostname of the managed database server.
        schema: { type: string }
    outputs:
      host:
        description: Hostname a client connects to.
        schema: { type: string }
        from: { input: host }
```

There is no `resourceType` at node or value scope; what an external component
is does not select how it is supplied. A language model reached with an
endpoint, a credential and a model together is an external component too: its
connection input ([§6.4](#connection-requirements)) takes the connection whole,
and its outputs hand the members to the nodes that call it.

### <a id="jobs"></a>5.7 Jobs and schedules

<a id="COMP-JOB-001"></a>**`COMP-JOB-001`**: A `JOB` without `schedule` runs to
completion once per rollout of the installation that deploys it: at
installation, at each update and at each redeploy. v1 orders it against nothing.
It may run before, after or beside any other node's rollout, so a job that needs
another node ready waits for it itself. The outcome of each run, success or
failure, is recorded for the installation. v1 defines no automatic retry: a
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

<a id="COMP-JOB-002"></a>**`COMP-JOB-002`**: `schedule.cron` makes a `JOB` recur.
It is a cron expression of exactly five fields separated by one or more spaces
or tabs: minute, hour, day of month, month and day of week. Any other field
count, such as a seconds or year field, or a macro such as `@daily`, is
`ERR_INVALID_VALUE` at `/spec/workload/schedule/cron`, structural, rather than
read two ways.

Each field is a comma-separated list of one or more elements. An element is `*`,
a number `n` or a range `a-b` with `a` not greater than `b`, each optionally
followed by a step `/s` where `s` is a positive number. A step keeps the first
value of what it follows and every value `s` apart after it: `*/15` in the
minute field is 0, 15, 30 and 45, and `n/s` means `n-max/s`, where `max` is the
top of the field's range. Fields take numbers only, never month or day names.
The ranges are:

| Field | Range |
|---|---|
| Minute | 0–59 |
| Hour | 0–23 |
| Day of month | 1–31 |
| Month | 1–12 |
| Day of week | 0–6, where 0 is Sunday |

A run falls due at every minute whose five values each match their field. When
both day of month and day of week are restricted (neither is `*`), a day
matches when either of them matches, as POSIX `crontab` defines. A field
outside this grammar, or a number outside its field's range, is
`ERR_INVALID_SCHEDULE` at `/spec/workload/schedule/cron`, semantic.

<a id="COMP-JOB-003"></a>**`COMP-JOB-003`**: A schedule is evaluated in UTC. There
is no time-zone field, so `0 3 * * *` runs at 03:00 UTC wherever the
installation is deployed.

<a id="COMP-JOB-004"></a>**`COMP-JOB-004`**: A scheduled run that falls due while
the previous run of the same job is still executing is skipped. It is neither
queued nor started beside the running one, and the next run falls due at the
schedule's next time.

A scheduled `JOB` runs only when its schedule falls due; a rollout does not
start one.

## <a id="contract"></a>6. Configuration contract

`contract.inputs` and `contract.outputs` are named maps. Keys match
`^[a-z][a-zA-Z0-9]{0,63}$`.

<a id="COMP-DESC-001"></a>**`COMP-DESC-001`**: A `description` on an input or
output, when present, is non-empty, and every value input and every output
declares a logical schema. These are structural rules.

<a id="COMP-DESC-004"></a>**`COMP-DESC-004`**: A published component MUST
describe every input and output. The description is the single place a value is
explained, and a blueprint parameter shows it rather than carrying its own
([ADR 0026](../../../docs/adr/0026-a-component-declares-requirements.md) §2).
One without is rejected in the `capability` phase with
`ERR_DESCRIPTION_REQUIRED` at the input or output, for the reason
[`COMP-DESC-003`](#COMP-DESC-003) gives.

### <a id="inputs"></a>6.1 Inputs

An input is a **value input**, which declares `schema`, or a **connection
input**, which declares `connection` ([§6.4](#connection-requirements)). The key
that is present says which: declaring neither is `ERR_MISSING_FIELD`, and
declaring both is `ERR_INVALID_VALUE`. These are structural rules.

A value input declares `schema`, a `description` it needs before it is
published ([`COMP-DESC-004`](#COMP-DESC-004)), and optionally `required`
(default true), `default`, `sensitive` (default false), `presentationHint` and
`target`.
An input of a workload component requires `target.envVarKey`, the environment
variable its value is written to; an input of an `EXTERNAL` component forbids a
target ([`COMP-EXT-002`](#COMP-EXT-002)).

```yaml
inputs:
  postgresPassword:
    description: Password the database superuser is created with.
    schema: { type: string }
    sensitive: true
    target: { envVarKey: POSTGRES_PASSWORD }
```

When a blueprint binds nothing to an input, the input takes its default; with no
default, an optional input is absent and a required one fails. A present binding
owns supply and cannot fall back to the default after failure. Defaults are
logical values, and are null only when their schema permits it.

### <a id="outputs"></a>6.2 Outputs

<a id="COMP-OUT-001"></a>**`COMP-OUT-001`**: Every output declares `from`, and
the key present in it says where the value comes from. It holds exactly one
origin:

| Keys | Meaning |
|---|---|
| `value` | Logical non-secret value |
| `input`, optional `member` | Forward the named own input, or one member of a connection input, retaining sensitivity |
| `endpoint`, `property` | Read one allocated endpoint property |
| `template` | Single-pass string substitution over own endpoints |

A `from` naming no origin is `ERR_MISSING_FIELD`, and so is a `property` without
its `endpoint` or an `endpoint` without its `property`: the two keys are one
origin, and each half requires the other. A `from` naming two origins is
`ERR_INVALID_VALUE`. These are structural rules.

```yaml
outputs:
  address:
    description: Internal host and port clients reach the database at.
    schema: { type: string }
    from: { endpoint: primary, property: privateAddress }
```

<a id="COMP-OUT-002"></a>**`COMP-OUT-002`**: An `input` origin names an existing
own input; otherwise `ERR_UNKNOWN_INPUT_REFERENCE` at `from/input`. Its logical
type must fit the output. An input the blueprint binds to another node's output
may be forwarded, and blueprint rejects the cycles that can form
([blueprint `BP-CONN-002`](../../blueprint/v1/spec.md#BP-CONN-002)).

<a id="COMP-OUT-003"></a>**`COMP-OUT-003`**: Every declared output must be
produced, so an `input` origin MUST name an input that is always supplied: one
that is required, or one that carries a `default`. An origin naming an optional
input with no default is `ERR_OUTPUT_NOT_PRODUCIBLE` at `from/input`. The
default of `required` is true ([§6.1](#inputs)), so an input that says nothing
satisfies this.

The code is not `ERR_UNKNOWN_INPUT_REFERENCE`, because the input exists and
naming it was not the mistake. What the document promises is an output, and
[§6.1](#inputs) already says that an unbound optional input with no default is
simply absent. An output whose only source can be absent is a promise the
contract cannot keep, and a consuming node discovers that at install time rather
than here. A `default` closes it, because a default is a value: it makes the
input supplied whether a blueprint binds it or not.

<a id="COMP-OUT-004"></a>**`COMP-OUT-004`**: An `input` origin naming a connection
input MUST carry `member`, one of `baseURL`, `apiKey` or `model`, and one naming
a value input MUST NOT. Failure: `ERR_UNKNOWN_INPUT_REFERENCE`, at `from/input`
when the member is missing and at `from/member` when it is not wanted, semantic.
A `member` without an `input` is `ERR_MISSING_FIELD`, structural. Each member
is a string, so an output forwarding one declares a string schema, as
[`COMP-OUT-002`](#COMP-OUT-002) requires of any forwarded value; `apiKey` is
sensitive, so an output forwarding it is sensitive ([§11](#security)).

<a id="COMP-REF-001"></a>**`COMP-REF-001`**: A `template` admits only core's
`self` namespace, and a `self` path is exactly
`endpoints.<endpoint>.<property>`: `${{ self.endpoints.web.publicHostname }}`,
in the same order as an `endpoint` and `property` origin. A path of any other
shape names no endpoint explicitly, and fails with `ERR_UNKNOWN_ENDPOINT` at
`from/template`, as an undeclared endpoint does. That includes the
property-first order, `${{ self.publicHostname.web }}`. There is no implicit
endpoint selection. A declared endpoint followed by a property outside
[§5.2](#endpoints)'s table fails with `ERR_UNKNOWN_ADDRESS_PROPERTY` at
`from/template`.

Escapes and non-recursive substitution follow
[core](../../core/v1/spec.md#reference-grammar). A template produces a string.
An `endpoint` origin reading `privatePort` or `publicPort` produces an integer,
and one reading any other property produces a string. Values are checked
against output schemas. Values produced by a job at run time are unsupported.

### <a id="value-schema"></a>6.3 Logical schemas

<a id="COMP-VAL-001"></a>**`COMP-VAL-001`**: `schema.type` is one of string,
integer, number, boolean, null, array or object.

<a id="COMP-VAL-002"></a>**`COMP-VAL-002`**: The bounded JSON Schema 2020-12
profile admits only the following assertions:

| Type | Keywords in addition to type and non-empty enum |
|---|---|
| string | minLength, maxLength, pattern |
| integer, number | minimum, maximum, exclusiveMinimum, exclusiveMaximum |
| boolean, null | none |
| array | items (required), minItems, maxItems, uniqueItems |
| object | properties (required), required, additionalProperties (required false) |

An `enum`, at any level, is non-empty and its members are unique; an empty or
repeating one is `ERR_INVALID_VALUE`, structural.

<a id="COMP-VAL-003"></a>**`COMP-VAL-003`**: Unknown or inapplicable keywords,
remote or local schema references, composition and conditional schemas are
rejected. Object required names must be declared properties. Schema depth is at
most 16. Integer means a mathematically integral JSON number; no coercion occurs.

<a id="COMP-VAL-004"></a>**`COMP-VAL-004`**: `presentationHint`, outside schema,
may be EMAIL, URI, ENDPOINT_URL, CONNECTION_STRING, HOSTNAME or TIMEZONE. These
are UI annotations and make no assertion. Defaults and sensitivity also belong
outside schema; JSON Schema annotation processing never inserts values.

<a id="COMP-VAL-005"></a>**`COMP-VAL-005`**: Defaults and statically known values
MUST satisfy their schemas. Schema defects fail with `ERR_INVALID_VALUE_SCHEMA`;
value defects fail with `ERR_VALUE_CONSTRAINT`. Resolved dynamic values are
checked before encoding or workload execution. A reference-free `template` is a
statically known string after escape processing and follows the same constraint
and authored-secret rules as a literal.

<a id="COMP-VAL-006"></a>**`COMP-VAL-006`**: Arrays validate every item. An item
enumeration constrains members; an array enumeration constrains whole arrays.
There is no special string-list transport type.

Patterns use ASCII regular-expression atoms, classes, anchors and quantifiers,
without groups, alternation, lookaround, backreferences or Unicode/property and
word-boundary escapes; maximum 256 characters. At most one quantified atom is
permitted; a quantified pattern must begin with `^`, and numeric repetition
bounds must not exceed 1024. This prevents combinatorial backtracking in the
supported profile. Matching is Unicode-aware,
case-sensitive, without implicit anchors. Implementations MUST bound execution.
Logical values share core's depth, byte and scalar limits. Numbers use finite
binary64 values, with integers restricted to the inclusive safe-integer range.
Unsupported numeric values are rejected, never silently rounded.

### <a id="connection-requirements"></a>6.4 Connection inputs

A connection input stands for an endpoint, a credential and a model the platform
acquires together as one atomic connection
([ADR 0030](../../../docs/adr/0030-atomic-named-connections.md)). It declares
`description` and `connection`, which requires `protocol` and may list
`capabilities`. The component that declares one is an external node standing
for the model API, and its outputs hand the members on:

```yaml
spec:
  type: EXTERNAL
  contract:
    inputs:
      llm:
        description: Language-model connection this node stands for.
        connection:
          protocol: OPENAI_CHAT_COMPLETIONS
          capabilities: [STREAMING]
    outputs:
      baseURL:
        description: Base URL of the language-model API.
        schema: { type: string }
        from: { input: llm, member: baseURL }
      apiKey:
        description: Credential the language-model API accepts.
        schema: { type: string }
        sensitive: true
        from: { input: llm, member: apiKey }
      model:
        description: Model the language-model API answers with.
        schema: { type: string }
        from: { input: llm, member: model }
```

Protocols are OPENAI_CHAT_COMPLETIONS and ANTHROPIC_MESSAGES: client request and
response contracts, independent of upstream vendor. Optional `capabilities` is a
unique list of STREAMING and TOOL_CALLS. Unknown terms are rejected, not ignored.
STREAMING requires incremental protocol-native response events and termination;
TOOL_CALLS requires protocol-native tool requests and tool-result continuation.
Omitting capabilities requests only ordinary non-streaming text conversation.

<a id="COMP-CONNECTION-002"></a>**`COMP-CONNECTION-002`**: A connection input
declares only `description` and `connection`. Its protocol fixes its members,
`baseURL`, `apiKey` and `model`, each a string and `apiKey` sensitive, so it
MUST NOT carry `schema`, `default`, `required`, `sensitive`,
`presentationHint` or `target`, and it is always required. Only an `EXTERNAL`
component declares one. A field this excludes is `ERR_INVALID_VALUE` at that
field, and a connection input on a `SERVICE`, `WORKER` or `JOB` is
`ERR_INVALID_VALUE` at its `connection`. These are structural rules.

A blueprint fills a connection input with a connection parameter
([blueprint §5.3](../../blueprint/v1/spec.md#atomic-connections)), and the
nodes that call the model wire ordinary inputs to the external node's outputs.
A workload never declares a connection input. It receives a connection's
members as ordinary values, like any other value from outside the blueprint
([§5.6](#external)).

Credentials are whole values, never templates or concatenated strings. Existing
sensitivity propagation and secret-publication prohibitions apply.

## <a id="validation-layers"></a>7. Validation layers

Core's phases and explicit coverage statuses apply. Components are structurally
validated before semantic checks. Publication requires the publication profile;
workload execution additionally requires blueprint resolution and admission.
Some rules here fall on the publication side of that line and nowhere earlier:
[`COMP-ID-001`](#COMP-ID-001), because the lineage is a fact the catalog holds,
and [`COMP-DESC-003`](#COMP-DESC-003) with the obligations
[§5](#publication-obligations) lists, because an unwritten description or an
unchosen image is only a defect in a component someone is trying to publish.

## <a id="diagnostics"></a>8. Diagnostics

Core diagnostics also apply.

| Code | Phase | Meaning |
|---|---|---|
| `ERR_CONFLICTING_ENV_KEY` | `semantic` | Environment destination claimed twice. |
| `ERR_UNKNOWN_ENDPOINT` | `semantic` | Endpoint absent or not explicitly named. |
| `ERR_ENDPOINT_NOT_HTTP` | `semantic` | Endpoint cannot supply this HTTP operation. |
| `ERR_ENDPOINT_NOT_L4` | `semantic` | Endpoint cannot supply an edge address. |
| `ERR_UNKNOWN_ADDRESS_PROPERTY` | `semantic` | Template reads a property §5.2 does not define. |
| `ERR_ENDPOINT_NOT_EXPOSABLE` | `semantic` | A `WORKER` endpoint is exposed `PUBLIC`, or a `WORKER` output reads a public property. |
| `ERR_INVALID_SCHEDULE` | `semantic` | A cron field is outside §5.7's grammar or range. |
| `ERR_UNKNOWN_INPUT_REFERENCE` | `semantic` | Output names no own input, or reads a connection input without the member §6.2 requires. |
| `ERR_OUTPUT_NOT_PRODUCIBLE` | `semantic` | Output forwards an optional input that has no default. |
| `ERR_INVALID_MOUNT` | `semantic` | Mount is not canonical or overlaps another. |
| `ERR_INVALID_VALUE_SCHEMA` | `semantic` | Unsupported or invalid logical schema. |
| `ERR_VALUE_CONSTRAINT` | `semantic`, `resolution` | Known value or output origin violates a contract. |
| `ERR_SECRET_LITERAL` | `semantic` | Authored literal supplies a sensitive contract. |
| `ERR_VERSION_NOT_MONOTONIC` | `capability` | Published component revision does not increase. |
| `ERR_DESCRIPTION_REQUIRED` | `capability` | Publication requires a description this document, or one of its inputs or outputs, does not carry. |
| `ERR_WORKLOAD_REQUIRED` | `capability` | Publication requires a workload of a `SERVICE`, `WORKER` or `JOB`. |
| `ERR_SOURCE_REQUIRED` | `capability` | Publication requires a workload source. |
| `ERR_ENDPOINT_REQUIRED` | `capability` | Publication requires an endpoint of a `SERVICE`. |
| `ERR_COMMAND_REQUIRED` | `capability` | Publication requires a command of a `JOB`. |
| `ERR_OUTPUT_REQUIRED` | `capability` | Publication requires an output of an `EXTERNAL` component. |
| `ERR_ENV_ENCODING` | `resolution` | Value cannot be encoded into an environment variable. |

## <a id="conformance"></a>9. Conformance

Implementations declare their profiles and execute the corresponding family and
core fixtures. Skipped obligations are never counted as passed.
Normalization, resolution, rendering and lifecycle fixtures test implementation
outcomes as defined in [the conformance contract](../../../docs/conformance.md).

## <a id="known-debt"></a>10. Unsupported capabilities

Runtime-emitted outputs, arbitrary expressions, recursive substitution,
provider-specific configuration maps, non-HTTP health mechanisms, schedule
time zones and ordering a job against other nodes are unsupported. Reject
unsupported declarations. Adding them requires defined semantics and
conformance evidence.

## <a id="security"></a>11. Security considerations

Published artifacts MUST NOT contain secret plaintext, including defaults
and build arguments. A validator cannot discover every
unmarked secret; this does not authorize embedding one. Sensitive contracts
reject authored literal supply.

Sensitivity follows the value through binding, forwarding, formatting and
storage. Effective sensitivity is source OR destination sensitivity.
Diagnostics, logs, events, previews and public plans MUST NOT expose sensitive
values, their substrings, or content hashes. Materialization is a private channel.
