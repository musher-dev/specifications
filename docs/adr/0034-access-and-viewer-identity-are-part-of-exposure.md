# ADR 0034: Access and viewer identity are part of exposure

- **Status:** Accepted
- **Date:** 2026-09-28
- **Extends:** [ADR 0005](0005-platform-divergence-reconciliation.md) §5
- **Relies on:** [ADR 0027](0027-a-reference-names-a-fact-the-document-cannot-contain.md) §1
- **Relies on:** [ADR 0031](0031-one-grammar-for-the-authored-documents.md) §1
- **Relies on:** [ADR 0031](0031-one-grammar-for-the-authored-documents.md) §3
- **Relies on:** [ADR 0007](0007-naming-conventions.md) §1

## Context

A blueprint node chooses one of two exposures for each endpoint of its
component: `PUBLIC` or `PRIVATE`. That choice says whether the endpoint can be
reached from outside the installation, and nothing else. A `PUBLIC` endpoint is
open to anyone who has its URL.

Some workloads should sit behind the platform's sign-in instead. The first is
OpenClaw, whose gateway can run in a trusted-proxy mode: it reads the viewer's
identity from a request header, and accepts that header only when the request
arrives from an address it trusts. With the platform authenticating viewers,
nobody pastes a gateway token on first visit
([musher-dev/platform#3149](https://github.com/musher-dev/platform/issues/3149),
[musher-dev/specifications#134](https://github.com/musher-dev/specifications/issues/134)).

The v1 grammar cannot say either half of that:

- A node cannot ask the platform to authenticate an endpoint's viewers.
- The workload needs two values only the platform knows: the name of the header
  that carries the identity, and the addresses it arrives from. A binding is a
  parameter, another node's output or a literal. A parameter's `from` reads an
  organization variable or a connection. A literal would hard-code the
  platform's network into every catalog item, and a variable would make every
  organization maintain the platform's own address ranges.

The draft catalog item works around both with a documentation-range
placeholder, `192.0.2.0/24`, that trusts nothing.

The issue proposed one new access mode, `EDGE_IDENTITY`, and a pair of
`edge*` endpoint properties. Review of that proposal found that one mode joins
three separate decisions, and that the addresses a workload sees are not the
edge's.

### Why now

The catalog item is blocked on this, and the platform and infrastructure work
that implements the edge behaviour needs a contract to implement. Both families
have released, so whatever is added has to be additive inside v1.

## Decision

### 1. Visibility, access and viewer identity are three decisions

An exposure answers three questions, and each has its own member:

| Member | Question | Values |
|---|---|---|
| `visibility` | Can the endpoint be reached from outside the installation? | `PUBLIC`, `PRIVATE` |
| `access` | Must the platform authenticate and authorize a viewer before forwarding? | `OPEN` (default), `AUTHENTICATED` |
| `viewerIdentity` | Does the workload receive the viewer's identity, and how? | `NONE` (default), `HEADER` |

```yaml
exposure:
  web:
    visibility: PUBLIC
    access: AUTHENTICATED
    viewerIdentity: HEADER
```

Public does not mean anonymous, and private does not mean authenticated.
`AUTHENTICATED` protects a workload that never reads an identity, so access
does not require identity. `HEADER` requires `AUTHENTICATED`, because an
identity the platform did not verify is one the caller supplied. `access` and
`viewerIdentity` apply only to `PUBLIC`: a private endpoint serves the platform
and sibling nodes, and the platform's sign-in is not on that path.

`AUTHENTICATED` requires an `HTTP`, `HTTPS` or `WS` endpoint, because a sign-in
redirect and a request header exist only there. gRPC clients and TCP and UDP
endpoints need other mechanisms and are unsupported until they are defined.

`HEADER` names the mechanism, not a vendor or a hop, so a signed assertion can
later join it as another value.

### 2. The bare value is shorthand, and its meaning does not change

The object form sits beside the bare enum. Bare `PUBLIC` is
`{ visibility: PUBLIC }`, which is `{ visibility: PUBLIC, access: OPEN,
viewerIdentity: NONE }`, and bare `PRIVATE` is `{ visibility: PRIVATE }`. An
endpoint left out of `exposure` is still `PRIVATE`. Every document valid today
keeps its verdict and its meaning, and every rule that reads `PUBLIC` reads the
effective visibility of either form.

### 3. The values are endpoint properties

The two values are properties of the endpoint, beside `publicURL`:

| Property | Logical type | Meaning |
|---|---|---|
| `viewerIdentityHeader` | string | The lowercase name of the request header carrying the viewer's identity |
| `trustedProxyCIDRs` | array of string | Canonical CIDRs covering every address the workload observes as the immediate peer of forwarded traffic |

They pass [ADR 0027](0027-a-reference-names-a-fact-the-document-cannot-contain.md)
§1's test: each is a fact of the allocated endpoint that no document can
contain. They are read the way `publicURL` is, through an output
`from: { endpoint, property }` or a `self.endpoints.<name>.<property>` path, and
a node that needs them binds its own outputs back into its own inputs. That is
a discovery dependency on an allocated fact, not a value cycle.

`trustedProxyCIDRs` means the addresses the workload itself observes as its
TCP peer. They need not be the edge's, the gateway's or any public range: on
the current platform the peer is a proxy on the compute host. Hence
"trusted proxy", the name OpenClaw, Envoy Gateway and most frameworks use for
the same setting, and not "edge source".

The value is an array. Outputs already carry array schemas, and an array
reaches the environment as compact JSON. A comma-separated string would be the
string-list transport type component v1 declines to have. Because a template
produces a string, a template cannot read it.

A component whose output reads either property requires every node deploying
it to set `viewerIdentity: HEADER` on that endpoint, as an output reading a
public property already requires `PUBLIC`. A workload that trusts the header
obtains both values that way, so it cannot be deployed where anyone could
forge the header.

### 4. Documents do not choose principals in v1

`AUTHENTICATED` admits the principals the installation's access policy
authorizes. The platform owns that policy and resolves it in the owning
organization and project. No document names a policy, a role or a principal.
Selecting one is a later, additive member of the object form. It is not named
`policyRef`, because a `…Ref` points at another document
([ADR 0031](0031-one-grammar-for-the-authored-documents.md) §3).

### 5. The platform's obligations fail closed

The runtime obligations are normative, carry requirement IDs, and are recorded
as unpinned because no document phase observes a forwarded request:

- **Admission.** The platform authenticates and authorizes a viewer before it
  forwards anything, on HTTP requests and WebSocket upgrades alike. Missing or
  unavailable authorization state refuses the request. A consumer that does not
  understand `AUTHENTICATED` never treats it as `OPEN`.
- **Headers.** Under `HEADER`, inbound copies of the identity header and of the
  forwarding headers are removed before the platform sets them. The identity is
  a stable, opaque principal identifier: never an email address, never a
  credential. The application's own `Authorization` header and cookies, the
  validated `Host` and the `Origin` are preserved, and the platform's own
  session credential is never forwarded.
- **Trusted addresses.** No other workload or tenant can originate traffic
  from a trusted address. The addresses are allocated before the workload
  starts, and a change to them is a new allocation.
- **Revocation.** How long an established connection can outlive the
  authorization that admitted it is bounded, and the bound is documented.

## Alternatives considered

**One mode, `access: EDGE_IDENTITY`.** Smaller, but it cannot protect a
workload that ignores identity, and it joins what a signed assertion would
later have to separate again.

**`level` for the visibility member.** The issue's name. Rejected because the
platform already calls this `visibility`, in its ingress model and its host
agent's port bindings, and a level suggests an ordering that two values do not
have.

**`identity` for the identity member.** Rejected because `identity` already
means an opaque identifier in allocations, resolution records and blueprint §3.

**A `platform.edge.*` reference namespace.** Rejected: it is a core change, and
it detaches the values from the endpoint they describe, so nothing could tie a
read to the exposure that makes it meaningful.

**An organization variable, or a literal.** Rejected: both make someone other
than the platform maintain the platform's addresses, and a literal is wrong the
moment a proxy moves.

**`edgeIdentityHeader` and `edgeSourceCIDRs`.** Rejected because the addresses
are not the edge's, as §3 records.

**A comma-separated string of CIDRs.** Easier to drop into an environment
variable, and rejected for the reason §3 gives.

## Consequences

**Additive in v1.** The object form and the two properties are rejected by
every released validator, so accepting them only widens validation. Component
releases first, and blueprint, which reads the component's property table,
follows it.

**The resolution record carries the object form.** A record copies the
authored exposure, so its schema accepts both forms.

**Allocation gains two facts.** The public routing facts of an endpoint that
forwards identity carry the header name and the addresses. A fact the
installation lacks leaves resolution incomplete, and a fact on an endpoint
that does not forward identity is an invalid context.

**Work outside this repository.** Enforcing access, sessions, header handling,
revocation and origin trust belongs to the platform and infrastructure. What an
application does with a forwarded identity, such as OpenClaw's scopes, belongs
to the catalog item that configures it. This record fixes only what they must
honour.
