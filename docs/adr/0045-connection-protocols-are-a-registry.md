# ADR 0045: Connection protocols are a registry, and messaging joins it

- **Status:** Accepted
- **Date:** 2026-11-07
- **Refines:** [ADR 0030](0030-atomic-named-connections.md) §4, protocol names identify client contracts
- **Refines:** [ADR 0039](0039-provenance-is-chosen-at-deployment.md) §3, members are fixed per protocol, in records
- **Refines:** [ADR 0039](0039-provenance-is-chosen-at-deployment.md) §5, an HTTP-based view is one with a locator
- **Relies on:** [ADR 0007](0007-naming-conventions.md) §1, member names
- **Relies on:** [ADR 0043](0043-registries-are-released-data-interfaces.md), registries are released data interfaces

## Context

Component v2 §6.4 states the five connection protocols in a hand-written member
table, and blueprint §5.3 restates them in a view table. The schema's protocol
enum, its capabilities conditional and the union `from.member` takes repeat
them again, and so do two hard-coded tables in the tooling and the fixture
format's prose. Downstream, platform-api ports the member table by hand and
has already dropped its defaults
([#219](https://github.com/musher-dev/specifications/issues/219)). Every copy
is a place for the next protocol to be missed.

The next protocols are waiting. Pelorus runs Telegram, Slack and Discord bots
and needs their tokens delivered as connections, with the same atomic
selection, scoped credential and rotation as a database's
([#220](https://github.com/musher-dev/specifications/issues/220)). None of
them fits the five: Slack needs three secrets where every protocol so far has
one, and none of the three is spoken by more than one vendor.

## Decision

### 1. The registry is the normative source of the facts it tabulates

Each protocol is one JSON record in component's `protocols/` directory, named
after the protocol in lower case with hyphens, beside a `categories.json`. Core
ships the record schema, `interfaces/registry/protocol.schema.json`, with the
other registry schemas
([ADR 0043](0043-registries-are-released-data-interfaces.md)). A record holds
the protocol's identifier, title, category, description, status, the release
that introduced it, informative references, its capabilities and its members.
Each member has a name, a role, a presence, an optional default, its
sensitivity, a JSON Schema fragment holding its logical type and value
constraints, and a description.

The records are normative for those facts. Component §6.4 stays normative for
what they mean: what a role is, how presence and defaults resolve, how a
derived `url` composes, and what TLS each member fixes. Where the two could
disagree, the facts are the registry's and the meaning is the prose's.

### 2. Everything that restates the registry is generated

`tools/src/render/protocols.ts`, the first step of `task docs`, writes:

- the protocol enum, the capabilities conditional and the `from.member` union
  in component's schema source;
- the component §6.4 member table and the `COMP-OUT-004` type sentence, and
  the blueprint §5.3 view table;
- blueprint's `interfaces/connection-evidence.schema.json`, the shape of the
  `connections` resolution context.

`task check:docs` fails when any is stale. The validator reads the records
directly. With the five protocols of 2.0.0, every generated table, sentence
and enum is byte-identical to the hand-written one it replaced.

A generated block in spec.md sits between a `BEGIN GENERATED` and an
`END GENERATED` HTML comment, which markdownlint and Vale pass and the rendered
page omits. spec.md stays the single normative text a reader opens: the table
is still there, and the comment says it is not edited by hand. Generating the
whole of §6.4 instead would move its prose out of spec.md.

The schema keeps the flat `from.member` union. JSON Schema cannot tie a member
to the protocol of a sibling input, so a member of the wrong protocol stays
semantic, `ERR_UNKNOWN_CONNECTION_MEMBER`, as released cases pin it.

### 3. A member has one of five roles

| Role | Meaning |
|---|---|
| `credential` | The one secret the selection's credential value supplies. Every protocol has exactly one |
| `secret` | A further secret the same credential carries, in `credential.secrets`. Always required |
| `locator` | The HTTPS URL a client sends requests to. A protocol with a locator is HTTP-based |
| `parameter` | Any other member a view carries |
| `derived` | A member resolution composes, never supplied |

Roles replace three lists that were kept by hand: the credential member per
protocol, the HTTP-based protocols, and their URL members. A view carries
exactly the locator and parameter members, so what a view holds is derived
rather than tabulated.

`secret` is new. A Slack app holds a bot token, an app-level token for Socket
Mode and a signing secret for HTTP events, and all three are one app's
credentials, issued and rotated together. Making the extra two view members
would put secrets in a view, which is never redacted as a credential is. Making
them separate connections would break the atomicity
[ADR 0030](0030-atomic-named-connections.md) §2 exists for. They are carried
by the one scoped credential, in `credential.secrets`, which holds exactly the
secret members of its views' protocols.

### 4. A category groups protocols with the same conventions

A category is registry metadata, never a document field: `LANGUAGE_MODEL`,
`DATABASE`, `CACHE`, `OBJECT_STORAGE` and `MESSAGING`. `categories.json` lists
each category's protocols in the order the specification lists them, and the
name its protocols give their credential and their locator: `apiKey` and
`baseURL` for a language model, `botToken` and `baseURL` for messaging. The
generator fails a protocol that names either differently.

### 5. Vendor-named protocols satisfy ADR 0030 §4

[ADR 0030](0030-atomic-named-connections.md) §4 says protocol names identify
client contracts, not upstream vendors. It forbids naming the provider behind
a contract that several providers speak: a gateway that speaks Chat
Completions is `OPENAI_CHAT_COMPLETIONS`, whoever serves it. Telegram's Bot
API, Slack's Web API and Discord's HTTP API are each spoken by one vendor, and
no multi-vendor contract for chat bots exists to name instead. Their names are
the names of their client contracts. Should a second service ever speak one of
them, it is selected under the same protocol.

### 6. TELEGRAM_BOT, SLACK_APP and DISCORD_BOT join, in category MESSAGING

| Protocol | Locator, optional | Credential | Secrets | Parameters |
|---|---|---|---|---|
| `TELEGRAM_BOT` | `baseURL`, default `https://api.telegram.org` | `botToken` | none | none |
| `SLACK_APP` | `baseURL`, default `https://slack.com/api` | `botToken` | `appToken`, `signingSecret` | none |
| `DISCORD_BOT` | `baseURL`, default `https://discord.com/api` | `botToken` | none | `applicationID`, `publicKey` |

Each service delivers events in two ways: outbound, where the workload opens
the connection (polling, Socket Mode or the gateway), and webhook, where the
service calls the workload. One protocol serves both, and every member of both
is required, so a workload may use either without the selection changing. A
Telegram webhook's secret token is chosen by the bot when it registers the
webhook, so it is not a member. The Discord `publicKey` verifies interactions
and is not secret. Token formats are not validated: they are the vendors', and
they change.

A webhook arrives at the consuming `SERVICE` node's own `PUBLIC` endpoint,
whose component offers the path in `exemptibleRequests.paths` and whose
blueprint grants it with `accessExemptions: [PATHS]`. Registering the URL with
the vendor, and holding a bot token to one consumer at a time, are outside the
documents.

The defaulted locator changes the blueprint §5.3 URL rule only in wording: the
credential's `permittedBaseURLs` must cover the URL the input receives, which
is the view's locator or, when the view omits an optional one, its default.
No released protocol has an optional locator, so none behaves differently.

### 7. Adding a protocol is specification-required; adding a category needs an ADR

Modelled on [RFC 8126](https://www.rfc-editor.org/rfc/rfc8126) §4.6, a protocol
that follows an existing category's conventions is added by specification:
its record, a row of any prose its meaning needs, conformance cases in
component and blueprint, an example, and term records for its identifiers,
released in a minor version. Its `introduced` is that version. A protocol that
needs a new category, a new role, or a member whose meaning §6.4 does not
already state needs an ADR first, as this one is for `MESSAGING` and `secret`.

Every addition is a relaxation inside the major version, which the
[compatibility policy](../governance.md#compatibility-review) releases as a
minor version. An input naming the new
protocol was rejected before, `ERR_INVALID_VALUE` at its `protocol`. Members
and union values only grow, so every output that validated still validates,
every member keeps its type, sensitivity and presence, and every selection that
resolved still resolves. A record is never removed inside a major version;
`status: deprecated` marks one that should no longer be chosen.

### 8. Selection evidence has a schema

The connection-evidence schema states the shape of a `connections` context:
the acquisition statuses `NOT_ACQUIRED`, `NOT_FOUND`, `DENIED`, `INCOMPATIBLE`
and `SELECTED`, a `SELECTED` acquisition's `persisted: true` and selection, the
credential with its `secrets` and `permittedBaseURLs`, and a closed view per
protocol whose members carry their registry schemas. The `BP-CONNECTION-002`
outcome table gains a status column, which makes the statuses normative.
Evidence the schema rejects is malformed, `ERR_INVALID_RESOLUTION_CONTEXT`;
evidence it accepts must still satisfy blueprint §5.3, whose rules (the
request matching the parameter's `from`, credential reuse, the URL rules)
cannot be stated as shape. The fixture format points at the schema instead of
restating the member and HTTP lists.

## Alternatives considered

**Keep the hand-written tables and add three rows.** The smallest change. It
was rejected because #219 is the cost of exactly that: six places to edit per
protocol, and a downstream port that already disagrees with them.

**Make spec.md the source and parse the tables.** The prose would stay the
only normative text. It was rejected because a Markdown table cannot hold a
value schema, a default's JSON value or a role without inventing a cell
grammar, and a parser of normative prose is a second, worse schema.

**Move the member facts out of spec.md entirely.** spec.md would cite the
registry instead of carrying tables. It was rejected because a reader of §6.4
would then need a second file to learn what `POSTGRES` holds; a generated table
costs nothing to read.

**A generic `WEBHOOK` or `CHAT_BOT` protocol with a vendor parameter.** One
protocol for every bot. It was rejected because the three APIs share no wire
contract: a client written for one cannot speak another, which is what a
protocol promises. It would also violate ADR 0030 §4 in the other direction,
by making the vendor a value instead of the contract.

**One protocol per delivery mode, such as `SLACK_SOCKET_MODE` and
`SLACK_EVENTS`.** Each would require only its own mode's members. It was
rejected because one Slack app uses both, and the workload, not the deployer,
chooses the mode; two protocols would make a deployment pick twice for one
app.

**Optional mode-specific members.** One protocol with `appToken` and
`signingSecret` optional. It was rejected because an output may only forward
a guaranteed member ([`COMP-OUT-003`](../../specifications/component/v2/spec.md#COMP-OUT-003)),
so a component could not hand either secret on, and a later change to required
would be breaking.

**Secrets as view members, or as separate connections.** Rejected in §3.

## Consequences

- A protocol is added by writing its record and running `task docs`. The
  schema, the three spec.md blocks, the evidence schema and the validator
  follow. Editing a generated block by hand fails `task check:docs`.
- component and blueprint release 2.1.0 with the three messaging protocols,
  and core releases the record schema. Blueprint's evidence schema is
  generated from component's registry, so component's release must precede
  blueprint's, which the dependency gate already orders.
- platform-api replaces its hand-ported member table with the records, maps
  `credential.secrets`, and supports the messaging protocols. Pelorus renames
  its Telegram `token` to `botToken` and adopts the Slack and Discord members.
- An SDK that enumerates protocols or members gains three protocols and five
  member names; one that enumerates them from the records needs no change.
- The runner validates every acquisition against the evidence schema, so a
  malformed acquisition is reported where the schema finds it.
