# ADR 0049: TCP, exec and gRPC probes, and probe headers

- **Status:** Proposed
- **Date:** 2026-11-13
- **Relies on:** [ADR 0031](0031-one-grammar-for-the-authored-documents.md) §1, the key that is present names the mechanism
- **Relies on:** [ADR 0032](0032-correcting-a-released-family-within-its-major.md) §3, a relaxation is declared
- **Closes:** [platform-api#1446](https://github.com/musher-dev/platform-api/issues/1446)

## Context

Component v2 probes are HTTP only (`COMP-EP-002`), and an HTTP probe sends no
header but a credential
([platform-api#1446](https://github.com/musher-dev/platform-api/issues/1446)).
Every catalog datastore pays for it. PostgreSQL, Redis and Valkey either
declare no probe, and are READY before they accept a connection, or ship an
HTTP shim that has to run as PID 1. Temporal declares an extra port only to be
probed, and docling-serve cannot be probed at all, because its health route
needs `X-Api-Key`. §10 already names both gaps, and says how each closes: a
mechanism key beside `http`, and an optional field on `http`.

## Decision

### 1. A probe holds exactly one of four mechanisms

`COMP-EP-002` becomes: a probe holds exactly one of `http`, `tcp`, `exec` and
`grpc`. Naming none is `ERR_MISSING_FIELD` and naming two `ERR_INVALID_VALUE`,
at the probe, structural. The timing fields and their defaults are unchanged
and apply to every mechanism.

| Mechanism | Fields | Succeeds when |
|---|---|---|
| `tcp` | `endpoint` | A TCP connection to the endpoint's `targetPort` is established. Nothing is sent |
| `exec` | `command`, exec form | The command, run inside the workload's container with its environment, exits 0 within `timeoutSeconds` |
| `grpc` | `endpoint`, optional `service` | A `grpc.health.v1.Health/Check` for `service` (default `""`, the whole server) answers `SERVING` |

- **`tcp`** (`COMP-PROBE-001`) names an endpoint whose protocol is `TCP`,
  `HTTP`, `WS` or `GRPC`: a stream protocol that is cleartext on the hop to the
  workload. Not `HTTPS`, because a connection that never completes the TLS
  handshake bypasses the endpoint's trust policy (`COMP-EP-007`); and not `UDP`,
  which has no connection. Semantic: `ERR_UNKNOWN_ENDPOINT`, and a new
  `ERR_ENDPOINT_NOT_TCP`, at `tcp/endpoint`.
- **`grpc`** (`COMP-PROBE-002`) names a `GRPC` endpoint. Semantic:
  `ERR_UNKNOWN_ENDPOINT`, and a new `ERR_ENDPOINT_NOT_GRPC`, at `grpc/endpoint`.
  `service` is at most 256 characters, structural.
- **`exec`** (`COMP-PROBE-003`) takes `command` as `workload.command` does: a
  non-empty list of strings no shell parses. Structural.

### 2. An HTTP probe may send headers

`COMP-PROBE-004`: `http.headers` maps a lowercase header name to exactly one
origin, a literal `value` or an `input`, as a probe credential does. At most 16.
A name matches `^[a-z][a-z0-9-]{0,63}$`, and is none the platform or `auth`
controls or a proxy reads: `host`, `authorization`, `proxy-authorization`,
`forwarded`, `x-forwarded-for`, `content-length`, `transfer-encoding`,
`connection`, `keep-alive`, `te`, `trailer`, `upgrade` and `cookie`. Viewer
identity header names are the platform's choice, so the platform refuses a
probe header named as one (`COMP-PROBE-006`). Lowercase, because header names
compare case-insensitively, so a mapping key is unique exactly when the header
is. A literal is visible ASCII, spaces and tabs, 1 to 1024 characters. All
structural, `ERR_INVALID_VALUE`.

`COMP-PROBE-005`: a header `input` names one of the component's own string
inputs that is always supplied, as a credential `input` does, with
`ERR_UNKNOWN_INPUT`, `ERR_VALUE_CONSTRAINT` and `ERR_INPUT_NOT_GUARANTEED`.
It may be sensitive. That is the secret-bound header form: a sensitive input
carries the value, and nothing new is needed to mark it. An input a header
reads counts as read for `COMP-INPUT-001`.

### 3. Platform obligations

`COMP-PROBE-006`: the platform runs each mechanism as the table says; ends
every process of an exec probe that outlives its timeout, never starts a probe
while its previous run executes, and treats exec output as sensitive; sends
headers on the probe request only, never on forwarded traffic; treats a value
from a sensitive input as sensitive; and refuses to send a header whose
resolved value holds CR, LF or NUL, or whose name is a viewer identity header,
which is a configuration error and never a failed probe. Recorded in `UNPINNED`: no document operation sends a request.

### 4. Relaxation, not narrowing

A document v2 rejected with `ERR_UNKNOWN_FIELD` for `tcp`, `exec`, `grpc` or
`headers` now validates. No released case pins one of those rejections, so
`RELAXED` stays empty unless `check:compat` finds one. Blueprint's
`ERR_READINESS_REQUIRED` accepts a readiness probe of any mechanism, as
`COMP-EP-003` always said ("a readiness probe").

## Alternatives considered

**Let `tcp` name any endpoint.** A TCP connect to an `HTTPS` endpoint skips
the trust policy every other connection the platform makes is bound to.

**A separate `headers` vocabulary for secrets.** A sensitive input already
says what is secret, and a second marker could disagree with it.

**Headers on every mechanism.** Only HTTP has request headers; gRPC metadata
can follow when a workload needs it, as a new optional field on `grpc`.

## Consequences

`items/postgres` can probe with `exec: {command: [pg_isready, -U, postgres]}` or
`tcp` on its unmodified image, and the HTTP shims can go. The host agent
implements three mechanisms and probe headers.
