# ADR 0046: The catalog is curated, and an organization publishes to its library

- **Status:** Accepted
- **Date:** 2026-11-07
- **Refines:** [ADR 0038](0038-v2-one-vocabulary-and-v1-retires.md) §9, the catalog is the curated collection
- **Relies on:** [ADR 0038](0038-v2-one-vocabulary-and-v1-retires.md) §1, term records are the authority for document vocabulary
- **Relies on:** [ADR 0038](0038-v2-one-vocabulary-and-v1-retires.md) §5, one scope lattice
- **Relies on:** [ADR 0003](0003-controlled-vocabulary-placement.md) §1, offerings are the platform's

## Context

[ADR 0038](0038-v2-one-vocabulary-and-v1-retires.md) §9 made the **catalog**
"the published collection" and the **storefront** the interface that browses
it. The v2 prose then gave that one word two roles (#221):

1. **Where a reference resolves and a lineage lives.** A catalog reference, a
   component's UUID with a revision, "resolves in the catalog". Component §4
   decides `COMP-ID-001` against "the catalog's lineage". Core's admission
   phase reads "catalog entries", and the `publication` scope adds "the
   obligations of publishing to the catalog".
2. **What a storefront offers.** The listing family presents "one catalog item
   in the storefront", and a listing is public: everything in it is shown to
   everyone who browses the catalog.

The two roles disagree about who sees what. An organization that publishes a
component for its own blueprints, and never means to offer it to anyone else,
has published to "the catalog" under the first reading and to a public,
curated collection under the second. The term records already showed the
strain: `catalog.blueprint-item` said a blueprint item holds `listing.yaml`,
while blueprint §3 says an item with no listing is deployable and not
browsable, and is not rejected.

The platform already draws the line. Pelorus models a Catalog bounded context
beside a Library. platform-console states that "Catalog and Library are
deliberate siblings". Platform ADR 0226 removed the cross-tenant Hub, so no
organization reads another's published documents. The specifications were the
one place where the two were a single word.

## Decision

### 1. Two terms

- The **catalog** is the curated, public collection of catalog items, each
  with a listing, that a storefront offers.
- An organization's **library** is the documents and items it has published
  for its own use. No storefront offers a library, and an item in one needs no
  listing.

Core §1.3 defines both, and listing §1.1 cites core. The term records are
`catalog.catalog` and a new `catalog.library`, each `associated` with the other
by `complements`. "Private catalog" and "organization catalog" become
discouraged aliases of library. Bare "library" gets no Vale rule: core §6.3
uses the word in its software sense, a library a validator links, and that
sense stays. The record lists it as a confusable.

### 2. A publication goes to a library or to the catalog

A **publication** admits a document or an item into an organization's library
or into the catalog, after every admission-phase obligation it carries has
completed. The `publication` validation scope is unchanged for both
destinations: the `document` obligations plus `admission`. A publication to a
library needs no listing. Listing an item in the catalog adds the listing
document's own obligations, which the listing family already states.

A component's lineage, the ordered sequence of its published revisions, is
held by the platform, whichever destination each publication went to.
`COMP-ID-001` reads that lineage.

### 3. A catalog reference resolves in the deploying organization's library and the catalog

A catalog reference resolves against the deploying organization's library plus
the catalog, and never against another organization's library. This is
platform policy, stated informatively in blueprint §4.1, and not a rule a
document can violate: the validation phases see only the components the
context supplies (`BP-REF-002`), and which components an authorized resolver
may acquire is the platform's to decide, as every offering is
([ADR 0003](0003-controlled-vocabulary-placement.md) §1).

### 4. The compound names keep their names

**Catalog item**, **catalog reference** and **catalog value** keep their names.
Each names a form, not membership: a catalog item is a directory published as
one unit, wherever it was published; a catalog reference is the UUID-and-revision
form of a component reference, whatever it resolves to; a catalog value is a
value of a platform vocabulary such as the compute or storage catalog. Each
record carries a confusable saying so. `catalog.catalog-item` is no longer
`part_of` `catalog.catalog`, and `blueprint.catalog-reference` `resolves-in`
both `catalog.library` and `catalog.catalog`.

### 5. No validation change

No requirement, diagnostic, schema or conformance case changes, and the
specifications gain no MUST. The prose that used "the catalog" for where a
reference resolves or where a lineage lives now says the library and the
catalog, published documents, or the platform. The records
`catalog.blueprint-item` (`listing.yaml` only once the item is listed),
`catalog.publication`, `component.lineage` and `core.admission-phase` follow
the same wording. The blueprint-item record now agrees with blueprint §3.

## Comparable systems

| System | Where a reference resolves | What is offered |
|---|---|---|
| GitHub Actions | `uses: owner/repo@ref` resolves any action the caller can read | Marketplace lists the subset whose authors chose to list them; listing changes nothing about `uses:` |
| Terraform | A source address names the public registry or a private registry by host | The public registry is the curated, browsable one; a private registry serves one organization |
| Operator Lifecycle Manager | A cluster's catalog sources, which may be private | OperatorHub is the public index people browse |
| W3C Data Catalog Vocabulary | A resource exists before any catalog describes it | A catalog record describes a resource; a resource need not have one |

Each separates what can be referenced from what is presented for discovery,
and in each the presentation is the smaller, curated set.

## Consequences

- Downstream glossaries adopt the two terms: platform-api, musher-cli and the
  SDKs say library for an organization's own publications and catalog for the
  curated, listed collection. Pelorus's `catalog.cml` (line 107) already
  matches.
- Every family releases the wording in its next release. No document's
  validity changes, so `task check:compat` replays every released case
  unchanged.
- A future rule that a document can violate about where a reference resolves
  would be a narrowing, and needs its own decision.

## Alternatives considered

**One umbrella catalog.** Keep "catalog" for every publication and qualify the
curated part as "the public catalog". It was rejected because it keeps the
word that #221 found ambiguous, and every sentence would need the qualifier to
say which collection it means.

**Rename "catalog reference".** Call it a "published reference" or a "UUID
reference" so it stops implying the catalog. It was rejected because it renames
a released term and its anchors for no change in meaning: the name describes
the form, and a confusable on the record says so at less cost.

**A named union term, such as "reference scope".** Name the set a catalog
reference resolves in. It was rejected because "scope" already means a
validation scope, one of the lattice's five values, and a second scope would
collide with it. "The deploying organization's library and the catalog" is
short enough to write out.

**A normative MUST against cross-organization references.** State in blueprint
§4.1 that a catalog reference MUST NOT resolve in another organization's
library. It was rejected because a new MUST that a document can violate makes
validation stricter inside v2, which core §3 forbids. No document carries the
organization it will be deployed by, so the rule could not be decided from the
document anyway; it is the resolver's policy.
