# Downstream v1 adoption

This is an informative adoption guide for the platform and catalog repositories. The
[component](../specifications/component/v1/spec.md) and
[blueprint](../specifications/blueprint/v1/spec.md) specifications govern the
contract; this checklist does not define another document dialect.

## Pin the reviewed contract

Before starting downstream migration, record the full immutable commit SHA of
this hardening change after it merges. The SHA is pending until that merge;
do not substitute a moving branch, invent a final SHA, or claim that this
guide pins a release already published. Record the selected SHA in each
migration pull request and vendor the matching schemas, specifications, and
conformance corpus together.

Once releases are published, replace the temporary commit pin with the exact
family releases and their verified dependency closure from `published.json`.
Keep checksums and dependency identities with vendored artifacts. Release
archives must work offline without fetching mutable `main`.

## Platform implementation

1. Adopt explicit consumer-owned bindings, logical value validation, sensitivity
   propagation, authoritative endpoint allocations, and related diagnostic
   locations. Keep value resolution separate from current deployment admission.
2. Persist a versioned private installation snapshot before materializing any
   workload values. The public resolution record contains opaque snapshot
   references, never secret values or hashes of them. Reconcile records against
   the blueprint and resolved component artifacts.
3. Acquire connections atomically per installation and connection parameter.
   Persist the organization policy revision, connection version, protocol views,
   model, endpoint settings, credential identity and rotation together.
   Connection requirements bound to one connection parameter share one
   selection; equal protocols alone never imply sharing.
4. Implement durable, idempotent acquisition and credential issuance. Inject
   failures between acquisition, issuance, persistence, and materialization.
   Recovery must reuse the selection and avoid duplicate active credentials;
   compensate or reconcile interrupted issuance before exposing workload values.
5. Retry and redeploy reuse the persisted selection. A default change affects
   new installations. Explicit updates and rotations produce new durable state
   and resolution records. Clones receive distinct installation identities and
   scoped credentials. Revocation and current authorization remain enforceable
   even when an immutable record exists.
6. Reject partial connection overrides. A replacement supplies the complete
   connection; it must never retain a managed credential while changing its
   destination. Use service- and installation-scoped gateway credentials rather
   than unrestricted organization provider keys. Keep secrets out of diagnostics,
   forms, previews, logs, public reads, and content hashes.
7. Distinguish offline acquisition context from authoritative not-found, denied,
   and incompatible results. Never fall back to another billable provider.
   Disclose the selected connection and cost owner through the installation
   interface; existing organization policy may authorize automated deployments.

## Gateway and SDK verification

Run the specification's synthetic conformance fixtures through downstream
adapters, then separately test real, explicitly pinned supported SDK versions
against the gateway. Record SDK versions and results in the downstream pull
request; synthetic fixtures do not prove network compatibility.

| Client protocol | Managed SDK base path | Expected request path |
| --- | --- | --- |
| `OPENAI_CHAT_COMPLETIONS` | `/openai/v1` | `/openai/v1/chat/completions` |
| `ANTHROPIC_MESSAGES` | `/anthropic` | `/anthropic/v1/messages` |

These are managed gateway routes, not restrictions on generic connection URLs.
Test actual SDK URL joining, protocol-specific authentication, ordinary text
requests, streaming termination and errors, tool calls and tool-result
continuations, cancellation, and upstream error responses. Declare only
capabilities the selected protocol view implements; reject unsupported or
unknown capabilities. Do not infer a protocol from the model vendor.

## Catalog migration and rollout

1. Implement and validate the platform adapter against the pinned contract
   before migrating catalog documents. Keep existing deployments on their
   persisted installation snapshots during rollout.
2. Migrate catalog components and blueprints together. Declare grouped connection
   requirements over existing sensitive-string credential inputs, blueprint
   connection parameters, and explicit connection bindings. Remove independent
   URL/key/model suppliers for group-owned inputs and retired targeting
   vocabulary.
3. Validate every migrated catalog document structurally and semantically, then
   exercise installation resolution and current admission in the platform.
   Include two same-protocol connection parameters, explicit sharing, complete
   replacement, default changes, retries, rotation, revocation, and clone
   scenarios.
4. Update downstream documentation to link the generated reference. Preserve
   platform-specific API and lifecycle documentation; do not maintain duplicate
   handwritten document field tables.
5. Prepare release pull requests in dependency order: core, component and listing,
   then blueprint. A ready release pull request is not evidence that a tag or
   immutable release asset exists. Publish only through the repository release
   workflow, verify assets and the ledger, and then update downstream exact pins.

Downstream completion requires linked migration changes, passing shared
conformance, gateway integration evidence, and durable lifecycle failure tests.
Specification fixtures alone must not be presented as completed production
integration. Track any missing evidence as explicit downstream follow-up work.
