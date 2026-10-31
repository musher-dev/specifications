# Listing specification

A listing document presents one catalog item in the storefront: how it is
shown, categorised, and found. The item is a blueprint item or a component item.
A listing carries presentation only, and is never an input to deployment.

A listing is an [item document](../core/v2/spec.md#item-directory),
`listing.yaml`, at the root of the catalog item it presents.

## Versions

| Major | Specification | Examples | Released? |
|---|---|---|---|
| `v2` | [`v2/spec.md`](v2/spec.md) | [`v2/examples/`](v2/examples/) | Released from [`2.0.0`](https://github.com/musher-dev/specifications/releases/tag/listing%2Fv2.0.0). Every release is in [`published.json`](../../published.json) ([how to tell](../../docs/publication.md#draft-or-released)) |
| `v1` | Retired: v2 supersedes it, and its released bytes stay at their tags | | Released from [`1.0.0`](https://github.com/musher-dev/specifications/releases/tag/listing%2Fv1.0.0) |

What changed from v1, field by field:
[§1.2 Migration from v1](v2/spec.md#migration).

## Start here

1. The [core specification](../core/README.md), which this one applies
2. [§1.1 Terms](v2/spec.md#terms) and [§2 Document envelope](v2/spec.md#envelope),
   for what this family fixes
3. [§3 Identity](v2/spec.md#identity), and the item root
   [§3.1](v2/spec.md#item-directory) locates
4. [§4 Presentation](v2/spec.md#presentation), including
   [§4.1 The overview Markdown profile](v2/spec.md#overview-markdown)
5. [§5 Media](v2/spec.md#media), [§5.1 Resolution after
   ingest](v2/spec.md#media-resolution) and
   [§7 Diagnostics](v2/spec.md#diagnostics)

An implementation implements every section of this specification and of each
specification it builds on, together with the external specifications they cite.
This one cites [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/), for the
overview Markdown profile in §4.1, [RFC
3986](https://www.rfc-editor.org/rfc/rfc3986), the
[SPDX License List](https://spdx.org/licenses/) for `license`, and the PNG,
JPEG and WebP header layouts for media dimensions. The list above is where to
begin, not what to implement.

## Builds on

Core v2. The authoritative list is the "Normative dependencies" table in
[§2](v2/spec.md#envelope).

## Requirement IDs

| Prefix | Covers | Section |
|---|---|---|
| `LIST-ITEM` | Agreement between the listing and the item holding it | [§3](v2/spec.md#identity) |
| `LIST-URL` | The URL fields | [§4](v2/spec.md#presentation) |
| `LIST-TAG` | Tags | [§4](v2/spec.md#presentation) |
| `LIST-LICENSE` | The licence expression and its SPDX membership | [§4](v2/spec.md#presentation) |
| `LIST-MD` | The overview Markdown profile | [§4.1](v2/spec.md#overview-markdown) |
| `LIST-MEDIA` | Media files: existence, containment, size and dimensions | [§5](v2/spec.md#media) |

Every ID, the clause stating it, and the cases pinning it:
[listing/v2 in docs/traceability.md](../../docs/traceability.md#listingv2).

## Schema

| | URL |
|---|---|
| Major-version alias | `https://specifications.musher.dev/listing/v2/listing.schema.json` |
| Exact release | `https://specifications.musher.dev/listing/v2.<MINOR>.<PATCH>/listing.schema.json` |

Which one to use, and how to bind it, is in
[Using the schemas](../../docs/using-schemas.md). The schema is authored in
[`v2/schemas/src/`](v2/schemas/src/) and built with `task bundle`.
