# Downstream v1 adoption

This is an informative adoption guide for the platform and catalog repositories. The
[component](../specifications/component/v1/spec.md) and
[blueprint](../specifications/blueprint/v1/spec.md) specifications govern the
contract; this checklist does not define another document dialect.

## Pin the released contract

Pin exact releases, never a commit on `main`: `core/v1.1.0`,
`component/v1.6.0` and `blueprint/v1.7.0`, plus `listing/v1.0.0` where the
catalog reads listings. Earlier component and blueprint releases were withdrawn
from the compatibility guarantee by
[ADR 0033](adr/0033-inputs-are-the-only-way-into-a-component.md) §5; migrate
from them as [below](#migrating-to-inputs-only-component-v120-and-blueprint-v130)
describes. [`published.json`](../published.json) records each
release's tree, bundle digest and exact dependencies. Vendor each family's
release archive, which carries its schema, specification, examples and
conformance corpus together with its whole dependency closure, and keep
the digests and dependency identities beside it. Verify each asset as
[SECURITY.md → Verifying a release](../.github/SECURITY.md#verifying-a-release)
describes. Release archives work offline, without fetching `main`.

## Platform implementation

1. Adopt explicit consumer-owned bindings, logical value validation, sensitivity
   propagation, authoritative endpoint allocations, and related diagnostic
   locations. Keep value resolution separate from current deployment admission.
2. Persist a versioned private installation snapshot before materializing any
   workload values. The public resolution record contains opaque snapshot
   references, never secret values or hashes of them. Reconcile records against
   the blueprint and resolved component artifacts.
3. Acquire connections atomically per installation and connection parameter.
   Persist the organization policy revision, connection version, protocol views,
   model, endpoint settings, credential identity and rotation together.
   Connection inputs bound to one connection parameter share one selection;
   equal protocols alone never imply sharing.
4. Implement durable, idempotent acquisition and credential issuance. Inject
   failures between acquisition, issuance, persistence, and materialization.
   Recovery must reuse the selection and avoid duplicate active credentials;
   compensate or reconcile interrupted issuance before exposing workload values.
5. Retry and redeploy reuse the persisted selection. A default change affects
   new installations. Explicit updates and rotations produce new durable state
   and resolution records. Clones receive distinct installation identities and
   scoped credentials. Revocation and current authorization remain enforceable
   even when an immutable record exists.
6. Reject partial connection overrides. A replacement supplies the complete
   connection; it must never retain a managed credential while changing its
   destination. Use service- and installation-scoped gateway credentials rather
   than unrestricted organization provider keys. Keep secrets out of diagnostics,
   forms, previews, logs, public reads, and content hashes.
7. Distinguish offline acquisition context from authoritative not-found, denied,
   and incompatible results. Never fall back to another billable provider.
   Disclose the selected connection and cost owner through the installation
   interface; existing organization policy may authorize automated deployments.

## Gateway and SDK verification

Run the specification's synthetic conformance fixtures through downstream
adapters, then separately test real, explicitly pinned supported SDK versions
against the gateway. Record SDK versions and results in the downstream pull
request; synthetic fixtures do not prove network compatibility.

| Client protocol | Managed SDK base path | Expected request path |
| --- | --- | --- |
| `OPENAI_CHAT_COMPLETIONS` | `/openai/v1` | `/openai/v1/chat/completions` |
| `ANTHROPIC_MESSAGES` | `/anthropic` | `/anthropic/v1/messages` |

These are managed gateway routes, not restrictions on generic connection URLs.
Test actual SDK URL joining, protocol-specific authentication, ordinary text
requests, streaming termination and errors, tool calls and tool-result
continuations, cancellation, and upstream error responses. Declare only
capabilities the selected protocol view implements; reject unsupported or
unknown capabilities. Do not infer a protocol from the model vendor.

## Catalog migration and rollout

1. Implement and validate the platform adapter against the pinned contract
   before migrating catalog documents. Keep existing deployments on their
   persisted installation snapshots during rollout.
2. Migrate catalog components and blueprints together. Declare grouped connection
   requirements over existing sensitive-string credential inputs, blueprint
   connection parameters, and explicit connection bindings. Remove independent
   URL/key/model suppliers for group-owned inputs and retired targeting
   vocabulary.
3. Validate every migrated catalog document structurally and semantically, then
   exercise installation resolution and current admission in the platform.
   Include two same-protocol connection parameters, explicit sharing, complete
   replacement, default changes, retries, rotation, revocation, and clone
   scenarios.
4. Update downstream documentation to link the generated reference. Preserve
   platform-specific API and lifecycle documentation; do not maintain duplicate
   handwritten document field tables.
5. Prepare release pull requests in dependency order: core, component and listing,
   then blueprint. A ready release pull request is not evidence that a tag or
   immutable release asset exists. Publish only through the repository release
   workflow, verify assets and the ledger, and then update downstream exact pins.

Downstream completion requires linked migration changes, passing shared
conformance, gateway integration evidence, and durable lifecycle failure tests.
Specification fixtures alone must not be presented as completed production
integration. Track any missing evidence as explicit downstream follow-up work.

## Migrating to inputs only (component v1.2.0 and blueprint v1.3.0)

[ADR 0033](adr/0033-inputs-are-the-only-way-into-a-component.md) makes inputs the
only way a value reaches a workload, and makes a language model an external
component. Every change is mechanical:

| Before | After |
|---|---|
| `workload.envVars: { NAME: value }` | An input with `schema: {type: string}`, `default: value` and `target: {envVarKey: NAME}` |
| `contract.connectionRequirements` on a workload | Remove it. Keep the three inputs as ordinary value inputs |
| The connection itself | An `EXTERNAL` component with one connection input, `{description, connection: {protocol, capabilities}}`, and outputs `from: {input, member}` for `baseURL`, `apiKey` and `model` |
| `connectionBindings: { llm: { parameter: p } }` on a node | A node for the external component with `bindings: { llm: { parameter: p } }`, and `node` bindings from the workload's three inputs to its outputs |
| An image with no tag, or a floating tag | Valid as written. A bare name means `latest`, as in Docker |

The console's component editor shows one list, Inputs. It no longer has a
separate environment-variables panel.

## Storing unfinished components (component v1.3.0 and blueprint v1.4.0)

A component with only a `type` is now a valid document, so an editor can create
one in a click and store every intermediate state. What a component needs before
it runs (a workload, a source, an endpoint for a `SERVICE`, a command for a
`JOB`, an output for an `EXTERNAL` component, and a description on every input
and output) is checked at publication instead, each with its own `capability`
code ([component §5](../specifications/component/v1/spec.md#publication-obligations)).
Validate drafts with the `document` profile and publish with `publication`.
A blueprint node still deploys only a finished component
([`BP-REF-003`](../specifications/blueprint/v1/spec.md#BP-REF-003)).

## HTTPS workload endpoints (component v1.4.0 and blueprint v1.5.0)

An `HTTPS` endpoint can now say how the platform trusts its certificate
(`tls.verify` of `SYSTEM`, `BUNDLE` or `NONE`, with `serverName` and
`trustBundle`), and an HTTP probe can name the statuses it expects
(`expectedStatuses`) and the credentials it sends (`auth.basic` or
`auth.bearer`, each credential from an input)
([component §5.2](../specifications/component/v1/spec.md#tls) and
[§5.4](../specifications/component/v1/spec.md#health)).

- Derive the proxy's upstream transport and every probe client from one
  resolution of the endpoint's protocol and `tls`, so they cannot disagree
  ([`COMP-EP-007`](../specifications/component/v1/spec.md#COMP-EP-007)).
- Never fall back from a verifying mode to `NONE`, or from `HTTPS` to `HTTP`.
  A host that cannot honour an endpoint's policy is a placement or
  configuration error, not a failed probe.
- Resolve probe credentials from their inputs, send them on probe requests
  only, and never add them to forwarded traffic or write them to logs
  ([`COMP-EP-011`](../specifications/component/v1/spec.md#COMP-EP-011)).
- Follow no redirect on a probe. An absent `expectedStatuses` still means
  200–399.

Validate blueprints with blueprint v1.5.0 or later. The v1.4.0 release archive
carries component v1.3.0 in its dependency closure, so a validator built from
it rejects a repo-local component using these fields with `ERR_UNKNOWN_FIELD`.

## Authenticated exposure (component v1.5.0 and blueprint v1.6.0)

An exposure can now be an object that says, beside its `visibility`, whether
the platform signs viewers in (`access: OPEN | AUTHENTICATED`) and whether the
workload receives each viewer's identity in a header
(`viewerIdentity: NONE | HEADER`). Bare `PUBLIC` and `PRIVATE` keep their
meaning. A component reads the header name and the proxy addresses to trust it
from as two endpoint properties, `viewerIdentityHeader` and `trustedProxyCIDRs`
([blueprint §4.5](../specifications/blueprint/v1/spec.md#access),
[component §5.2](../specifications/component/v1/spec.md#viewer-identity),
[ADR 0034](adr/0034-access-and-viewer-identity-are-part-of-exposure.md)).

- Parse both forms of `exposure.<endpoint>` everywhere it is read, including
  the pinned resolution record, whose `exposure` copies the authored map. The
  platform's own ingress already calls the first member `visibility`.
- Authenticate and authorize every request and WebSocket upgrade to an
  `AUTHENTICATED` endpoint before forwarding it, against the installation's
  access policy. Refuse, never forward, when that state is missing or
  unavailable, and never read an exposure you do not understand as `OPEN`
  ([`BP-ACCESS-002`](../specifications/blueprint/v1/spec.md#BP-ACCESS-002)).
- Under `HEADER`, strip inbound copies of the identity header and of
  `Forwarded`, `X-Forwarded-*` and `X-Real-IP`, then set the identity header to
  a stable, opaque user identifier, not an email address. Keep `Host`, `Origin`,
  the request's `Authorization` header and application cookies, and never
  forward the platform's session cookie
  ([`BP-ACCESS-003`](../specifications/blueprint/v1/spec.md#BP-ACCESS-003)).
  The specification leaves the header names to the platform. Put every header
  forwarded to a workload under one prefix the platform owns, without `X-`
  (RFC 6648), such as `<platform>-viewer-id`, and strip inbound copies by that
  prefix, not by an enumerated list, at every hop that can add headers.
- Supply `viewerIdentityHeader` and `trustedProxyCIDRs` as public routing facts
  of the endpoint allocation, before the workload starts. The CIDRs are the
  addresses the container itself observes as its TCP peer, which on the current
  hosts is the compute host's proxy through the port publish, not the edge and
  not loopback. No other workload or tenant may originate traffic from them
  ([`BP-ACCESS-004`](../specifications/blueprint/v1/spec.md#BP-ACCESS-004)). A
  missing fact leaves resolution incomplete.
- Bound, and document, how long an admitted WebSocket outlives a sign-out,
  expiry or removed permission
  ([`BP-ACCESS-005`](../specifications/blueprint/v1/spec.md#BP-ACCESS-005)).

For a catalog item such as OpenClaw in trusted-proxy mode, declare outputs
reading `viewerIdentityHeader` and `trustedProxyCIDRs` from the gateway
endpoint, bind them back into the node's own inputs, and expose the endpoint with
`access: AUTHENTICATED` and `viewerIdentity: HEADER`. Remove the placeholder
CIDR and the header default. The CIDRs arrive in the environment as a compact
JSON array, which can be written into `gateway.trustedProxies` as it is. What
the application grants a forwarded viewer, such as OpenClaw's scopes, stays the
catalog item's decision.

Validate blueprints with blueprint v1.6.0 or later, whose dependency closure
carries component v1.5.0.

## Identity modes, machine access, installer facts and hashes (core v1.1.0, component v1.6.0 and blueprint v1.7.0)

[ADR 0035](adr/0035-how-identity-and-credentials-reach-a-workload.md) adds four
things, all of them additive:

- `viewerIdentity` gains `ASSERTION`, a signed JWT in a request header, and
  `OIDC`, an OpenID Connect client the platform registers for the endpoint.
  `viewerClaims: [EMAIL, NAME]` releases those facts beside the subject, in
  headers of their own under `HEADER` and inside the token otherwise
  ([blueprint §4.5](../specifications/blueprint/v1/spec.md#access),
  [component §5.2](../specifications/component/v1/spec.md#viewer-identity)).
- A component declares `accessExemptions` on an endpoint, `paths` and
  `bearer: true`, and a node selects `accessExemptions: [PATHS, BEARER]` from
  them, so webhooks and API clients reach an `AUTHENTICATED` endpoint
  ([component §5.2](../specifications/component/v1/spec.md#access-exemptions)).
- A parameter can read `${{ deployment.installer.identity }}`, `.email` or
  `.name`, facts about the person who created the installation
  ([`BP-PARAM-011`](../specifications/blueprint/v1/spec.md#BP-PARAM-011)).
- A parameter can be `hash: { parameter, algorithm }`, a `BCRYPT` or
  `ARGON2ID` hash of a generated parameter
  ([`BP-PARAM-012`](../specifications/blueprint/v1/spec.md#BP-PARAM-012)).

For the platform:

- Parse the new exposure members, endpoint members and parameter supply
  everywhere they are read, including the pinned resolution record.
- **Subject.** Give one person one opaque subject per installation, the same in
  the identity header, the assertion `sub`, the OIDC `sub` and
  `deployment.installer.identity`
  ([`BP-ACCESS-006`](../specifications/blueprint/v1/spec.md#BP-ACCESS-006)).
  Release an email only when it is verified.
- **Claim headers.** Allocate a distinct header name per released claim, strip
  inbound copies, and percent-encode every octet outside visible ASCII and every
  `%` in the value
  ([`BP-ACCESS-003`](../specifications/blueprint/v1/spec.md#BP-ACCESS-003)).
- **Assertions.** Sign an RS256 JWT per forwarded request with `kid`, `iss`,
  an `aud` unique to the installation's endpoint, `sub`, `iat` and an `exp` at
  most ten minutes later, plus released claims. Publish the key set at an HTTPS
  URL, and keep a retired key there until its last token expires
  ([`BP-ACCESS-007`](../specifications/blueprint/v1/spec.md#BP-ACCESS-007)).
  Supply the header name, issuer, audience and key set URL as public routing
  facts.
- **OpenID Connect.** Run an issuer, register one confidential client per
  installation endpoint with redirect URIs of exactly `publicURL` plus each
  `redirectPaths` entry, support the authorization code flow with PKCE, admit
  only viewers the installation's access policy authorizes, and revoke the client
  with the installation. The client registration, `{identity, version, issuerURL,
  clientID, secret}`, sits beside the endpoint's routing facts in the private
  snapshot, never among them
  ([`BP-ACCESS-008`](../specifications/blueprint/v1/spec.md#BP-ACCESS-008)).
- **Exemptions.** Under `PATHS`, forward a request under a declared path as
  `OPEN` does, matching segment by segment on the normalized path, ignoring the
  query, and never exempting a path holding `;`, an encoded slash or backslash,
  a backslash, NUL or an empty segment. Under `BEARER`, forward a request with
  no session and a bearer token without identity, and identify one with a
  session as usual. Keep `/.musher` out of every exemption
  ([`BP-ACCESS-009`](../specifications/blueprint/v1/spec.md#BP-ACCESS-009),
  [`BP-ACCESS-010`](../specifications/blueprint/v1/spec.md#BP-ACCESS-010),
  [musher-dev/platform#3184](https://github.com/musher-dev/platform/issues/3184)).
- **Installer facts.** Capture the creator's identity, verified email and
  display name once, when the installation is created, and keep them in the
  snapshot. Report a fact you know is missing, such as a service principal's
  email, as `ERR_DEPLOYMENT_FACT_UNAVAILABLE`, not as incomplete. Treat the
  values as sensitive.
- **Hashes.** Compute a hash with a random salt when its source is generated,
  store it as its own credential with the source's rotation, recompute it only
  when the source rotates, and never publish it. bcrypt is `$2b$`, cost 12;
  argon2id is `m=19456,t=2,p=1`. Disclose a generated value that carries `ui`
  only to the installation's managers, privately.

For catalog items: an app that speaks OpenID Connect, such as Open WebUI or
Grafana, declares `oidc.redirectPaths` and reads the three `oidc*` properties.
One that verifies a JWT, such as Langflow, reads the four `viewerAssertion*`
properties and needs no trusted proxies. n8n declares its webhook paths and
seeds its owner from `deployment.installer.email` and a `BCRYPT` hash of a
generated password. Label Studio's admin email can come from the installer
instead of the form.

Validate blueprints with blueprint v1.7.0 or later, whose dependency closure
carries component v1.6.0 and core v1.1.0.
