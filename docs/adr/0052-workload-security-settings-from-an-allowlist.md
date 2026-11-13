# ADR 0052: Workload security settings, from an allowlist

- **Status:** Proposed
- **Date:** 2026-11-13
- **Relies on:** [ADR 0007](0007-naming-conventions.md) §1, field and value naming
- **Relies on:** [ADR 0044](0044-the-validation-result-is-a-released-schema.md) §6, deferred obligations name what is missing
- **Closes:** [platform-api#1451](https://github.com/musher-dev/platform-api/issues/1451)

## Context

A component cannot state the container settings common images document
([platform-api#1451](https://github.com/musher-dev/platform-api/issues/1451)).
Chromium needs a large `/dev/shm` and, for its own sandbox, unprivileged user
namespaces or a relaxed seccomp profile, so every browser item runs
`--no-sandbox`. Uptime Kuma's ping needs `NET_RAW`, and whether a container
has it is undocumented. Hardened upstreams run with a read-only root and
`cap_drop: ALL`, which a component cannot ask for.

Each setting is one a platform may be unable or unwilling to grant, which is
the shape of [`COMP-EP-019`](../../specifications/component/v2/spec.md#COMP-EP-019):
valid as written, refused at admission against the platform's runtime.

## Decision

### 1. `workload.security`

```yaml
security:
  shmSizeMiB: 1024
  readOnlyRootFilesystem: true
  capabilities: { drop: [ALL], add: [NET_RAW] }
  seccompProfile: RUNTIME_DEFAULT
  sysctls: { net.ipv4.ping_group_range: "0 2147483647" }
```

`COMP-SECURITY-001`, structural, `ERR_INVALID_VALUE` at the field:

| Field | Rule |
|---|---|
| `shmSizeMiB` | Integer, 1 to 65536. Absent, `/dev/shm` is at least 64 MiB. It counts against the workload's memory |
| `readOnlyRootFilesystem` | Boolean, default false. True, the root filesystem is read-only; volumes, files and `/dev/shm` stay as declared |
| `capabilities.drop` | Unique names from the allowlist, or `ALL` |
| `capabilities.add` | Unique names from the allowlist. Drop applies first, then add |
| `seccompProfile` | `RUNTIME_DEFAULT` (default) or `UNCONFINED` |
| `sysctls` | Names from the namespaced allowlist; each value one or more decimal integers separated by single spaces, at most 64 characters |

The capability allowlist is the OCI default set: `AUDIT_WRITE`, `CHOWN`,
`DAC_OVERRIDE`, `FOWNER`, `FSETID`, `KILL`, `MKNOD`, `NET_BIND_SERVICE`,
`NET_RAW`, `SETFCAP`, `SETGID`, `SETPCAP`, `SETUID` and `SYS_CHROOT`. A
component can therefore give up privilege freely, and ask back only for what a
container ordinarily holds. `SYS_ADMIN`, privileged mode and every other
capability stay out of reach (#1451's non-goal).

The sysctl allowlist is the namespaced, per-container set Kubernetes calls
safe, plus `net.core.somaxconn`: `kernel.shm_rmid_forced`,
`net.ipv4.ip_local_port_range`, `net.ipv4.ip_unprivileged_port_start`,
`net.ipv4.ping_group_range`, `net.ipv4.tcp_fin_timeout`,
`net.ipv4.tcp_keepalive_intvl`, `net.ipv4.tcp_keepalive_probes`,
`net.ipv4.tcp_keepalive_time` and `net.ipv4.tcp_syncookies`.
`vm.overcommit_memory`, which Valkey asks for, is a host setting, not a
container's, so no component can set it.

### 2. Three admission rules

Each reads the platform's runtime from the admission context, and is deferred
without it, as `COMP-EP-019` is:

| Rule | Refused | Code | Context |
|---|---|---|---|
| `COMP-SECURITY-002` | A capability in `add` the runtime does not grant | `ERR_CAPABILITY_NOT_GRANTED` at `capabilities/add/<i>` | `platform.capabilities` |
| `COMP-SECURITY-003` | `UNCONFINED` where the runtime refuses it | `ERR_SECCOMP_NOT_GRANTED` at `seccompProfile` | `platform.unconfinedSeccomp` |
| `COMP-SECURITY-004` | A sysctl the runtime does not set | `ERR_SYSCTL_NOT_GRANTED` at `sysctls/<name>` | `platform.sysctls` |

### 3. The defaults are a platform obligation

`COMP-SECURITY-005`: the platform applies every setting or refuses it at
admission, never ignores one; never runs a workload privileged; sets
no-new-privileges; applies the runtime's default seccomp profile unless
`UNCONFINED` is admitted; grants by default a subset of the allowlist, which it
documents. Recorded in `UNPINNED`.

## Deferred

A Chromium seccomp profile, user-namespace support, tmpfs paths beside a
read-only root, and a PID limit. Each closes as a new enum value or optional
field.

## Alternatives considered

**Any capability, refused at admission.** Puts the safety of the vocabulary in
every platform's hands; the allowlist puts the ceiling in the specification.

**Reject `UNCONFINED` structurally.** Upstream sandboxes run that way today; a
platform that can isolate them should be able to say yes.
