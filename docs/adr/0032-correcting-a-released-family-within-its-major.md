# ADR 0032: Correcting a released family within its major version

- **Status:** Accepted
- **Date:** 2026-09-20
- **Extends:** [ADR 0005](0005-platform-divergence-reconciliation.md) §1
- **Refines:** [ADR 0002](0002-conformance-case-trees.md) §2
- **Relies on:** [ADR 0022](0022-the-musher-document-core-specification.md) §2
- **Relies on:** [ADR 0023](0023-published-bytes-are-immutable-release-assets.md)

## Context

All four families were tagged `v1.0.0` on 2026-09-18, which closed
[ADR 0005](0005-platform-divergence-reconciliation.md) §1's pre-publication
window: "every narrowing proposed afterwards is a `v2` directory". Within days,
two downstream reports arrived that the window's closing does not obviously
cover, and reading them together showed that "breaking" was being asked to
answer a question it was never given the words for.

**A rule with no enforcement.** [Issue #106](https://github.com/musher-dev/specifications/issues/106)
reported that the last sentence of
[`COMP-OUT-002`](../../specifications/component/v1/spec.md#COMP-OUT-002),
"Every declared output must be produced, so an absent optional input cannot
supply an `input` origin", had no diagnostic code, no check in the reference
validator, and no conformance case. A catalog item was authored against it,
validated clean, and was fixed by hand. The rule was normative in
`component/v1.0.0`; nothing anywhere could tell an author they had broken it.

**A rule on the wrong side of a line.** [Issue #110](https://github.com/musher-dev/specifications/issues/110)
reported that `metadata.description`, being structurally REQUIRED, made a
work-in-progress document not a document at all, so a platform that draws its
draft line at the structural phase cannot store one. That change goes the other
way: it stops rejecting something.

Each ran into the same wall from a different side.
[GOVERNANCE.md § Compatibility review](../governance.md#compatibility-review)
defines a breaking change as one that "rejects a previously valid document", and
does not say what makes a document valid. And `check:compat`, correctly and by
design, replays a release's rejections as well as its acceptances, so it reads
a deliberate relaxation as a regression and has no way to be told otherwise.

### Why now

Both are small. The reasoning is not, it will be asked for again, and the first
time a question like this is answered in a pull request description is the last
time anyone can find the answer. [ADR 0005](0005-platform-divergence-reconciliation.md)
§1 exists because the same thing had already happened twice.

## Decision

### 1. "Previously valid" means valid against the released specification

**A released family MAY add a diagnostic code, a requirement ID and a
conformance case for a condition its released `spec.md` already rejects. This is
a defect fix and takes a minor release. It is not a narrowing and does not need
a new major.**

`spec.md` states the definitive rule; schema `description` text, examples and the
generated reference pages are informative. A document violating a sentence of the
released prose was never valid. It was undetected, which is a different thing.
Giving that sentence a code and a case changes what is *found*, not what is
*true*.

This is not new law. [Core v1 §9](../../specifications/core/v1/spec.md#editions)
already says a minor release of core "adds a code only for a condition an earlier
v1 edition already rejects". §1 says the same of a family, in the same words, and
for the same reason.

**The bound is exact, and it is the whole safeguard.** The condition must already
be rejected by the released prose, in a sentence a reader can be shown. A rule
that is merely implied, that follows from another rule, or that the prose
declines to state is a *new* rule: proposing it is proposing a `v2`, and ADR 0005
§1 leaves no discretion there. If the argument for a change has to reconstruct
the rule rather than quote it, §1 does not apply.

**What it costs, stated plainly.** An implementation that conformed to the
corpus rather than to the prose has work to do, and a `v1.1.0` will reject
documents its `v1.0.0` accepted. That is the price of the prose being definitive.
The alternative is a major version for a sentence that was always normative,
which would say that an unenforced rule is not a rule, and a specification that
concedes that has conceded that its prose is documentation.

### 2. A requirement ID names one rule

**Where a rule carries its own diagnostic, it carries its own requirement ID.**

`COMP-OUT-002` carried four rules and one ID. `checkRequirementCoverage` asks
whether an ID is cited by some case; three cases cited it, so CI was green while
half of it went untested. No gate can ask whether a case pins every *sentence* of
a requirement, and none is proposed here: the defect is in the writing, not in
the runner.

This extends what [ADR 0022](0022-the-musher-document-core-specification.md)
§2 already required of the ID space ("one ID names one rule") from *not
declaring an ID twice* to *not hiding a second rule inside one*. The practical
test when writing a requirement: if a sentence names a condition a document can
violate, and a diagnostic would be reported for it, it is its own ID.

Splitting an ID is additive. The original keeps its anchor, its text and its
fixtures, and the new rule takes a new number; no published ID is retired, which
after the first tag no later edit could take back.

### 3. A relaxation is declared per case, in one direction

**`check:compat` keeps replaying released rejections. A release that
deliberately stops rejecting a document declares that case, with its reason, in
`RELAXED` in `tools/src/publication/compat.ts`.**

Replaying rejections is right and stays the default. A rejection pins observable
meaning as much as an acceptance does, and a gate that only replayed acceptances
would let a code, a path or a phase change under a document that still fails.

But it makes the gate stricter than the guarantee it enforces.
[Core v1 §3](../../specifications/core/v1/spec.md#compatibility) forbids
validation becoming *stricter* within a major and says nothing against a
relaxation, which is the direction §1 of this record and issue #110 both travel
in. What was missing was not permission but a place to write the reason down.

The mechanism carries three properties, and it was chosen for them:

- **One direction.** An entry moves a historical verdict from `fail` to `pass`
  and nothing else. An entry naming a case the release accepted is refused,
  because a `pass` to `fail` waiver is exactly the regression this gate exists
  to catch.
- **It audits itself.** The released document is still replayed, byte for byte,
  against today's schemas and semantics; only the verdict it is measured against
  moves. If a relaxed case still rejects, the gate reports a pass that failed, so
  an entry cannot outlive the release that needed it.
- **It is read by a reviewer.** `RELAXED` is a map in the source, like `UNPINNED`
  and `UNCOVERED` beside it, so an entry arrives in a diff rather than in a
  configuration file nobody opens.

## Alternatives considered

**Treat issue #106 as a narrowing and open component v2.** Correct under a
reading of "previously valid" that means "accepted by the tooling", and that
reading is the one this record rejects. It also has a cost nobody would accept in
the general case: every unenforced sentence in every released family becomes a
major version's worth of work, so the cheapest response to finding one is to
delete it.

**Withdraw the sentence instead, and permit the document.** Available, and
genuinely the right answer where a rule turns out to be wrong. It is not this
rule: an output whose source can be absent is a promise the contract cannot keep,
and the reporter had already fixed the item by hand rather than argue the rule.

**Warn in v1, reject in v2.** A non-blocking diagnostic would leave the gap open
for the whole of v1 while looking closed, and this contract has no warning
severity to put it at. Inventing one to avoid deciding a compatibility question
is a larger change than the question.

**Keep `description` structural and let the platform store drafts outside the
contract.** Rejected in the issue and rejected here: stored drafts would be
non-conformant documents, which puts a conformance-gated behaviour behind a local
exception, and [ADR 0005](0005-platform-divergence-reconciliation.md) §6 already
refused to create a register for blessed non-conformance.

**A waiver that suppresses a failing case rather than moving its verdict.**
Simpler, and it would suppress a real regression with the same keystroke. Moving
the verdict keeps the case running.

## Consequences

**The prose is load-bearing in a way it was not obviously before.** A sentence
in a released `spec.md` can be enforced later without a major version, so a
sentence written loosely is a promise made loosely. Requirements are written
one rule at a time from here.

**Nothing detects the next `COMP-OUT-002`.** No check can compare a requirement's
prose against what its cases exercise, and §2 is a writing discipline, not a
gate. Every multi-sentence requirement in the four released families is a
candidate; a pass over them is worth doing and is not done here.

**`RELAXED` is a place a regression could hide.** Its entries are
one-directional and self-auditing, which bounds the damage, but an entry is still
a maintainer's claim that a relaxation was intended. It is a review obligation,
and the list should stay short for the same reason `UNCOVERED` is empty.

**Downstream sees a rejection it did not see before.** `component/v1.1.0`
rejects an output that forwards an optional input with no default. The catalog
has already fixed the one item that did
([musher-dev/catalog#35](https://github.com/musher-dev/catalog/pull/35)); any
other implementation finds it by running the corpus.
