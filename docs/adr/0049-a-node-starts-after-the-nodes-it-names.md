# ADR 0049: A node starts after the nodes it names

- **Status:** Proposed
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
  rollout has completed successfully.

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
holds in that rollout, and reports a node that waits as waiting, never as
failed or degraded. A condition that can no longer hold, because the job it
names failed, leaves the node not started and the rollout failed. Ordering
governs only when a node starts: a dependency that later stops being ready
neither stops nor restarts the node that waited for it. Orchestration after a
rollout stays out of scope.

### 4. A rollout is active

A rollout is **active** once every `SERVICE` and `WORKER` node it runs is
`READY` and every **ordered job**, an unscheduled `JOB` that carries
`startAfter`, has `SUCCEEDED`. The platform reports a deployment active only
then. A job without `startAfter` keeps `COMP-JOB-001`'s meaning: it is ordered
against nothing, and its outcome does not hold activation.

Activation is what an exemption waits for (`BP-ACCESS-012`): until the rollout
that carries an exemption is active, the exempt requests require sign-in like
any other, so a bootstrap job finishes before anything it guards opens.

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
- Component `COMP-JOB-001` still says an unscheduled job is ordered against no
  other node. A blueprint now orders one, so the component family should name
  `startAfter` as the exception.
- platform-api holds a node until its conditions hold, reports it as waiting,
  and reports a deployment active by §4.
