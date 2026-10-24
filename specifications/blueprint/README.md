# Blueprint specification

A blueprint document is a graph of nodes. Each node deploys one component,
with the compute, storage, exposure and bindings that this use gives it, and
the blueprint names every value a deployment takes from outside the documents
as a deployment parameter. The blueprint is the unit of deployment.

A blueprint is an [item document](../core/v2/spec.md#item-directory),
`blueprint.yaml`, at the root of its catalog item. The component documents its
nodes reference sit inside the same item, or in the catalog.

## Versions

| Major | Specification | Examples | Released? |
|---|---|---|---|
| `v2` | [`v2/spec.md`](v2/spec.md) | [`v2/examples/`](v2/examples/) | Not yet. Every release is in [`published.json`](../../published.json) ([how to tell](../../docs/publication.md#draft-or-released)) |
| `v1` | Retired: v2 supersedes it, and its released bytes stay at their tags | | Released from [`1.0.0`](https://github.com/musher-dev/specifications/releases/tag/blueprint%2Fv1.0.0) |

What changed from v1, field by field:
[§1.2 Migration from v1](v2/spec.md#migration).

## Start here

1. The [core specification](../core/README.md) and the
   [component specification](../component/README.md), which this one applies
2. [§1.1 Terms](v2/spec.md#terms) and [§2 Document envelope](v2/spec.md#envelope),
   for what this family fixes
3. [§3 Identity](v2/spec.md#identity)
4. [§4 Node graph](v2/spec.md#node-graph), including
   [§4.2 Bindings](v2/spec.md#bindings)
5. [§5 Deployment parameters](v2/spec.md#parameters), including
   [§5.2 Origins and resolution](v2/spec.md#value-sources),
   [§5.3 Connections](v2/spec.md#connections), and
   [§7 Diagnostics](v2/spec.md#diagnostics)

An implementation implements every section of this specification and of each
specification it builds on, together with the external specifications they cite.
This one cites none of its own beyond those core and component cite. The list
above is where to begin, not what to implement.

## Builds on

Core v2 and component v2. The authoritative list is the "Normative
dependencies" table in [§2](v2/spec.md#envelope).

## Requirement IDs

| Prefix | Covers | Section |
|---|---|---|
| `BP-ID` | Item identity and description particular to a blueprint | [§3](v2/spec.md#identity) |
| `BP-GRAPH` | The node graph | [§4](v2/spec.md#node-graph) |
| `BP-REF` | Document references | [§4.1](v2/spec.md#component-reference) |
| `BP-BIND` | Bindings, what they name, and the value-dependency graph | [§4.2](v2/spec.md#bindings), [§5.1](v2/spec.md#recipients) |
| `BP-NODE` | Node compute, storage and exposure | [§4.3](v2/spec.md#node-compute), [§4.5](v2/spec.md#access) |
| `BP-ACCESS` | What the platform does for an exposure | [§4.5](v2/spec.md#access) |
| `BP-PARAM` | Deployment parameters, their recipients and origins | [§5](v2/spec.md#parameters) |
| `BP-PLACEHOLDER` | A parameter's `from` | [§5.2](v2/spec.md#value-sources) |
| `BP-RESOLVE` | Resolution, its stages and the resolution record | [§5.2](v2/spec.md#value-sources) |
| `BP-CONNECTION` | Connections | [§5.3](v2/spec.md#connections) |
| `BP-UI` | The deploy form | [§5.4](v2/spec.md#deploy-form) |

Every ID, the clause stating it, and the cases pinning it:
[blueprint/v2 in docs/traceability.md](../../docs/traceability.md#blueprintv2).

## Schema

| | URL |
|---|---|
| Major-version alias | `https://specifications.musher.dev/blueprint/v2/blueprint.schema.json` |
| Exact release (after first release) | `https://specifications.musher.dev/blueprint/v2.<MINOR>.<PATCH>/blueprint.schema.json` |

Which one to use, and how to bind it, is in
[Using the schemas](../../docs/using-schemas.md). The schema is authored in
[`v2/schemas/src/`](v2/schemas/src/) and built with `task bundle`.
