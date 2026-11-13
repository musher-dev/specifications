# ADR 0063: A job run's time limit counts from its start and ends with a graceful stop

- **Status:** Accepted
- **Date:** 2026-11-13
- **Relies on:** [ADR 0055](0055-a-node-starts-after-the-nodes-it-names.md) §5, time limits and start order

## Context

Component 2.2.0 gave every run of a `JOB` a time limit (#227):
`timeLimitSeconds`, an integer from 1 to 604800 seconds (`COMP-JOB-005`),
shorter than a scheduled job's period (`COMP-JOB-006`), 900 seconds by default
(`COMP-JOB-007`), and a run still executing at its limit is stopped and has
failed (`COMP-JOB-008`). It shipped without an ADR, so this one records it.

Start order (ADR 0055) then raised questions the limit did not answer. A job
that carries `startAfter` waits before it starts: does the wait count? A run
stopped at its limit may exit 0 when it gets the stop signal: has it
succeeded? `COMP-JOB-008` left how a run is ended to the platform, so a
command could be killed mid-write with no chance to finish. And a review of
the deploy-test findings asked whether a job needs more fields: a stop grace,
a deadline on a wait, a deadline on a missed start, retries.

The peers compared:

| Platform | Run limit | Default | Stop |
|---|---|---|---|
| Kubernetes Job | `activeDeadlineSeconds`, from the Job's start | None | `SIGTERM`, then `terminationGracePeriodSeconds`, 30 s by default |
| AWS Batch | `timeout.attemptDurationSeconds`, per attempt, at least 60 | None | Like `docker stop` |
| Cloud Run jobs | `timeout`, per task attempt, up to 168 hours | 10 minutes | `SIGTERM`, then 10 s |
| Amazon ECS | No run limit | None | `stopTimeout`, 30 s by default |
| Nomad | No run limit | None | `kill_signal`, then `kill_timeout`, 5 s by default |
| Docker Compose | No run limit | None | `stop_signal`, then `stop_grace_period`, 10 s by default |

## Decision

### 1. The limit counts from the command's start

A run's limit counts from when its command starts: once its `startAfter`
conditions hold, its host is chosen and its image is in place. Waiting for any
of them is not part of it. The platform bounds how long a run waits to start,
and a wait on start order ends when what it waits on succeeds, becomes ready
or fails (`BP-ORDER-004`). A job's limit is then about its own work, which is
the only thing its author can size. Each run has its own limit, as AWS Batch
and Cloud Run apply theirs to each attempt.

### 2. A run stopped at its limit has failed

A run still executing at its limit has failed, whatever it exits with once the
stop has begun. A command that traps the signal and exits 0 has still not done
its work, and the first exit the platform records must not turn a timeout into
a success. `SUCCEEDED` therefore holds only for a run that "has exited 0
before its time limit", and a rollout that orders a run stopped at its limit
has failed.

### 3. The stop is graceful

The platform sends the stop signal the image declares, `SIGTERM` when it
declares none, and does not force the run to end sooner than 10 seconds after
it. Ten seconds is Cloud Run's and Compose's grace, and what the platform's
runtime does today. A run being stopped is still executing, so a scheduled run
that falls due meanwhile is skipped (`COMP-JOB-004`), and whatever waits for a
run to end waits no longer than its limit and the stop that follows it.

### 4. No new field

- **`stopTimeoutSeconds`** is deferred until a workload needs more than 10
  seconds to stop. When it is added it takes that name, after ECS's
  `stopTimeout`, not one with "period" in it, because the period is already the
  interval of a schedule (`COMP-JOB-006`).
- **A deadline on a `startAfter` wait**, or a rollout's
  `progressDeadlineSeconds`, is deferred. Every wait is bounded by what it
  waits on, and a job's own limit bounds the longest of them. Kubernetes'
  `progressDeadlineSeconds` only reports a stalled rollout; it stops nothing.
- **A deadline on a missed scheduled start**, Kubernetes'
  `startingDeadlineSeconds`, and **retries**, AWS Batch's attempts or
  Kubernetes' `backoffLimit`, are deferred until v2 has schedules a run can
  miss and retries at all. When they come, the limit applies to each attempt.

## Alternatives considered

**Counting from when the run is created**, as Kubernetes counts
`activeDeadlineSeconds`. A job waiting on a slow database, or on an image pull,
would spend its limit before doing any work, and its author could not size it.

**Leaving the stop to the platform**, as 2.2.0 did. A command could be killed
with no warning partway through a write, and the outcome a deployment records
would depend on how the platform happened to end it.

**Counting an exit 0 after the stop as success.** It rewards a command that
ignores its limit, and makes the outcome depend on a race between the stop and
the recording of the limit.

## Consequences

- Component `COMP-JOB-008` states when the limit starts, how a run is stopped
  and that it has failed; blueprint's `SUCCEEDED` row, `BP-ORDER-004` and
  `BP-ORDER-005` follow. No document's validity changes: every rule here is a
  platform obligation.
- platform-api records a run stopped at its limit as failed before it drops the
  run from the roster, so an exit 0 after the stop signal is not recorded as a
  success.
- A scheduled job whose limit is close to its period can still be stopping when
  its next run falls due, and that run is skipped. A job that needs every run
  declares a limit with room for the stop.
