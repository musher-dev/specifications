# Blueprint specification

A blueprint document describes a composition of components into one deployable
application: which components participate, which values supply their inputs, how compute,
storage and public exposure are allocated, and what the installation takes from
outside the documents as parameters. The blueprint is the unit of deployment.

A blueprint is an [item document](../core/v1/spec.md#item-directory),
`blueprint.yaml`, at the root of its catalog item. The component documents it references sit inside the same item.

## Versions

| Major | Specification | Examples | Released? |
|---|---|---|---|
| `v1` | [`v1/spec.md`](v1/spec.md) | [`v1/examples/`](v1/examples/) | Draft — no `blueprint/v1.*` tag yet ([how to tell](../../docs/publication.md#draft-or-released)) |

## Start here

1. The [core specification](../core/README.md) and the
   [component specification](../component/README.md), which this one applies
2. [§2 Document envelope](v1/spec.md#envelope), for what this family binds
3. [§3 Identity](v1/spec.md#identity)
4. [§4 Component graph](v1/spec.md#components), including
   [§4.2 Explicit bindings](v1/spec.md#bindings)
5. [§5 Installation parameters](v1/spec.md#parameters), including
   [§5.3 Atomic connections](v1/spec.md#atomic-connections), and
   [§7 Diagnostics](v1/spec.md#diagnostics)

An implementation implements every section of this specification and of each
specification it builds on, together with the external specifications they cite.
This one cites none of its own beyond those core and component cite. The list
above is where to begin, not what to implement.

## Builds on

Core v1 and component v1. The authoritative list is the "Normative
dependencies" table in [§2](v1/spec.md#envelope).

## Requirement IDs

| Prefix | Covers | Section |
|---|---|---|
| `BP-ID` | Item identity and description particular to a blueprint | [§3](v1/spec.md#identity) |
| `BP-REF` | Component references and parameter sources | [§4.1](v1/spec.md#component-reference), [§5.2](v1/spec.md#value-sources) |
| `BP-CONN` | Explicit bindings and the value-dependency graph | [§4.2](v1/spec.md#bindings) |
| `BP-NODE` | Node compute, storage and exposure | [§4.3](v1/spec.md#node-compute) |
| `BP-PARAM` | Installation parameters, their recipients and supply | [§5](v1/spec.md#parameters) |
| `BP-RESOLVE` | Installation resolution | [§5.2](v1/spec.md#value-sources) |
| `BP-CONNECTION` | Atomic connections | [§5.3](v1/spec.md#atomic-connections) |
| `BP-UI` | Install-form presentation | [§5.4](v1/spec.md#install-form) |

Every ID, the clause stating it, and the cases pinning it:
[blueprint/v1 in docs/traceability.md](../../docs/traceability.md#blueprintv1).

## Schema

| | URL |
|---|---|
| Major-version alias | `https://specifications.musher.dev/blueprint/v1/blueprint.schema.json` |
| Exact release (after first release) | `https://specifications.musher.dev/blueprint/v1.<MINOR>.<PATCH>/blueprint.schema.json` |

Which one to use, and how to bind it, is in
[Using the schemas](../../docs/using-schemas.md). The schema is authored in
[`v1/schemas/src/`](v1/schemas/src/) and built with `task bundle`.
