# ADR 0053: An organization API key deploys as the user who created it

- **Status:** Proposed
- **Date:** 2026-11-13
- **Extends:** [ADR 0035](0035-how-identity-and-credentials-reach-a-workload.md) §5, the creator's facts
- **Relies on:** [ADR 0038](0038-v2-one-vocabulary-and-v1-retires.md) §5, one scope lattice

## Context

A blueprint reads facts about the person who created its deployment through a
deployment-fact parameter: `from: "${{ deployment.creator.email }}"`
(blueprint `BP-PARAM-011`). Catalog items use it to give the deployer an
administrator account: seven of the catalog's items, n8n among them, read
`deployment.creator.email`.

Deploy-testing those items on production on 2026-11-13 (platform-api #1434)
found two faults:

1. **An organization API key has no creator.** Deploying with one answered
   `ERR_DEPLOYMENT_FACT_UNAVAILABLE` at `/spec/parameters/ownerEmail/from`,
   because the platform treated the key as a service principal with no email.
   No automation holding a key, such as a CI job, a deploy-verify harness or an
   MCP key, could deploy any of those items.
2. **Validation did not predict the refusal.** `blueprints:validate` at the
   `deployment` scope, with the same key and document, answered `INCOMPLETE`
   with no diagnostic: it deferred every resolution rule, the creator's facts
   among them, although the caller was known. A client was told nothing was
   wrong and then refused.

The specification allowed both. `BP-PARAM-011` named "a deployment a service
principal created" as the example of a fact the platform lacks, and nothing
said what a `deployment`-scope validation does with deployment facts.

## Decision

### 1. A key's deployment has the key's creator as its creator

A deployment created with an organization API key has a creator: the user who
created the key. `deployment.creator.identity`, `.email` and `.name` resolve
to that user's facts, captured when the deployment is created, as for any
creator. Revoking or deleting the key afterwards changes nothing: the facts are
the deployment's. A key whose creator the platform no longer knows, such as a
user removed from the organization, supplies none of the facts, and each one a
blueprint reads is `ERR_DEPLOYMENT_FACT_UNAVAILABLE`.

The rule is `BP-PARAM-015`. It is a platform obligation: no document breaks
it, and the conformance runner lists it with that reason.

### 2. A `deployment`-scope validation resolves the caller's facts

A `deployment`-scope validation describes a deployment the caller would create,
so it treats the caller as the prospective creator: the person who calls, or,
for a key, the user who created it. It resolves each deployment fact the
blueprint reads from that caller, in the `resolution` phase at stage
`parameters`, under `BP-PARAM-011`'s table. A fact the caller lacks is
`ERR_DEPLOYMENT_FACT_UNAVAILABLE`, never a deferred obligation, so a
validation that the deploy call would refuse for that reason is `INVALID`,
never `INCOMPLETE` with no diagnostic. The rest of resolution stays deferred.

The rule is `BP-PARAM-016`, pinned by behavioural `validate` cases: the
fixture's `deployment` context stands for the caller.

## Alternatives considered

**A service identity the key names.** A key could carry a synthetic identity,
with an email the organization chooses. It needs a new object in the platform
API, and a blueprint that seeds an administrator account would then hand it to
an address nobody reads. A key is created by a person, and that person is
accountable for what it deploys.

**A fallback in the blueprint**, `from` with a `default`. It puts an authored
literal where a person's address belongs, and `BP-PARAM-010` forbids `default`
beside `from` for that reason: a default that silently replaces a fact is the
failure the fact exists to prevent.

**Leaving validation to defer.** It is what produced the fault. A deferred
obligation says context is missing, and here it is not: the caller is the
context.

## Consequences

- platform-api resolves `deployment.creator.*` for a key deploy to the key's
  creator, and its `deployment`-scope validation reports a fact the caller
  lacks.
- `BP-PARAM-011`'s example of a missing fact no longer names a service
  principal.
- No document's validity changes, and every released case replays unchanged.
