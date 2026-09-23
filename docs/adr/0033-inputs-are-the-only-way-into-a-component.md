# ADR 0033: Inputs are the only way into a component, and v1 is reset once

- **Status:** Accepted
- **Date:** 2026-09-23
- **Supersedes:** [ADR 0030](0030-atomic-named-connections.md) §1
- **Refines:** [ADR 0026](0026-a-component-declares-requirements.md) §1
- **Refines:** [ADR 0031](0031-one-grammar-for-the-authored-documents.md) §1
- **Extends:** [ADR 0005](0005-platform-divergence-reconciliation.md) §1
- **Relies on:** [ADR 0023](0023-published-bytes-are-immutable-release-assets.md)
- **Relies on:** [ADR 0032](0032-correcting-a-released-family-within-its-major.md) §3

## Context

A component had three ways to put a value into its workload's environment:

| Mechanism | Where | Supplied by |
|---|---|---|
| `workload.envVars` | the workload | the component, verbatim |
| `inputs.<k>.target.envVarKey` | the contract | the blueprint |
| `contract.connectionRequirements` | the contract, over three inputs | a connection, through `connectionBindings` |

An author asking "how do I set `FOO`?" had two correct answers, and a console
that offers an "environment variable" field beside an "input" field gives no hint
which one to reach for. `COMP-ENVVAR-002` and `ERR_CONFLICTING_ENV_KEY` existed
only because two sources could claim one name.

Connections repeated the problem one level up. A worker declared `llmBaseURL`,
`llmAPIKey` and `llmModel` as ordinary inputs, then grouped them in a second
block that forbade wiring them as ordinary inputs (`COMP-CONNECTION-001`,
`BP-CONNECTION-001`). They looked like three pins and behaved like one socket,
and the blueprint needed a second binding map, `connectionBindings`, to reach it.

The mental model this record adopts is an integrated circuit. **A component's
contract is its pins.** Every value that reaches a workload enters through a
declared input, whether or not anything is wired to it. A value that is fixed
is fixed upstream, by a default on the pin or by a binding in the blueprint.
Anything that lives outside the blueprint, such as a managed database or a
language-model API, is an `EXTERNAL` component: a chip whose outputs are pins
the rest of the board wires to.

That model was checked against the formats that already describe outside
dependencies:

| Format | An outside dependency is | A consumer receives it |
|---|---|---|
| Score | a `resources` entry beside the workload | per-output placeholders in its variables |
| .NET Aspire | a resource in the app model | `WithReference`, injected as environment |
| Docker Compose | a top-level `models` entry beside `services` | named environment variables per member |
| Terraform | a `data` or `resource` block | module variables wired attribute by attribute |

Every one of them treats an outside dependency as a peer node with outputs, not
as a field on the consumer. Score and Terraform wire those outputs one at a time,
which is what [blueprint §4.2](../../specifications/blueprint/v1/spec.md#bindings)
already does for a managed database.

Separately, `COMP-SRC-002` and `COMP-SRC-003` rejected an image reference Docker
accepts: a bare name, which Docker reads as `:latest`, and a set of floating
tags. A tag was never a pin (component §5.1 says so); exact identity comes from
the generated artifact digest. The rule rejected ordinary references without
buying the reproducibility it appeared to.

### Why this is a v1 change

Component `v1.1.0` and blueprint `v1.2.0` are released, so
[ADR 0005](0005-platform-divergence-reconciliation.md) §1's pre-publication
window is closed, and everything above except the image relaxation narrows what
validates. The ordinary answer is a `v2` directory.

The ordinary answer protects readers who adopted a release. There are none. The
platform is pre-MVP, every system that consumes these documents is maintained by
the same people, and every downstream document can be migrated in the same week.
A `v2` would publish a second major whose only audience is the team that wrote
the first, and would make every later reader ask what `v1` was for.

## Decision

### 1. Every workload environment variable is an input

`spec.workload.envVars` is removed. A document carrying it reports
`ERR_UNKNOWN_FIELD`. A constant becomes an input with a `default` and a
`target`. A blueprint may leave it unwired and get the default, or wire it and
override it, like any other pin. A default costs the installer nothing, because
the install form is authored separately in blueprint `parameters`
([ADR 0026](0026-a-component-declares-requirements.md) §3). A value that must
never be overridden belongs in the image.

`COMP-ENVVAR-002` narrows to "no two inputs claim one `envVarKey`" and keeps
`ERR_CONFLICTING_ENV_KEY`. The name grammar and the encoding rules stay in
component §5.3, which now describes the environment the inputs produce.

### 2. An outside dependency is an external component, and a connection enters through one

`contract.connectionRequirements` and `COMP-CONNECTION-001` are removed, and so
is `ERR_INVALID_CONNECTION_REQUIREMENT`. An input now carries either `schema`, a
**value input**, or `connection`, a **connection input**. The key that is
present decides which, per [ADR 0031](0031-one-grammar-for-the-authored-documents.md) §1:

| Union | Spelling |
|---|---|
| Input kind | `schema` (a value input) or `connection` (a connection input) |
| Output origin | `from: {value}`, `{input}`, `{input, member}`, `{endpoint, property}` or `{template}` |

`COMP-CONNECTION-002`: a connection input declares only `description` and
`connection: {protocol, capabilities?}`. It has no `schema`, `default`,
`required`, `sensitive`, `presentationHint` or `target`, and it is always
required. Only an `EXTERNAL` component declares one; a workload reaches a
language model through an external node's outputs, like anything else outside
the blueprint.

`COMP-OUT-004`: an `input` origin naming a connection input carries `member`,
one of `baseURL`, `apiKey` or `model`, and an origin naming a value input does
not. Each member is a string, and `apiKey` is sensitive, so the existing
propagation rule makes any output forwarding it sensitive.

The consumer is now three ordinary inputs. The protocols, capabilities and
acquisition semantics of [ADR 0030](0030-atomic-named-connections.md) §2 to §4
are unchanged. Only their owner moves, from the consumer to the external node.

### 3. Image references follow Docker

A bare image name is valid and means the tag `latest`. `COMP-SRC-003` and
`ERR_UNPINNED_IMAGE` are removed. The prose keeps its warning that a tag is a
request and only a digest identifies content.

### 4. One binding map

Blueprint `connectionBindings` is removed. A connection parameter binds a
connection input through ordinary `bindings`, as `{parameter}`.
`BP-CONNECTION-001` becomes a kind rule: a connection input is bound only by a
connection parameter, and a connection parameter binds only connection inputs.
It keeps `ERR_INVALID_CONNECTION_BINDING`. `BP-CONNECTION-002` and
`BP-CONNECTION-003` are unchanged, so the selection is still one per
installation and parameter.

### 5. A one-time reset of the v1 compatibility baseline

**The compatibility guarantee of
[core v1 §3](../../specifications/core/v1/spec.md#compatibility) runs, for
component and blueprint, from the first release that carries this record, and
not from these five:**

- `component/v1.0.0`, `component/v1.1.0`
- `blueprint/v1.0.0`, `blueprint/v1.1.0`, `blueprint/v1.2.0`

They stay published, byte for byte, at their pinned URLs
([ADR 0023](0023-published-bytes-are-immutable-release-assets.md)), and their
ledger entries do not change. What changes is only that `check:compat` stops
replaying them. It lists them in `WITHDRAWN` in
`tools/src/publication/compat.ts`, beside `RELAXED`, and a unit test pins that
list to exactly these five tags. Adding a sixth is a change to a test that
exists to be read, not a line anyone can slip into a map.

The `RELAXED` entries that name these releases stay where they are. They record
what those releases relaxed, and nothing consults them once the release is not
replayed.

This is the pre-publication window of
[ADR 0005](0005-platform-divergence-reconciliation.md) §1, applied once more to
two families whose releases no one outside the project adopted. It is not a
second window. It is spent by this record, and the next narrowing of either
family is a `v2` on the ordinary terms.

The change is declared as breaking here and in each family's changelog, and not
with a `BREAKING CHANGE:` trailer. release-please reads that trailer as a major
bump, and a `2.0.0` from a `v1` directory is exactly the version this record
declines to make. The release is a minor: component `v1.2.0` and blueprint
`v1.3.0`.

## Alternatives considered

**A `v2` directory for each family.** Correct under GOVERNANCE.md, and the right
answer the moment anyone outside the project depends on `v1`. Rejected because
nobody does, and because the migration it would require is the one the
maintainers are doing by hand anyway.

**A typed connection input on the consumer.** `llm: {connection: ...}` on the
worker, with a target per member, is terser and lets the worker demand a
protocol. Rejected because it keeps a second kind of pin on every workload, and
because an outside dependency then appears in the graph in two different ways,
as a node when it is a database and as a field when it is a model.

**Built-in external components the platform defines.** A reserved reference
such as `musher:openai-chat` would spare an author writing the external node.
Deferred: a platform-published component, referenced by UUID and revision,
already does this with no new syntax. A readable alias is a later, additive
decision.

**Per-case `pass` to `fail` waivers in `check:compat`.** Narrower in form, but
it would need one entry per released case and example that used a removed
field. [ADR 0032](0032-correcting-a-released-family-within-its-major.md) §3
refused that direction for good reason, since a waiver that turns an
acceptance into a rejection is how a regression hides. Naming whole releases,
once, is the honest statement of what happened.

**Amending core v1 §3.** A general "baseline" mechanism in core would make the
exception repeatable, which is the opposite of what is wanted, and would hold
every family's release behind a core release.

## Consequences

**A component is pins and nothing else.** The console shows one list, Inputs,
whose rows have a name, a description, a type, a default, a sensitivity flag and
an environment variable. The "environment variables" panel goes away.

**A worker cannot demand a protocol or capabilities.** It sees three strings. The
external node declares what it provides, and the blueprint author chooses the
node, as they already do when a worker reads a database's host and port.

**Atomicity moves to the source.** One connection parameter fills one external
node, so its members always come from one selection. A blueprint can wire
`apiKey` from one node and `baseURL` from another. That is a visible authoring
mistake rather than a silent mix of configuration, and the scoped credential's
`permittedBaseURLs` still refuses it at run time.

**Images can float.** A component may run `nginx` or `nginx:latest`, and two
installations of one revision can run different bytes until the platform
records a digest. That was already true of every tag outside the old list.

**Retired identifiers.** `COMP-SRC-003` and `COMP-CONNECTION-001`, with
`ERR_UNPINNED_IMAGE` and `ERR_INVALID_CONNECTION_REQUIREMENT`, are withdrawn.
`COMP-CONNECTION-002` and `COMP-OUT-004` are added. Their cases are deleted or
rewritten, not excused.

**Downstream migrates now.** `musher-dev/catalog`, the console and the platform
move every `envVars` entry to a defaulted input, move every
`connectionRequirements` group to an external node, and move every
`connectionBindings` entry into `bindings` on that node.
