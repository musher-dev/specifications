# ADR 0058: A deployment exports a private endpoint to a named consumer

- **Status:** Accepted
- **Date:** 2026-11-13
- **Extends:** [ADR 0034](0034-access-and-viewer-identity-are-part-of-exposure.md) §1, exposure decisions
- **Extends:** [ADR 0027](0027-a-reference-names-a-fact-the-document-cannot-contain.md) §3, the namespace set
- **Relies on:** [ADR 0034](0034-access-and-viewer-identity-are-part-of-exposure.md) §4, documents do not choose principals
- **Relies on:** [ADR 0031](0031-one-grammar-for-the-authored-documents.md) §4, parameters are how values enter

## Context

Blueprint `BP-ACCESS-011` makes a `PRIVATE` endpoint reachable only from the
nodes of its own deployment and the platform's probing host. Two deployments of
one organization are as separate as two organizations are.

Deploy-testing on production on 2026-11-13, reported as platform-api #1454,
found two items that lose their main value to that rule. A workflow server's
customers write their own workers, and a worker deployed separately cannot reach
the server's private gRPC endpoint, so it has to be added as a node in a fork of
the server's blueprint. A business-intelligence tool exists to query other
databases, and cannot reach the private database of another deployment in the
same organization, so its listing tells users the database must be reachable
from the internet. That workaround weakens security.

The proposed form of this record put the consumers an export admits into the
exporting blueprint, and left three questions open: whether an import is a
connection protocol or a parameter kind of its own, how a consumer is named,
and what a consumer sees when the exporter is redeployed or deleted. This
revision answers them, and is accepted with blueprint and core 2.4.0.

## Decision

### 1. Documents carry roles; policy carries parties

A deployment reaches another's private endpoint only through an **export** the
exporting deployment's blueprint declares and an **import** the consuming
deployment's blueprint declares. Neither side alone opens anything.

The documents name **roles** only. An exporting blueprint says which of its
endpoints it offers, under a key of its own, and names no consumer. An importing
blueprint says that it needs an export, by name, and binds the facts it yields.

The **parties**, which deployment exports under which name and which
deployments it admits, are the organization's policy, managed through the
platform API and named by no document. Blueprint §9 already treats a
`RESTRICTED` endpoint's access policy this way: the blueprint says the endpoint
admits only the viewers the deployment's policy admits, and never names one
([ADR 0034](0034-access-and-viewer-identity-are-part-of-exposure.md) §4).

```yaml
# The exporting blueprint: portable, and names no consumer.
spec:
  exports:
    frontend: { node: server, endpoint: grpc }
---
# The importing blueprint.
spec:
  parameters:
    temporal: { from: "${{ exports.temporal-frontend }}", ui: { label: Workflow server } }
  nodes:
    worker:
      bindings:
        temporalAddress: { parameter: temporal, property: privateAddress }
```

An exported endpoint is a `PRIVATE` endpoint of a `SERVICE` or a `WORKER` node.
A `PUBLIC` endpoint needs no export, and a `JOB` has no endpoint to export.

A consequence, not a decision of this record: because an exporting blueprint
names no consumer, one blueprint can be published to a catalog and deployed by
any organization as an exporter. How a template is shared is outside this
record.

### 2. The export name, and the grant

The platform gives each export a deployment's blueprint declares an **export
name**: a DNS label, unique among the organization's live and quarantined
export names, `<deployment-name>-<key>` by default. A member who may manage the
exporting deployment may rename it. A renamed export's old name is quarantined
for 90 days, during which no export takes it, and it does not redirect: a fresh
resolution of the old name fails as an unknown export would.

The exporting deployment's policy admits consumers by a **grant**, which names
the consuming deployment by its **deployment ID**, never by its name, hostname
or blueprint. A redeploy keeps its ID, and a new deployment, even of the same
blueprint and under a recycled name, has a new one, so nothing gains access
silently. This answers the second open question.

A consumer's acquired import is bound to the export and the grant by their
identities, not by the export name. A rename therefore keeps every existing
import working; only a resolution that reads the name afresh sees the new one.
The platform MAY tell a caller that a name was renamed, and to what, only when
that caller could already see the successor.

**There is no second handle.** An organization already has a Handle, its
global human name. A per-export or per-deployment handle beside it would be a
second human name with the same job. The export name is scoped to the
organization, and the organization Handle roots any future qualified reference,
`<org-handle>/<export-name>`, without a new concept.

### 3. The import is a deployment parameter

What enters a deployment from outside its documents enters as a parameter
([ADR 0031](0031-one-grammar-for-the-authored-documents.md) §4). An import is a
parameter whose `from` is `${{ exports.<export-name> }}`, a seventh parameter
origin, **EXPORT**. This answers the first open question: an import is a
parameter kind of its own, not a connection protocol whose provider is a
deployment. A connection fills a connection input with the members of a
protocol; an import yields three addressing facts that any value input can
take, so a node needs no `EXTERNAL` stand-in to reach it.

The facts are the endpoint properties component already names for a private
endpoint: `privateHostname`, `privatePort` and `privateAddress`. A binding
selects one with a `property` member, mirroring a component output's
`{endpoint, property}` origin, and a template names one as
`${{ parameters.<import>.<property> }}`. The template form fits
[ADR 0056](0056-a-binding-composes-a-string-and-encodes-what-it-interpolates.md)'s
grammar unchanged: it is one more segment in a namespace a template already
permits, and a two-segment `parameters` path was rejected before. An import
parameter is bound only through one of the two forms, because it has no single
value.

Acquisition is authorized, persisted and recorded once per deployment and
parameter, and reused by every retry, redeploy and update, as a connection
selection is. A consumer that is not granted, an unknown export and a withdrawn
one fail with **one** code, `ERR_EXPORT_UNAVAILABLE`, so that nothing about
another deployment's exports can be enumerated from an import.

### 4. The namespace is core's

`exports` joins core v2 §5.2's reserved namespaces, which may grow by addition
within the major version, and blueprint parameters' `from` permits it. Its path
is exactly one DNS-label segment. A document that wrote `${{ exports.… }}`
before was already rejected, with `ERR_UNKNOWN_PLACEHOLDER_NAMESPACE`. It is
still rejected wherever no family permits it, now with
`ERR_NAMESPACE_NOT_PERMITTED`. One record decides the namespace and its only
use, as ADR 0056 did for `parameters` and `nodes`.

### 5. Within one organization only

An export admits consumers of the same organization. Cross-organization
networking is out of scope, as is public exposure of a `TCP` endpoint. A later
version may add org-qualified references, `<org-handle>/<export-name>`, by
addition: today such a path is not one DNS label, and is rejected.

### 6. Isolation still holds at the network level

The platform admits a granted consumer's traffic at the network level, and only
to the exported endpoint, as `BP-ACCESS-011` requires for isolation. Revoking a
grant or withdrawing an export denies new connections within 4 seconds, the
bound the platform already keeps when a viewer's access is revoked. An
established connection may survive a revocation, and the specification says so
rather than promise a reset.

### 7. The exporter's lifecycle

This answers the third open question.

- **Redeploy.** A consumer keeps the facts it resolved until its own next
  rollout. An exporter's redeploy does not reach into a running consumer, and
  the consumer follows it on its next rollout.
- **Delete.** Deleting an exporter whose export is imported is refused unless
  the deleter forces it. A forced delete withdraws the export, ends every
  import of it and degrades the consumers: their new connections are refused,
  and their next resolution fails with `ERR_EXPORT_UNAVAILABLE`.

## Alternatives considered

**Consumers named in the exporting blueprint**, as this record first proposed.
It makes a blueprint name parties, which ADR 0034 §4 keeps out of documents for
access policy, and it ties a catalog blueprint to one organization's
deployments, so it could not be shared.

**An import as a connection protocol.** It would reuse acquisition, but a
connection input fills an `EXTERNAL` node, whose outputs a node then binds. An
import's facts are addresses a value input takes directly, and an `EXTERNAL`
stand-in would add a node per import and say nothing.

**A per-export handle, globally unique.** A second human name beside the
organization Handle, with the same job.

**An organization-wide private network.** Every deployment could reach every
other. It is the simplest to build and the hardest to reason about: a private
endpoint would be private to the organization, not to its deployment, and a
database would be one compromised workload away from every other.

**Making the database public.** The workaround in use today.

**Forking the blueprint.** It works, and loses the separate lifecycle that is
the reason to deploy separately.

## Consequences

- Blueprint 2.4.0 adds §5.5, `spec.exports`, the import parameter, the binding
  `property` and `BP-EXPORT-001` to `BP-EXPORT-008`, and removes the §9.1
  draft. `BP-ACCESS-011` admits the consumers an export grant admits, to that
  endpoint alone.
- Core 2.4.0 reserves and assigns `exports`. Component 2.4.0 releases with it,
  aligned to the core release.
- The conformance fixture contract gains an `imports` resolution context key.
- platform-api implements the export name, grants, admission and the
  lifecycle. The specification pins what a document or a resolution can show,
  and lists the rest as platform obligations.
