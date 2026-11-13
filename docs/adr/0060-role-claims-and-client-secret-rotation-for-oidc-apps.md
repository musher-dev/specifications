# ADR 0060: Role claims, and client-secret rotation, for the apps a viewer signs in to

- **Status:** Accepted
- **Date:** 2026-11-13
- **Refines:** [ADR 0035](0035-how-identity-and-credentials-reach-a-workload.md) §2, the claims a node releases
- **Refines:** [ADR 0035](0035-how-identity-and-credentials-reach-a-workload.md) §3, a rotation is an allocation
- **Relies on:** [ADR 0028](0028-explicit-binding-and-resolution-before-release.md) §3, resolution comes first

## Context

Deploy-testing catalog items on production on 2026-11-13 found two gaps for
apps that sign viewers in through the platform
([platform-api#1457](https://github.com/musher-dev/platform-api/issues/1457)).

1. **No role.** The ID token, the user information and the viewer assertion
   carry the subject, and on request the email address and name. Nothing says
   whether the viewer created the deployment or what they may do in its
   organization. Apps that grant the first user nothing, such as LibreChat,
   have their admin mapped by matching the creator's email address literally,
   which breaks when the creator leaves or the address changes.
2. **Rotation is silent.** Rotating a client secret is a change of allocation
   ([`BP-ACCESS-008`](../../specifications/blueprint/v2/spec.md#BP-ACCESS-008)),
   but nothing says a workload sees it. Gitea stores its OpenID Connect source
   in its database, registered by a bootstrap `JOB` that runs once per
   rollout. A secret rotated outside a rollout leaves the stored copy stale,
   and sign-in fails until someone redeploys.

## Decision

### 1. `ROLE` is a released claim

`viewerClaims` takes `ROLE` beside `EMAIL` and `NAME`. Released, it puts two
claims in the viewer assertion, and in the ID token and user information of
an OpenID Connect client:

| Claim | Value |
|---|---|
| `musher_role` | The viewer's role in the organization that owns the deployment when the token is issued: `owner`, `admin`, `member` or `viewer`. Absent for a viewer the access policy admits who holds no role in it |
| `musher_deployment_creator` | `true` when the viewer is the deployment's creator, the person `deployment.creator.identity` names, and holds a role in the organization when the token is issued; else `false`, for a creator who has left the organization included |

The names carry a `musher_` prefix because neither is a registered claim
([RFC 7519](https://www.rfc-editor.org/rfc/rfc7519) §4.2 asks a private claim
to resist collision). The values are lowercase, as claim values conventionally
are, not the upper snake case of a document's enumerations: they are not
document values. Both are the facts at issue time, so a changed role reaches
an assertion within its 600-second lifetime and an app at its next sign-in.

`ROLE` travels inside a token, so it is released under `ASSERTION` and `OIDC`
only. Under `HEADER` it is rejected: each claim there needs a header fact of
its own, which this decision does not add.

### 2. Rotating the client secret is a rollout

The platform applies a rotated client secret as a rollout of the deployment,
as it applies an update: every node that reads `oidcClientSecret` starts with
the new one, and every `JOB` without a schedule runs again
([component `COMP-JOB-001`](../../specifications/component/v2/spec.md#COMP-JOB-001)).
The previous secret keeps working at the issuer until that rollout has
completed. An app that stores the client re-registers it from the `JOB` it
already uses, and no new endpoint property is needed.

## Consequences

- Blueprint gains `BP-ACCESS-013`, a structural rule with cases, and
  `BP-ACCESS-014` and `BP-ACCESS-015`, platform obligations listed with their
  reasons among the runner's coverage exceptions.
- platform-api issues the two claims and rolls a deployment out on rotation.
  LibreChat maps its admin role from `musher_deployment_creator` or
  `musher_role`; Gitea keeps its bootstrap `JOB`.
- `ROLE` is a new enum value, so this is a relaxation released in a minor
  version.

## Alternatives considered

**A `groups` claim listing strings such as `deployment-owner` and
`org-admin`.** Rejected because a list invites apps to test membership by
string matching, which is exactly the fragility the issue reports, and
because one viewer has one organization role.

**A claim named `owner`.** Rejected because it collides with what an
organization's owner role means, and with claims other issuers use.

**An endpoint property, such as `oidcClientVersion`, for the workload to
poll.** Rejected because no workload reads a property after it starts: a new
value reaches it only through a rollout, which then makes the property
redundant.

**`HEADER` claim headers for the role.** Deferred: they need two new
allocation facts and component properties, and no catalog item asked for
them.
