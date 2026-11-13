# ADR 0055: A node starts after the nodes it names

- **Status:** Accepted
- **Date:** 2026-11-13
- **Relies on:** [ADR 0038](0038-v2-one-vocabulary-and-v1-retires.md) §3, the composition graph of nodes

## Context

A blueprint could not order its nodes. Component `COMP-JOB-001` runs an
unscheduled job "ordered against no other node", and blueprint §9 listed
startup ordering between nodes as not supported. Every multi-node item
therefore waited for its own dependencies.

Deploy-testing 25 catalog items on production on 2026-11-13, reported as
platform-api #1445, found that 10 of them needed a workaround: wait loops in
shell, Node, Python or Perl preludes, startup probes inflated to cover a
sibling's image pull, and bootstrap scripts hidden in another node's command.
A service that started before its database crashed once, and the deployment
showed `DEGRADED` until it recovered. A job that claims an application's first
administrator account polled the service for up to 900 seconds.

The same round found the security fault of platform-api #1444: an exempt path
on a restricted endpoint went live as soon as its node was ready, before the
bootstrap job had claimed the instance. Ordering is what lets a blueprint say
when a deployment is finished starting, and so when an exemption may open.

## Decision

### 1. `startAfter` on a node

A node may carry `startAfter`, a list of `{node, condition}`. `condition` is
`READY` or `SUCCEEDED`:

- `READY` names a `SERVICE` or a `WORKER`. It holds once the node has a ready
  replica in the rollout: its readiness probe passes or, without one, its
  startup probe has succeeded or, without either, its workload has started.
- `SUCCEEDED` names an unscheduled `JOB`. It holds once the job's run in the
  rollout has exited 0 before its time limit.

A `SERVICE`, a `WORKER` and an unscheduled `JOB` may carry `startAfter`. An
`EXTERNAL` node runs nothing, and a scheduled `JOB` is started by its schedule,
not by a rollout, so neither may carry it or be named by it.

One field serves a service waiting for its database, a migration job waiting
for it, and a job that runs once a service is ready, such as one that claims an
application's first administrator account. A job's start is its run, so a
separate `runAfter` for jobs would be a second spelling of the same thing.

### 2. Cycles are a semantic error

The start graph, the nodes and the edges `startAfter` draws, must be acyclic,
and a node naming itself is a cycle: `ERR_START_CYCLE` at `/spec/nodes`. It is
a graph of its own. A value dependency (`BP-BIND-002`) is on allocated
addresses and resolved values, which exist before anything starts, so it orders
no start, and a start order adds no value dependency.

### 3. What the platform does

In each rollout the platform starts a node only once every condition it names
holds in that rollout, and reports a node that waits as waiting, with what it
waits on, never as failed or degraded. A node the rollout does not change
holds `READY` with its current ready replica. A condition that can no longer hold, because the job it
names failed, leaves the node not started and the rollout failed. Ordering
governs only when a node starts: a dependency that later stops being ready
neither stops nor restarts the node that waited for it. Orchestration after a
rollout stays out of scope.

### 4. A rollout is active

A rollout is **active** once every `SERVICE` and `WORKER` node it runs is
`READY` and every **ordered job**, an unscheduled `JOB` that carries
`startAfter` or that one names, has `SUCCEEDED`. A rollout whose ordered job
fails has failed and is never active, and a rollout has **completed** once it
is active or has failed. The platform reports a deployment active only once
its first rollout is, and the previous active rollout keeps serving until a
later one is active, so an update is not an outage. A job neither carrying nor
named by `startAfter` keeps `COMP-JOB-001`'s meaning: it is ordered against
nothing, and its outcome does not hold activation. An ordered job runs again
in every rollout, so it is written to succeed when its work is already done.

Activation is what an exemption waits for (`BP-ACCESS-012`), path by path:
until a rollout that exempts a path is active, requests to it require sign-in
like any other, so a bootstrap job finishes before anything it guards opens,
and a path a later rollout adds waits for that rollout. A platform-checked API
key (`BP-ACCESS-018`) waits the same way. A blueprint with no `startAfter`
orders no job, so its exempt paths wait only for the node that exposes them to
be ready, and a node that never becomes ready elsewhere in the deployment does
not hold them closed.

### 5. Time limits

A job's run has a time limit (component `COMP-JOB-005` to `COMP-JOB-008`), and
start order counts with it, not against it:

- The limit counts from when the run's command starts, after its `startAfter`
  conditions hold, so time spent waiting is never charged to it.
- A run stopped at its limit has failed, whatever it exits with after the stop
  begins. `SUCCEEDED` on it can no longer hold, and a rollout that orders it has
  failed and is never active.
- A run the platform ends to move it to another host has not failed; the run
  that replaces it decides the condition.
- No wait has a deadline of its own. Every wait ends when what it waits on
  succeeds, becomes ready or fails, and a job's time limit bounds the longest
  wait on one.

[ADR 0063](0063-a-job-runs-time-limit-counts-from-its-start-and-ends-with-a-graceful-stop.md)
records the limit and why no further field is added.

## Alternatives considered

**Compose's `depends_on`.** It names a service and a condition, which is this
design. Its third condition, `service_started`, is `READY` for a workload
without probes; its default orders without waiting, which is the failure this
fixes.

**Gating publication of an endpoint on a named job.** It solves #1444 alone,
and leaves every wait loop in place. Activation solves both.

**A post-ready hook on the service.** It puts a second workload inside the
first. An ordered job is a node of its own, with its own inputs, compute and
outcome.

## Consequences

- The not-supported row "startup ordering between nodes" closes by the
  relaxation it named: a new optional field on a node.
- Component `COMP-JOB-001` names `startAfter` as the one exception to an
  unscheduled job being ordered against no other node, and says that a job a
  `startAfter` names, or that carries one, fails the rollout when it reaches
  its time limit.
- Released documents carry no `startAfter`, so their exempt paths wait only for
  the node that exposes them (`BP-ACCESS-012`), a change of runtime meaning the
  blueprint states where it applies.
- platform-api holds a node until its conditions hold, reports it as waiting,
  and reports a deployment active by §4.
