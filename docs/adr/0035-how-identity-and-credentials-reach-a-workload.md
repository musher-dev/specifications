# ADR 0035: How identity and credentials reach a workload

- **Status:** Accepted
- **Date:** 2026-09-29
- **Extends:** [ADR 0034](0034-access-and-viewer-identity-are-part-of-exposure.md) §1, §3, §5
- **Extends:** [ADR 0031](0031-one-grammar-for-the-authored-documents.md) §4
- **Extends:** [ADR 0027](0027-a-reference-names-a-fact-the-document-cannot-contain.md) §3
- **Extends:** [ADR 0029](0029-reproducible-release-and-installation-contracts.md) §2
- **Relies on:** [ADR 0030](0030-atomic-named-connections.md)
- **Relies on:** [ADR 0007](0007-naming-conventions.md) §1, §2

## Context

[ADR 0034](0034-access-and-viewer-identity-are-part-of-exposure.md) let a
blueprint node put an endpoint behind the platform's sign-in and forward the
viewer's identity in one request header. Moving the catalog onto it found five
places where it stops:

- **Machine traffic.** `AUTHENTICATED` covers every path of an endpoint. n8n,
  mlflow, langflow, flowise, openclaw and open-webui serve a UI and an API or
  webhooks on one port, and a machine client never has a viewer session. Each
  stays `OPEN` for that reason alone
  ([#141](https://github.com/musher-dev/specifications/issues/141),
  [musher-dev/platform#3184](https://github.com/musher-dev/platform/issues/3184)).
- **The peer check.** Trusting the identity header needs a workload that checks
  its TCP peer against `trustedProxyCIDRs`. Open WebUI reads the header from any
  peer. Apps that verify a signed token instead, such as Langflow and Grafana,
  need no peer check, and an opaque id alone cannot provision a usable account
  ([#139](https://github.com/musher-dev/specifications/issues/139)).
- **OpenID Connect.** The mechanism nearly every self-hosted app does implement
  is an OIDC client: Open WebUI, Grafana, Gitea, Outline, Nextcloud, Mattermost
  and more. An OIDC client is an issuer, a client id, a client secret and
  redirect URIs that depend on the endpoint's own URL, all facts the platform
  holds ([#138](https://github.com/musher-dev/specifications/issues/138)).
- **The installer.** Label Studio and n8n seed an admin account from an email in
  the environment. The platform knows who is installing, but the installer types
  it into the form
  ([#140](https://github.com/musher-dev/specifications/issues/140)).
- **Hashed credentials.** n8n takes its owner password only as a bcrypt hash and
  code-server only as an argon2 hash. A generator produces one string, so an
  item cannot hand the installer a password and the app its hash
  ([#142](https://github.com/musher-dev/specifications/issues/142)).

Prior art agrees on the shapes. Cloudron's `oidc` addon has the app declare
callback paths and injects the issuer, client id and secret. Google IAP,
Cloudflare Access, AWS ALB and Pomerium forward a short-lived signed JWT whose
audience is the application, with a published key set. oauth2-proxy, Authelia,
Umbrel and Cloudflare Access exempt declared routes from sign-in, and
oauth2-proxy's CVE-2025-54576, which matched a route against the query string,
shows what loose matching costs. Terraform's `random_password.bcrypt_hash`
hashes once and keeps the result; Helm's `bcrypt` rehashes on every render and
churns every deployment.

### Why now

Six catalog items are held at `access: OPEN`, and the platform's enforcement
work for exemptions has an issue waiting on a contract. All five changes widen
what v1 accepts, so they fit in the released major line.

## Decision

### 1. Seven principles

Every decision below applies one of these:

1. **A fact about a person reaches a workload only where a document names it.**
   Released claims are listed in the exposure, and installer facts are bound
   through parameters. A reviewer reading the blueprint sees each one.
2. **One subject per person per installation.** The identity a `HEADER` forwards,
   the `sub` of an assertion or of an OIDC ID token, and
   `deployment.installer.identity` are the same string for the same person in
   one installation. They MAY differ between installations. An application keys
   its accounts on that subject, and an email is an attribute of the account,
   never its key.
3. **Every identity mode requires `access: AUTHENTICATED`.** The edge keeps
   refusing a revoked viewer (BP-ACCESS-005) even while an application holds a
   session of its own. Allowing a mode under `OPEN` later would widen
   validation, which a minor release may do.
4. **A platform-owned fact is an endpoint property**, readable only under the
   exposure that makes it exist, as ADR 0034 §3 made the header name one.
5. **A platform-issued secret is a sensitive endpoint property.** Whatever reads
   it is sensitive, as a connection's `apiKey` is, and it lives in the private
   installation snapshot, never in the resolution record.
6. **Declarations fail closed.** Every enumeration is closed. A path is literal
   and matched segment by segment, and a request whose path is ambiguous goes
   through sign-in.
7. **The component constrains, the node selects, and every set starts small.**
   Each value a later release adds widens validation inside v1.

### 2. Two more identity modes, and released claims

`viewerIdentity` gains two values, and the exposure object gains `viewerClaims`:

| Member | Values | Absent |
|---|---|---|
| `viewerIdentity` | `NONE`, `HEADER`, `ASSERTION`, `OIDC` | `NONE` |
| `viewerClaims` | A unique, non-empty list of `EMAIL` and `NAME` | Nothing beyond the subject is released |

```yaml
exposure:
  web:
    visibility: PUBLIC
    access: AUTHENTICATED
    viewerIdentity: OIDC
    viewerClaims: [EMAIL, NAME]
```

`ASSERTION` forwards a signed JWT in a request header. `OIDC` registers the
endpoint as an OpenID Connect client of the platform's issuer, and the
application signs its viewers in itself. `EMAIL` is the viewer's verified email
address, omitted for a viewer who has none. `NAME` is their display name. The
subject is always delivered. A claim needs an identity mode to travel in, so
`viewerClaims` under `NONE` is invalid, and like every member but `visibility`
it applies only to `PUBLIC`.

The claims are a sibling of the mode, not members of an object under it. One
list serves all three modes, and the member keeps one form.

### 3. The facts each mode needs are endpoint properties

| Property | Logical type | Exists under |
|---|---|---|
| `viewerEmailHeader`, `viewerNameHeader` | string | `HEADER`, with that claim released |
| `viewerAssertionHeader` | string | `ASSERTION` |
| `viewerAssertionIssuer`, `viewerAssertionAudience` | string | `ASSERTION` |
| `viewerAssertionKeysURL` | string | `ASSERTION` |
| `oidcIssuerURL`, `oidcClientID` | string | `OIDC` |
| `oidcClientSecret` | string, sensitive | `OIDC` |

They are read as `viewerIdentityHeader` is, and a read on an endpoint whose
exposure lacks the mode or claim is `ERR_VIEWER_IDENTITY_NOT_FORWARDED`. That
code's meaning grows from "does not forward identity" to "does not forward that
mode or claim". A document valid today reads neither kind of property, so none
changes its verdict.

An assertion is a JWS compact JWT signed with RS256, the algorithm every OpenID
Connect relying party supports, so both modes share one key story. Its
audience is unique to the installation's endpoint, and the workload verifies
the signature, the issuer, the audience and the expiry. A token one application
receives therefore opens no other.

An OIDC client needs redirect URIs, and only the component knows its routes. An
endpoint declares them:

```yaml
endpoints:
  web:
    targetPort: 8080
    protocol: HTTP
    oidc:
      redirectPaths: [/oauth/oidc/callback]
```

The platform registers exactly `publicURL` followed by each path, compared
exactly (RFC 9700 §2.1). A redirect URI is not a new property: a template
already composes one from `publicURL`. A component that reads an `oidc*`
property from an endpoint without `oidc`, or a node that selects `OIDC` for one,
is `ERR_ENDPOINT_NOT_OIDC_CLIENT`.

The client secret is a fact of the allocated endpoint, as `publicURL` is, so it
passes ADR 0027 §1's test and enters as an endpoint property. It is not a value
the installation chooses, which is what ADR 0031 §4 routes through parameters.
It is the first sensitive endpoint property. The client lives beside the
endpoint's allocation in the private snapshot, never among the public routing
facts, and rotating it is a changed allocation: a new snapshot and a new record.

### 4. Machine traffic on an authenticated endpoint

A component declares what its endpoint can safely accept without a viewer, and a
node selects from it:

```yaml
# component
endpoints:
  web:
    protocol: HTTP
    targetPort: 5678
    accessExemptions:
      paths: [/webhook, /webhook-test]
# blueprint
exposure:
  web: { visibility: PUBLIC, access: AUTHENTICATED, accessExemptions: [PATHS] }
```

- `PATHS` forwards a request whose path lies under a declared path as `OPEN`
  would: with no identity, no claims and no assertion, and with inbound copies
  of them still removed. A path matches segment by segment, as the Gateway API's
  `PathPrefix` does, so `/webhook` covers `/webhook/abc` and never `/webhooks`.
  The query takes no part. A request path that holds `;`, an encoded slash or
  backslash, a backslash, NUL or an empty segment is never exempt.
- `BEARER` forwards, without identity, a request that has no viewer session and
  carries `Authorization: Bearer`. A request with a session is admitted and
  identified as usual. The component opts in with `bearer: true`, its statement
  that every route checks its own tokens: without it, a node could open a
  workload that checks nothing.

`accessExemptions` requires `AUTHENTICATED`. A value the component does not
declare is `ERR_EXEMPTION_NOT_DECLARED`. The platform serves its own sign-in
callback under `/.musher` on an authenticated endpoint, so no declared path may
lie there. Platform-issued machine tokens, which the edge itself would accept,
are a later addition.

### 5. Installer facts are the first `deployment` facts

Core reserved `deployment` for "facts about a deployment" (ADR 0027 §3), and
the platform's own reference grammar gives it the same meaning. Blueprint
parameters' `from` now admits it, with exactly three paths:

```yaml
parameters:
  adminEmail: { from: "${{ deployment.installer.email }}" }
```

| Path | Value |
|---|---|
| `deployment.installer.identity` | The subject of principle 2 |
| `deployment.installer.email` | The installer's verified email address |
| `deployment.installer.name` | The installer's display name |

`identity`, not the issue's `id`, because ADR 0034 settled `identity` as the
word for an opaque identifier. Any other path is `ERR_UNKNOWN_DEPLOYMENT_FACT`,
where before this record every `deployment` reference was
`ERR_REFERENCE_NOT_IN_SCOPE`. The verdict is the same, and only the code is more
precise.

The facts are captured once, from the person who creates the installation, and
kept in the snapshot, so a redeploy, an update or another member changes
nothing. They are sensitive: they are personal data, not secrets, but they stay
out of public inspection, previews and diagnostics for the same reasons. Like a
variable, a deployment fact is never submitted. A fact not yet acquired leaves
resolution incomplete. A fact the platform knows it lacks, such as the email of
a service principal, is `ERR_DEPLOYMENT_FACT_UNAVAILABLE`, because waiting would
never supply it.

### 6. A hash is a parameter of its own

A new parameter supply, named by the key present as ADR 0031 §1 requires:

```yaml
parameters:
  ownerPassword:
    generator: { byteLength: 24, encoding: BASE64URL }
    ui: { label: Owner password }
  ownerPasswordHash:
    hash: { parameter: ownerPassword, algorithm: BCRYPT }
```

A parameter carries at most one of `default`, `generator`, `from` and `hash`,
which extends ADR 0031 §4. A binding still names a parameter and nothing else.
The source is a generated parameter. The algorithms and their parameters are
fixed, so every implementation produces the same format:

| Algorithm | Format |
|---|---|
| `BCRYPT` | `$2b$12$`, then 53 characters of salt and hash |
| `ARGON2ID` | `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`, a 16-byte salt and a 32-byte hash |

bcrypt reads at most 72 bytes and silently ignores the rest, so a `BCRYPT` source
must encode to 72 bytes or fewer. A source that cannot, or that is not
generated, is `ERR_INVALID_HASH_SOURCE`.

The hash is computed once, with a random salt, when its source is created, and
again only when the source rotates. It is stored as a credential of its own
beside the source, carrying the source's rotation. The record lists it by
identity and rotation, never by value or content hash, as ADR 0029 §2 requires.

A generated parameter carrying `ui` may be disclosed to the installation's
managers through a private channel. That is what makes an item that binds only
the hash usable: the person who installed it can read the password. So a
generated parameter that a hash names, and that carries `ui`, counts as used
without a binding of its own.

## Alternatives considered

**An `OIDC_CLIENT` connection protocol.** The issue's first proposal. A
connection is an organization-scoped entry that installation selects, and ADR
0030 fixes its members to `baseURL`, `apiKey` and `model`. An OIDC client is
minted for one endpoint and depends on its URL.

**`viewerIdentity: { mode, claims }`.** It would give the member a second,
object form beside its bare value, and a claims list is the same for every mode.

**Plain claim headers only.** Email and name in headers still need the peer
check, and do not help an application that cannot do one. The assertion serves
those, and the headers serve applications like Grafana's `auth.proxy` that can.

**ES256 for the assertion.** IAP, ALB and Pomerium use it. RS256 is what every
OIDC relying party must accept, and the modes share keys. ES256 can be added.

**One `machineAccess` value, or per-path `access`.** A single value cannot say
"paths and bearer". Per-path access in the blueprint would have the node spell
routes it does not own.

**Bearer pass-through chosen by the node alone.** It would let a node open a
workload whose API checks nothing.

**A prefilled, editable installer email.** It would make a default a reference,
which ADR 0031 §4 keeps literal. An item that wants the email to be editable
keeps a submitted parameter.

**`generator.derive` and a `derived` binding member.** It would widen the binding
grammar every rule reads, and could not hash one password two ways.

**A deterministic salt.** It would make the hash reproducible from the secret
alone, and identical across installations that share a secret. Persisting the
hash gives reproducibility without either.

## Consequences

**Additive in v1.** Every value, member and property here is rejected by every
released validator, so accepting them only widens validation, and no released
conformance case changes verdict. Core releases first, component next, and
blueprint last.

**Core gives `deployment` a meaning.** Its reserved-namespace table records that
blueprint parameters' `from` defines the namespace.

**The fixture contract grows.** The resolution context used by behavioural
cases gains installer facts, the OIDC client of an allocation, and the facts of
each identity mode.

**Still unsupported.** Role and group claims (platform#3168, ADR 0034 §4),
algorithms other than RS256, identity modes under `OPEN`, post-logout
redirects, platform machine tokens, per-method exemptions, hashing a submitted
value, and `deployment` facts beyond the installer.

**Work outside this repository.** The platform issues assertions, runs the OIDC
issuer and registers clients, enforces exemptions (platform#3184), and captures
installer facts. Catalog items adopt the new fields.
