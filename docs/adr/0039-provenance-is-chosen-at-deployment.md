# ADR 0039: Provenance is chosen at deployment

- **Status:** Accepted
- **Date:** 2026-10-24
- **Extends:** [ADR 0030](0030-atomic-named-connections.md) §2, §3, connections for any protocol
- **Refines:** [ADR 0033](0033-inputs-are-the-only-way-into-a-component.md) §2, members fixed per protocol
- **Relies on:** [ADR 0003](0003-controlled-vocabulary-placement.md) §1, offerings are the platform's
- **Relies on:** [ADR 0007](0007-naming-conventions.md) §1, member names
- **Relies on:** [ADR 0038](0038-v2-one-vocabulary-and-v1-retires.md) §10, §11, connection, binding and `EXTERNAL`

## Context

Reading component §5 raised three questions. Is `EXTERNAL` the right name? What
does `type` mean? And can a primitive the platform provides, such as a managed
PostgreSQL, Redis or object store, appear in the graph?

`type` was answering two questions at once. For `SERVICE`, `WORKER` and `JOB`
it said how a workload behaves: request-driven, long-running or run to
completion. For `EXTERNAL` it said that there is no workload. Read that way, a
managed database looks like it needs a fifth type, `MANAGED`.

"Managed" itself had three senses in v1 prose: a database somebody else
operates ("a managed database", component §5.6), the `MANAGED` selection kind
of a connection, and a credential Musher issues. Only the second is a defined
term.

What decides the shape is **who chooses the provider, and when**. A blueprint
author who writes a PostgreSQL node does not know whether a given organization
wants Musher's PostgreSQL or the one it already runs. The deployer knows, at
deployment. Existing formats fall into three models:

| Model | Examples | Fits when |
|---|---|---|
| Provenance is a source on one node | Docker Compose `provider:`; Radius `resourceProvisioning: manual \| recipe`; .NET Aspire `RunAsContainer` and `AsExisting` | The deployer chooses |
| The environment resolves a typed dependency | Score `resources.<name>.type` with a provisioner; Cloud Foundry managed and user-provided service instances, which bind identically; Kubernetes Service Binding | The deployer chooses |
| Managed is a category of its own | Render `databases:`; DigitalOcean App Platform `databases`; Heroku add-ons; Terraform `resource` beside `data`; Kubernetes `ExternalName` | The author chooses, once |

No platform that allows a choice at deployment encodes provenance in the
author's category. Musher already follows the second model for language
models: an `EXTERNAL` node declares a connection input with a protocol, and
the organization's connection configuration, or a complete `USER` override,
decides who provides it
([ADR 0030](0030-atomic-named-connections.md),
[ADR 0033](0033-inputs-are-the-only-way-into-a-component.md) §2). This record
generalizes that model from two language-model protocols to any protocol.

## Decision

### 1. Definitions

These are fixed here and adopted, word for word in substance, by the term
records and the v2 prose.

- **`type`** says what the platform runs from this document. `SERVICE`,
  `WORKER` and `JOB` run its workload. `EXTERNAL` runs nothing: the node stands
  in the graph for something whose values arrive from outside the graph, which
  is external to the graph and not to Musher. The enum is unchanged. The header
  of component §5's type table becomes "What the platform runs".
- **protocol** is the wire contract a client speaks, independent of vendor. It
  fixes a connection's members, their types and their sensitivity. It is one
  concept with an endpoint's `protocol`, with two closed value sets: one for
  endpoints, one for connections.
- **connection** is the members of one protocol, acquired together for one
  connection parameter of one deployment: all of them or none. "Atomic" leaves
  the term; atomicity stays in the definition and in ADR 0030. Component v2
  §1.1 holds the definition, and core and blueprint cite it.
- **selection kind** is `MANAGED` or `USER`. A `MANAGED` selection is supplied
  and operated by Musher. A `USER` selection is a complete set of members the
  deployer supplies.
- **managed** means only "supplied and operated by Musher". A managed selection
  is **granted**, access to a service that outlives the deployment, as a
  language-model gateway is, or **provisioned**, a service created for this
  deployment and bound to its lifecycle. Which one is a property of the
  offering, not of any document.

"a managed database" leaves the prose (component §5.6 and its example, blueprint
§5.2 and §5.3). A database the organization already runs is "a database the
organization runs", and one Musher provides is a connection.

### 2. Provenance is not part of the component

A component never says who provides what it stands for. An outside dependency
is an `EXTERNAL` node with one connection input, whose `protocol` says what is
needed:

```yaml
# components/postgres.yaml
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
```

```yaml
# blueprint
parameters:
  db: { from: "${{ connections.postgres.default }}", ui: { label: Database } }
nodes:
  db:
    componentRef: ./components/postgres.yaml
    bindings: { postgres: { parameter: db } }
  app:
    componentRef: ./components/app.yaml
    compute: { profile: general.standard.small }
    bindings: { databaseURL: { node: db, output: url } }
```

The organization's connection configuration answers `connections.postgres.default`
with a managed offering or with its own database, and a deployer may replace it
with a complete `USER` selection. The blueprint, the component and the record's
node `source: EXTERNAL` are the same in every case. The specification fixes
each protocol's member contract and never lists Musher's offerings, versions,
plans or regions ([ADR 0003](0003-controlled-vocabulary-placement.md) §1).

### 3. Members are fixed per protocol

`connection.protocol` is one of five values. The protocol fixes each member's
type and sensitivity, and whether it is **required**, present and non-empty in
every connection; **optional with a default**, which an absent member takes;
**optional without a default**, absent when the connection does not hold it;
or **derived**, composed at resolution and never supplied:

| Protocol | Required | Optional (default) | Derived |
|---|---|---|---|
| `OPENAI_CHAT_COMPLETIONS`, `ANTHROPIC_MESSAGES` | `baseURL`, **`apiKey`**, `model` | none | none |
| `POSTGRES` | `host`, `port` (integer), `database`, `username`, **`password`**, `sslMode` | none | **`url`** |
| `REDIS` | `host`, `port` (integer), `tls` (boolean) | `database` (integer, `0`), `username` (none), **`password`** (none) | **`url`** |
| `S3` | `endpointURL`, `region`, `bucket`, `accessKeyID`, **`secretAccessKey`** | `pathStyle` (boolean, `false`) | none |

Members are strings unless typed, and **sensitive** ones are in bold.

- `port` is an integer from 1 to 65535.
- `sslMode` takes PostgreSQL's `sslmode` values, `disable`, `allow`, `prefer`,
  `require`, `verify-ca` and `verify-full`, so the TLS a PostgreSQL client uses
  is a member, not a client default. `tls` does the same for Redis, and the
  HTTP-based protocols carry it in the HTTPS scheme of their URL member.
- A `REDIS` connection without `password` is to a server that requires no
  authentication, and names no `username`. With `password` and without
  `username`, the client authenticates as the default user.
- `url` is never stored. Resolution composes it from the other members and the
  credential, by one canonical composition component §6.4 defines: the scheme
  (`postgresql://`, or `rediss://` when `tls` is true and `redis://` when it is
  false), percent-encoded userinfo, the host lowercased with an IPv6 address
  bracketed, the port always explicit, `/` and the database, and for
  `POSTGRES` `?sslmode=` with `sslMode`. A `url` therefore always agrees with
  the members beside it, and rotating the credential cannot leave it stale.
- `S3` `endpointURL` is the service URL a client sends requests to, and never
  includes the bucket: the client composes the bucket into the hostname when
  `pathStyle` is false and into the path when it is true. It is AWS's own
  term, and its record lists the confusable with a component endpoint.
- `capabilities` (`STREAMING`, `TOOL_CALLS`) is permitted only on the two
  language-model protocols. On any other protocol it is `ERR_INVALID_VALUE` at
  `connection/capabilities`, structural, expressed in the schema by
  `if`/`then`.

A member is extensible by relaxation. An output reads only a member every
connection holds: a required, derived or defaulted one. So a new optional
member with a default can be added to a protocol inside v2: every existing
connection still resolves, taking the default, and no existing output reads
it.

Names follow [ADR 0007](0007-naming-conventions.md) §1: an acronym keeps its
case except where it leads, so `baseURL`, `endpointURL` and `accessKeyID`.

`COMP-CONNECTION-002` says the members are fixed per protocol, and component
§6.4 carries the table above and the composition of `url`. Core's `connections` namespace row reads "the
members of one protocol, selected together".

### 4. An output reads a member its protocol defines

`COMP-OUT-004` is generalized. An `input` origin naming a connection input
carries `member`, and one naming a value input does not.

| Condition | Code | Path | Phase |
|---|---|---|---|
| `member` is not one of the seventeen member names the protocols define | `ERR_INVALID_VALUE` | `from/member` | `structural` |
| `member` is a name some protocol defines, but not the input's protocol | **`ERR_UNKNOWN_CONNECTION_MEMBER`** | `from/member` | `semantic` |
| A connection input is named without `member` | `ERR_UNKNOWN_INPUT` | `from/input` | `semantic` |
| A value input is named with `member` | `ERR_UNKNOWN_INPUT` | `from/member` | `semantic` |
| The member's type does not fit the output's schema | `ERR_VALUE_CONSTRAINT` | `from/input` | `semantic` |
| A sensitive member is forwarded by an output that does not declare `sensitive: true` | `ERR_VALUE_CONSTRAINT` | `from/member` | `semantic` |
| An optional member without a default is forwarded (`COMP-OUT-003`) | `ERR_INPUT_NOT_GUARANTEED` | `from/member` | `semantic` |

The schema's `from.member` enum is the union of every protocol's members, which
is why a name no protocol defines fails structurally and a name from the wrong
protocol fails semantically. A forwarded integer member, `port` or the `REDIS`
`database`, needs an integer schema, or a number schema, since an integer may
supply a number; `tls` and `pathStyle` need a boolean schema. An output
forwarding `apiKey`, `password`, `url` or `secretAccessKey` declares itself
sensitive, so the contract shows the sensitivity instead of leaving it to
propagation. A `REDIS` `password` or `username` may be absent, so no output
forwards either; `url` carries them.

### 5. A view carries its protocol's members

Blueprint `BP-CONNECTION-002` changes in one place: a protocol view carries the
members of its protocol, not "baseURL, model and capabilities". It carries
neither the credential member, which the credential supplies, nor the derived
`url`, which resolution composes, and it omits an optional member it does not
hold. The `OPENAI_CHAT_COMPLETIONS`, `ANTHROPIC_MESSAGES` and `S3` views are
HTTP-based, and for them the existing URL rules apply to `baseURL` and
`endpointURL`: an absolute HTTPS URL without user information, query or
fragment, within the credential's `permittedBaseURLs`, which every selection
with an HTTP-based view carries. A selection of a `REDIS` server that requires
no authentication carries no credential. A view breaking any of these, or
carrying `url`, is malformed evidence, `ERR_INVALID_RESOLUTION_CONTEXT` in the
`connections` stage. A `USER` selection missing a required member of its
protocol is `ERR_CONNECTION_INCOMPATIBLE`, and is never completed from a
managed selection.

The resolution record gains no `source` value: the node is `EXTERNAL`, whoever
supplies it. The selection in the private deployment snapshot already records
`MANAGED` or `USER`.

### 6. A provisioned selection lives as long as its deployment

`BP-CONNECTION-003` adds the provisioned lifecycle:

- A provisioned selection is created at the first acquisition for its
  deployment and connection parameter, and persisted with its scoped
  credential before materialization, like any selection.
- Retry, redeploy and update reuse it. An update that selects something else
  does not release it.
- It is released only when the deployment is deleted. What is retained after
  deletion, and for how long, belongs to the platform API.
- Rotating its credential is durable and idempotent and keeps the service.
- A clone is a new deployment and provisions its own. Copying data between
  them is a platform concern.

A granted selection keeps the v1 lifecycle unchanged.

### 7. What lands with it

- **Component schema**: the three protocols, the `capabilities` condition and
  the `from.member` union.
- **Examples**: `component/v2/examples/postgres.yaml`, `redis.yaml` and
  `s3.yaml`, beside the language-model example, and a PostgreSQL example in
  blueprint §5.3.
- **Tooling**: one per-protocol member table replaces the hardcoded member list
  and the language-model view shape in `tools/src/validation/connections.ts`
  and `resolution.ts`.
- **Cases**: each new protocol accepted; `capabilities` on `POSTGRES` rejected;
  a language-model member on a `POSTGRES` input rejected; a `port` into a
  string schema rejected; a sensitive member into a non-sensitive output
  rejected; an optional member without a default forwarded, rejected; and
  `POSTGRES`, `REDIS` and `S3` selections resolved in blueprint
  `behavior.json`, with the composed `url` and the defaults observed.

## Alternatives considered

**`type: MANAGED`.** A fifth type for things Musher runs on the author's behalf.
Rejected: it hardcodes provenance into the component, so a blueprint offering
"Musher's PostgreSQL or yours" needs two components and a choice the graph
cannot express. It also breaks the definition of `type`, because the platform
does run something, just not from this document.

**`workload.source.managed`.** A source naming a Musher offering. Rejected for
the same reason, and because a source is what an image is built or pulled
from, which a managed offering is not.

**A two-axis `type` plus `provider`.** `type: DATABASE, provider: MUSHER`.
Rejected: `provider` is still decided by the author, and the axes multiply
into combinations, most of them meaningless.

**Renaming `EXTERNAL` to `CONNECTOR`.** Rejected in
[ADR 0038](0038-v2-one-vocabulary-and-v1-retires.md) §11: a connector is code
that runs, and `type` names what runs, not a role.

**Author-declared members.** Let a component list the members it wants.
Rejected: two components standing for one PostgreSQL would declare different
members, and no offering could satisfy both. A protocol is useful because its
members are fixed.

**A URL-only connection.** One sensitive URL per protocol. Rejected: many
clients and images read host, port and user separately, as the official
PostgreSQL image's `POSTGRES_*` variables do, and S3 has no standard URL that
carries credentials.

**`type` in place of `protocol`.** `connection: {type: POSTGRES}`. Rejected:
`type` names a category everywhere else, and what the input needs is a wire
contract, which an endpoint already calls `protocol`.

## Consequences

**One mechanism for every outside dependency.** A database, a cache, an object
store and a language model all enter a blueprint as an `EXTERNAL` node with a
connection input, and the deployer's organization decides who provides each.

**The platform owns the offerings.** Which versions, plans and regions exist,
and whether an offering is granted or provisioned, never appears here.

**Deleting a deployment deletes what was provisioned for it.** That is the
lifecycle a deployer expects from a database created for one deployment, and
retention policy is stated where it can change without a major.

**Not supported in v2.** Each gap below closes by a relaxation: a new optional
field, a new optional member with a default, or a new value.

| Gap | How it would close |
|---|---|
| `capabilities` for a non-language-model protocol, such as a PostgreSQL extension or a minimum server version | Permit `capabilities` on that protocol, with new values |
| A connection member its protocol does not define | A new optional member with a default |
| Choosing a plan or size for a provisioned offering | A new optional field on the connection parameter |
| Swapping a self-hosted `SERVICE` for a connection at deployment | Conditional topology, which [ADR 0019](0019-external-component-node.md) leaves open |
