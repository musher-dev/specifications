# ADR 0031: One grammar for the authored documents

- **Status:** Accepted
- **Date:** 2026-09-18
- **Supersedes:** [ADR 0019](0019-external-component-node.md) §1, §6
- **Refines:** [ADR 0007](0007-naming-conventions.md) §1
- **Refines:** [ADR 0027](0027-a-reference-names-a-fact-the-document-cannot-contain.md) §2, §3
- **Refines:** [ADR 0028](0028-explicit-binding-and-resolution-before-release.md) §1
- **Refines:** [ADR 0030](0030-atomic-named-connections.md) §1
- **Relies on:** [ADR 0005](0005-platform-divergence-reconciliation.md) §1

## Context

The component and blueprint vocabularies were decided one field at a time, and
a pre-release review read them as a user would. It found no single grammar a
reader could use to predict a name they had not yet seen:

- **Two union styles and no rule between them.** The component chose between
  `workload` and `external` by which key was present. Every other union carried
  a `type` tag, including unions with one member
  (`envVars[].value: {type: LITERAL, value}`, probe `type: HTTP`) and unions whose
  tag restates the only other key (`{type: INPUT, input: baseUrl}`).
- **An empty marker.** ADR 0028 removed `resourceType`, so `external: {}` became
  an object that holds nothing and that an author has to type anyway.
- **One word, four meanings.** `source` named a workload's image or Git build, an
  output's origin, a configuration reference and a connection slot.
- **Three doors for outside values.** An installation took values from
  parameters, from `CONFIG_REF` bindings on each node and from top-level
  `connectionSources`. All three answer the same question, "what does this
  installation take from outside the documents?", and each answered it in a
  different place.
- **Names that describe the wrong thing.** `containerPort` assumes a container.
  `size` holds a `family.tier.size` slug, so its name matches one segment of its
  own value. `accessMode: READ_WRITE_ONCE` imports Kubernetes jargon that even
  Kubernetes users misread: it means one node, not one replica. `command` was a
  single string, with no rule for how it is split.
- **Behaviour left undefined.** Nothing said when a `JOB` runs, which timezone a
  `CRON` expression uses, or what happens when a scheduled run overlaps the
  previous one. A `WORKER` could declare no endpoint, so it could have no health
  probe.

### Why now

`git tag -l` is empty and `published.json` records no release, so ADR 0005 §1's
pre-publication window is open for every family. Every decision below narrows
what validates. Each is free now and would need a `v2` after the first tag.

## Decision

### 1. `type` names a category; the present key names a source

A `type` tag is used only where the variant is a **category** that constrains
fields its variants share. Where the variant is **where a value comes from**,
the key that is present decides it and there is no tag. Authored formats already
work this way: Kubernetes `valueFrom`, volume sources and probes; CloudFormation
`Ref` and `Fn::GetAtt`; GitHub Actions `uses` and `run`.

| Union | Spelling |
|---|---|
| Component category | `spec.type: SERVICE \| WORKER \| JOB \| EXTERNAL` |
| Endpoint protocol | `protocol` (unchanged) |
| Workload source | `source: {image}` or `source: {git: {repositoryURL, ref?, build}}` |
| Git ref | `ref: {branch}` or `ref: {commit}` |
| Build | `build: {dockerfile}` or `build: {buildpacks: {builderImage}}`, with `arguments` beside either |
| Probe mechanism | `http: {endpoint, path}` beside the timing fields |
| Output origin | `from: {value}`, `{input}`, `{endpoint, property}` or `{template}` |
| Node binding | `{parameter}`, `{node, output}` or `{value}` |
| Connection binding | `{parameter}` |
| Parameter supply | submitted (optional `default`), `generator`, or `from` |

The rule covers authored documents only. The generated resolution record is read
by software, not written by people, and keeps its `source` tag.

A field that names another key in the same document is a bare noun: `input`,
`endpoint`, `parameter`, `node`, `output`. This is ADR 0007 §1's `…Ref` rule
stated from the other side: `…Ref` points at another document
(`componentRef`), and nothing else carries a suffix.

### 2. The component's category sits at `spec.type`

`spec.type` is REQUIRED. `workload` is REQUIRED unless the type is `EXTERNAL`,
and forbidden when it is. This supersedes ADR 0019 §1. The objections that
section raised no longer apply: a tag on every document costs nothing inside
the window, and the conditions are written as `if`/`then` over shared
properties, as `ComponentWorkload` already is, so defaults beneath them stay
within ADR 0008's effective-value resolution.

The categories split by lifecycle and by whether the workload serves traffic:

| Type | Lifecycle | Endpoints |
|---|---|---|
| `SERVICE` | Long-running, request-driven | At least one |
| `WORKER` | Long-running, not request-driven | Optional, never `PUBLIC` |
| `JOB` | Runs to completion | None |
| `EXTERNAL` | Not run by the platform | None |

A `JOB` without `schedule` runs once per rollout: installation, update and
redeploy. v1 orders it against nothing. A `JOB` with `schedule.cron` recurs. The
expression is evaluated in UTC, and a run due while the previous run is still
executing is skipped. `CRON` is withdrawn as a type: a schedule is a property of
a job. Kubernetes reached the same conclusion when it renamed `ScheduledJob` to
`CronJob` as a job template plus a schedule, and Nomad makes a periodic job a
batch job with a `periodic` block.

**Why `JOB`, not `TASK`.** "Task" means a running instance in ECS, one process
in a Nomad group, one unit of a Cloud Run job execution and a queued message in
Celery. "Job" means run-to-completion in Kubernetes, Cloud Run, AWS Batch,
DigitalOcean App Platform, Render and Railway.

**Why `WORKER` stays.** `WORKER` is the term users of Heroku, Render and
DigitalOcean look for. It is also where later queue triggers and scale-to-zero
policy attach, because its scaling signal is work rather than requests. It may
now declare private endpoints, so a worker can serve `/healthz` or metrics and
have liveness probes.

### 3. Names say what the value is

| Before | After | Why |
|---|---|---|
| `containerPort` | `targetPort` | The port the process listens on, which is where traffic is forwarded. It assumes no container |
| `command: "…"` | `command: [argv…]` | Exec form, no shell. It replaces the image `CMD` and keeps `ENTRYPOINT`, which is what `command` means in Docker and Compose |
| `envVars: [{key, value: {type: LITERAL, value}}]` | `envVars: {NAME: text}` | A single-member union. The parser already rejects duplicate keys, so `COMP-ENVVAR-001` and `ERR_DUPLICATE_ENV_KEY` are withdrawn. The name stays `envVars`, because "environment" means the deployment environment |
| `minimumSizeGiB` | `minSizeGiB` | ADR 0007 §2's `min…` prefix |
| `accessMode` | `shared: true \| false` | Whether the volume is mounted on every replica |
| node `size` | node `compute.profile` | The value is a compute profile slug |
| `placement.storageClass`, `placement.minStorageIOPS` | `volumes.<name>.storageClass`, `volumes.<name>.minIOPS` | They describe a volume, not a host |
| output `source` | output `from` | `source` now means only the workload source |
| `${{ self.publicHostname.web }}` | `${{ self.endpoints.web.publicHostname }}` | The same order as `{endpoint, property}` |

`compute` holds `profile` and `placement`, because placement narrows exactly the
profile it sits beside. A workload node requires it and an `EXTERNAL` node
forbids it, and a blueprint checks that agreement semantically against the
component it deploys. This supersedes ADR 0019 §6: `size: null` is withdrawn,
and with it the last family-bound `null` in the blueprint that meant "none".

A worker endpoint cannot be exposed. A blueprint that sets one `PUBLIC` is
rejected with `ERR_ENDPOINT_NOT_EXPOSABLE`.

### 4. Parameters are the one way values enter an installation

`spec.parameters` lists everything an installation takes from outside the
documents: values a person submits, generated values, organization variables
and connections. Node `bindings` only wire what is inside the documents. This is
how Terraform module variables, CloudFormation typed parameters and ARM
parameter files work.

A parameter carries at most one of `default`, `generator` and `from`. `from` is
one whole reference:

```yaml
parameters:
  region:
    from: "${{ variables.cloud.region }}"
  llm:
    from: "${{ connections.llm.default }}"
    ui: { label: Language model }
```

The reference's namespace says what kind of entry it names, as GitHub Actions'
`vars` and `secrets` contexts do. `variables` names one value. `connections`
names an atomic connection, ADR 0030's bundle of endpoint, credential and model.
A `connections` parameter is bound only through `connectionBindings`, and any
other parameter only through `bindings`, or the blueprint is rejected with
`ERR_INVALID_CONNECTION_BINDING`. This refines ADR 0028 §1, which removes the
`CONFIG_REF` binding, and ADR 0030 §1, which removes `connectionSources`. A
connection keeps its whole-selection override. A generated or variable-sourced
parameter rejects a submitted value with `ERR_PARAMETER_NOT_SUBMITTABLE`,
replacing `ERR_GENERATED_OVERRIDE`. Variables resolve against the configuration
visible to the environment the installation is deployed into: organization
values, overridable per environment.

### 5. Core's namespaces follow

This refines ADR 0027 §3's reserved set. `config` becomes `variables`,
`connections` is added, and `params` becomes `parameters`, the same spelling as
the field. ADR 0027 §2's grammar is unchanged. `self` paths are defined by
component as `self.endpoints.<name>.<property>`. Core's `metadata` clause widens
from identity to "identity, and any description the family binds".

### 6. Both authored item documents describe themselves

Component and blueprint `metadata` each carry a REQUIRED `description`: plain
text, not Markdown, 1 to 280 characters, the listing `summary` limit. A
component's only other name is the stem of its file, and a published component
is reused by items that know nothing about it. A blueprint's description is for
people who operate the installation; the listing's `summary` is still the
storefront copy.

### 7. What stays

`presentationHint` stays on the component input and output. It says what a value
is, which holds in every composition, and that is ADR 0026's test for what a
component owns. Outputs carry it too, and an output has no blueprint parameter
it could move to. It stays outside `schema` because core §6.2 bars `format` from
asserting. `kind` still names only the document family (ADR 0007 §1), and
`EXTERNAL` is not a separate kind: its contract is the same shape as any other
component's.

## Alternatives considered

**Tags everywhere.** This keeps OpenAPI `discriminator` support and exhaustive
TypeScript `switch`. It was rejected because it keeps tags that restate the only
other key and unions with a single member, and because the diagnostic quality it
buys is already provided by `ERR_UNKNOWN_FIELD` at every level (`CORE-ENV-005`).

**`kind: SERVICE` and so on, or a `type` beside `kind` in the envelope.** The
envelope belongs to core and is shared by every family. Several kinds would
split one contract shape across families that a blueprint references
identically.

**`SERVICE | JOB | EXTERNAL`, with a worker as a service without endpoints.** It
is the Nomad and systemd model and follows §1 strictly. It was rejected in
favour of the term users search for and of a place for work-driven scaling.

**`storage` with `VOLUME | SHARED | BLOCK`.** Block devices need a device path,
not a mount path, and nothing in v1 needs one. Adding a type later is a
relaxation.

**Network storage as an external component.** An external component only
passes values, and nothing mounts them. Object storage and managed databases are
value dependencies and fit `EXTERNAL` or connections.

**Parameter keys `config:` and `connection:`.** They repeat the store's name in
the key and in the reference. The namespace already says which kind of entry is
named.

## Consequences

**A reader can predict a spelling.** A category is a `type`, a source is a key,
a reference to a sibling key is a bare noun, and everything from outside is a
parameter.

**Every fixture and example changes.** The renames are mechanical, and each
withdrawn requirement ID and diagnostic code is deleted rather than excused.
The reference validator in `tools/src/validation/` and the reference renderer
change with them.

**Core publishes a new edition before the families.** The namespace rename is a
core change, and blueprint depends on it.

**Downstream migrates.** The platform, the CLI, the SDKs and `musher-dev/catalog`
all carry these names, and none can claim the new profiles until its conformance
run passes.
