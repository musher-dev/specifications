# ADR 0061: A platform-checked API key, and exact exempt paths

- **Status:** Proposed
- **Date:** 2026-11-13
- **Refines:** [ADR 0035](0035-how-identity-and-credentials-reach-a-workload.md) §4, machine traffic
- **Relies on:** [ADR 0035](0035-how-identity-and-credentials-reach-a-workload.md) §6, generated values rotate
- **Relies on:** [ADR 0031](0031-one-grammar-for-the-authored-documents.md) §1, the key present names the origin

## Context

Deploy-testing catalog items on production on 2026-11-13 found that a
`RESTRICTED` endpoint has no safe answer for machine clients
([platform-api#1452](https://github.com/musher-dev/platform-api/issues/1452)).

1. **No checked key.** A client without a viewer session, such as an MCP
   client, an SDK or a webhook sender, is refused. The `BEARER` exemption lets
   any `Authorization: Bearer` value through for the workload to judge
   ([`BP-ACCESS-010`](../../specifications/blueprint/v2/spec.md#BP-ACCESS-010)),
   which is safe only for a workload that checks every token itself. Firecrawl
   and the Graphiti MCP server check nothing, so their items add a gateway node
   whose only job is to compare a bearer token with a generated value.
2. **Prefix matching only.** An exempt path covers itself and every path
   under it ([`BP-ACCESS-009`](../../specifications/blueprint/v2/spec.md#BP-ACCESS-009)).
   An item that needs one health path exempt, such as playwright-mcp, which
   serves MCP on every other path, cannot exempt it without exempting what
   lies under it.

## Decision

### 1. An exposure may name an API key the platform checks

A `RESTRICTED` exposure may carry `apiKey: { parameter: <name> }`, naming a
generated parameter of the blueprint:

```yaml
parameters:
  apiKey: { generator: { byteLength: 32 }, ui: { label: API key } }
nodes:
  api:
    exposure:
      api: { visibility: PUBLIC, access: RESTRICTED, apiKey: { parameter: apiKey } }
```

The platform forwards a request that carries no valid viewer session and an
`Authorization` header of the `Bearer` scheme whose token equals the
parameter's current value, compared in constant time. It forwards it without
an identity, claim or assertion header, as an exempt request. Any other
request without a session, a request with a wrong key included, is refused
unless an exemption covers it. A request with a valid session is handled as
any other. Whatever else a request carries, a session included, the platform
removes an `Authorization` header whose token matches the key before it
forwards the request, so the key never reaches the workload's logs.

After the parameter rotates, the platform also accepts the previous
generation until the rollout that applies the rotation has completed, as it
accepts a rotated OIDC client secret
([ADR 0060](0060-role-claims-and-client-secret-rotation-for-oidc-apps.md) §2),
and never afterwards. A client then has a bounded window to take the new key,
and a leaked key stops working once that rollout completes.

The key is a generated parameter, so it is created once, persisted, rotated
by generation and disclosed to the people who manage the deployment, exactly
as any generated credential is. Naming it counts as using it, so the
parameter needs no binding. `apiKey` cannot sit beside a `BEARER` exemption:
both answer a bearer token, one by checking it and one by passing it on, and
a request would have no single meaning. The key covers the whole endpoint.

### 2. An exempt path is a prefix or an exact path

An entry of `exemptibleRequests.paths` may be `{ prefix: <path> }` or
`{ exact: <path> }`. `prefix` covers the path and every path under it,
segment-bounded, as a bare entry always has: `/status` covers `/status` and
`/status/x`, never `/status-page`. `exact` covers the path alone. Both compare
case-sensitively after the normalization `BP-ACCESS-009` already states, and
the query string takes no part. That normalization decodes once, and a
request whose path holds an encoded `%` (`%25`) is never exempt, because a
workload that decodes again would see another path. No document holds one: an
endpoint path admits no `%`, so this is a platform obligation, not a
validation rule. Mount routing uses the same normalization.

### 3. The bare string stays, as the `prefix` form

The bare string already had segment-bounded semantics, so nothing a released
component offers changes meaning. It stays valid in v2 as another spelling of
`{ prefix: <path> }`, never of `{ exact: <path> }`, and no warning is reported
for it: a warning would ask every released component to change bytes for no
change of meaning. A v3 may drop it.

### 4. Everything here is a relaxation

`apiKey`, an object entry in `paths` and the code
`ERR_INVALID_API_KEY_PARAMETER` were each rejected before, as an unknown field
or a value of the wrong type. Every document accepted before keeps its
meaning, so component and blueprint release this in a minor version.

## Consequences

- Component gains `COMP-EP-021`. Blueprint gains `BP-ACCESS-016` to
  `BP-ACCESS-018`, of which `BP-ACCESS-016` is structural and semantic, with
  cases, and the other two are edge obligations listed with their reasons
  among the runner's coverage exceptions. `BP-ACCESS-002` cites
  `BP-ACCESS-018` beside the exemptions.
- The record's `credentials` map includes a generated parameter an `apiKey`
  names, as it includes one a binding names.
- platform-api's edge checks the key and matches exact paths, with one matcher
  shared with the gateway. Firecrawl and Graphiti drop their gateway nodes.

## Deferred

The issue asks for more, and each item is left for a decision of its own:
exclusions inside a prefix, method-scoped exemptions, glob and suffix
patterns, a key scoped to some paths or carried in a named header, an exempt
or checked HTTP Basic credential (which `git clone` over HTTPS needs), a deny
list on a `PUBLIC` endpoint, and OAuth for MCP clients at the edge.

## Alternatives considered

**An `API_KEY` exemption kind in `accessExemptions`.** Rejected because an
exemption is what the component offers and the blueprint grants, for a
workload that checks the request itself. A key the platform checks needs no
offer from the component, and naming its parameter needs a member of its own.

**A key the platform issues per deployment, managed through the platform
API.** Rejected for now: a generated parameter already has creation,
persistence, rotation and disclosure, and the documents can name it.

**Deprecate the bare string.** Rejected in §3.
