# Musher Component Document — Specification v1

**Status:** Draft (pre-stable)
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
narrowing.

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
is REQUIRED. It says what the component is, in one or two sentences of plain
text, 1 to 280 characters, the limit of a
[listing summary](../../listing/v1/spec.md#presentation). A consumer MUST NOT
render it as Markdown. An absent description is `ERR_MISSING_FIELD` at
`/metadata`, and an empty or longer one is `ERR_INVALID_VALUE`. These are
structural rules.

A component's file stem is its only other name, and a published component is
reused by items that know nothing about it, so the document describes itself.
The description is for the person composing a blueprint. It is not storefront
copy: that is the listing's `summary`.

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
whole of the `structural` rule, and every other statement in this section is
either `capability` or a SHOULD.

## <a id="workload"></a><a id="type"></a>5. The component's shape

`spec` holds `type`, `workload` and `contract`. The type says what kind of
node the component is, the workload says how the platform runs it, and the
contract ([§6](#contract)) says what configuration it consumes and produces. A
minimal service needs only a type, an image and one endpoint:

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

<a id="COMP-EXT-001"></a>**`COMP-EXT-001`**: `spec.workload` is REQUIRED unless
the type is `EXTERNAL`, and MUST be absent when it is. A missing workload is
`ERR_MISSING_FIELD` at `/spec`; a workload on an `EXTERNAL` component is
`ERR_INVALID_VALUE` at `/spec/workload`. These are structural rules.

The type decides which workload fields apply:

| Field | `SERVICE` | `WORKER` | `JOB` |
|---|---|---|---|
| `source` | Required | Required | Required |
| `command` | Optional | Optional | Required |
| `endpoints` | Required, non-empty | Optional | Forbidden |
| `health` | Optional | Optional | Forbidden |
| `schedule` | Forbidden | Forbidden | Optional |
| `envVars`, `volumes` | Optional | Optional | Optional |

Forbidden means absent. Empty mappings and null are not alternative spellings.
A forbidden field is `ERR_INVALID_VALUE` at its own path, and a required one
that is missing is `ERR_MISSING_FIELD` at the object that lacks it. Unknown
fields are rejected. These are structural rules. The four rules that follow say
why each type allows what it does.

<a id="COMP-TYPE-002"></a>**`COMP-TYPE-002`**: A `SERVICE` MUST declare at least
one endpoint. It is request-driven, and a service nothing can reach serves
nothing.

<a id="COMP-TYPE-003"></a>**`COMP-TYPE-003`**: A `WORKER` MAY declare endpoints
and health probes. Its endpoints serve the platform and sibling nodes, for
example a health check, metrics or an internal API, and never the public. A
blueprint that exposes one `PUBLIC` fails with `ERR_ENDPOINT_NOT_EXPOSABLE`
([blueprint §4.3](../../blueprint/v1/spec.md#node-compute)). Because a `WORKER`
endpoint is never public, an output of a `WORKER` that reads a `public*`
property of one of its own endpoints, through an `endpoint` origin or a
`template`, could never resolve. It fails with `ERR_ENDPOINT_NOT_EXPOSABLE` at
the output's `from` or `from/template`, semantic.

<a id="COMP-TYPE-004"></a>**`COMP-TYPE-004`**: A `JOB` MUST declare `command`,
and MUST NOT declare `endpoints` or `health`. It runs to completion and serves
nothing, so there is nothing to route to or probe.

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

<a id="COMP-SRC-002"></a>**`COMP-SRC-002`**: `image` is an OCI image reference
and MUST carry a tag or a SHA-256 digest. A bare name is an implicit `latest`
and is `ERR_INVALID_VALUE`, structural. A tag is an author request; only a
resolved digest identifies immutable content.

An omitted Git `ref` requests the repository's default branch. A `branch` is a
request, not a pin: the branch moves. A `commit` identifies the repository
content, not every build input or the resulting image.

`build.dockerfile` is the path of a Dockerfile relative to the repository root.
`build.buildpacks.builderImage` names a Cloud Native Buildpacks builder.
`build.arguments` applies to either strategy: build-time values keyed by name,
using the environment-variable grammar of [§5.3](#env-vars). They configure the
build only; runtime configuration rides on `envVars` and inputs.

<a id="COMP-SRC-003"></a>**`COMP-SRC-003`**: Without a digest, image tags MUST NOT
be latest, main, main-stable, master, stable, edge, nightly, dev or rolling,
compared case-insensitively. Failure: `ERR_UNPINNED_IMAGE` at
`/spec/workload/source/image`, semantic.

This set is fixed for v1. Extending it to reject previously accepted documents
is breaking regardless of validation phase. Other tags are still mutable.

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

`envVars` maps each variable name to its value, an intrinsic non-secret
constant written verbatim. An empty string is a value. Names match
`^[A-Z_][A-Z0-9_]*$` and contain 1–128 characters. A name appears once: the YAML
profile rejects a repeated mapping key in the `parser` phase
([`CORE-YAML-006`](../../core/v1/spec.md#CORE-YAML-006)), so no rule here
restates it.

```yaml
envVars:
  PGDATA: /var/lib/postgresql/data/pgdata
  POSTGRES_DB: app
```

A value that varies between installations is not an environment constant. It is
an input with a target ([§6.1](#inputs)), supplied by the blueprint, and an
organization variable reaches a component only that way.

<a id="COMP-ENVVAR-002"></a>**`COMP-ENVVAR-002`**: An input target MUST NOT claim
a name `envVars` declares, or another input's key. Failure:
`ERR_CONFLICTING_ENV_KEY` at the claiming input's `target/envVarKey`; input
names are compared in UTF-8 order to select the later declaration.

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
its `target`, structural.

<a id="COMP-EXT-003"></a>**`COMP-EXT-003`**: An `EXTERNAL` component requires a
`contract` with a non-empty `outputs` map. It exists to publish values another
node consumes, so one publishing nothing is a node nothing can need. An absent
`contract` or `outputs` is `ERR_MISSING_FIELD`, and an empty `outputs` is
`ERR_INVALID_VALUE`. These are structural rules.

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
is does not select how it is supplied. A language model or other API reached with an
endpoint, a credential and a model together is a connection
([§6.4](#connection-requirements)), not an external node.

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

<a id="COMP-DESC-001"></a>**`COMP-DESC-001`**: Every input and output requires a
non-empty description and a logical schema.

### <a id="inputs"></a>6.1 Inputs

Inputs declare `schema` and `description`, and optionally `required` (default
true), `default`, `sensitive` (default false), `presentationHint` and `target`.
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
| `input` | Forward the named own input, retaining sensitivity |
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
([blueprint `BP-CONN-002`](../../blueprint/v1/spec.md#BP-CONN-002)). Every
declared output must be produced, so an absent optional input cannot supply an
`input` origin.

<a id="COMP-REF-001"></a>**`COMP-REF-001`**: A `template` admits only core's
`self` namespace, and a `self` path is exactly
`endpoints.<endpoint>.<property>`: `${{ self.endpoints.web.publicHostname }}`,
in the same order as an `endpoint` and `property` origin. A path of any other
shape names no endpoint explicitly, and fails with `ERR_UNKNOWN_ENDPOINT` at
`from/template`, as an undeclared endpoint does. That includes the withdrawn
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

### <a id="connection-requirements"></a>6.4 Connection requirements

`contract.connectionRequirements` is an optional map of named atomic connection
requirements: an endpoint, a credential and a model the component needs
together. A blueprint satisfies each one with a connection parameter
([blueprint §5.3](../../blueprint/v1/spec.md#atomic-connections)). Names use the
input-name grammar. Each requirement requires `protocol` and `inputs`, which
maps exactly the three roles `baseURL`, `apiKey` and `model` to existing inputs.

```yaml
connectionRequirements:
  llm:
    protocol: OPENAI_CHAT_COMPLETIONS
    capabilities: [STREAMING]
    inputs:
      baseURL: llmBaseURL
      apiKey: llmAPIKey
      model: llmModel
```

Protocols are OPENAI_CHAT_COMPLETIONS and ANTHROPIC_MESSAGES: client request and
response contracts, independent of upstream vendor. Optional `capabilities` is a
unique list of STREAMING and TOOL_CALLS. Unknown terms are rejected, not ignored.
STREAMING requires incremental protocol-native response events and termination;
TOOL_CALLS requires protocol-native tool requests and tool-result continuation.
Omitting capabilities requests only ordinary non-streaming text conversation.

<a id="COMP-CONNECTION-001"></a>**`COMP-CONNECTION-001`**: Every role MUST name a
required string input with no default. An input named by a role belongs to
exactly one requirement, and two roles cannot name the same input. The `apiKey`
role MUST name a sensitive input. Failure:
`ERR_INVALID_CONNECTION_REQUIREMENT`.

The inputs keep their own schemas, descriptions and environment targets; the
requirement groups them and does not duplicate them. Credentials are whole
values, never templates or concatenated strings. Existing sensitivity
propagation and secret-publication prohibitions apply.

## <a id="validation-layers"></a>7. Validation layers

Core's phases and explicit coverage statuses apply. Components are structurally
validated before semantic checks. Publication requires the publication profile;
workload execution additionally requires blueprint resolution and admission.

## <a id="diagnostics"></a>8. Diagnostics

Core diagnostics also apply.

| Code | Phase | Meaning |
|---|---|---|
| `ERR_UNPINNED_IMAGE` | `semantic` | Forbidden floating image tag. |
| `ERR_CONFLICTING_ENV_KEY` | `semantic` | Environment destination claimed twice. |
| `ERR_UNKNOWN_ENDPOINT` | `semantic` | Endpoint absent or not explicitly named. |
| `ERR_ENDPOINT_NOT_HTTP` | `semantic` | Endpoint cannot supply this HTTP operation. |
| `ERR_ENDPOINT_NOT_L4` | `semantic` | Endpoint cannot supply an edge address. |
| `ERR_UNKNOWN_ADDRESS_PROPERTY` | `semantic` | Template reads a property §5.2 does not define. |
| `ERR_ENDPOINT_NOT_EXPOSABLE` | `semantic` | A `WORKER` endpoint is exposed `PUBLIC`, or a `WORKER` output reads a public property. |
| `ERR_INVALID_SCHEDULE` | `semantic` | A cron field is outside §5.7's grammar or range. |
| `ERR_UNKNOWN_INPUT_REFERENCE` | `semantic` | Output names no own input. |
| `ERR_INVALID_MOUNT` | `semantic` | Mount is not canonical or overlaps another. |
| `ERR_INVALID_VALUE_SCHEMA` | `semantic` | Unsupported or invalid logical schema. |
| `ERR_VALUE_CONSTRAINT` | `semantic`, `resolution` | Known value or output origin violates a contract. |
| `ERR_SECRET_LITERAL` | `semantic` | Authored literal supplies a sensitive contract. |
| `ERR_VERSION_NOT_MONOTONIC` | `capability` | Published component revision does not increase. |
| `ERR_ENV_ENCODING` | `resolution` | Value cannot be encoded into an environment variable. |
| `ERR_INVALID_CONNECTION_REQUIREMENT` | `semantic` | Invalid connection member or role. |

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

Published artifacts MUST NOT contain secret plaintext, including defaults,
environment constants and build arguments. A validator cannot discover every
unmarked secret; this does not authorize embedding one. Sensitive contracts
reject authored literal supply.

Sensitivity follows the value through binding, forwarding, formatting and
storage. Effective sensitivity is source OR destination sensitivity.
Diagnostics, logs, events, previews and public plans MUST NOT expose sensitive
values, their substrings, or content hashes. Materialization is a private channel.
