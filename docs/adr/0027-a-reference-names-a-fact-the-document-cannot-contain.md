# ADR 0027: A reference names a fact the document cannot contain

- **Status:** Accepted
- **Date:** 2026-09-17
- **Supersedes:** [ADR 0005](0005-platform-divergence-reconciliation.md) §5
- **Supersedes:** [ADR 0019](0019-external-component-node.md) §3
- **Supersedes:** [ADR 0026](0026-a-component-declares-requirements.md) §5
- **Refines:** [ADR 0026](0026-a-component-declares-requirements.md) §4
- **Refines:** [ADR 0003](0003-controlled-vocabulary-placement.md) §1
- **Extends:** [ADR 0007](0007-naming-conventions.md) §4
- **Relies on:** [ADR 0005](0005-platform-divergence-reconciliation.md) §1, §2
- **Relies on:** [ADR 0022](0022-the-musher-document-core-specification.md) §2

## Context

[ADR 0026](0026-a-component-declares-requirements.md) separated what a component
needs from how a blueprint supplies it. One thread stayed knotted: a blueprint
still has no way to say **this value is not known until the thing is deployed**.

The only answer today is `platformDefault`, a three-field block naming one of
four address forms:

```yaml
platformDefault:
  type: SELF_ADDRESS
  source: PUBLIC_HOSTNAME
  endpoint: web
```

It can hand a deployment its own hostname. It cannot build anything from one.
An OAuth callback is `https://<the hostname>/oauth/cb`, and that value is not
expressible in a blueprint at all — not by `platformDefault`, which yields a
bare address, not by a connection, which carries an upstream node's output, and
not by any literal, because a parameter carries no value. The composition is the
whole requirement, and the structural form has no way to compose.

This is the fourth mechanism for "a value that is not written here", and they do
not compose with each other either:

| Mechanism | Says |
|---|---|
| `connections` | take it from another node's output |
| `valueFrom: INPUT` | republish one of my own inputs |
| `generator` | mint one |
| `platformDefault` | derive one from my own addressing |

Each is sound alone. Together they are four spellings of one idea, and a fifth
question — compose an address into a URL — has no spelling at all.

### The decision was already taken downstream, which is backwards

`musher-dev/platform` ADR 0119, accepted 2026-08-08, defines
`${{ <namespace>.<path> }}`: one sigil, one parser, a closed namespace set
(`params`, `self`, `config`, `deployment`, `environment`, `organization`),
`$${{` as a single four-character escape, and per-site namespace validation. It
is implemented, tested, and documented there as a standing contract.

This specification defines none of it. That inversion has already cost
something: platform ADR 0167 had to **withdraw** part of ADR 0119, because "the
specification is normative and this repository is the downstream
implementation", and this specification had decided otherwise. A grammar that
is user-visible, load-bearing and undefined upstream will keep producing that
outcome.

### This reverses two accepted decisions, and says so

Two records rejected exactly this, and both named the `self` namespace:

> The alternative shape issue #32 raised — a `self.publicAddress.<endpoint>`
> reference namespace — is rejected. This contract has no expression language;
> references are structural fields, and introducing a namespace to answer one
> question would be a far larger change than the question warrants.
>
> — [ADR 0005](0005-platform-divergence-reconciliation.md) §5

and, restated three weeks later by the record that introduced the structural
reference this one generalizes:

> **There is no expression language and this does not introduce one.**
>
> — [ADR 0019](0019-external-component-node.md) §3

ADR 0005 §5's rejection is a proportionality argument, not a principled one, and
it is explicit about that: the objection is that a namespace is "a far larger
change than the question warrants". The question count has since grown from one
to five — self-addressing, minted secrets, composed URLs, literal supply, and
the identity facts a deployment carries — and the answer has grown to four
mechanisms that do not compose. The proportion has inverted.

What was missing was a principle that admits a reference without admitting an
expression language. §1 is that principle.

### Why now

`git tag -l` is empty and `published.json` records `{"releases": {}}`, so
[ADR 0005](0005-platform-divergence-reconciliation.md) §1's pre-publication
window is open. §1 and §5 below narrow what validates, and both are free only
inside it.

## Decision

### 1. A reference names a fact the document cannot contain

That sentence is the whole of the admission test, and it is what separates a
reference from an expression language.

[Core](../../specifications/core/v1/spec.md) `CORE-YAML-007` withholds YAML
anchors and aliases, and states its reason: "a document whose meaning depends on
being expanded is not readable as the thing it declares". A reference appears to
fall under that reason and does not, because the two do opposite things. **An
alias hides information that is present.** Expanding it adds nothing a reader
could not have read, so the only thing it buys is that the document is harder to
read. **A reference names information that is absent and cannot be present**,
because the platform assigns it after this document is written and sealed.

Withholding the first costs an author nothing. Withholding the second costs them
the value.

The principle is not decoration. It decides every question that follows:

- **No functions, no operators, no conditionals, no arithmetic, no fallbacks.**
  Each computes over values that are already in hand, and a document that
  computes is a document whose meaning depends on being run.
- **No reference to a sibling field.** That information is present. Naming it
  `${{ }}` would be an alias with extra steps, and `CORE-YAML-007` governs.
- **No reference resolves to text that is itself scanned** (§4).
- A future namespace is admitted by asking one question: is the fact it names
  one this document could have carried? If yes, it is not a reference.

### 2. `${{ <namespace>.<path> }}`

A reference is `${{`, optional whitespace, a namespace, one or more
`.`-separated segments, optional whitespace, `}}`. `$${{` is the only escape and
is a single four-character token rendering a literal `${{`; a `$` that does not
begin `${{` or `$${{` is literal. A segment matches `^[a-z][a-zA-Z0-9]*$`, which
admits both the address-form names and the endpoint-name grammar
[ADR 0007](0007-naming-conventions.md) §4 fixes at `^[a-z][a-z0-9]{0,19}$`, so a
dotted path never needs escaping to be read unambiguously. Examples write one
space inside each brace pair.

`${{ }}` over `${ }` and `{{ }}`, on three grounds and in this order:

1. **It is what the platform already parses.** This record ratifies a shipped
   grammar rather than commissioning a migration of every seeded application and
   catalog listing. Where this specification and a working implementation can
   agree at no cost to the specification, they should.
2. **`{{ }}` collides with every mainstream template engine** a value might
   transit on its way to a container.
3. **`${ }` collides with shell parameter expansion** in the fields most likely
   to carry a reference. A component's environment variable values and a
   workload's command are shell-adjacent by construction, and a grammar that is
   indistinguishable from the shell's in exactly those fields is a grammar that
   will be resolved twice or not at all.

### 3. The namespace set is closed, and only `self` resolves in v1

Seven namespaces are reserved. An author cannot extend the set, and a namespace
outside it is an error at every position — never a pass-through.

| Namespace | v1 |
|---|---|
| `self` | Resolvable. The node's own addressing. |
| `params`, `config`, `deployment`, `environment`, `organization`, `output` | Reserved. No meaning in these documents; any use is an error. |

Reserving a name costs one table row and buys the thing that cannot be bought
later: none of them can ever become an author-addressable key. This is the
posture platform ADR 0119 §3 takes for `deployment`, `environment` and
`organization` — reserved, not stubbed — and it is why `output` is reserved here
although ADR 0119 §6 declined to reserve it there. That decision turned on an
implementation hazard, that reserving a namespace the snapshot model cannot
represent "invites someone to implement it against a hash that cannot see it".
Reserving it *here* has the opposite effect, because here reservation means a
document naming it is rejected.

Only `self` resolves, and each of the other six is held back for its own reason.
`config`, `deployment`, `environment` and `organization` name facts about a
running system that a blueprint and a component never see; nothing in either
document could read one, so defining them here would be writing rules no
document can exercise. `output` names a producer's value for a consumer, which
is what a connection already is — the document holds that edge, so §1 excludes a
second spelling of it. `params` is the closest call: a parameter's value is
typed by the deploying user and is genuinely not in the document, so §1 admits
it. §4 is what holds it back. The only position that would read one is another
parameter's `default`, and a `default` resolving to a `default` is a chain,
which needs an order, which ADR 0005 §2 has foreclosed.

Namespaces are named by concept, never by vendor. A closed set has nothing to
collide with, so the prefixing convention that produces `VERCEL_URL` and
`FLY_APP_NAME` does not apply, and `musher.*` is unavailable regardless —
platform `observability.md` OBS-06 fixes it as the OpenTelemetry attribute
prefix. Closed tool-owned namespaces name by concept: GitHub Actions reserves
twelve contexts of which one is the vendor's, and Terraform and Helm have the
same shape.

Under [ADR 0003](0003-controlled-vocabulary-placement.md) §1 this is a
vocabulary this contract fixes, so it is a closed enumeration stated here and
checked offline, not a named external surface.

### 4. A resolved value is never re-scanned

[ADR 0005](0005-platform-divergence-reconciliation.md) §2 withdrew cycle
detection from a blueprint's connection graph, and left a standing foreclosure
behind it:

> A later rule that needs an order is now breaking. … an ordered rollout, a
> health-gated start, or a value that legitimately depends on an inbound edge
> would each need an acyclic graph, and re-introducing that requirement after
> publication rejects compositions v1 accepts. **Anyone proposing such a rule is
> proposing a major version.**

A reference that could resolve to text containing another reference is exactly
such a rule: resolving it needs an order, an order needs acyclicity, and
blueprint §4.2 permits cycles deliberately. So the text a reference yields is
substituted and never scanned again.

The gain is larger than the constraint. There is no chain, so there is no cycle
to detect, no depth budget, no per-pass size budget, and no memoized-depth
subtlety of the kind platform `config-references.md` §6 has to warn reviewers
not to simplify away. Resolution is one pass over authored text. `self` names
the node's own addressing rather than anything reached over an edge, so it adds
no edge to the graph and needs no order in the first place.

### 5. An unescaped `${{` must be a reference

In a position that admits references, an unescaped `${{` MUST begin a
well-formed reference. A malformed one is an error.

This is the one rule the downstream contract does not have. Platform
`config-references.md` §1 says a string that does not match the reference shape
— "an unclosed `${{`, an invalid key, a namespace-less `${{ KEY }}`" — "is
literal text and passes through verbatim". Those are precisely the shapes a typo
takes. `${{ publicUrl }}` and `${{ self.publicUrl }` are each one keystroke from
correct, and each currently ships to a container as literal placeholder text
with no error at authoring time, at publish, or at deploy.

That is the same failure ADR 0119 §2 was written to end. It closed the
cross-epoch case and left the malformed case open, because at that point the
pass-through behaviour was load-bearing for stored customer plaintext. Nothing
is stored here and nothing is released, so this specification can close it, and
this is the only moment at which closing it is free.

### 6. `platformDefault` becomes `default`

A blueprint parameter carries `default`: a string, which may contain references,
prefilled into the install form and overridable by the deploying user. It
replaces `platformDefault` and its `SELF_ADDRESS` block, whose four `source`
members map one-to-one onto `self` paths.

| Retired | Written |
|---|---|
| `source: PUBLIC_URL` | `${{ self.publicUrl }}` |
| `source: PUBLIC_HOSTNAME` | `${{ self.publicHostname }}` |
| `source: PUBLIC_ADDRESS` | `${{ self.publicAddress }}` |
| `source: PUBLIC_PORT` | `${{ self.publicPort }}` |
| `endpoint: web` | `${{ self.publicUrl.web }}` |

Platform ADR 0119 §5 proposed this collapse and ADR 0167 withdrew it, on a
ground worth answering rather than ignoring: `platformDefault` and a
user-supplied value **co-occur** — "the platform fills the value and the
deploying user may type over it" — so collapsing the two asserts an exclusivity
that does not hold, and ADR 0167 concluded "the remedy went to the wrong side of
the pair".

It did, and this is the other side. The two facts are orthogonal, so they take
two fields rather than one: **the field name says whether the value may be
typed over, and the reference says where it comes from.** `default` means prefilled and editable, which is
what `platformDefault` meant; `${{ self.publicUrl }}` says where the prefill
comes from, which the `source` enum said. Nothing is collapsed that was
distinct. What is gained is that the source side is now composable — the case
this record opened with, `https://${{ self.publicHostname }}/oauth/cb`, is a
`default` and was not a `platformDefault` — and that a blueprint can supply a
plain literal value, which it has never been able to do.

`default` and `generator` remain mutually exclusive, on ADR 0026 §5's unchanged
reasoning: minting a value and deriving one are two answers to one question.

A parameter's `default` replaces the covered input's `schema.default` for this
composition. That is the only precedence rule the change adds, and it runs the
way the documents already run: the blueprint decides supply, the component
declares the requirement.

### 7. `fromNode`, and parameters may name their target

Two corrections that the addressing vocabulary needs and that `default` makes
load-bearing.

**`fromRole` becomes `fromNode`, and `ERR_UNKNOWN_ROLE` becomes
`ERR_UNKNOWN_NODE`.** Blueprint §4.2's own sentence is "`fromRole` MUST name a
node in this blueprint". The `$defs` key is `BlueprintNode`,
[ADR 0007](0007-naming-conventions.md) §4 calls the identifier a node name, and
the word *role* appears nowhere in the specification except inside those two
identifiers. It is a straggler from a vocabulary the document no longer uses.

Not `fromComponent`: `componentRef` sits one field away in the same object and
names a component *document*. Two `component`-prefixed fields naming two
different kinds of thing, adjacent, is worse than the inconsistency it fixes.

**A parameter may carry `toNode` and `toInput`**, both OPTIONAL. ADR 0026 §4's
binding by key stands and is unchanged where neither is present; these narrow a
correspondence that would otherwise be ambiguous, and they are what make §6
well-defined.

The ambiguity is already in the specification. `BP-PARAM-005` reads "A platform
default MUST resolve, **on every node the parameter covers**" — so a parameter
covering two nodes derives two addresses for one form field, and nothing says
which the deploying user is shown. `toNode` restricts coverage to one node,
which is what lets `self` denote one thing.

`toInput` answers a failure that is quieter and worse. Binding by key is sound
where key equality implies value equality, and across independently authored
components it does not: two components each declaring `apiKey` with identical
schemas are covered by one parameter, pass `BP-PARAM-002`, and receive the same
typed secret. `toInput` lets a parameter key differ from the input key, so two
same-named inputs can be two form fields. Without it the only remedy is to edit
someone else's component.

The names are symmetric with the connection they mirror: a connection says
`fromNode` and `fromOutput`, a parameter says `toNode` and `toInput`.

### 8. The grammar belongs in core

Against [ADR 0022](0022-the-musher-document-core-specification.md) §2's three
tests:

1. **It can be stated without naming a kind.** The grammar, the escape, the set
   and "a resolved value is never re-scanned" name no `kind`. What each
   namespace *denotes* is family-specific, so that stays in the families: core
   reserves the names and each family says which it admits, and where.
2. **At least two families apply it.** Blueprint admits `self` in a parameter's
   `default`; component admits it in a `DECLARED` output's `value`. Both are
   positions the platform already templates.
3. **It can only grow by addition within the major.** Admitting a namespace,
   or a position, is addition. This is why §5 lands now rather than later — it
   is the one part that is a narrowing, and core narrows for every family at
   once.

The rules sit in the `semantic` phase, where core §6's own table already places
"reference resolution". That also keeps the grammar out of a JSON Schema
`pattern`, which core §11 requires be free of lookaround so it compiles under
RE2 — matching "every unescaped `${{` opens a well-formed reference" is a
lookaround-shaped problem, and a parser states it plainly.

## Alternatives considered

| Option | Why rejected |
|---|---|
| Keep references structural and add a fifth field for composition | The composition *is* the value. A field that composes an address into a URL is an expression language with a worse notation, and there would then be five mechanisms rather than four. |
| Adopt the platform's grammar entire, chains and fallbacks included | Chains need an order and [ADR 0005](0005-platform-divergence-reconciliation.md) §2 forecloses one. A `:-` fallback is a defaulting mechanism, and defaults belong on the input's `schema.default` and the parameter's `default`, where a reader looks for them. |
| Resolve `params.*` inside a parameter's `default` | It is a chain, so §4 forecloses it, and §1 excludes it besides: a parameter's value is a fact the document can contain. |
| Reserve nothing, and error only on what is defined | Reservation is the only part of this that cannot be done later. A customer key called `deployment` can no longer be addressed the moment one exists. |
| Keep `platformDefault` and add references alongside it | Two mechanisms for one concept, which is the shape platform ADR 0119 named as "what a vocabulary takes right before it fragments permanently". |
| Collapse `valueFrom: INPUT` into `${{ inputs.X }}` at the same time | It would subsume it, and `inputs` is deliberately left unreserved so that it can. But `valueFrom` is settled by [ADR 0026](0026-a-component-declares-requirements.md) §6 and load-bearing for `BP-CONN-002`, and folding it in here would put two freshly-decided things in one record. |

## Consequences

### Positive

- The value this opened with — `https://${{ self.publicHostname }}/oauth/cb` —
  is expressible, and nothing else in the contract expresses it.
- A blueprint can supply a literal value, which it could not before.
- One grammar, stated upstream of the implementation that already parses it.
- A malformed reference is rejected at authoring time rather than shipped to a
  container as literal text.
- No cycles, no depth budget, no ordering, and therefore no route back to the
  major version [ADR 0005](0005-platform-divergence-reconciliation.md) §2 warns
  about.
- Six namespaces are closed to authors before any document could claim one.

### Negative

- Breaking, on three families at once. Free only inside
  [ADR 0005](0005-platform-divergence-reconciliation.md) §1's window, and it
  still needs maintainer approval and a declared breaking change.
- `musher-dev/platform` must rename `platformDefault` to `default` and
  `fromRole` to `fromNode`, add `toNode` and `toInput`, and tighten its
  `reference_grammar` leaf to reject a malformed token it currently passes
  through. Its other five namespaces are unaffected: this record reserves those
  names and gives them no meaning here.
- `musher-dev/catalog` items carrying `fromRole` or `platformDefault` are
  rejected until they are re-authored.

### Neutral

- `valueFrom: INPUT` stands, and `inputs` stays unreserved so a later record can
  collapse the two.
- The five namespaces this record reserves without defining will each need their
  own decision before they resolve, and an author who writes one gets an error
  naming the reserved set rather than silence.
