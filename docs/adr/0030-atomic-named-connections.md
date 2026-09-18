# ADR 0030: Atomic named connections

- **Status:** Accepted
- **Date:** 2026-09-18
- **Extends:** [ADR 0028](0028-explicit-binding-and-resolution-before-release.md)
- **Relies on:** [ADR 0029](0029-reproducible-release-and-installation-contracts.md)

## Context

Issue #95 requires organization-default LLM access without mixing an endpoint,
credential and model from independent configuration lookups. The maintainer
approved named atomic connections for the first release and both client protocols.
Literal defaults and ordinary configuration references retain their meanings.

## Decision

### 1. Explicit ownership

Component connectionRequirements map baseUrl, apiKey and model roles to existing
inputs and declare OPENAI_CHAT_COMPLETIONS or ANTHROPIC_MESSAGES requirements.
Optional required capabilities are STREAMING and TOOL_CALLS. A credential targets
a sensitive string input. Group members have one owner, no independent binding,
and no default. Blueprints declare connectionSources with whole config references
and bind component requirements through named connectionBindings.

### 2. Atomic selection

The selection identity is installation plus named slot, not protocol. Consumers
of one slot share one immutable connection with declared protocol views. Separate
slots remain independent. The binder projects acquired values into the existing
input pipeline; it does not fetch organization or provider data during validation.
Unavailable context is incomplete. Authoritative absence, denial and incompatible
protocols or capabilities reject, without provider fallback.

### 3. Lifecycle and overrides

Acquisition, scoped credential issuance and durable selection precede workload
materialization. Retries and redeploys reuse the selection. Default changes affect
new installations; explicit updates and rotation produce new snapshot versions.
Clones get distinct installation credentials and revocation denies use immediately.
Overrides replace the entire connection, including endpoint, credential and model.
A managed credential is never retained for a replacement destination.

### 4. Boundaries

Credentials are whole sensitive values, scoped to installation, slot and permitted
service. Public artifacts, previews, diagnostics and hashes exclude secret values.
Protocol names identify client contracts, not upstream vendors. Gateway prefixes,
provider defaults, billing policy, SDK integration and durable storage are platform
responsibilities. The installation interface discloses connection and cost owner.

## Consequences

Schemas, semantics, examples and synthetic conformance describe one grouped supply
mechanism. No name-based automatic assembly or partial override mode is admitted.
Downstream adapters must demonstrate atomic persistence and real SDK compatibility
before claiming production support; this repository publishes data contracts only.
