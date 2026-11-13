# ADR 0047: A workload without an endpoint starts when its process runs

- **Status:** Proposed
- **Date:** 2026-11-13
- **Relies on:** [ADR 0005](0005-platform-divergence-reconciliation.md) §1, the prose governs the platform
- **Closes:** [platform-api#1440](https://github.com/musher-dev/platform-api/issues/1440)

## Context

Component v2 lets a `WORKER` declare no endpoint and no probe. Schedulers,
queue consumers and bots usually listen on nothing. The specification never
said when such a workload has started or is ready, so the host agent filled
the gap: it armed a port-bind check on a port the component never declared,
and killed the workload with `port_bind_timeout` 15 seconds after it started
([platform-api#1440](https://github.com/musher-dev/platform-api/issues/1440)).
A supercronic image deployed from the catalog crash-looped for 40 minutes, and
no wrapper could help it, because its entrypoint ignores its arguments.

Every other catalog `WORKER` happened to declare a private health endpoint,
which hid the gap.

## Decision

### 1. The probes, and nothing else, decide start and readiness

`COMP-HEALTH-001`: a replica of a `SERVICE` or `WORKER` has started when its
startup probe succeeds, or, with no startup probe, once its process is
running. It is ready when its readiness probe succeeds, or, with none, once it
has started. A platform MUST NOT require the workload to listen on any port
other than a declared endpoint's `targetPort`, and MUST NOT fail, restart or
withhold readiness from it for not listening on one. A check that a port is
bound, where a platform applies one, applies only to a declared endpoint.

So a `WORKER` with no endpoint and no probe is ready once its process runs,
and stays so until it exits. A workload that wants a stronger signal declares
a probe, and [ADR 0049](0049-tcp-exec-and-grpc-probes-and-probe-headers.md)
gives one that needs no port: `exec`.

### 2. Platform obligation, pinned outside this repository

No document breaks the rule, and no document operation observes a running
process. It is recorded in the conformance runner's `UNPINNED` list with that
reason. The test that proves it belongs to the runtime: the host agent's
integration suite, which starts an endpoint-less `WORKER` and asserts that it
reaches READY and stays running. A document case still shows that such a
component is valid, so that the corpus holds the shape the runtime is tested
with.

## Alternatives considered

**Require a probe on every `WORKER`.** A narrowing inside v2, and a probe that
proves nothing: a queue consumer has no request to answer.

**Let the platform keep a port-bind check with a longer timeout.** It still
kills a workload that binds nothing, only later.

## Consequences

The host agent arms `port_bind_timeout` only for a replica that declares a
port. The specification states the readiness of every workload type that
runs, where before it stated only what a probe does.
