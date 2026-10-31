# Component specification

A component document is a reusable, versioned definition that a blueprint node
deploys ([blueprint §4](../blueprint/v2/spec.md#components)). Its `type` says
what the platform runs for it: a workload (a service, a worker or a job), or
nothing, for an external component that stands in the graph for a connection or
an outside service. Its component contract says which inputs it consumes and
which outputs it produces. A component is never deployed on its own; a
[blueprint](../blueprint/README.md) composes it.

Component documents sit inside a
[catalog item](../core/v2/spec.md#item-directory) rather than naming one, commonly
as `components/<name>.yaml`, `component.yaml` or `component-<name>.yaml`, the
patterns [editors bind](../../docs/using-schemas.md#in-your-editor).

## Versions

| Major | Specification | Examples | Released? |
|---|---|---|---|
| `v2` | [`v2/spec.md`](v2/spec.md) | [`v2/examples/`](v2/examples/) | Released from [`2.0.0`](https://github.com/musher-dev/specifications/releases/tag/component%2Fv2.0.0). Every release is in [`published.json`](../../published.json) ([how to tell](../../docs/publication.md#draft-or-released)) |
| `v1` | Retired: v2 supersedes it, and its released bytes stay at their tags | | Released from [`1.0.0`](https://github.com/musher-dev/specifications/releases/tag/component%2Fv1.0.0) |

What changed from v1, field by field:
[§1.2 Migration from v1](v2/spec.md#migration).

## Start here

1. The [core specification](../core/README.md), which this one applies
2. [§1.1 Terms](v2/spec.md#terms) and [§2 Document envelope](v2/spec.md#envelope),
   for what this family fixes
3. [§5 What the platform runs](v2/spec.md#workload), including
   [§5.1 Source and build recipe](v2/spec.md#source),
   [§5.6 External components](v2/spec.md#external) and
   [§5.7 Jobs and schedules](v2/spec.md#jobs)
4. [§6 Component contract](v2/spec.md#contract), including
   [§6.3 Value schemas](v2/spec.md#value-schema) and
   [§6.4 Connection inputs](v2/spec.md#connection-requirements)
5. [§8 Diagnostics](v2/spec.md#diagnostics)

An implementation implements every section of this specification and of each
specification it builds on, together with the external specifications they cite.
Logical values use the bounded value-schema profile in §6.3. The list above is
where to begin, not what to implement.

## Builds on

Core v2. [Blueprint](../blueprint/README.md) in turn applies this family. The
authoritative list is the "Normative dependencies" table in
[§2](v2/spec.md#envelope).

## Requirement IDs

| Prefix | Covers | Section |
|---|---|---|
| `COMP-ID` | Revision | [§4](v2/spec.md#metadata) |
| `COMP-TYPE` | What the platform runs, and the workload fields each type allows | [§5](v2/spec.md#workload) |
| `COMP-CMD` | Command | [§5](v2/spec.md#command) |
| `COMP-EXT` | Workload or external node | [§5](v2/spec.md#workload), [§5.6](v2/spec.md#external) |
| `COMP-SRC` | Image, Git or upload source | [§5.1](v2/spec.md#source) |
| `COMP-BUILD` | Build recipe, build context and build secrets | [§5.1](v2/spec.md#build) |
| `COMP-EP` | Endpoints, probes, and the fields naming them | [§5.2](v2/spec.md#endpoints), [§5.4](v2/spec.md#health) |
| `COMP-ENVVAR` | Environment variables | [§5.3](v2/spec.md#env-vars) |
| `COMP-VOL` | Volume mount paths, and whether replicas share a volume | [§5.5](v2/spec.md#volumes) |
| `COMP-JOB` | When a job runs, and its schedule | [§5.7](v2/spec.md#jobs) |
| `COMP-CONTRACT` | Input and output names | [§6](v2/spec.md#contract) |
| `COMP-DESC` | Component, input and output descriptions | [§4](v2/spec.md#metadata), [§6](v2/spec.md#contract) |
| `COMP-INPUT` | Inputs with no environment target | [§6.1](v2/spec.md#inputs) |
| `COMP-OUT` | Outputs | [§6.2](v2/spec.md#outputs) |
| `COMP-PLACEHOLDER` | Placeholders in output templates | [§6.2](v2/spec.md#outputs) |
| `COMP-VAL` | Value schemas | [§6.3](v2/spec.md#value-schema) |
| `COMP-CONNECTION` | Connection inputs and their protocols | [§6.4](v2/spec.md#connection-requirements) |
| `COMP-SEC` | Keeping sensitive values out of public output, and trusting a viewer's identity | [§11](v2/spec.md#security) |

Every ID, the clause stating it, and the cases pinning it:
[component/v2 in docs/traceability.md](../../docs/traceability.md#componentv2).

## Schema

| | URL |
|---|---|
| Major-version alias | `https://specifications.musher.dev/component/v2/component.schema.json` |
| Exact release | `https://specifications.musher.dev/component/v2.<MINOR>.<PATCH>/component.schema.json` |

Which one to use, and how to bind it, is in
[Using the schemas](../../docs/using-schemas.md). The schema is authored in
[`v2/schemas/src/`](v2/schemas/src/) and built with `task bundle`.
