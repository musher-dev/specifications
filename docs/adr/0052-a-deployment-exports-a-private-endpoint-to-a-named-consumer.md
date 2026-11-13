# ADR 0052: A deployment exports a private endpoint to a named consumer

- **Status:** Proposed
- **Date:** 2026-11-13
- **Extends:** [ADR 0034](0034-access-and-viewer-identity-are-part-of-exposure.md) §1, exposure decisions

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

## Decision

This record decides the shape. The specification text it implies is left as a
marked draft in blueprint §9, with no requirement ID, until the platform can
route one deployment's private traffic to another's. Nothing below is normative
until a later change gives it requirement IDs and conformance cases.

### 1. Export is explicit, and names its consumer

A deployment reaches another's private endpoint only through an **export**
the exporting deployment declares and an **import** the consuming deployment
declares. Neither side alone opens anything. An export names the endpoint and
the consumers it admits; a consumer is named by a stable identity the
organization assigns, never by a deployment's hostname, so a redeploy or a new
deployment does not silently gain access.

### 2. The import is a deployment parameter

What enters a deployment from outside its documents enters as a parameter
([ADR 0031](0031-one-grammar-for-the-authored-documents.md) §4). An import is
therefore a parameter whose `from` names an export, in a namespace core already
reserves, and a node binds the facts it yields, a private host, port and
address, through ordinary bindings. Its acquisition is authorized, persisted and
recorded like a connection's (`BP-CONNECTION-002`, `BP-CONNECTION-003`): a
deployment that is not a named consumer is denied.

A connection is the closest existing mechanism, and the record leaves open
whether an import is a new connection protocol whose provider is an exporting
deployment, or a parameter kind of its own.

### 3. Within one organization only

An export admits consumers of the same organization. Cross-organization
networking is out of scope, as is public exposure of a `TCP` endpoint.

### 4. Isolation still holds at the network level

The platform admits a consumer's traffic at the network level, as
`BP-ACCESS-011` requires for isolation, and only to the exported endpoint.
Revoking an export, or removing a consumer from it, denies new connections
immediately.

## Alternatives considered

**An organization-wide private network.** Every deployment could reach every
other. It is the simplest to build and the hardest to reason about: a private
endpoint would be private to the organization, not to its deployment, and a
database would be one compromised workload away from every other.

**Making the database public.** The workaround in use today.

**Forking the blueprint.** It works, and loses the separate lifecycle that is
the reason to deploy separately.

## Consequences

- Blueprint §9 lists cross-deployment reach as not supported, and carries the
  draft of the export and import.
- `BP-ACCESS-011` is unchanged until the draft becomes normative.
- platform-api documents the isolation that holds today.
