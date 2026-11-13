# ADR 0048: A workload's environment is its image's, overlaid by its inputs

- **Status:** Accepted
- **Date:** 2026-11-13
- **Relies on:** [ADR 0033](0033-inputs-are-the-only-way-into-a-component.md) §1, inputs are the only way in
- **Relies on:** [ADR 0032](0032-correcting-a-released-family-within-its-major.md) §1, valid against the released prose
- **Closes:** [platform-api#1443](https://github.com/musher-dev/platform-api/issues/1443)

## Context

Component v2 §5.3 says "a workload's environment is exactly its inputs'
targets, and nothing else writes the environment". Read literally, that
deletes the image's own `ENV`, which no runtime does and no author expects. It
also says nothing about the variables a container runtime adds.

The runtime sets `HOSTNAME` to the replica's name and overrides an image's
`ENV HOSTNAME`
([platform-api#1443](https://github.com/musher-dev/platform-api/issues/1443)).
Docker keeps the image's value. A Next.js standalone server reads `HOSTNAME`
as its bind address, and its official image sets `ENV HOSTNAME=0.0.0.0` for
that reason; under the override it stopped answering on loopback. Nothing
documented which variables the runtime sets, and whether an input targeting
`HOSTNAME` would win was never decided.

## Decision

### 1. Precedence

`COMP-ENVVAR-005`: the environment a workload's process starts with is the
image's configured environment, with every input target written over it. An
input's target replaces an image variable of the same name, and every other
image variable keeps its value. The platform adds no other variable and
changes or removes none the image or an input sets, with one exception: where
neither sets `PATH`, `HOME` or `HOSTNAME`, it MAY set it, as container
runtimes do. Platform obligation.

That list is the whole of what a runtime may supply. A platform fact a
workload needs, such as its compute, enters through an input like any other
value ([ADR 0033](0033-inputs-are-the-only-way-into-a-component.md) §1).

### 2. No reserved names

`COMP-ENVVAR-006`: no name is reserved. An input MAY target any name the
grammar admits, `PATH`, `HOME` and `HOSTNAME` included, and the workload sees
the input's value. Validation accepts it.

Reserving a name would reject a document v2 accepts today, which is a new
major. It would also take away the fix #1443 asks for: an input targeting
`HOSTNAME` is exactly how a component pins its bind address against a runtime
default.

### 3. What changes in v2

§5.3 is corrected, not narrowed: no document changes verdict. The precedence
is a platform obligation, recorded in `UNPINNED`; `COMP-ENVVAR-006` is pinned
by a passing case that targets `HOSTNAME`.

## Alternatives considered

**Reserve `HOSTNAME` and the other runtime variables, and reject an input
targeting one.** A narrowing, and it would leave a Next.js image no way to
listen on loopback.

**Inject `MUSHER_*` facts.** A second way into a component beside its inputs,
which ADR 0033 removed.

## Consequences

The host agent stops overriding an image's `HOSTNAME`. A component that needs
a value regardless of its image targets it with an input, and the input wins.
