# Core specification

The Musher Document Core Specification states the rules every Musher document
family shares: the document envelope, version compatibility, the
[catalog item](v2/spec.md#item-directory),
the identifier grammars more than one family uses, the validation phases and
scopes, the YAML profile, the shared diagnostic codes, and what a conformance
claim covers.

Core **defines no kind** and **ships no schema**: each
[kind family](../README.md#kind-family) applies it, as
[How the families relate](../README.md#how-the-families-relate) explains. Its
own executable form is a parser-phase conformance corpus.

## Versions

| Major | Specification | Corpus | Released? |
|---|---|---|---|
| `v2` | [`v2/spec.md`](v2/spec.md) | [`v2/conformance/`](v2/conformance/) | Released from [`2.0.0`](https://github.com/musher-dev/specifications/releases/tag/core%2Fv2.0.0). Every release is in [`published.json`](../../published.json) ([how to tell](../../docs/publication.md#draft-or-released)) |
| `v1` | Retired. Its released bytes are kept in its tagged release archives and recorded in [`published.json`](../../published.json) | Retired | Released from [`1.0.0`](https://github.com/musher-dev/specifications/releases/tag/core%2Fv1.0.0); superseded by v2 |

v1 is a retired major version: it is tagged and recorded, but has no directory
on the main branch and receives no further release. v2 supersedes it, and
[§1.4 Migration from v1](v2/spec.md#migration) lists every name core v2 changed.

Core has its own tag prefix, `core/v<MAJOR>.<MINOR>.<PATCH>`. Each family release
records the core release it was built and tested against
([§9](v2/spec.md#core-releases)).

## Start here

1. [§1 Scope](v2/spec.md#scope), [§1.1 What a family fixes](v2/spec.md#family-fixes)
   and [§1.3 Terms](v2/spec.md#terms)
2. [§2 Document envelope](v2/spec.md#envelope)
3. [§4 Items](v2/spec.md#items)
4. [§6 Validation phases](v2/spec.md#validation-phases), including
   [§6.1 Validation scope](v2/spec.md#validation-scope) and
   [§6.2 The Musher YAML profile](v2/spec.md#yaml-profile)
5. [§7 Diagnostics](v2/spec.md#diagnostics) and
   [§8 Conformance](v2/spec.md#conformance)

An implementation implements every section of this specification, together with
the external specifications it cites: [YAML
1.2.2](https://yaml.org/spec/1.2.2/), for the YAML profile in §6.2. The list
above is where to begin, not what to implement.

## Builds on

Nothing. Core is the base: [component](../component/README.md),
[blueprint](../blueprint/README.md) and [listing](../listing/README.md) each
apply core v2 and say so in their own §2.

## Requirement IDs

| Prefix | Covers | Section |
|---|---|---|
| `CORE-ENV` | The document envelope | [§2](v2/spec.md#envelope) |
| `CORE-ITEM` | The YAML files of an item, and item identity | [§4.1](v2/spec.md#item-directory), [§4.2](v2/spec.md#item-identity) |
| `CORE-PLACEHOLDER` | The placeholder grammar and its reserved namespaces | [§5.2](v2/spec.md#placeholder-grammar) |
| `CORE-ADMISSION` | Completing every obligation of a publication or deployment scope | [§6.1](v2/spec.md#validation-scope) |
| `CORE-YAML` | The Musher YAML profile | [§6.2](v2/spec.md#yaml-profile) |

Every ID, the clause stating it, and the cases pinning it:
[core/v2 in docs/traceability.md](../../docs/traceability.md#corev2).
