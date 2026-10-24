# Musher Document Core Specification, version 2

**Status:** Stable
**Family:** `core`

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) and
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) when, and only when, they
appear in all capitals, as shown here.

> **What is normative.** This document defines the behaviour every Musher
> document family shares. It releases no JSON Schema of its own
> ([§10](#not-supported)). Each family's bundle is the executable form of that
> family's structural validity, and states this document's envelope rules for
> that family's documents. The [conformance corpus](../../../docs/conformance.md)
> (this document's own, and each family's) is the executable form for
> observable outcomes. This document, the corpora, and each family schema where
> it states a rule of this document are normative, and none is permitted to
> disagree with another. Examples, generated documentation, and validator
> message text are informative.
>
> A disagreement between two normative artifacts is a defect in this
> specification and blocks a release. Until it is fixed this document governs.
> That is how to read a broken specification, not a licence for a schema or a
> fixture to be wrong.

---

## <a id="scope"></a>1. Scope

The **Musher Document Core Specification** states the rules every Musher
document family shares: the document envelope, version compatibility, the
catalog item, the identifier grammars more than one family uses, the validation
phases and the YAML profile, the shared diagnostic codes, what a conformance
claim covers, and the security considerations every document raises.

It defines no `kind`. No document declares this specification, and no document
is validated against it alone. A document belongs to a family (today
[component](../../component/v2/spec.md), [blueprint](../../blueprint/v2/spec.md)
or [listing](../../listing/v2/spec.md)), and that family's specification applies
this one, fixing what [§1.1](#family-fixes) leaves open.

A family specification cites a clause of this document by its major version and
section, as `core v2 §6.1`, and always as a link to the clause's anchor
([§9](#core-releases)).

**Out of scope for this document**

- Every field inside `metadata` and `spec`: the family specification
- The JSON Schema a document is validated against: the family's bundle
- Runtime state, replicas, and endpoints: the Musher API

### <a id="bindings"></a><a id="family-fixes"></a>1.1 What a family fixes

This document leaves some things to the family that applies it. A family
specification MUST fix each of them in its §2, in a table whose columns are
headed "Left to the family" and "This family":

| Left to the family | What the family states | Read by |
|---|---|---|
| `kind` | The constant its documents declare. | [`CORE-ENV-002`](#CORE-ENV-002) |
| `metadata` | The section defining its `metadata` object: its identity fields and any description it requires. | [`CORE-ENV-003`](#CORE-ENV-003) |
| Fields accepting `null` | Each field that accepts `null`, with the section that justifies it, or that there are none. | [`CORE-ENV-007`](#CORE-ENV-007) |
| Item document | The file name its document takes at an item root, or that its documents sit inside an item rather than naming one. | [§4.1](#item-directory) |

A family specification MUST also declare its **normative dependencies**, in a
table headed "Normative dependencies" that follows the first table. Its columns
are headed "Specification" and "Major version", and each row names a
specification whose rules the family applies and, in the "Major version"
column, the major version it applies (`v2`). Every family names core. A family
that applies a rule another family defines names that family too, and the
dependencies decide the family's diagnostic registry ([§1.3](#terms)). Tooling
reads both tables, so they stay tables.

A family specification narrows this document where it says so and relaxes it
nowhere.

### <a id="admission"></a><a id="core-membership"></a>1.2 What belongs in core

This section is informative. The test is decided in
[ADR 0022](../../../docs/adr/0022-the-musher-document-core-specification.md) §2,
and restated here so a reader proposing a rule can apply it.

A rule belongs in this document only when **all three** of these hold:

1. **It can be stated without naming a kind.** A rule that names `COMPONENT`
   cannot bind a family that has no components.
2. **At least two families apply it.** A rule only one family applies is that
   family's rule under another name.
3. **Within the major version, it can only grow by addition.** A release of this
   document reaches every family at once, so narrowing one of its rules is a new
   major version of every family.

A rule that looks shared can still fail the first condition. Component's value
schemas are applied by component and by blueprint, and they stay in
[component §6.3](../../component/v2/spec.md#value-schema): they are the grammar
of a block only a component defines, and blueprint reaches them through its
declared dependency on component.

### <a id="terms"></a>1.3 Terms

These terms are defined once, here, and used with these meanings throughout
this document and every family that applies it.

- A **Musher document** is a YAML file with the envelope of [§2](#envelope),
  written by a person for Musher to read.
- A **family** is one kind of Musher document and its specification, released
  under its own tag prefix, such as `component/`. Core is the family with no
  kind.
- A **major version** is one incompatible generation of a family, named by
  `specVersion` (`v2`) and held in its own `v<N>` directory. Within a major
  version validation never becomes stricter ([§3](#compatibility)).
- A **core release** is one tagged release of this document, such as `2.0.0`, tagged `core/v2.0.0`
  ([§9](#core-releases)).
- A **catalog item** is a directory the catalog publishes as one unit
  ([§4.1](#item-directory)). Its **item documents** sit at its **item root**,
  and [§4.1](#item-directory) says which of its files are its component
  documents.
- A **placeholder** is a `${{ <namespace>.<path> }}` expression standing for a
  value the document cannot contain ([§5.2](#placeholder-grammar)). Its
  **namespace** is one of a closed, reserved set.
- A **validation phase** is one ordered step of validation: `parser`,
  `structural`, `semantic`, `admission` or `resolution` ([§6](#validation-phases)).
- A **stage** is one ordered step of the `resolution` phase
  ([§6.4](#resolution-stages)). "Stage" means nothing else.
- A **validation scope** is how far a validation result reaches, one of
  `parser`, `structural`, `document`, `publication` and `deployment`
  ([§6.1](#validation-scope)). A conformance claim names a scope too.
- A **deferred obligation** is a rule a validation scope requires that could
  not be decided with the context supplied.
- A **diagnostic** is one reported condition: a code, a phase, and a JSON
  Pointer into the submitted document ([§7](#diagnostics)).
- A family's **diagnostic registry** is every code its documents may be
  reported with: its own diagnostics table, core's ([§7](#diagnostics)), and
  the tables of the families it declares as normative dependencies
  ([§1.1](#family-fixes)). It lists, for each code, every phase that may report
  it.

### <a id="migration"></a>1.4 Migration from v1

Core v2 supersedes core v1, which is a retired major version: it is tagged and
its released bytes stay at their pinned URLs, but it has no directory on the
main branch and receives no further release. Core v2 renames what core v1 named
ambiguously, declares the phases its families already used, and replaces two
competing lists of validation profiles with one lattice. No rule changes meaning
beyond what this table states.

<!-- vale MusherSpecifications.Terms = NO -->

| v1 | v2 | Why |
|---|---|---|
| `specVersion: v1` | `specVersion: v2` | A new major version of every family. |
| "reference", "reference grammar" (`${{ }}`) | "placeholder", "placeholder grammar" | "Reference" now means only a document reference. |
| `CORE-REF-001`, `CORE-REF-002`, `CORE-REF-003` | `CORE-PLACEHOLDER-001`, `CORE-PLACEHOLDER-002`, `CORE-PLACEHOLDER-003` | They follow the term. |
| `ERR_MALFORMED_REFERENCE` | `ERR_MALFORMED_PLACEHOLDER` | They follow the term. |
| `ERR_UNKNOWN_REFERENCE_NAMESPACE` | `ERR_UNKNOWN_PLACEHOLDER_NAMESPACE` | They follow the term. |
| `ERR_REFERENCE_NOT_IN_SCOPE` | `ERR_NAMESPACE_NOT_PERMITTED` | It names the condition: a family permits namespaces at a position, and "scope" now means validation scope. |
| Reserved namespace `output` | `nodes` | A value comes from a node, and an output never "publishes". |
| Phase `capability` | `admission` | It decides admission to the catalog or to a deployment; "capability" had four senses. |
| Phase `resolution`, used but undeclared | Declared, with stages `sources`, `parameters`, `allocation`, `connections`, `values`, `build`, `environment`, `record` | Diagnostics already reported it. `sources` is new and runs first, pinning content; `build` is new and runs after `values`, whose results its build secrets read. |
| Validation profiles `structural`, `document`, `publication`, `deployment`; conformance profiles `parser`, `structural`, `offline`, `platform` | One validation scope lattice: `parser`, `structural`, `document`, `publication`, `deployment` | Two lattices described one thing. `offline` is `document`; `platform` is `publication` or `deployment`. |
| Result field `validationProfile` | `validationScope` | "Profile" had seven senses. |
| Behavioural "profiles" | Behaviour suites | The same reason. |
| "label grammar", `x-musher-grammar: label` | "DNS-label grammar", `x-musher-grammar: dns-label` | It is the DNS label of RFC 1123, and "label" alone collides with UI labels. |
| §1.1 "Bindings", column "Core parameter" | §1.1 "What a family fixes", column "Left to the family" | "Binding" and "parameter" are blueprint concepts. |
| §1.2 "Admission" | §1.2 "What belongs in core" | "Admission" is a phase. |
| "edition" | "core release" | A release of this document is a release. |
| "line", "compatibility family" | "major version" | One term for one concept. |
| "Unsupported capabilities" | "Not supported in v2" ([§10](#not-supported)) | Each row states how it closes, and every row closes by relaxation. |
| `ERR_INVALID_NUMBER`, with no requirement ID | `CORE-YAML-013` | Every rule a document can violate carries an ID. |
| `ERR_INVALID_YAML`, with no requirement ID | `CORE-YAML-014`, and [`CORE-ITEM-002`](#CORE-ITEM-002) for a YAML file of an item | The same reason. A component document of an item is defined once ([§4.1](#item-directory)). |
| A "reserved" namespace, meaning one with no meaning yet | An unassigned namespace. "Reserved" names all eight ([§5.2](#placeholder-grammar)) | Every namespace in the set is reserved; only four have no meaning. |
| Placeholder segment `^[a-z][a-zA-Z0-9]*$` | `^[a-z]$`, or `^[a-z][a-zA-Z0-9-]*[a-zA-Z0-9]$` | A DNS-label name, such as a node name, is addressable. Every v1 segment is still accepted. |
| "tag line" | "tag prefix" | It names the prefix a family's tags share, such as `component/`. |

<!-- vale MusherSpecifications.Terms = YES -->

Every section that was renamed keeps its v1 anchor beside its new one, so a
link into core v1's structure still lands on the clause that replaced it.

## <a id="envelope"></a>2. Document envelope

Every Musher document shares one envelope:

```yaml
specVersion: v2
kind: <KIND>
metadata: { … }
spec: { … }
```

| ID | Field | Requirement |
|---|---|---|
| <a id="CORE-ENV-001"></a>`CORE-ENV-001` | `specVersion` | REQUIRED. Declares the major version of the document format, independent of any API URL version. |
| <a id="CORE-ENV-002"></a>`CORE-ENV-002` | `kind` | REQUIRED. MUST be the constant the family specification fixes ([§1.1](#family-fixes)). |
| <a id="CORE-ENV-003"></a>`CORE-ENV-003` | `metadata` | REQUIRED. Identity, and any description the family requires. |
| <a id="CORE-ENV-004"></a>`CORE-ENV-004` | `spec` | REQUIRED. The definition itself. |

<a id="CORE-ENV-005"></a>**`CORE-ENV-005`**: unknown properties MUST be
rejected with `ERR_UNKNOWN_FIELD` at every level, not only at the root of the
envelope. A misspelled field is an error, never a silently ignored one,
including when the misspelled field is optional, where ignoring it would
silently substitute the default. A property that *is* defined, by a schema
release the validator does not hold, is the same error for a reason
[§3](#compatibility) gives.

<a id="CORE-ENV-006"></a>**`CORE-ENV-006`**: a validator encountering a
`specVersion` it does not support MUST reject the document with
`ERR_UNSUPPORTED_SPEC_VERSION` and MUST NOT attempt a best-effort
interpretation. A validator that holds only v2 therefore rejects a
`specVersion: v1` document.

<a id="CORE-ENV-007"></a>**`CORE-ENV-007`: an optional field is omitted,
not written `null`.** A field accepts `null` only where `null` means something
omission does not, and a family specification names each field that accepts
`null` ([§1.1](#family-fixes)). A field written `null` outside those places is
rejected in the `structural` phase with `ERR_INVALID_TYPE`. This rule is here
rather than beside each field because it is a property of the whole document
format: a three-state field (absent, `null`, present) modelling a two-state idea
is three states in every SDK generated from a family's schema, forever, and
nothing reads the third.

> **Note.** This envelope is deliberately not a Kubernetes-style
> `apiVersion: <group>/<version>`. `specVersion` is Musher's document-format
> discriminator and one convention beats two. See
> [ADR 0001](../../../docs/adr/0001-canonical-repository-architecture.md).

## <a id="compatibility"></a>3. Version compatibility

For the same document and pinned external context, a compatible release MUST
preserve acceptance and defined meaning: defaults, binding recipients,
placeholder selection, encodings and sensitivity. Moving a check between the
`structural` and `semantic` phases does not alter this guarantee. Changing
operational policy decided in the `admission` phase is separate and MUST NOT
silently rewrite document meaning.

`specVersion: v2` declares a **major version**, not an exact schema. A
validator MUST evaluate the document against the newest `2.x.y` schema release
it holds.

Within a major version, validation MUST NOT become stricter. A document that
validated against `2.0.0` MUST validate against every later `2.x.y`.

**A validator MUST reject unsupported constructs.** A document using only its
supported subset may be accepted even when authored against a newer release.
A field introduced in `2.3.0` is, to a validator holding `2.1.0`, a property
the schema does not define, and it is rejected in the `structural` phase with
`ERR_UNKNOWN_FIELD` like any other. A validator MUST NOT ignore, strip, or pass
through a property it cannot evaluate, and MUST NOT relax the rule on a claim
that the property is new: no such claim is verifiable.

**The code is `ERR_UNKNOWN_FIELD` because the validator cannot tell the two
cases apart.** `specVersion` names the major version, not the release, so
nothing in the document says which release it was written against. A field
from a later release and a misspelling are the same bytes to a validator that
holds neither definition. A code that said so, `ERR_SCHEMA_TOO_OLD`, would
require the validator to know what it is missing, which is precisely what it
does not have.

**Guessing is the failure [§2](#envelope) exists to prevent.** Ignoring a
misspelled optional field silently substitutes the default; a field from a newer
release is that hazard with a worse ending. The author wrote it, the schema
defining it exists, and the only party who cannot see it is the validator. A
document rejected for a field the operator can look up is recoverable. A
document accepted with that field dropped is not.

Because the diagnostic cannot name the cause, the implementation is where an
operator has to find it. An implementation SHOULD make the schema release it
evaluated against discoverable (in the diagnostic, in a `--version`-style
output, or both) and SHOULD name updating the validator among the remedies.
Message text is not normative ([§7](#diagnostics)), so this is a recommendation
about what an implementation surfaces, not about the words it chooses.

**Why the release is not pinned in the document.** Letting `specVersion` carry
`2.3.0` would turn this failure into `ERR_UNSUPPORTED_SPEC_VERSION`, which
names the cause exactly. That alternative is still rejected. `specVersion` is
the document-format discriminator and declaring a major version is the whole of
its job ([§2](#envelope)); pinning a release there asks every author to name a
floor they have no way to know, and makes a document that would validate
everywhere fail against the releases it never needed.

**The guarantee runs one way.** An old document validates against a new
validator; a new document does not validate against an old one. A field added in
`2.N.0` is therefore usable only where the consumer holds `2.N.0` or later,
and a document that must validate everywhere is written against the oldest
release its consumers hold.

**A retired major version keeps its bytes.** v1 is retired. Its releases stay
tagged, recorded in the ledger and served at their pinned URLs, so a document
pinned to a v1 schema still validates against exactly what it was written for.
Nothing in v2 is compatible with v1 by promise: moving a document to v2 is a
migration, and each family's "Migration from v1" section, with
[§1.4](#migration) here, states what it changes.

## <a id="items"></a>4. Items

Some rules are about a document's surroundings rather than its contents: that
its slug matches the directory holding it, that a path stays inside that
directory, that a sibling a family expects is beside it. This section defines
the surroundings those rules are measured against, once, and states the one of
them that every family shares.

### <a id="item-directory"></a>4.1 The item directory

A document does not always travel alone. Documents that belong together, such
as a blueprint and its sibling listing, belong to a catalog item
([§1.3](#terms)): a directory the catalog publishes as one unit.

An **item document** is a document whose file name its family specification
fixes ([§1.1](#family-fixes)). The directory containing an item document is the
**item root**. It is what [§4.2](#item-identity)'s rule is measured against,
and what a family's rules about paths inside an item are measured against.

**Item documents are siblings.** An item holding more than one item document
holds them in the same directory, so the directory containing one is the
directory containing the others, and an item has one item root however many
item documents it holds. A document whose family names no item document sits
inside an item rather than at its root, and has no item root of its own.

**A document with no directory has no item root.** Every rule measured against
an item root needs one, so an implementation handed a document rather than a
directory MUST NOT report any of them. It has not been given the means to check,
and a diagnostic it cannot substantiate is worse than a silence. Those rules are
deferred obligations instead ([§6.1](#validation-scope)).

<a id="component-documents"></a>**The component documents of an item.** A
**component document of an item** is a file under the item root, outside its
`media/` directory, whose name ends `.yaml` or `.yml`, that parses under the
YAML profile ([§6.2](#yaml-profile)) as a document declaring
`kind: COMPONENT`. Its family is component's, and it is defined here because
more than one family counts them: blueprint requires a node to reference each
one, and listing requires a component item to hold exactly one. A file whose
name ends `.yaml` or `.yml` is read to decide whether it is one, so it has to be
readable:

| ID | Rule | Phase | Diagnostic | Path |
|---|---|---|---|---|
| <a id="CORE-ITEM-002"></a>`CORE-ITEM-002` | Every file under the item root, outside `media/`, whose name ends `.yaml` or `.yml` MUST parse under the YAML profile. | `semantic` | `ERR_INVALID_YAML`, with a related location naming the file | `""` |

The rule is reported while validating an item document, and the file it names
is another file of the item, so the primary path is the item document's root
and the related location carries the file's item-relative path. Like every rule
measured against an item root, it is not reported for a document handed over
with no directory.

### <a id="item-identity"></a>4.2 Item identity

One rule binds an item document to the item holding it. It is `semantic`, it is
measured against the item root [§4.1](#item-directory) defines, and it reads a
field the item document's family defines in its `metadata`.

| ID | Rule | Diagnostic |
|---|---|---|
| <a id="CORE-ITEM-001"></a>`CORE-ITEM-001` | An item document's `metadata.slug` MUST equal the item directory name. | `ERR_SLUG_MISMATCH` |

A document handed over with no directory has no item root, and
[§4.1](#item-directory) says what that means for this rule.

**The item, not its siblings, is what an item document is measured against.**
An item's documents agree on their identity because each agrees with the one
directory holding them, never by being compared with one another. Nothing here
requires an item to hold any particular item document, or two of them to agree
on anything beyond the name they share with their directory. What a family's
other `metadata` fields count is that family's to say:
[blueprint §3](../../blueprint/v2/spec.md#identity) says what an item's revision
counts, and [component §4](../../component/v2/spec.md#metadata) says why a
component's is a different number.

## <a id="grammars"></a>5. Identifier grammars

A grammar named here is used by more than one family, and is stated once. A
family that uses one cites it. Schema sources reference generated shared grammar
definitions; the deterministic bundler embeds those definitions into each
self-contained bundle a family releases. Families do not independently maintain
the patterns.

### <a id="label-grammar"></a><a id="dns-label-grammar"></a>5.1 The DNS-label grammar

A **DNS label** matches `^[a-z][a-z0-9-]{0,61}[a-z0-9]$`: a lowercase letter, then
up to sixty-one lowercase letters, digits or hyphens, then a lowercase letter or
a digit. It is two to sixty-three characters long, a subset of the host-name
label of [RFC 1123](https://www.rfc-editor.org/rfc/rfc1123) §2.1, and it is the
grammar [ADR 0007](../../../docs/adr/0007-naming-conventions.md) §4 gives an
identifier that is composed into a host name or materialised under its own name.
`metadata.slug`, a blueprint node name and a component volume name all take it.
A schema source marks a field that takes it with `x-musher-grammar: dns-label`
([§10](#not-supported)).

The grammar carries no requirement ID. The rule a document violates is its
family's rule that a field takes the grammar, and a value outside it is rejected
in the `structural` phase with `ERR_INVALID_VALUE`.

### <a id="reference-grammar"></a><a id="placeholder-grammar"></a>5.2 The placeholder grammar

A **placeholder** names a fact this document cannot contain. It is written
`${{ <namespace>.<path> }}`, and it stands where a value would stand:

```yaml
template: "https://${{ self.endpoints.web.publicHostname }}/oauth/cb"
```

A document is sealed before the thing it describes exists. The address that
deployment will answer on is assigned afterwards, so no author can write it
down, and no field can carry it. A placeholder is how a document names it
anyway.

Placeholders use single-pass substitution, without functions, operators,
conditionals, arithmetic, recursive expansion or fallback expressions.
Families explicitly identify the permitted positions and namespaces.

**The grammar.** A placeholder is `${{`, optional whitespace, a namespace, one
or more `.`-separated segments, optional whitespace, and `}}`. A namespace is
one of the names this section reserves. A segment matches
`^[a-z]$|^[a-z][a-zA-Z0-9-]*[a-zA-Z0-9]$`: a lowercase letter, then letters,
digits and hyphens, never ending in a hyphen. It accepts every lowerCamelCase
name and every DNS label ([§5.1](#dns-label-grammar)), so a node name such as
`web-ui` is addressable, and it excludes `.`, so a dotted path is read one way.
Whitespace inside the braces is insignificant; this specification and the
examples write one space inside each brace pair.

**The escape.** `$${{` is the only escape. It is a single four-character
sequence rendering a literal `${{`, and not per-`$` doubling. A `$` that begins neither
`${{` nor `$${{` is literal and needs no escape.

**What a placeholder yields.** A placeholder occupying a whole value yields the
value it names. A placeholder with text around it yields that value's string
form, joined with the surrounding text. A whole placeholder preserves the
logical type of the value it names. Families define where string composition is
permitted and the encoding used there.

**A resolved value is never scanned again.** The text a placeholder yields is
substituted, and a `${{` within it is literal. Substitution is non-recursive.
This does not eliminate value dependencies between explicit input and output
bindings; their ordering belongs to blueprint.

**Where a placeholder may be written.** Nowhere, unless a family says so. A
family opens a named position and names the namespaces it permits there, and a
`${{` anywhere else is text. No family may open a position whose value decides
identity or drives resolution itself (a `kind`, a `specVersion`, a mapping key,
or a document reference), because a placeholder there would have to be
resolved before the document could be read.

<a id="CORE-PLACEHOLDER-001"></a>**`CORE-PLACEHOLDER-001`**: in a position a
family opens to placeholders, an unescaped `${{` MUST begin a well-formed
placeholder. A malformed one is rejected in the `semantic` phase with
`ERR_MALFORMED_PLACEHOLDER`, at the position holding it.

An unclosed `${{`, a namespace with no path, and a path with no namespace are
each one keystroke from a placeholder an author meant to write. Treating them as
text carries the mistake through validation, through publication, and into the
deployed thing as the literal characters, where it is discovered by whatever
reads the value and fails.

<a id="CORE-PLACEHOLDER-002"></a>**`CORE-PLACEHOLDER-002`**: a placeholder's
namespace MUST be one this section reserves. `semantic`,
`ERR_UNKNOWN_PLACEHOLDER_NAMESPACE`, at the position holding the placeholder.

<a id="CORE-PLACEHOLDER-003"></a>**`CORE-PLACEHOLDER-003`**: a placeholder's
namespace MUST be one the family permits at that position. `semantic`,
`ERR_NAMESPACE_NOT_PERMITTED`, at the position holding the placeholder.

**The reserved namespaces** are `self`, `parameters`, `variables`,
`connections`, `deployment`, `environment`, `organization` and `nodes`. The set
is closed. An author cannot extend it, and a family permits names from it rather
than adding to it.

| Namespace | Names | v2 |
|---|---|---|
| `self` | The addressing of the thing the value is bound to. | Defined by the family that permits it. |
| `parameters` | A value supplied when a blueprint is deployed. | Unassigned. |
| `variables` | An organization variable, as visible to the environment a deployment reads variable values from. | Defined by blueprint parameters' `from`. |
| `connections` | A connection ([component v2 §1.1](../../component/v2/spec.md#terms)). | Defined by blueprint parameters' `from`. |
| `deployment` | Facts about the deployment, such as `deployment.creator.*`. | Defined by blueprint parameters' `from`. |
| `environment` | The environment a deployment reads variable values from. | Unassigned. |
| `organization` | Facts about the owning organization. | Unassigned. |
| `nodes` | A value another node of the same blueprint produces. | Unassigned. |

An **unassigned** namespace is a reserved one with no meaning in any document of
any family in this major version. No family permits one, so writing it is
`CORE-PLACEHOLDER-003`. Reserving it is what keeps it from ever becoming a name
an author can address with another meaning. The set may grow by addition within
this major version; an unassigned name may be given a meaning, and no name
leaves the set.

Namespaces name a concept and never a vendor. A closed set has nothing to
collide with, so the convention that prefixes a flat keyspace does not apply
here.

**A diagnostic quotes the placeholder, never the value.** An implementation
reporting any of the three rules above MUST reproduce the placeholder as written
and MUST NOT include a value it resolved or attempted to resolve, on the terms
[§11](#security) sets for resolved configuration values. Behavioural conformance
cases exercise that obligation.

## <a id="validation-layers"></a><a id="validation-phases"></a>6. Validation phases

Validation runs in five phases. An implementation MUST apply them in order and
MUST NOT report a later-phase diagnostic before the earlier phases pass.

| Phase | Enforces | Where it runs |
|---|---|---|
| `parser` | The Musher YAML profile: [§6.2](#yaml-profile). | Client and server |
| `structural` | The family's JSON Schema 2020-12 document. | Client and server |
| `semantic` | Rules JSON Schema cannot express: placeholder grammar and namespaces, path containment, uniqueness across collections, agreement between the documents of one item. | Client and server |
| `admission` | Obligations that need authorized platform context: account, region and quota checks, and catalog and publication obligations, such as a revision that must exceed every published one. | Server only |
| `resolution` | Turning an admitted blueprint revision into one deployment's values, in the stages of [§6.4](#resolution-stages). | Server only |

An evaluator MUST NOT access the network in the `parser`, `structural`, or
`semantic` phases. The `admission` and `resolution` phases read context an
authorized resolver acquired and pinned: catalog entries, account policy,
organization variables, connections and deployment facts. Neither phase fetches
a URL a document selects. The one acquisition a document directs is a workload
source: the `sources` stage of [§6.4](#resolution-stages) reads a git
`repositoryURL`, an image reference and a buildpacks builder image. That read
is acquisition by the authorized resolver under platform policy, not a fetch by
a phase, and the policy admits `https` alone: no other scheme, no `file:`, and
no address in a private, loopback or link-local range. Because the context is
pinned, a check over catalog-backed facts can also run offline against a
supplied copy of it.

**Why the `parser` phase rejects legal YAML.** A duplicate key, an anchor and
an alias are all well-formed YAML 1.2, and all three are rejected here.

A duplicate key has no defined winner: parsers disagree on whether the first or
the last survives, so a document carrying one means two things. An alias means
one thing, but only after expansion, and a document whose meaning depends on
being expanded is not readable as the thing it declares: the same reason
[§2](#envelope) rejects a misspelled optional field rather than ignoring it. An
anchor with no alias is inert, and is rejected anyway: an author who writes one
is reaching for a feature this format does not have, and finding that out at
authoring time is better than finding it out when the alias is added.

The bound also matters. Alias expansion is where a small document becomes a
large one (the billion-laughs shape), and a validator that must expand before
it can measure has no way to refuse cheaply.

`ERR_ANCHOR_OR_ALIAS` is separate from `ERR_INVALID_YAML` because the two say
different things to an author. One means the document is malformed; the other
means it is well-formed and uses something this format withholds.

### <a id="coverage"></a><a id="validation-scope"></a>6.1 Validation scope

A validation result carries a status (`VALID`, `INVALID` or `INCOMPLETE`), its
`validationScope`, the phase it reached, its diagnostics and its deferred
obligations. Each deferred obligation identifies its rule, its document pointer
and the context that is missing.

The **validation scope** says how far a result reaches. The scopes form one
lattice, each containing every obligation of the one before it:

`parser` ⊂ `structural` ⊂ `document` ⊂ `publication` ⊂ `deployment`

| Scope | Obligations | Phases it runs |
|---|---|---|
| `parser` | The YAML profile. | `parser` |
| `structural` | The family's schema. | `parser`, `structural` |
| `document` | Every rule the document and the item holding it decide, including the documents it references. | `parser`, `structural`, `semantic` |
| `publication` | `document`, plus the obligations of publishing to the catalog. | the above, and `admission` |
| `deployment` | `publication`, plus deploying in one organization's account under its current policy, and resolving the deployment's values. | the above, and `resolution` |

A known failure takes precedence over incompleteness: a result with a
diagnostic is `INVALID`. Otherwise a result with a deferred obligation is
`INCOMPLETE`, and `VALID` means every obligation of the result's scope
completed. A `document` result without the item or dependency context it
requires is `INCOMPLETE`. No caller may interpret `INCOMPLETE` as approval.

A conformance claim names a scope from the same lattice ([§8](#conformance)),
so "conforms at `document`" and "validated at `document`" mean the same
obligations.

<a id="CORE-ADMISSION-001"></a>**`CORE-ADMISSION-001`**: a `publication` or
`deployment` result MUST NOT be `VALID` until every obligation of its scope,
including each deferred one, is completed. Synthetic catalog and account
fixtures may exercise these checks offline; a production implementation still
acquires and verifies its own authorized context.

### <a id="yaml-profile"></a>6.2 The Musher YAML profile

Musher documents are written in a **restricted profile of
[YAML 1.2.2](https://yaml.org/spec/1.2.2/)**, not in unrestricted YAML. This
section is that profile, and it governs every family built on this document. A
family specification inherits it rather than restating it.

Every restriction below withholds something YAML 1.2.2 permits. The reason is
uniform, and it is the one [§2](#envelope) gives for rejecting a misspelled
optional field: a document that means different things to different readers, or
that cannot be judged without unbounded work, is not a specification of
anything. A feature is therefore withheld when it is *legal but ambiguous*, not
when it is merely unusual.

**Encoding and framing**

| ID | Rule | Diagnostic |
|---|---|---|
| <a id="CORE-YAML-001"></a>`CORE-YAML-001` | A document MUST be encoded in UTF-8. Malformed UTF-8 is rejected before replacement decoding. | `ERR_INVALID_UTF8` |
| <a id="CORE-YAML-002"></a>`CORE-YAML-002` | A document MAY begin with a UTF-8 byte order mark. It carries no meaning and MUST be ignored. | None |
| <a id="CORE-YAML-003"></a>`CORE-YAML-003` | Line endings MAY be LF or CRLF, and carry no meaning. | None |
| <a id="CORE-YAML-004"></a>`CORE-YAML-004` | A file MUST contain exactly one YAML document. The `---` and `...` markers MAY be present; a stream carrying more than one document is rejected. | `ERR_MULTIPLE_DOCUMENTS` |
| <a id="CORE-YAML-014"></a>`CORE-YAML-014` | A file MUST be well-formed YAML 1.2.2: a stream the YAML grammar can parse. | `ERR_INVALID_YAML` |

A file holding two documents has no answer to "which one is the document", and
picking the first silently discards a thing the author wrote.

**Structure**

| ID | Rule | Diagnostic |
|---|---|---|
| <a id="CORE-YAML-005"></a>`CORE-YAML-005` | Every mapping key MUST be a string. A numeric, boolean, null, or complex key is rejected. | `ERR_NON_STRING_KEY` |
| <a id="CORE-YAML-006"></a>`CORE-YAML-006` | A mapping key MUST NOT appear twice. | `ERR_DUPLICATE_KEY` |
| <a id="CORE-YAML-007"></a>`CORE-YAML-007` | A document MUST NOT declare an anchor or an alias. | `ERR_ANCHOR_OR_ALIAS` |
| <a id="CORE-YAML-008"></a>`CORE-YAML-008` | A document MUST NOT use a merge key (`<<`). | `ERR_MERGE_KEY` |
| <a id="CORE-YAML-009"></a>`CORE-YAML-009` | A node MUST NOT carry an explicit tag: neither a custom tag (`!secret`) nor a core-schema tag (`!!str`). | `ERR_EXPLICIT_TAG` |

Mapping keys are property names in every schema this repository releases, and
`1:` resolving to the integer one on one parser and the string `"1"` on another
is the duplicate-key problem wearing a different hat.

A merge key is an alias by another name and is withheld for the same reason.
It is named separately because `<<` reads as a key rather than as an alias, so
an author who writes one is not told about aliases; they are told about `<<`.

An explicit tag overrides scalar resolution, and scalar resolution is exactly
what this profile fixes below. `!!str 5` and `5` differ only in a tag, and a
format in which the type of a value depends on an annotation beside it has no
stable reading.

**Scalar resolution**

Scalars resolve by the **YAML 1.2 core schema**, and by nothing else. `true`
and `false` are booleans; `null` and `~` are null; `on`, `off`, `yes`, and `no`
are strings, as YAML 1.2 requires and YAML 1.1 did not. A value whose intended
type is not the resolved one MUST be quoted.

This is the one place where naming the version does real work: a YAML 1.1
parser reads `no` as boolean false, and a `country: no` in a document read by
both is two different documents.

| ID | Rule | Diagnostic |
|---|---|---|
| <a id="CORE-YAML-013"></a>`CORE-YAML-013` | A numeric scalar MUST be finite, and an integer MUST lie within ±9007199254740991. | `ERR_INVALID_NUMBER` |

Other numbers use their finite binary64 representation. An integer outside the
safe range would be read exactly by one language and rounded by another, so the
same document would carry two different values.

**Bounds**

An implementation MUST reject a document exceeding any of these, and MUST accept
one that does not:

| ID | Bound | Limit | Diagnostic |
|---|---|---|---|
| <a id="CORE-YAML-010"></a>`CORE-YAML-010` | Document size | 1 MiB (1 048 576 bytes) | `ERR_DOCUMENT_TOO_LARGE` |
| <a id="CORE-YAML-011"></a>`CORE-YAML-011` | Nesting depth | 64 levels | `ERR_DEPTH_EXCEEDED` |
| <a id="CORE-YAML-012"></a>`CORE-YAML-012` | Scalar length | 64 KiB (65 536 bytes) | `ERR_SCALAR_TOO_LONG` |

The bounds are stated rather than left to implementations because "be sensible"
is not a bound: a document one validator accepts and another refuses on size is
not one format, and an author has no way to discover the limit except by
exceeding it somewhere.

Each is far above any document a person writes and far below what makes a
parser a denial-of-service surface. Document size MUST be measured before
parsing: a limit a parser can apply only after building the tree is not a limit
on the work it does. The alias ban already removes the billion-laughs shape;
these bound the cases it does not cover.

**What carries no meaning**

Key order, comments, indentation width, quoting style, and flow-versus-block
form are all presentation. Two documents differing only in these are the same
document, and an implementation MUST NOT derive meaning from any of them.

Because YAML 1.2 is a superset of JSON, a document written as JSON is a valid
Musher document and is read identically.

**At the byte boundary.** The byte boundary MUST use fatal UTF-8 decoding.
Profile errors and representation depth are checked before conversion to JSON,
and aliases are never expanded. Implementations return diagnostics rather than
conversion exceptions. A logical value may contain `null` where its value schema
explicitly permits it; that is separate from omitting an optional document field
([`CORE-ENV-007`](#CORE-ENV-007)).

### <a id="format-policy"></a>6.3 The `format` keyword

This clause is about the JSON Schema **keyword** `format`, not about any field
named `format` a family defines. The two are unrelated: such a field is the
family's, with its own rules, and no schema this repository releases uses the
keyword at all.

Should one ever appear, `format` is an **annotation and asserts nothing**. That
is the JSON Schema 2020-12 default rather than a shortcut: `format` constrains a
value only where the Format Assertion vocabulary is explicitly declared, and no
Musher schema declares it.

A validator MUST NOT reject a document because a value fails a `format`
keyword, and MUST NOT accept one it would otherwise reject because a value
satisfies one.

The reason is portability. `format` implementations differ (one library's
`uri` accepts what another's rejects, and `email` is worse), so a schema that
depended on `format` for rejection would validate differently depending on which
library a consumer happened to link. A rule that must hold everywhere is written
with an assertion keyword instead: `pattern`, `enum`, `minLength`, `const`. Where
a rule cannot be expressed that way, it belongs to the `semantic` phase and
carries a diagnostic of its own.

Adopting the Format Assertion vocabulary would make previously valid documents
invalid, so it is not available within a major version.

### <a id="resolution-stages"></a>6.4 Resolution stages

The `resolution` phase runs in stages, in this order. Blueprint defines what
each stage does; this document fixes their names and their order, so that every
family reports a resolution diagnostic in the same terms.

| Stage | What it settles |
|---|---|
| `sources` | Each node's workload source, pinned without building anything: a git ref resolved to a commit, an upload archive verified against its digest, a tag-only image reference resolved to an image digest, and a buildpacks builder image resolved to a digest. |
| `parameters` | Each deployment parameter's value, from its origin. |
| `allocation` | The addresses and identity facts allocated for each node's endpoints. |
| `connections` | Each connection parameter's selection. |
| `values` | Each binding's value, with every placeholder substituted. |
| `build` | Each git or upload source built from its pinned content into an image digest, with its build secrets read from the resolved values. |
| `environment` | Each node's environment variables, written from its inputs. |
| `record` | The resolution record of the deployment. |

A diagnostic reported in the `resolution` phase MUST name its stage. Stages run
in order, as phases do: a stage is not entered until the earlier stages
complete. A completed resolution establishes no authorization,
quota or placement grant beyond the moment it was decided.

## <a id="diagnostics"></a>7. Diagnostics

Diagnostic **codes** and the **phase** at which validation fails are normative.
Human-readable messages are not: implementations in different languages emit
different text and that is expected. A code identifies a condition, and its
registry lists every phase that may report it. A diagnostic reports the actual
phase where the condition was found, and a `resolution` diagnostic also reports
its stage ([§6.4](#resolution-stages)).

A diagnostic's primary `path` is a JSON Pointer into the submitted document.
A cross-document diagnostic anchors at an authored binding or document reference
(`componentRef`), and carries `related` locations, each with an `artifact`
naming the other document and its actual `path`. A missing component input
anchors at `componentRef`; an implementation MUST NOT invent blueprint output
fields or absent binding fields as diagnostic locations. Human-readable messages
and related artifact labels MUST NOT expose sensitive values.

The codes below apply to every document of every family. A family
specification's diagnostics table adds codes to them, and MUST NOT declare one
of them again: a code declared in two tables can be given two meanings, and one
code names one condition.

| Code | Phase | Meaning |
|---|---|---|
| `ERR_INVALID_YAML` | `parser`, `semantic` | The document is not well-formed YAML 1.2, or, in the `semantic` phase, a YAML file of its item is not ([§4.1](#component-documents)). |
| `ERR_INVALID_UTF8` | `parser` | The original bytes are malformed UTF-8. |
| `ERR_INVALID_NUMBER` | `parser` | A numeric scalar is non-finite or an unsafe integer ([§6.2](#yaml-profile)). |
| `ERR_DUPLICATE_KEY` | `parser` | The same mapping key appears twice. |
| `ERR_ANCHOR_OR_ALIAS` | `parser` | The document declares a YAML anchor or an alias. |
| `ERR_MULTIPLE_DOCUMENTS` | `parser` | The file carries more than one YAML document. |
| `ERR_NON_STRING_KEY` | `parser` | A mapping key is not a string. |
| `ERR_MERGE_KEY` | `parser` | The document uses a merge key (`<<`). |
| `ERR_EXPLICIT_TAG` | `parser` | A node carries an explicit YAML tag. |
| `ERR_DOCUMENT_TOO_LARGE` | `parser` | The document exceeds the size bound in [§6.2](#yaml-profile). |
| `ERR_DEPTH_EXCEEDED` | `parser` | The document nests deeper than [§6.2](#yaml-profile) permits. |
| `ERR_SCALAR_TOO_LONG` | `parser` | A scalar exceeds the length bound in [§6.2](#yaml-profile). |
| `ERR_UNSUPPORTED_SPEC_VERSION` | `structural` | `specVersion` is not a supported value. |
| `ERR_WRONG_KIND` | `structural` | `kind` does not match the family being validated. |
| `ERR_UNKNOWN_FIELD` | `structural` | A property not defined by the schema is present. |
| `ERR_MISSING_FIELD` | `structural` | A required property is absent. |
| `ERR_INVALID_TYPE` | `structural` | A value has the wrong type. |
| `ERR_INVALID_VALUE` | `structural` | A value violates a pattern, enum, or bound. |
| `ERR_SLUG_MISMATCH` | `semantic` | `metadata.slug` disagrees with the item directory name. |
| `ERR_MALFORMED_PLACEHOLDER` | `semantic` | An unescaped `${{` does not begin a well-formed placeholder ([§5.2](#placeholder-grammar)). |
| `ERR_UNKNOWN_PLACEHOLDER_NAMESPACE` | `semantic` | A placeholder names a namespace [§5.2](#placeholder-grammar) does not reserve. |
| `ERR_NAMESPACE_NOT_PERMITTED` | `semantic` | A placeholder names a reserved namespace the family does not permit at that position. |

## <a id="conformance"></a>8. Conformance

**A claim to conform to a family release covers two sets of cases**: the
release's own corpus, and the core corpus ([§8.1](#core-corpus)) of the core
release the family release records ([§9](#core-releases)). An implementation
conforms when it produces the declared outcome for every case in both that its
claimed scope requires. It MAY also run a later core v2 corpus, and MUST NOT
substitute one for the other.

Implementations MUST run the fixture corpus in their own CI. Passing a fixture
that is declared to fail is a conformance failure.

An implementation MUST declare the **validation scope** it claims, from the
lattice of [§6.1](#validation-scope). Conformance is not a single claim:
`admission` needs an account, a region and a quota, so an implementation a user
runs locally cannot reach `publication`, and an editor integration that checks
structure is a useful thing to be without being a control plane. Which cases
each scope requires, the behaviour suites claimed beside it, and the report
shape a claim should take are defined in
[docs/conformance.md](../../../docs/conformance.md#validation-scopes).

A skipped case is never a passed one. An implementation MUST NOT claim a scope
while skipping any case that scope requires.

### <a id="core-corpus"></a>8.1 The core corpus

The core corpus is [`specifications/core/v2/conformance/`](conformance/), and it
holds `parser` cases only. A `structural` case needs a schema, and this document
releases none; a case about an item needs a document of some family inside a
directory.

An adapter runs a core case through its parser alone. `expected: pass` means the
parser accepts the document, and no later phase runs. A core case's document
need not be a valid envelope, because no later phase reads it. Where it carries a
`kind`, that value is `COMPONENT` and has no effect, and an adapter MUST NOT
dispatch on it. The parser runs before a family is chosen, so an
implementation covering more than one family runs the core corpus once (once per
parser, where it has more than one).

Each family's corpus keeps one `parser` case, `parser-001-reject-duplicate-keys`.
It shows that the family's pipeline applies the YAML profile at all. It does not show
that the pipeline applies all of it, which is what the core corpus is for.

## <a id="editions"></a><a id="core-releases"></a>9. Core releases

This document has its own tag prefix, `core/`, as each family has. One
release of it is a **core release**.

**A family cites the major version, not the core release.** A family
specification cites this document as "core v2 §N" and never names an exact core
release in prose: a release number in prose would turn every core patch release
into a prose edit in every family. Every citation MUST be a link to the clause's
anchor. A section number standing alone is read as a section of the document it
appears in, so an unlinked `core v2 §6.1` in a family specification points a
reader at the family's own §6.1.

**A family release records the core release.** Each release of a family records
the core release it was built and tested against, and carries that release's
`spec.md` and corpus with it. A conformance claim against the family release
names that core release ([§8](#conformance)), so the two corpora the claim names
both exist and were tested together. How the core release is recorded, the
checks that hold a family release while this document has unreleased releasable
changes, and why its other unreleased changes only warn, are set out in
[ADR 0023](../../../docs/adr/0023-published-bytes-are-immutable-release-assets.md),
as [ADR 0037](../../../docs/adr/0037-the-repository-adopts-engineering-conventions-0-7-0.md)
§3 refines it.

**What a core release may change.** This paragraph is informative: it records
this repository's release policy. Within v2, a minor core release adds a clause,
a case or a relaxation, and adds a code only for a condition an earlier v2 core
release already rejects. No core release rejects a document an earlier v2 core
release accepted: that is [§3](#compatibility) applied to every family at once,
which is why [§1.2](#core-membership) accepts only rules that grow by addition. A
rule that needs narrowing is core v3, a new major version that each family
adopts in a major version of its own.

## <a id="known-debt"></a><a id="not-supported"></a>10. Boundaries, and what is not supported in v2

**Boundaries.** These are where this document stops, by design.

- **Family dispatch.** After the `parser` phase, a dispatcher rejects an unknown
  `kind` with the structural `ERR_WRONG_KIND`. An explicitly selected family
  uses the same code when the document's kind differs from the constant it
  fixes. Dispatch never precedes the `parser` phase.
- **Shared grammar ownership.** A family's schema sources mark a field that
  takes core's DNS-label grammar with `x-musher-grammar: dns-label`. Bundles
  inline its constraints from [§5.1](#dns-label-grammar), so released bundles
  are self-contained, and no source copy authors the pattern itself.
- **Endpoint semantics.** Component defines the `self` endpoint paths, as
  `self.endpoints.<name>.<property>`. Blueprint consumes that definition. Core
  defines placeholder syntax only.
- **Deployment facts.** The `deployment` namespace is defined only where
  blueprint parameters' `from` permits it.

**Not supported in v2.** Each row is something v2 does not do, and each closes,
if it ever does, by a relaxation inside v2: a document v2 rejects today becomes
acceptable, and no document v2 accepts today is rejected.

| Not supported | Today | How it closes |
|---|---|---|
| A core JSON Schema | Each family's bundle states the envelope for its own documents. [ADR 0022](../../../docs/adr/0022-the-musher-document-core-specification.md) §5 records why neither shared shape was worth publishing. | Releasing one. It rejects no document a family bundle accepts. |
| The unassigned namespaces `parameters`, `environment`, `organization` and `nodes` | Writing one is `ERR_NAMESPACE_NOT_PERMITTED` ([`CORE-PLACEHOLDER-003`](#CORE-PLACEHOLDER-003)). | A family permitting the namespace at a position, with a defined meaning. |
| Placeholder expressions: functions, operators, conditionals, arithmetic and fallbacks | Anything but a namespace and a dotted path inside `${{ }}` is `ERR_MALFORMED_PLACEHOLDER`. | Defining a syntax for one, inside `${{ }}`, that is malformed today. |

## <a id="security"></a>11. Security considerations

This section is addressed to **implementations**: what a validator, a CLI, or a
control plane must do so that reading an untrusted Musher document is safe.
[SECURITY.md](../../../.github/SECURITY.md) is the separate question of what counts as a
vulnerability *in this repository* and how to report one.

A Musher document is untrusted input. It arrives from a pull request, a
catalog submission, or a `POST` body, and every consideration below assumes its
author is hostile. Each family specification adds what is specific to its own
documents.

**Parsing.** [§6.2](#yaml-profile) is a security boundary as much as an
interoperability one. Aliases are refused because expansion is where a small
document becomes a large one, and the size bound is measured before parsing
because a limit applied after the tree exists is not a limit on the work done to
build it. An implementation MUST enforce all three bounds, and MUST NOT raise
them to accommodate a document that exceeds them.

An implementation MUST NOT resolve YAML tags to host language types. The tag ban
makes this unreachable through a conforming parser, but a parser configured to
construct arbitrary objects from tags is the classic deserialisation
vulnerability, and the ban is not a substitute for choosing a safe loader.

**Regular expressions.** Every `pattern` a Musher schema releases is free of
lookaround and backreferences, which is what lets it compile under RE2 as well as
under a backtracking engine. An implementation evaluating these patterns on a
backtracking engine SHOULD apply a match timeout regardless: the guarantee is
about the patterns published here, not about any the platform composes with them.

**Diagnostics.** An implementation MUST NOT include resolved configuration values
in a diagnostic message. Diagnostics are logged, attached to pull requests, and
printed in CI output, and a validator that echoes the value it rejected turns a
validation error into a disclosure.

**Paths inside an item.** A path a document names inside its item is a path an
implementation will open, chosen by the document's author. An implementation
MUST decide containment on the **resolved** location rather than on the string:
a path is an escape if what it resolves to lies outside the item root, whether it
got there by `../`, by an absolute path, or by a symbolic link inside the tree.

Symlinks are the case worth stating plainly. A link committed inside an item can
point anywhere the process can read, so an implementation MUST resolve links
before testing containment, and MUST treat a dangling link resolving outside the
root as an escape: containment is a property of the resolved location, not of
whether the target happens to exist. The conformance corpus fixtures this
directly; see [docs/conformance.md](../../../docs/conformance.md#case-trees).

An implementation MUST NOT follow a path outside the item root even when the
resulting file would be readable and would parse. The rule is about what a
reviewer of the item can see: a document that reaches outside the directory being
reviewed brings in something the review did not cover.

**Schema retrieval.** Every published bundle is self-contained: all `$ref`s
resolve inside `$defs`, and no validator needs a network request to evaluate a
document ([Using the schemas](../../../docs/using-schemas.md#offline)). An
implementation SHOULD vendor the schema at an exact version rather than fetching
it, and MUST verify what it fetches if it does: the `.sha256` beside each pinned
URL and `published.json` are there for that. A validator that resolves schemas
over the network at validation time is an SSRF primitive and a runtime
dependency on an origin it does not control.
