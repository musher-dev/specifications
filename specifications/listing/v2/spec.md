# Musher Listing Document Specification v2

**Status:** Stable
**Family:** `listing`
**Schema:** `https://specifications.musher.dev/listing/v2/listing.schema.json`

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) when, and only when, they
appear in all capitals, as shown here.

> **What is normative.** This document, together with the
> [Musher Document Core Specification](../../core/v2/spec.md) it applies,
> defines the complete behaviour of this specification. The JSON Schema bundle
> is its executable form for structural validity, and the
> [conformance corpus](../../../docs/conformance.md) is its executable form for
> observable outcomes. Both are normative, and neither is permitted to disagree
> with this document or with the other. Schema `description` fields, examples,
> generated documentation, and validator message text are informative.
>
> A disagreement between two normative artifacts is a defect in this
> specification and blocks a release. Until it is fixed this document governs.
> That is how to read a broken specification, not a licence for the schema to
> be wrong.

---

## <a id="scope"></a>1. Scope

A **listing document** presents one catalog item in the storefront: how it is
shown, categorised, and found.

It carries presentation only. It MUST NOT influence how the workload runs: a
listing is never an input to deployment. The one field written for the moment
after deployment, `gettingStarted` ([§4](#presentation)), is shown to a person;
nothing reads it to deploy anything.

### <a id="terms"></a>1.1 Terms

- **Catalog**: the published collection of catalog items.
- **Storefront**: the interface people browse the catalog in.
- A catalog item is a blueprint item or a component item. "Catalog item" is
  core's term ([core v2 §1.3](../../core/v2/spec.md#terms)), and so is a
  [component document of an item](../../core/v2/spec.md#component-documents).
- **Blueprint item**: a catalog item whose root holds `blueprint.yaml`.
- **Component item**: a catalog item whose root holds no `blueprint.yaml` and
  exactly one component document ([`LIST-ITEM-002`](#LIST-ITEM-002)).
- **Overview**: `spec.overview`, the long Markdown body of a listing.
- **Getting started**: `spec.gettingStarted`, the Markdown a person reads right
  after a deployment of the item is running.
- **Overview Markdown profile**: the subset of CommonMark that `overview` and
  `gettingStarted` are written in ([§4.1](#overview-markdown)).
- **Media path**: an item-relative path, beginning `media/`, naming one image
  the item ships ([§5](#media)).
- **Overview image**: a Markdown image in `overview` or `gettingStarted`. It is
  a media path, and it is not part of the screenshot gallery.
- **Published media set**: the mapping from each media path to the location a
  consumer serves its bytes from ([§5.1](#media-resolution)).

A `description`, in every Musher family, is short plain text. A listing has no
`description` field: its long body is the overview, which is Markdown.

### <a id="migration"></a>1.2 Migration from v1

v2 is a new major version. Every v1 name it changes is listed here.

<!-- vale MusherSpecifications.Terms = NO -->

| v1 | v2 | Why |
|---|---|---|
| `specVersion: v1` | `specVersion: v2` | The major version this document is written against. |
| `spec.description` | `spec.overview` | "description" means short plain text in every family; the Markdown body is a different thing. |
| "description Markdown profile", "description image" | overview Markdown profile, overview image | They follow the field. The anchor `#description-markdown` is kept. |
| Diagnostic paths `/spec/description` | `/spec/overview`, or `/spec/gettingStarted` | They follow the field. |
| `spec.sourceRepoURL` | `spec.sourceRepositoryURL` | Words are spelled out; only `URL` stays an initialism ([ADR 0007](../../../docs/adr/0007-naming-conventions.md)). |
| `category: AI_ML` | `AGENTS` for an agent or an agent builder; `MODELS` for anything else | `AI_ML` named a technology rather than what a person browses for, and every agent stack would fit it ([§4.2](#vocabularies)). |
| `category: GAMING` | `MEDIA` | A game is entertainment; one shelf for it sits outside what the catalog offers. |
| `category: INFRASTRUCTURE`, for a database, cache, vector store or search engine | `DATABASES` | Kept, with a narrower meaning: `DATABASES` now holds the data stores it used to absorb. |
| "known debt" (`#known-debt`) | Not supported in v2 (anchor kept) | Each row now says how it closes, and every one closes by a relaxation. |
| "storefront" and "catalog" as synonyms | catalog, storefront ([§1.1](#terms)) | One concept per word. |
| the "label" grammar | the DNS-label grammar | Core v2 renames it ([core v2 §5.1](../../core/v2/spec.md#dns-label-grammar)). |
| a URL field: any characters but whitespace | printable ASCII other than space ([`LIST-URL-001`](#LIST-URL-001)) | The schema names the characters it admits, so a control character or a non-ASCII one cannot slip through a whitespace class. |

<!-- vale MusherSpecifications.Terms = YES -->

v2 is also stricter than v1 in these places, each of which closes a gap v1
could not close without a new major:

| New in v2 | Where |
|---|---|
| A component item holds exactly one component document | [`LIST-ITEM-002`](#LIST-ITEM-002) |
| Media files are bounded in size | [`LIST-MEDIA-004`](#LIST-MEDIA-004) |
| Media files are bounded in dimensions, at admission | [`LIST-MEDIA-005`](#LIST-MEDIA-005) |
| Every `license` identifier is one SPDX publishes, at admission | [`LIST-LICENSE-002`](#LIST-LICENSE-002) |
| An optional `gettingStarted` field | [§4](#presentation) |
| A `license` expression may hold one level of parentheses | [`LIST-LICENSE-001`](#LIST-LICENSE-001) |

## <a id="envelope"></a>2. Document envelope

```yaml
specVersion: v2
kind: LISTING
metadata: { slug: … }
spec: { itemType: …, displayName: …, … }
```

A listing document is a Musher document as the
[Musher Document Core Specification](../../core/v2/spec.md) defines one, and
every rule of core v2 applies to it. This family fixes what
[core v2 §1.1 (What a family fixes)](../../core/v2/spec.md#family-fixes) leaves to
a family:

| Left to the family | This family |
|---|---|
| `kind` ([`CORE-ENV-002`](../../core/v2/spec.md#CORE-ENV-002)) | `LISTING` |
| `metadata` ([`CORE-ENV-003`](../../core/v2/spec.md#CORE-ENV-003)) | [§3](#identity) |
| Fields accepting `null` ([`CORE-ENV-007`](../../core/v2/spec.md#CORE-ENV-007)) | None |
| Item document ([core v2 §4.1](../../core/v2/spec.md#item-directory)) | `listing.yaml` |

This specification narrows core v2 where it says so and relaxes it nowhere. It
cites core by its major version ("core v2 §N"), and the core release a release
of this family was built and tested against is recorded with that release
([core v2 §9](../../core/v2/spec.md#core-releases)).

**Normative dependencies**

| Specification | Major version |
|---|---|
| [core](../../core/v2/spec.md) | v2 |

## <a id="identity"></a>3. Identity

`metadata` carries `slug` and nothing else. It is bound by the rule stated once
for every family in [core v2 §4.2](../../core/v2/spec.md#item-identity):
[`CORE-ITEM-001`](../../core/v2/spec.md#CORE-ITEM-001) binds it to the item
directory name, measured against the item root [§3.1](#item-directory) locates.
`slug` follows the DNS-label grammar
([core v2 §5.1](../../core/v2/spec.md#dns-label-grammar)).

**A listing carries no revision, and the absence is deliberate.** A listing
presents an item; it does not publish one. What counts publications of a
blueprint item is the blueprint's `metadata.revision`
([blueprint §3](../../blueprint/v2/spec.md#identity)), and a component item is
counted by its component document's own
([component §4](../../component/v2/spec.md#metadata)). A copy of either number
on this document could only agree with the original or be wrong, and a reader
who found the two disagreeing would have no way to tell which one described
what would be deployed.
[ADR 0025](../../../docs/adr/0025-the-listing-carries-no-revision.md) records
the withdrawal, and the rule that policed the copy with it.

`spec.itemType` says which of the two kinds of catalog item this is, and the
item decides:

| ID | Rule | Phase | Diagnostic | Path |
|---|---|---|---|---|
| <a id="LIST-ITEM-001"></a>`LIST-ITEM-001` | `spec.itemType` MUST be `BLUEPRINT` if and only if the item root holds `blueprint.yaml`. | `semantic` | `ERR_ITEM_TYPE_MISMATCH` | `/spec/itemType` |
| <a id="LIST-ITEM-002"></a>`LIST-ITEM-002` | An item whose `spec.itemType` is `COMPONENT` MUST hold exactly one component document. | `semantic` | `ERR_COMPONENT_COUNT` | `/spec/itemType` |

Both are `semantic` because they read the item root rather than the document.
`LIST-ITEM-002` counts the item's
[component documents](../../core/v2/spec.md#component-documents) as core
defines them, and a YAML file of the item that does not parse is
[`CORE-ITEM-002`](../../core/v2/spec.md#CORE-ITEM-002)'s `ERR_INVALID_YAML`,
never a file the count skips.

**A classification the storefront renders should be a fact rather than a
claim.** `itemType` decides which shelf an item appears on, and it is the one
field here that something outside the document can settle. Left to the author
it is an assertion about a directory they may not have looked at: an item whose
`blueprint.yaml` was removed goes on advertising a blueprint nobody can
deploy, and an item that gained one goes on presenting itself as a single
building block. Without `LIST-ITEM-001`, both validate.

**A component item is one component.** A component item publishes one component
on its own. An item holding two has no document saying how they fit together,
which is what a blueprint is for; it is a blueprint item without its blueprint,
and the storefront would present a building block it cannot name. An item
holding none presents nothing. `LIST-ITEM-002` makes either one an error rather
than a shelf entry.

Do not confuse `kind` with `spec.itemType`. `kind` identifies the document
format, and [ADR 0007](../../../docs/adr/0007-naming-conventions.md) §1 reserves
the word for that; `itemType` identifies the kind of catalog item this document
presents.

### <a id="item-directory"></a>3.1 The item directory

`listing.yaml` is this family's item document, so the directory containing it is
the item root [core v2 §4.1](../../core/v2/spec.md#item-directory) defines. A
component item holds no `blueprint.yaml`, and it has a root all the same:
`metadata.slug` is measured against it, [§3](#identity) looks inside it, and
[§5](#media) resolves every media path within it.

```
<slug>/
  listing.yaml          this document
  blueprint.yaml        a blueprint item only
  components/           the component documents the item publishes
  media/                icon, screenshots and overview images
```

Two names in that tree are fixed: `listing.yaml`, and `media/` by
[§5](#media). Component documents MAY sit anywhere under the root.
`components/` is the convention
[blueprint §3.1](../../blueprint/v2/spec.md#item-directory) describes, and a
flat sibling is equally valid.

The no-directory rule of [core v2 §4.1](../../core/v2/spec.md#item-directory)
reaches §5 as well as §3. A listing handed over without a directory has no item
root, so an implementation in that position MUST NOT report
`ERR_ITEM_TYPE_MISMATCH`, `ERR_COMPONENT_COUNT`, `ERR_MEDIA_NOT_FOUND`,
`ERR_PATH_ESCAPE`, `ERR_MEDIA_TOO_LARGE` or `ERR_MEDIA_DIMENSIONS`: each of them
reads a root it has not been given.

## <a id="presentation"></a>4. Presentation

`displayName` is the item's title in the storefront. It is REQUIRED and at most
200 characters. It is the name a reader sees before anything else on the page,
and it is the item's own: a listing that repeats its category or its summary
here has given the storefront nothing to label the entry with.

`summary` is plain text, at most 280 characters, and MUST NOT be rendered as
Markdown. It is a one-line tagline; rendering it as Markdown turns an
underscore in a product name into emphasis and an asterisk into a bullet. This
is the first of three rules here that bind what a consumer emits rather than
what an author writes; [§4.1](#overview-markdown) states the second and
[§5.1](#media-resolution) the third.

`overview` is Markdown, at most 20 000 characters, written in the overview
Markdown profile ([§4.1](#overview-markdown)). It says what the item is and
when to choose it.

`gettingStarted` is Markdown, at most 5 000 characters, written in the same
profile and held to the same link, image and media rules, with the same
diagnostics reported at `/spec/gettingStarted`. It says what a person does
right after a deployment of the item is running: where to sign in, which
account to create first, what to open. It MAY name a parameter by its
`ui.label` ([blueprint §5.4](../../blueprint/v2/spec.md#deploy-form)), and it
SHOULD NOT hold a parameter's value or any credential. When the platform hands
a running deployment to a person, this is what it shows them, and an assistant
doing the same reads it rather than mining the overview for instructions. A
listing is public; anything written here is shown to everyone who browses the
catalog.

`homepageURL`, `sourceRepositoryURL`, and `supportURL` each carry one absolute
URL.

`category` and `lifecycleStage` are controlled vocabularies, described in
[§4.2](#vocabularies).

`tags` are discovery keys the storefront groups listings by. The vocabulary is
open: what a tag says is the author's, and only how it is spelled is this
specification's.

`license` names the licence of the listed software, as an SPDX licence
expression. The identifiers are published at <https://spdx.org/licenses/> and
are deliberately not restated here, for the reason
[ADR 0003](../../../docs/adr/0003-controlled-vocabulary-placement.md) §2 gives.

| ID | Rule | Phase | Diagnostic | Path |
|---|---|---|---|---|
| <a id="LIST-URL-001"></a>`LIST-URL-001` | `homepageURL`, `sourceRepositoryURL` and `supportURL` MUST each use the `https`, `http` or `mailto` scheme, in any case, MUST consist of printable ASCII characters other than space (U+0021 to U+007E), so no space, tab, CR, LF or other control character and no character outside ASCII, and are at most 2048 characters. | `structural` | `ERR_INVALID_VALUE` | the field |
| <a id="LIST-TAG-001"></a>`LIST-TAG-001` | Each member of `tags` MUST match `^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$`. | `structural` | `ERR_INVALID_VALUE` | the member |
| <a id="LIST-TAG-002"></a>`LIST-TAG-002` | A member of `tags` MUST NOT repeat, and there are at most sixteen. | `structural` | `ERR_INVALID_VALUE` | `/spec/tags` |
| <a id="LIST-LICENSE-001"></a>`LIST-LICENSE-001` | `license` MUST be an SPDX licence expression in the grammar below. | `structural` | `ERR_INVALID_VALUE` | `/spec/license` |
| <a id="LIST-LICENSE-002"></a>`LIST-LICENSE-002` | Each licence identifier in `license` MUST be on the SPDX License List release the platform pins, deprecated identifiers included, and each identifier after `WITH` on that release's exception list. | `admission` | `ERR_UNKNOWN_LICENSE` | `/spec/license` |

**The URL scheme set is [§4.1](#overview-markdown)'s.** `javascript:` in
`homepageURL` is the same stored injection as `javascript:` in an overview link,
and the storefront renders both. The rest of that rule is not shared: an
overview link may also be a fragment beginning `#`, and a fragment is not a
destination one of these fields can have.

**The scheme is compared case-insensitively, and this is stated because the
schema cannot state it.** [RFC 3986 §3.1](https://datatracker.ietf.org/doc/html/rfc3986#section-3.1)
makes a scheme case-insensitive while naming lowercase as the canonical form, so
`HTTPS://example.com` is legal but non-canonical input rather than a different
URL. The two placements of this rule must agree on it: a consumer that finds a
link destination parses it, and parsing normalises the scheme, whereas a JSON
Schema `pattern` carries no case-insensitive flag and must spell the
alternation out in character classes to reach the same answer. [§5](#media)
spells its extension alternation the same way for the same reason. An
implementation MAY canonicalise a scheme to lowercase before storing it; it
MUST NOT reject a document for the case of a permitted one.

**A tag is lowercase kebab-case, and the tags are a short set.** `Self-Hosted`,
`self hosted` and `self-hosted` being three tags rather than one is a defect the
grammar prevents instead of a normalisation every consumer has to reinvent, and
permitting one tag twice in a list would leave the same defect one step along.
The bound is what keeps a discovery key a discovery key: a list long enough to
hold every word in the overview is a list the storefront cannot group on.

**The licence grammar.** `LIST-LICENSE-001` fixes the shape. An identifier is
one to 64 of the characters `A-Z`, `a-z`, `0-9`, `.`, `+` and `-`. A term is an
identifier, or a group: `(`, two to nine identifiers joined by ` AND `, ` OR `
or ` WITH `, then `)`. An expression is a term, optionally joined to up to eight
more by the same operators, and is at most 256 characters. A group does not
nest, and holds at most nine identifiers. `(MIT OR Apache-2.0) AND Unicode-3.0` is in the grammar;
`((MIT OR Apache-2.0) AND BSD-3-Clause) OR GPL-2.0-only` is not
([§9](#not-supported)).

**Membership is an `admission` rule.** Whether an identifier is one SPDX
publishes depends on the SPDX License List release the platform pins, which is
the platform's state rather than this repository's: placement two in
[ADR 0003](../../../docs/adr/0003-controlled-vocabulary-placement.md) §1, with
its failure in the phase ADR 0003 §3 assigns. For `LIST-LICENSE-002`:

- identifiers compare case-insensitively, as SPDX defines;
- an identifier SPDX lists as deprecated, such as `GPL-2.0`, is on the list and
  is accepted: deprecation is SPDX's advice to authors, not a removal;
- a trailing `+` (the SPDX "or later" operator) is not part of the identifier
  it follows;
- an identifier beginning `LicenseRef-` names a licence the author defines, and
  is accepted without lookup;
- an identifier after `WITH` is looked up on the exception list, and every
  other identifier on the licence list;
- a group's parentheses are not identifiers.

`license: MTI` is a well-formed expression and fails `LIST-LICENSE-002`.
`license: LicenseRef-Acme-Enterprise AND MIT` passes it. A `license` is still
the author's claim rather than a verified fact, and [§10](#security) says what
the storefront may do with it.

Featured-row placement is **not** part of this specification. A listing
document MUST NOT declare `spec.featured`; promotion is a storefront operator's
action, not an author's. A document that declares it is rejected in the
`structural` phase with `ERR_UNKNOWN_FIELD`, like any other unknown property:
accepting it silently would let an author believe they had promoted their own
listing.

### <a id="overview-markdown"></a><a id="description-markdown"></a>4.1 The overview Markdown profile

`overview` and `gettingStarted` are
**[CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/)**, narrowed by the
three rules below. Naming a grammar and a version is deliberate: "Markdown" is
not one language, and a rule written against it is a rule each implementation
resolves against whatever parser it happened to have.

A listing is authored by a third party and rendered by the storefront, so both
fields are untrusted content displayed in a first-party origin. These are the
rules that make them safe to render. The reasoning is recorded in
[ADR 0004](../../../docs/adr/0004-listing-description-trust-boundary.md).

| ID | Rule | Phase | Diagnostic | Path |
|---|---|---|---|---|
| <a id="LIST-MD-001"></a>`LIST-MD-001` | The field MUST NOT contain raw HTML: an *HTML block* ([CommonMark §4.6](https://spec.commonmark.org/0.31.2/#html-blocks)) or *raw HTML* inline ([§6.6](https://spec.commonmark.org/0.31.2/#raw-html)). | `semantic` | `ERR_RAW_HTML` | the field |
| <a id="LIST-MD-002"></a>`LIST-MD-002` | A link destination MUST use the `https`, `http`, or `mailto` scheme, in any case (the comparison is [§4](#presentation)'s), or be a fragment beginning `#`. | `semantic` | `ERR_DISALLOWED_SCHEME` | the field |
| <a id="LIST-MD-003"></a>`LIST-MD-003` | An image destination MUST be a media path as defined by [§5](#media). | `semantic` | `ERR_IMAGE_NOT_LOCAL` | the field |

"The field" is `/spec/overview` or `/spec/gettingStarted`, whichever holds the
offending construct. Each field is one scalar, so there is no finer pointer to
give. All three rules are `semantic`: finding a link destination means parsing
the document, which no JSON Schema pattern can do. That is the same line
[§5](#media) draws between the media grammar it carries as a `pattern` and the
rules it cannot.

**A code fence is not raw HTML.** CommonMark tokenises a code span and a fenced
code block as their own constructs, so a listing MAY document `<script>` or an
embed snippet inside one and remain conforming. This is the reason the rule is
written in CommonMark's terms rather than as a search for angle brackets: a
lexical rule would reject the authors writing honest documentation, which is
most of them. Character entity references, such as `&amp;` and `&#39;`, are
likewise not raw HTML.

**The rule reaches the renderer.** A consumer rendering `overview` or
`gettingStarted` MUST NOT emit an HTML element, an attribute, or a URL that
this profile forbids, whether or not it validated the document first. It is
stated because an authoring rule alone would protect nobody: the document this
profile exists to stop is written by someone who will not run the validator.

This is the second of the three rules here that constrain an implementation's
output rather than a document, after [§4](#presentation)'s on `summary` and
before [§5.1](#media-resolution)'s on an overview image. All three are here
because what a consumer does with a listing is not settled by a rule about what
an author may write, and a rule each consumer resolves privately is not a
specification.

**An overview image is a media path, with everything that follows from it.**
[§5](#media) fixes `media/` as the one directory an item ships assets from, and
an overview image is held to the same grammar, so a remote image is not merely
discouraged: it is unspellable. It is a rule rather than a note because a
remote image discloses every storefront viewer's IP address and user agent to a
host the listing author chose, on every page view, with no interaction. Every
rule of §5 that reads the file reaches an overview image too, reported at the
field holding it: `LIST-MEDIA-001`, `LIST-MEDIA-002`, and the screenshot bounds
of `LIST-MEDIA-004` and `LIST-MEDIA-005`. `LIST-MEDIA-003` does not: it is about
the screenshot gallery, which an overview image is not part of. What the
destination resolves to for a consumer that does not serve the item directory
itself is [§5.1](#media-resolution).

**What this profile leaves open.** A link target is never fetched, so nothing
here decides whether a permitted scheme points somewhere hostile; that is a
moderation problem and not a validation one. Nor is there a bound on how many
links, images, or headings a field may hold beyond its length bound. Both are
decisions, not gaps: v2 will not narrow either.

### <a id="vocabularies"></a>4.2 Category and lifecycle stage

`category` and `lifecycleStage` are **fixed by this specification**: the schema
carries each as a closed `enum`, and a value outside it is rejected in the
`structural` phase with `ERR_INVALID_VALUE` at the field. That is
[ADR 0003](../../../docs/adr/0003-controlled-vocabulary-placement.md) §1's
placement one, and it is the right one for the reason that ADR gives: the test
is who decides membership, and a category becomes real when this repository
releases, not when an operator provisions something.

This is where the two fields stop resembling each other.

**`category` is an open taxonomy.** It is the field most likely to need
extension, and it is the one where the path of least resistance always points
the same way: a publisher whose item fits nothing reaches for a new value, and
no individual value is the one that does the damage. Adding a value is a minor
release and removing one is a new major, so growth is cheap in every single
case and irreversible in aggregate. The rule that governs it is editorial and
lives in [docs/governance.md](../../../docs/governance.md#changing-a-controlled-vocabulary),
because it is a process rule and that is where process rules live.

**The v2 set was reviewed once, against that rule.** A category answers "what
am I looking for", and the catalog's lead offering is agent stacks: agents,
workflow engines, model gateways, vector stores and chat frontends. v2 drops
`AI_ML`, which named a technology rather than a shelf and would have held every
item in such a catalog, and `GAMING`, a shelf outside what the catalog offers.
It adds `MODELS`, `DATABASES` and `OBSERVABILITY`, each of which would
otherwise have had to split an existing value later, which is the one kind of
addition the governance rule rejects. [§1.2](#migration) maps every dropped
value. The schema's `description` for `category` says what each value holds.

**`lifecycleStage` is a closed progression**, and does not share that rule.
`EXPERIMENTAL`, `BETA`, and `STABLE` are ordered, each claiming more about the
item than the one before, and `SUNSET` is terminal rather than a fourth point
on the scale: it says the item is going away, which is a statement about the
future and not about maturity reached. The ordering is stated because the
storefront sorts and filters on it, and a consumer that had to infer it from the
names would be inventing rules.

A new stage therefore changes what the storefront *means* rather than how it
sorts, and docs/governance.md gates one on an accepted ADR instead of the
category admission test.

**Neither field's values are restated here.** The schema is where they live,
and a second copy in prose is a copy that can disagree: the reasoning ADR 0003
§2 applies to a vocabulary published elsewhere, applied to one published here.

## <a id="media"></a>5. Media

`icon`, `screenshots[].file` and every overview image are media paths, resolved
inside the item root [core v2 §4.1](../../core/v2/spec.md#item-directory)
defines.

`screenshots` is the storefront gallery, in display order, and holds at most
twelve entries. The bound is on the gallery a person scrolls rather than on the
bytes an item ships: past a dozen, a reader has stopped looking and the entries
after that are cost with no reader. Each entry MAY carry a `caption`, plain text
of at most 280 characters, which is the accessible description of the image and
is shown beneath it.

A media path MUST satisfy all of the following, and is rejected in the
`structural` phase with `ERR_INVALID_VALUE` when it does not:

- it MUST be relative: a leading `/` is not accepted;
- its first segment MUST be exactly `media`;
- every segment after that MUST begin with a letter or a digit, which is how
  `.` and `..` are excluded as segments without a negative lookahead;
- every later character of a segment MUST be a letter, a digit, `.`, `_`, or
  `-`, which is how a space, a backslash and a control character are excluded;
- it MUST end in `.png`, `.jpg`, `.jpeg`, or `.webp`, in any case;
- it is at most 512 characters.

**`media/` is a stronger rule than "relative to the listing document".** One
fixed directory means a reader can find every asset an item ships without first
reading its listing, and a publisher can copy that directory without walking the
document to work out what to take. A path merely relative to the document buys
neither, and the two are easy to confuse because every conforming path satisfies
both.

The rules that need the file:

| ID | Rule | Phase | Diagnostic | Path |
|---|---|---|---|---|
| <a id="LIST-MEDIA-001"></a>`LIST-MEDIA-001` | A media path MUST resolve to a file that exists. | `semantic` | `ERR_MEDIA_NOT_FOUND` | the media path's field |
| <a id="LIST-MEDIA-002"></a>`LIST-MEDIA-002` | The resolved target MUST lie inside the item root. | `semantic` | `ERR_PATH_ESCAPE` | the media path's field |
| <a id="LIST-MEDIA-003"></a>`LIST-MEDIA-003` | Two screenshots MUST NOT share the same full item-relative path. | `semantic` | `ERR_DUPLICATE_MEDIA_PATH` | the later `/spec/screenshots/<n>/file` |
| <a id="LIST-MEDIA-004"></a>`LIST-MEDIA-004` | The icon file MUST be at most 1 MiB (1 048 576 bytes), and each screenshot and overview image file at most 5 MiB (5 242 880 bytes). | `semantic` | `ERR_MEDIA_TOO_LARGE` | the media path's field |
| <a id="LIST-MEDIA-005"></a>`LIST-MEDIA-005` | The icon MUST be square and at least 256 pixels per side, and each screenshot and overview image at most 4096 pixels per side, as the image header states them. | `admission` | `ERR_MEDIA_DIMENSIONS` | the media path's field |

The media path's field is `/spec/icon`, `/spec/screenshots/<n>/file`, or the
Markdown field holding an overview image.

**`ERR_PATH_ESCAPE` outlives the grammar.** The pattern above makes `..`
unspellable, so no path can escape by traversal. One can still escape by
symlink: `media/icon.png` pointing outside the item is a legal spelling
resolving to an illegal target. Containment is a property of the resolved
location rather than of the string, the same distinction
[core v2 §11](../../core/v2/spec.md#security) draws for every path inside an
item.

**Media identity is the full item-relative path**, compared case-sensitively.
`media/desktop/overview.png` and `media/mobile/overview.png` are distinct
assets. Gallery identity and publication resolution use the same key.

**Size is read from the filesystem, never by decoding.** `LIST-MEDIA-004`
measures the resolved file's length in bytes. It is `semantic` because an
offline validator can stat a file without reading it, and it applies only to a
file that exists inside the item root: a missing or escaping file is
`LIST-MEDIA-001` or `LIST-MEDIA-002`, never a size. The bounds are generous for
an image a page displays and small enough that the storefront can serve a
gallery without a second look at what it is serving.

**Dimensions are read from the image header, and only at admission.** The width
and height `LIST-MEDIA-005` reads are the ones the format's header states, in
the format the path's extension names (`.jpg` and `.jpeg` are JPEG):

- **PNG**: the `IHDR` chunk, the first chunk after the signature. An animated
  PNG is read the same way, so its dimensions are its canvas's.
- **JPEG**: the first start-of-frame segment, one of the markers `SOF0` to
  `SOF15` (`0xFFC0` to `0xFFCF`) other than `DHT` (`0xFFC4`), `JPG`
  (`0xFFC8`) and `DAC` (`0xFFCC`), reached by skipping each earlier segment by
  its length. That is the primary frame: a thumbnail inside an EXIF `APP1`
  segment is skipped with the segment and never read.
- **WebP**: the canvas size of the first chunk after the RIFF header, which is
  `VP8` followed by a space (lossy), `VP8L` (lossless) or `VP8X` (extended).

A file whose header does not state dimensions in that format, which includes a
file that is not in that format at all, fails `LIST-MEDIA-005` too.
The rule is `admission` rather than `semantic` so that the phases a client runs
never point an image parser at untrusted bytes ([§10](#security)); the platform
reads the header once, where a publication is admitted. A square icon of at
least 256 pixels is what the storefront can scale to every place it shows one;
4096 pixels per side is past any display the gallery fills.

### <a id="media-resolution"></a>5.1 Resolution after ingest

A media path is authoring-time input. It is written against the item root, and
the item root is a directory in the publisher's repository: a consumer that
ingests an item and serves it from somewhere else does not have one.

`icon` and `screenshots[].file` survive that move because they are fields. A
consumer reads them, takes the bytes, and rewrites each field to whatever it
serves them from; it knows exactly which properties hold a media path. An
overview image survives nothing, because it is inside a Markdown blob: nothing
enumerates it, so nothing rewrites it, and `media/overview.png` resolves
against a directory that is no longer there.

**The published media set is that mapping, named.** A consumer serving an item
from anywhere other than the item directory holds, for each media path the item
ships, the location it serves those bytes from. A consumer that rewrites `icon`
already has this mapping, because it is what the rewrite is, and this section
does no more than say an overview image is entitled to it.

**A consumer that rewrites `icon` or `screenshots[].file` to a location it
serves MUST resolve an overview image destination through the same mapping.**
The obligation carries no requirement ID: no document can violate it, so an
identifier on it would name a rule the corpus could never pin, which is what
[docs/conformance.md](../../../docs/conformance.md#requirements) reserves prose
for. It is cited by section, as the two output rules beside it are.

**The mapping is keyed on the media path**, whole and unmodified: not on the
basename, and not on the location the bytes end up at. This is why
`LIST-MEDIA-003` stops at the screenshot gallery rather than reaching every
media path, and why [§4.1](#overview-markdown) can exempt an overview image
from it: `media/desktop/overview.png` and `media/mobile/overview.png` are two
keys, and a consumer that shortened them to one would have made the collision it
was avoiding.

**The mapping always has an entry.** [§4.1](#overview-markdown) already holds
an overview image to `LIST-MEDIA-001`, so an item referencing an image it does
not ship is rejected before a consumer sees it. The obligation above is never
asked to resolve something the item did not publish, and a consumer holding an
overview image it has no entry for is holding a document that did not validate.

**An image that will not resolve is omitted, never made remote.** A consumer
that cannot resolve an overview image MUST NOT emit a remote URL in its place.
It MAY omit the `img` element and render the alt text instead, and that is the
behaviour this section expects of it. The failure mode being forbidden is the
helpful one: a storefront repairing a broken image by pointing it somewhere
reachable has reopened the beacon [§4.1](#overview-markdown) closed, on a page
the author no longer controls.

**This binds an implementation's output, which is the third such rule here.**
[§4.1](#overview-markdown) counts them, and the grounds are the same in each
case. Left unsaid, the resolution is invented once per consumer and in private.
That is the objection
[ADR 0004](../../../docs/adr/0004-listing-description-trust-boundary.md) opens
with, reaching one step further downstream than it did.

**No fixture pins this section.** The corpus validates documents, and nothing in
it can observe what the storefront emits: the limit ADR 0004 already records for
the renderer clause. It is a rule this specification states and cannot test, and
saying so is better than a fixture that appears to cover it.

## <a id="validation-phases"></a><a id="validation-layers"></a>6. Validation phases

As defined in [core v2 §6](../../core/v2/spec.md#validation-phases), and
written in the YAML profile
[core v2 §6.2](../../core/v2/spec.md#yaml-profile) states. This family's rules
run in four of the five phases:

| Phase | This family's rules |
|---|---|
| `parser` | None of its own |
| `structural` | The schema, including [`LIST-URL-001`](#LIST-URL-001), [`LIST-TAG-001`](#LIST-TAG-001), [`LIST-TAG-002`](#LIST-TAG-002) and [`LIST-LICENSE-001`](#LIST-LICENSE-001) |
| `semantic` | [`LIST-ITEM-001`](#LIST-ITEM-001), [`LIST-ITEM-002`](#LIST-ITEM-002), [`LIST-MD-001`](#LIST-MD-001) to [`LIST-MD-003`](#LIST-MD-003), [`LIST-MEDIA-001`](#LIST-MEDIA-001) to [`LIST-MEDIA-004`](#LIST-MEDIA-004) |
| `admission` | [`LIST-MEDIA-005`](#LIST-MEDIA-005) and [`LIST-LICENSE-002`](#LIST-LICENSE-002), when a listing is published |

A listing is never deployed, so it has no `resolution` rules.

## <a id="diagnostics"></a>7. Diagnostics

The codes in [core v2 §7](../../core/v2/spec.md#diagnostics) apply to every
document in this family. This family adds:

| Code | Phase | Meaning |
|---|---|---|
| `ERR_ITEM_TYPE_MISMATCH` | `semantic` | `spec.itemType` disagrees with what the item root holds. |
| `ERR_COMPONENT_COUNT` | `semantic` | A component item holds no component document, or more than one. |
| `ERR_MEDIA_NOT_FOUND` | `semantic` | A referenced media file does not exist. |
| `ERR_PATH_ESCAPE` | `semantic` | A media path resolves outside the item directory. |
| `ERR_DUPLICATE_MEDIA_PATH` | `semantic` | Two screenshots share a full item-relative path. |
| `ERR_MEDIA_TOO_LARGE` | `semantic` | A media file is larger than its bound. |
| `ERR_RAW_HTML` | `semantic` | `overview` or `gettingStarted` contains raw HTML. |
| `ERR_DISALLOWED_SCHEME` | `semantic` | A link in `overview` or `gettingStarted` uses a scheme outside the permitted set. |
| `ERR_IMAGE_NOT_LOCAL` | `semantic` | An image in `overview` or `gettingStarted` is not an item media path. |
| `ERR_MEDIA_DIMENSIONS` | `admission` | A media file's header states dimensions outside its bounds, or states none. |
| `ERR_UNKNOWN_LICENSE` | `admission` | A `license` identifier is not on the pinned SPDX License List release. |

## <a id="conformance"></a>8. Conformance

An implementation conforms to this specification when it produces the declared
outcome for every case in [this family's corpus](conformance/) and in the
[core corpus](../../core/v2/conformance/) at the core release the release
records ([core v2 §8](../../core/v2/spec.md#conformance)). It MUST declare the
validation scope it claims, as [core v2 §8](../../core/v2/spec.md#conformance)
requires. A skipped case is never a passed one.

The `admission` cases carry real image headers, because `LIST-MEDIA-005` reads
them. Every other media file in the corpus is empty, or, for `LIST-MEDIA-004`,
a run of zero bytes one past its bound: those rules read whether a file exists,
where it resolves and how long it is, never what it holds.

## <a id="not-supported"></a><a id="known-debt"></a>9. Not supported in v2

Each row is something v2 does not accept, with how it would be accepted. Every
row closes by a relaxation: accepting documents v2 rejects. Each is therefore a
minor release whenever someone needs it.

| Not supported | Why | How it closes |
|---|---|---|
| A `license` expression whose parentheses nest | A `pattern` cannot express nesting, and one level ([`LIST-LICENSE-001`](#LIST-LICENSE-001)) covers every expression the catalog uses | Admit a deeper level, or move the grammar check to `semantic` with a parser |
| A `DocumentRef-<id>:LicenseRef-<id>` licence reference | The grammar's identifier excludes `:`, and a listing has no SPDX document to refer to | Admit `:` in an identifier, with the reference accepted without lookup like `LicenseRef-` |
| Media formats other than PNG, JPEG and WebP, including SVG, GIF, AVIF and video | Each needs its own header rule, and SVG its own trust boundary, since it can carry script | Add the extension to the media path grammar, with its header rule in `LIST-MEDIA-005` |
| Presentation in more than one language | One `displayName`, `summary`, `overview` and `gettingStarted` per listing | Add optional per-language fields beside the existing ones, which stay the default |
| More than twelve screenshots, more than sixteen tags, or larger media | The bounds in [§4](#presentation) and [§5](#media) | Raise the bound |

Three rules here bind what a consumer emits, and no fixture can watch any of
them: [§4](#presentation)'s on `summary`, [§4.1](#overview-markdown)'s renderer
clause, and [§5.1](#media-resolution)'s on overview images. The corpus validates
documents and cannot observe what the storefront emits. None of them is a gap a
later version closes; each is stated, and saying it cannot be tested is better
than a fixture that appears to cover it. The same holds for `gettingStarted`'s
SHOULD NOT: whether a string is a credential is not something a validator can
decide.

## <a id="security"></a>10. Security considerations

[Core v2 §11](../../core/v2/spec.md#security) applies in full: a listing
document is untrusted input. This section adds what is specific to listing:
alone among the three kind families, its content is **rendered to other
people**.

**`overview` and `gettingStarted` are a stored-injection surface.**
[§4.1](#overview-markdown) is the trust boundary, and
[ADR 0004](../../../docs/adr/0004-listing-description-trust-boundary.md)
records why it is drawn where it is. Two things about it are security rules
rather than formatting ones.

The renderer obligation in [§4.1](#overview-markdown), that a consumer must not
emit an element, attribute, or URL the profile forbids *whether or not it
validated the document first*, is one of the three rules here that constrain
an implementation's output rather than a document, and it is the one with
teeth. Validation happens where a document is submitted; rendering happens
wherever the storefront runs, possibly against a document stored before a rule
existed. A renderer that trusts validation to have happened is a renderer that
will emit whatever is in the database.

The URL scheme rule covers `homepageURL`, `sourceRepositoryURL`, and
`supportURL` as well as links inside Markdown ([§4](#presentation)).
`javascript:` in a storefront field is the same stored injection as
`javascript:` in an overview link, and a renderer treats both as a link.

**Remote images disclose viewers.** [§5](#media) requires media to be a path
inside the item rather than a URL. A remote image would make every storefront
visitor's IP address and user agent visible to a host the listing's author
chose, turning a catalog page into a tracking beacon on behalf of a third
party.

That rule survives ingest or it was never a rule. [§5.1](#media-resolution)
forbids a consumer from substituting a remote URL for an overview image it
cannot resolve, and the clause is here as well as there because the
substitution is the *repair*: a storefront doing it is fixing a broken image,
not attacking anyone, and it reopens the beacon exactly as an author-supplied
remote image would. A consumer that cannot resolve one omits it.

**`gettingStarted` is public.** It is shown to everyone who browses the catalog
and to every deployer, so a value written there, a password or a token most of
all, is disclosed to all of them. That is why [§4](#presentation) lets it name a
parameter by its label and tells it not to hold one.

**Media paths are paths.** `ERR_PATH_ESCAPE` is the listing's form of the
containment rule; the symlink and resolved-location requirements
[core v2 §11](../../core/v2/spec.md#security) sets for every path inside an item
apply to it.

**Media bytes are read as little as possible.** An implementation MUST NOT
decode or transcode a media file in the `parser`, `structural` or `semantic`
phases, and at `admission` it reads only the image header
([§5](#media)). `LIST-MEDIA-004` needs a file's length, which the filesystem
gives without opening it, and `LIST-MEDIA-005` needs the header's width and
height, which sit in the first bytes of a PNG or WebP file and in a marker
segment a JPEG reader reaches by skipping lengths. No phase requires an image
decoder to be pointed at untrusted bytes, and the one phase that reads any of
them runs on the platform, not on a client.

**A checked shape is not a checked fact.** `license` is held to the SPDX
expression grammar and the pinned SPDX list, and a `tags` member to the
kebab-case grammar; none of them looks at whether the value is true. The
storefront MUST escape both on render and MUST NOT treat `license` as an
assertion about licensing: a well-formed expression naming a real licence is
still an author's claim about software this repository has never seen.
