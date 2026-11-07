# ADR 0044: The validation result is a released schema

- **Status:** Accepted
- **Date:** 2026-11-07
- **Refines:** [ADR 0022](0022-the-musher-document-core-specification.md) §5, a core schema for no document
- **Relies on:** [ADR 0002](0002-conformance-case-trees.md), fixtures match diagnostics by code, path and phase
- **Relies on:** [ADR 0032](0032-correcting-a-released-family-within-its-major.md), released rejections are replayed
- **Relies on:** [ADR 0007](0007-naming-conventions.md), member names and value case
- **Relies on:** [ADR 0043](0043-registries-are-released-data-interfaces.md), core ships `interfaces/`

## Context

Core v2 §6.1 says what a validation result carries: a status, its validation
scope, the phase it reached, its diagnostics and its deferred obligations. §7
says what a diagnostic carries. Neither says it in a form a program can check,
and the result had no released schema.

Every consumer ported the shape by hand, and each port drifted
([#218](https://github.com/musher-dev/specifications/issues/218)):

- platform-api reports a `pointer` where the specification says `path`, writes
  phases and scopes in upper case, and invented a `severity` the specification
  does not define, so that it could report the `serverName` recommendation of
  component `COMP-EP-007` without failing the document.
- The reference runner in `tools/` reports `phase: semantic` on an
  `INCOMPLETE` `publication` result that entered `admission`.
- Nothing says whether a `stage` that does not apply is absent or `null`.
- `deferred[].missing` is free text, and the reference runner alone spells it
  three ways: `platform.privilegedPorts`, `connection:llm` and a sentence
  naming the SPDX release the platform pins.

Three facts are therefore unwritten. Whether a non-failing finding exists at
all. What `phase` means on a result that did not fail. And what an implementer
validates its own output against. The platform's `severity` shows the first is
needed. A finding that reports a SHOULD the document does not meet is useful to
an author, and the specification has no way to say it without rejecting the
document.

## Decision

### 1. Core releases the result's schema

`specifications/core/v2/interfaces/validation-result.schema.json`, JSON Schema
2020-12, `$id` `https://specifications.musher.dev/core/v2/validation-result`,
is released with core, as
[ADR 0043](0043-registries-are-released-data-interfaces.md) releases core's
other interfaces. Core v2 §6.1 and §7 are normative and the schema states
their shape. Where the two disagree, the prose wins and the schema is a
defect.

It is not a document schema. No author writes a validation result, and the
schema rejects no Musher document. Core v2 §10's row "A core document schema"
stays open: this schema does not close it.

### 2. The shape

Every object is closed.

- **Result:** `status`, `validationScope`, `phase`, `diagnostics` and
  `deferred`, all required.
- **Diagnostic:** `code`, `severity`, `phase` and `path` required; `stage`,
  `artifact`, `related` and `message` optional.
  - `code` matches `^(ERR|WARN)_[A-Z0-9_]+$`.
  - `path` is an RFC 6901 JSON Pointer.
  - `stage` is present exactly when `phase` is `resolution`, and is never
    `null`: a member that does not apply is absent.
  - `artifact` names another document of the same item that holds the primary
    location, by its item-relative path. Absent, the location is in the
    submitted document. This is distinct from `related`, which lists further
    locations; the primary location is still `path`.
  - `related` is a list of `{artifact, path}`.
- **Deferred obligation:** `rule`, a requirement ID; `path`, a pointer;
  `missing`, a non-empty string.
- **Expected diagnostic** (`$defs/ExpectedDiagnostic`): the subset a fixture
  declares. `code` is required; `path`, `severity`, `phase`, `stage` and
  `related` are optional, with the same stage rule. A `diagnostics.json` entry
  also carries `path`, as it always has. `path` stays optional in the
  definition because released `behavior.json` entries omit it.

Each status constrains the rest, by `if`/`then`:

| Status | Diagnostics | Deferred |
|---|---|---|
| `INVALID` | at least one `ERROR` | any |
| `INCOMPLETE` | no `ERROR` | at least one |
| `VALID` | no `ERROR` | none |

`WARNING` diagnostics may accompany any status.

### 3. Names and case follow the specification

Member names stay as core v2 already spells them: `path`, not `pointer`.
Case follows the specification's own values. Phases, scopes and stages are
lower case (`semantic`, `document`, `connections`) because §6, §6.1 and §6.4
define them so. Status and severity are upper case (`INVALID`, `WARNING`),
which is ADR 0007's rule for a closed set of values. An implementation that
carries other names or other case on its own wire maps them at its boundary.
The platform's `pointer` and its upper-case phases are such a mapping, not a
second contract.

### 4. Severity is required, and only an ERROR fails

Every diagnostic carries `severity`, `ERROR` or `WARNING`.

- An `ERROR` is a failure of the document. A result with one is `INVALID`, and
  only an `ERROR` makes it so.
- A `WARNING` is advisory. It reports a SHOULD the document does not meet,
  never changes the result's status, and is not approval of what it reports.
- A `WARN_` code is declared in a family's Warnings table,
  `| Code | Requirement | Meaning |`, under a heading naming warnings. Each row
  names the SHOULD it reports by its requirement ID. The existing
  `| Code | Phase | Meaning |` tables keep declaring `ERR_` codes.
- An `ERR_` code may be reported at `WARNING` only to preview a phase outside
  the result's validation scope, such as an `admission` rule in a `document`
  result. The preview reports the phase it previews, is reported only once the
  earlier phases pass, and is not that phase's decision.

The first warning is component's `WARN_ENDPOINT_SERVER_NAME`: an `HTTPS`
endpoint whose trust policy verifies and that names no `serverName`, which
`COMP-EP-007` says SHOULD be named. It is reported in the `semantic` phase at
the endpoint. platform-api's `ENDPOINT_SERVER_NAME_REQUIRED` maps to it.

### 5. What `phase` means on each status

| Status | `phase` |
|---|---|
| `INVALID` | the phase that rejected the document |
| `INCOMPLETE` | the last phase entered |
| `VALID` | the last phase of the result's validation scope |

The first row is what the runner already reported. The other two give a
result that did not fail a value it lacked, and they are the values a reader
of the scope lattice expects: a `document` result that passes reached `semantic`, and a
`publication` result left `INCOMPLETE` by admission it could not complete
entered `admission`.

### 6. `missing` stays free text in v2

`deferred[].missing` is a non-empty string with no grammar. Core v2 §6.1 adds a
SHOULD: `<context>:<key>`, such as `connection:llm`. Giving it a grammar now
would reject results today's producers emit, for a member nothing yet reads by
machine. A grammar can be adopted in a later major once the convention has
settled.

### 7. Fixtures match by severity, defaulting to ERROR

An expected diagnostic may carry `severity`; without one it is `ERROR`. It
matches only a produced diagnostic of the same severity. `behavior.json`
`expect` pointers read the observation with its `diagnostics` reduced to the
`ERROR` ones, so `"/diagnostics": []` means "no `ERROR` diagnostic". A warning
is pinned in an entry's `diagnostics`, with `"severity": "WARNING"`.

`task check:conformance` validates every `diagnostics.json` entry and every
`behavior.json` diagnostic against `$defs/ExpectedDiagnostic`. The local runner
emits `severity` on every diagnostic, and a test validates every result it
produces across the corpus against the schema.

## Why this stays in v2

Requiring a member of the result, and narrowing what makes a result
`INVALID`, could read as validation becoming stricter. It is not, and the
argument is specific.

**§3 constrains which documents validation accepts.** Core v2 §3 says a
document that validated against `2.0.0` MUST validate against every later
`2.x.y`. The guarantee is about documents: their acceptance and their defined
meaning. A required member of the result is a member of what a validator
outputs, and it rejects no document. No author's document changes outcome.

**The result had no released schema.** Nothing was released whose bytes this
narrows. Consumers validated results against their own ports, if at all, and
none of those ports is a contract this repository published.

**No released case changes.** Every expectation in the `2.0.0` corpora, in
`diagnostics.json` and in `behavior.json`, carries no `severity` and is
matched against `ERROR` diagnostics alone. Before this decision every
diagnostic was a failure, which is what `ERROR` names, so each case passes
exactly when it passed before, and each rejection keeps the code, path and
phase [ADR 0032](0032-correcting-a-released-family-within-its-major.md) replays
it for. `task check:compat` replays every released case against the candidate
and reports none regressed. No fixture byte changes.

**The WARNING class is new.** No released code becomes a warning, and no
document that failed now passes on the strength of one. The only change to
acceptance is none: a document with an unnamed `serverName` was valid and
stays valid, now with a `WARNING` beside it.

**The cost is real, and named.** A producer must now emit `severity`, and a
result that omits it does not conform to the schema. The known producers are
the reference runner in this repository, which does from this decision, and
platform-api, which already emits a `severity` and maps its values. A third
producer written against core v2 §7 as it stood would need the member added.
That is a change to producers, not to documents, and it is why this decision
is recorded rather than slipped into a patch.

## Consequences

**One contract for every producer and consumer.** platform-api, musher-cli and
the SDKs validate their results against the released schema and map their own
wire names at the boundary.

**A SHOULD can be reported without rejecting a document.** A family adds a
Warnings row to report one. The registry tables record which codes are
warnings ([ADR 0043](0043-registries-are-released-data-interfaces.md)).

**The result schema evolves by addition.** A new optional member and a new
`WARN_` code are compatible. A new status, severity, phase or stage is not,
because a consumer's closed switch over them breaks; each would take a new
major version of core.

## Alternatives considered

**An `advisories[]` array beside `diagnostics`.** It keeps every diagnostic a
failure and puts warnings elsewhere, so `severity` would not be needed. It was
rejected. A warning and an error share every member (code, phase, path, stage,
related), and splitting them doubles the shape for one bit of difference.
Every consumer that renders diagnostics would read two lists. The platform
already reports one list with a severity, and adopting its model costs it
nothing.

**Optional `severity`, defaulting to `ERROR`.** It avoids naming the cost to
producers. It was rejected because a default is a guess at the boundary: a
consumer that forgets the default treats a missing member as a warning or as
nothing, and the failure mode is a document read as clean when it is not.
Required costs one member per diagnostic.

**`pointer` and upper-case phases, the platform's spelling.** It would save
the platform a mapping. It was rejected because core v2 §6 and §7 spell them
`path` and lower case, every released fixture does too, and renaming them
would break the fixture contract for a cosmetic gain.

**A grammar for `missing` now.** Rejected for the reason §6 gives.
