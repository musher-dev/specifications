# ADR 0057: A deployment has many public hosts and one sign-in

- **Status:** Accepted
- **Date:** 2026-11-13
- **Extends:** [ADR 0034](0034-access-and-viewer-identity-are-part-of-exposure.md) §1, exposure decisions
- **Relies on:** [ADR 0034](0034-access-and-viewer-identity-are-part-of-exposure.md) §5, platform obligations fail closed

## Context

Blueprint §4.3 gives each endpoint an exposure, and component §5.2 gives a
public endpoint its own `publicHostname`. The platform nevertheless gave a
node at most one public HTTP hostname, and a viewer's session was bound to one
hostname.

Deploy-testing 25 catalog items on production on 2026-11-13, reported as
platform-api #1453, found three consequences:

1. A browser-facing second node, such as a realtime server or object storage
   for presigned uploads, could not be `RESTRICTED`: the application's
   cross-origin calls to it carried no session for its host. Items put it on
   bare `PUBLIC`, or shipped without the feature.
2. Two nodes could not share one public hostname by path, as `/socket.io` to a
   realtime node and the rest to the application.
3. Whether a node may expose more than one public endpoint, each on its own
   host, was nowhere stated.

## Decision

### 1. Every public endpoint has a host of its own, unless it is mounted

A `PUBLIC` endpoint is allocated a public hostname of its own, distinct from
every other endpoint's, and a node may expose several. This was already what
component §5.2's endpoint properties implied; blueprint now states it as the
platform's obligation, `BP-HOST-001`.

### 2. A mount serves an endpoint under another's host

An HTTP-routed `PUBLIC` endpoint may carry `mount: {node, endpoint, path}`:
it has no host of its own, and the named endpoint's host forwards every request
under `path` to it, path unchanged. Everything else on that host reaches the
host endpoint. The document decides what can be decided before deployment:

- the host endpoint exists, is `PUBLIC` and HTTP-routed, and is not itself
  mounted, so routing is one level deep;
- the path has no dot segment and does not lie under the platform's own
  `/.musher`;
- no two mounts on one host overlap, so a request reaches one endpoint, read
  one way.

A mounted endpoint keeps its own `access`, `viewerIdentity`, claims and
exemptions; its `publicHostname` and `publicPort` are the host's, and its
`publicURL` is the host's followed by the path.

The path is forwarded unchanged rather than stripped: applications that serve
under a prefix, such as Socket.IO, expect to see it, and an exempt path then
reads the same at the edge and in the workload.

### 3. One sign-in for a deployment

A viewer who signs in on any public host of a deployment is signed in on every
`RESTRICTED` endpoint of that deployment, on every host it has, and on no other
deployment's. A browser-facing second host can then be `RESTRICTED` without a
second sign-in, and a cross-origin request or WebSocket upgrade to it carries
the session, but only when its `Origin` is one of the deployment's own public
hosts. A request from any other origin is handled as one without a session, so
the shared sign-in gives another site nothing to forge a request with.
`BP-HOST-005` states it; the mechanism, a deployment-scoped session the edge
establishes on each host, is the platform's.

### 4. Routing is a platform obligation

The routing itself, and the session, happen at the edge, which no document
phase observes. They are platform obligations, listed with that reason in the
conformance runner's coverage exceptions. The document carries only what is
decidable from it.

## Alternatives considered

**A deployment-scoped session alone.** It solves the sign-in, but leaves two
hosts where an application wants one origin, and a CORS configuration an
application must get right.

**Path routing alone.** It gives one origin, but not every application can live
under a prefix, and an object store's presigned URLs name a host.

Both are adopted; each covers what the other cannot.

**Public `TCP` and `GRPC` endpoints with an authentication story.** #1453 also
asks for them. They need an access mode other than sign-in, mutual TLS or a key
at the edge, and are left to a decision of their own.

## Consequences

- items/sim's realtime node can be `RESTRICTED`, mounted under the
  application's host or on its own host with the shared sign-in.
- platform-api routes mounts at the edge and scopes the viewer session to the
  deployment.
