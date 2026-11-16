# Downstream v2 adoption

This is an informative adoption guide for the repositories that read Musher
documents: platform-api, the catalog, musher-cli, Pelorus, the SDKs and the
host agent. The v2 specifications govern the contract:
[core](../specifications/core/v2/spec.md),
[component](../specifications/component/v2/spec.md),
[blueprint](../specifications/blueprint/v2/spec.md) and
[listing](../specifications/listing/v2/spec.md). This page lists what each
consumer changes and defines nothing. Where it and a `spec.md` disagree, the
`spec.md` wins. Why v2 exists is
[ADR 0038](adr/0038-v2-one-vocabulary-and-v1-retires.md).

## v1 support is dropped

v2 replaces v1. It is not run beside it. v1 is a
[retired major](publication.md#retired-majors): its releases keep serving at
their pinned URLs, and it takes no further release. A consumer migrates every
stored document to v2 and then removes its v1 code path. The guide to the v1
migration,
[Downstream v1 adoption](https://github.com/musher-dev/specifications/blob/core/v2.0.0/docs/downstream-v1-adoption.md),
is kept as history at the `core/v2.0.0` tag.

Every v2 `spec.md` ends its scope section with a **Migration from v1** table
that maps each renamed field, value, diagnostic code and requirement ID to its
v2 form. Generate renames from those tables rather than from this page.

## Pin the v2 releases

Pin an exact release of each family: the latest one, as recorded in
[`published.json`](../published.json). v2 first released at `2.0.0`, in the
order core, component, blueprint and listing, and later releases follow the
same order. Every core release re-releases
every dependent family in the same release set
([Publication → The dependency gate](publication.md#core-release-alignment)),
so all four always sit on one core release. Vendor each release archive, which
carries its schema, specification, examples, conformance corpus and whole
dependency closure, and verify it as
[Verifying a release](../.github/SECURITY.md#verifying-a-release) shows.

## Changes every consumer makes

- **`specVersion: v2`.** Every document declares it, and it stays REQUIRED.
  Schema `$id`s and bundle URLs move to `/<family>/v2/`.
- **Validation phases.** There are five: `parser`, `structural`, `semantic`,
  `admission` (was `capability`) and `resolution`, now declared
  ([core v2 §6](../specifications/core/v2/spec.md#validation-phases)). A
  diagnostic's `phase` and any case tree named `capability/` use `admission`.
- **Validation scopes.** One lattice, `parser`, `structural`, `document`,
  `publication`, `deployment`, replaces the two profile sets. The result field
  `validationProfile` is `validationScope`
  ([core v2 §6.1](../specifications/core/v2/spec.md#validation-scope)).
- **Placeholders.** `${{ }}` is a placeholder, and the reserved namespace
  `output` is `nodes`. The codes are `ERR_MALFORMED_PLACEHOLDER`,
  `ERR_UNKNOWN_PLACEHOLDER_NAMESPACE` and `ERR_NAMESPACE_NOT_PERMITTED`.
- **Renamed diagnostic codes.** Map each old code to its new one in any stored
  result, test or message catalogue:

  | v1 | v2 |
  |---|---|
  | `ERR_UNKNOWN_INPUT_REFERENCE` | `ERR_UNKNOWN_INPUT` |
  | `ERR_VERSION_NOT_MONOTONIC` | `ERR_REVISION_NOT_INCREASING` |
  | `ERR_INVALID_PARAMETER_SOURCE` | `ERR_INVALID_PARAMETER_ORIGIN` |
  | `ERR_INVALID_HASH_SOURCE` | `ERR_INVALID_HASHED_PARAMETER` |
  | `ERR_CONFLICTING_ENV_KEY` | `ERR_CONFLICTING_ENV_VAR` |
  | `ERR_OUTPUT_NOT_PRODUCIBLE`, and `ERR_UNSATISFIED_REQUIRED_INPUT` at an output | `ERR_INPUT_NOT_GUARANTEED` |
  | `ERR_CONFLICTING_NODE_COMPUTE` | `ERR_COMPUTE_REQUIRED` (missing) or `ERR_COMPUTE_FORBIDDEN` (on `EXTERNAL`) |
  | `ERR_SECRET_LITERAL` | `ERR_SENSITIVE_LITERAL` |
  | `ERR_ENDPOINT_NOT_HTTP` for `publicURL` and `publicHostname` | `ERR_ENDPOINT_NOT_URL_ADDRESSED` |
  | `ERR_ENDPOINT_NOT_L4` | `ERR_ENDPOINT_NOT_PORT_ADDRESSED` |
  | `ERR_UNKNOWN_ADDRESS_PROPERTY` | `ERR_UNKNOWN_ENDPOINT_PROPERTY` |

  New codes: `ERR_UNKNOWN_CONNECTION_MEMBER`, `ERR_UNUSED_INPUT`,
  `ERR_COMPONENT_COUNT`, and, at admission, `ERR_UNKNOWN_LICENSE`,
  `ERR_MEDIA_TOO_LARGE` and `ERR_MEDIA_DIMENSIONS`.
- **Vocabulary.** A blueprint is deployed, not installed: the v1 nouns
  `installation`, `installer` and `install form` are **deployment**,
  **deployer** and **deploy form**. A value's provenance is its **origin**.
  Component references are **item-local** or **catalog** references. The glossary
  is the term records in `docs/terminology.yaml`; link to it rather than
  restating it.

## platform-api and the platform

- **Blueprint graph.** `spec.components` is `spec.nodes`, and the resolution
  record's `components` is `nodes`. `installationSnapshot` is
  `deploymentSnapshot`
  ([blueprint v2, resolution record](../specifications/blueprint/v2/spec.md#resolution-record)).
- **Creator facts.** `deployment.installer.{identity,email,name}` is
  `deployment.creator.{identity,email,name}`, captured once when the deployment
  is created.
- **Access.** `access: AUTHENTICATED` is `access: RESTRICTED`: only viewers who
  sign in and whom the deployment's access policy admits
  ([blueprint v2 §4.5](../specifications/blueprint/v2/spec.md#access)). The
  blueprint keeps `accessExemptions` as the grant.
- **Private endpoints are isolated.** A `PRIVATE` endpoint MUST NOT be reachable
  from another deployment, another organization or the public (issue #177). The
  platform's network policy enforces it.
- **Connections for any protocol.** Besides `OPENAI_CHAT_COMPLETIONS` and
  `ANTHROPIC_MESSAGES`, a connection may be `POSTGRES`, `REDIS` or `S3`, each
  with a fixed member set, sensitive members marked
  ([component v2 §6.4](../specifications/component/v2/spec.md#connection-requirements)).
  A selection is `MANAGED` (granted or provisioned by Musher) or `USER`. A
  provisioned selection is created at first acquisition for the deployment,
  reused across retry, redeploy and update, and released only when the
  deployment is deleted; retention belongs to platform-api.
- **Source and build recipe.** `workload.source` is one of `image`,
  `git: {repositoryURL, ref}` or the new `upload: {digest: "sha256:<64 hex>"}`.
  The build recipe moved out from under `git` to `workload.build`, beside the
  source: required for a `git` or `upload` source and forbidden for `image`. It
  holds `context` (a directory relative to the source root, default `.`, never
  `..`), exactly one of `dockerfile` (now relative to `context`, as in Compose)
  or `buildpacks: {builderImage}`, non-sensitive `arguments`, and `secrets`,
  each naming a sensitive, guaranteed input
  ([component v2 §5.1](../specifications/component/v2/spec.md#source)). A build
  reads nothing outside `context`, so which components a push touched is
  decidable by path. A build secret MUST NOT reach an image layer, build
  provenance, the build log or the launch environment. A recipe is always named
  by the document and never inferred. An upload is a POSIX tar, optionally
  gzip-compressed, and its extraction rejects any entry that could escape the
  archive root. A Git ref may name a `branch`, a `tag` or a full `commit`, and
  `repositoryURL` is an `https` URL without credentials, query or fragment.
- **The `sources` and `build` resolution stages.** `sources` runs first and
  only pins content: a git ref resolves to a commit, an upload is verified
  against its digest, and a tag-only image or a buildpacks builder resolves to a
  digest. `build` runs after `values`, because build secrets read resolved
  values, and builds a git or upload source into an image digest. The record
  keeps `source: IMAGE | GIT | UPLOAD | EXTERNAL`, adds `uploadDigest`,
  `recipeDigest` and `builderDigest`, and prefixes every digest with `sha256:`.
- **Inputs without a target.** A workload input's `target` is optional. An input
  with no target is never written to the environment and must be read by
  something else, otherwise `ERR_UNUSED_INPUT`.

## The catalog

- **Migrate every document to v2** with the Migration from v1 tables, then
  re-validate every item. The catalog enforces one component per component
  item: `itemType: COMPONENT` with any other count is `ERR_COMPONENT_COUNT`
  ([`LIST-ITEM-002`](../specifications/listing/v2/spec.md#LIST-ITEM-002)).
- **Listing fields.** `spec.description` (Markdown) is `spec.overview`, written
  in the overview Markdown profile, and `sourceRepoURL` is
  `sourceRepositoryURL`. The new optional `spec.gettingStarted`, at most 5 000
  characters in the same profile, says what a person does right after the
  deployment is running
  ([listing v2 §4](../specifications/listing/v2/spec.md#presentation)). It
  follows the same media and link rules, and it never holds a value.
- **Categories.** Use the reviewed category set in
  [listing v2 §4.2](../specifications/listing/v2/spec.md#vocabularies). Map
  stored categories that left the set before migrating.
- **Media bounds.** Size is checked from file metadata in `semantic`, never by
  decoding: an icon at most 1 MiB, each screenshot at most 5 MiB
  (`ERR_MEDIA_TOO_LARGE`). Dimensions are an admission rule that reads only
  image headers: the icon square and at least 256 px, a screenshot at most
  4096 px per side (`ERR_MEDIA_DIMENSIONS`)
  ([listing v2 §5](../specifications/listing/v2/spec.md#media)).
- **SPDX licences** are checked at admission against the SPDX list release the
  platform pins (`ERR_UNKNOWN_LICENSE`).
- **Storefront, catalog and library.** The catalog is the curated, public
  collection of listed items, and the storefront is the browsing UI. What an
  organization publishes for its own use is its library, which needs no
  listing ([2.1.0](#adopting-210)).

## <a id="adopting-210"></a>Adopting 2.1.0

Every family releases `2.1.0`, in the same order. No document that validated at `2.0.0`
stops validating. What a consumer adopts:

- **Vendor core's release record and registries** (#217). Core now ships data
  interfaces: its `release.json`, the schemas registries follow, and registries of
  requirements, diagnostics, vocabulary and term records. Each family ships its
  own requirement and diagnostic registries. Read them instead of copying
  `spec.md` tables or regular expressions
  ([ADR 0043](adr/0043-registries-are-released-data-interfaces.md)).
- **The validation result schema** (#218). A result validates against core's
  `validation-result` schema: every diagnostic carries a required `severity`
  (`ERROR` or `WARNING`) and a `path`, and phases, scopes and stages keep the
  specification's lower case. Only an `ERROR` makes a result `INVALID`. Map any
  platform field names onto these
  ([ADR 0044](adr/0044-the-validation-result-is-a-released-schema.md)).
- **The protocol registry and the connection-evidence schema** (#219).
  Connection protocols are records in component's `protocols/`, the
  `component-protocols` interface, and blueprint ships a connection-evidence
  schema, the `blueprint-connection-evidence` interface. Generate member tables and enums from
  them rather than hand-porting
  ([ADR 0045](adr/0045-connection-protocols-are-a-registry.md)).
- **Three messaging protocols and `credential.secrets`** (#220).
  `TELEGRAM_BOT`, `SLACK_APP` and `DISCORD_BOT` join the connection protocols.
  A selection carries a protocol's extra secret members in `credential.secrets`
  ([ADR 0045](adr/0045-connection-protocols-are-a-registry.md)).
- **Catalog and library** (#221). The catalog is curated and public, and an
  organization publishes to its library, which needs no listing. A catalog
  reference resolves against the deploying organization's library and the
  catalog. Glossaries adopt both terms; validation does not change
  ([ADR 0046](adr/0046-the-catalog-is-curated-and-an-organization-publishes-to-its-library.md)).

## <a id="adopting-220"></a>Adopting 2.2.0

Component `2.2.0` gives every run of a `JOB` a time limit (#226). Core `2.2.0`
carries its two new term records, and blueprint `2.2.0` carries component's new
code in its diagnostics registry. No document that validated at `2.1.0` stops
validating. What a consumer adopts:

- **Validate the time limit.** `spec.workload.timeLimitSeconds` is an integer
  from 1 to 604800 seconds, on a `JOB` only. A scheduled job's limit is shorter
  than its schedule's period, the shortest interval between two times the
  schedule falls due; otherwise `ERR_TIME_LIMIT_NOT_UNDER_SCHEDULE`, in the
  `semantic` phase. The specification says how to compute the period exactly
  ([component v2 §5.7](../specifications/component/v2/spec.md#computing-the-period)).
  Regenerate SDK types from the bundle.
- **Stop every run at its limit** (platform-api). A run's limit is
  `timeLimitSeconds`, or by default 900 seconds (15 minutes), or one second
  less than the schedule's period when that is shorter
  ([`COMP-JOB-007`](../specifications/component/v2/spec.md#COMP-JOB-007)). A
  run still executing at its limit is stopped and recorded as failed
  ([`COMP-JOB-008`](../specifications/component/v2/spec.md#COMP-JOB-008)), so a
  hung run never blocks its schedule, and anything waiting for a run to end
  waits no longer than its limit.
- **Declare a limit on a long job.** The 15-minute default is the platform
  operator's decision of 2026-11-13, so that every job has a limit. A job that
  declares none and runs longer than 15 minutes is stopped at 15 minutes once
  the platform adopts 2.2.0. A catalog item whose job needs longer declares
  `timeLimitSeconds`.

## <a id="adopting-230"></a>Adopting 2.3.0

Core, component and blueprint release `2.3.0` (#231), and listing `2.1.2`
records core `2.3.0` (#238). Every change is an optional field, a new value or
a relaxation, so no document that validated at `2.2.0` stops validating. ADRs
0047 to 0063 record the decisions. What a consumer adopts:

- **Workloads** (component). A workload without an endpoint starts when its
  process runs (`COMP-HEALTH-001`, ADR 0047). Its environment is the image's,
  overlaid by its inputs (`COMP-ENVVAR-005`, `COMP-ENVVAR-006`, ADR 0048). TCP,
  gRPC and exec probes and HTTP probe headers (`COMP-PROBE-001` to `006`, ADR
  0049). An `entrypoint`, configuration `files` and mixed-case environment
  names (`COMP-CMD-002`, `COMP-FILE-001` to `005`, `COMP-ENVVAR-004`, ADR
  0050). A compute floor and recommendation (`COMP-COMPUTE-001` to `003`, ADR
  0051). Shared memory, capabilities, seccomp and sysctls from an allowlist
  (`COMP-SECURITY-001` to `005`, ADR 0052). New codes: `ERR_ENDPOINT_NOT_TCP`,
  `ERR_ENDPOINT_NOT_GRPC`, `ERR_INVALID_COMPUTE`,
  `ERR_CAPABILITY_NOT_GRANTED`, `ERR_SECCOMP_NOT_GRANTED` and
  `ERR_SYSCTL_NOT_GRANTED`.
- **Connections** (component and blueprint). The `OPENAI_EMBEDDINGS`
  protocol, and connections a node provides, bound with `{node, connection}`
  (`COMP-CONNECTION-004`, `005`, `BP-CONNECTION-004`, `005`, ADR 0059). New
  codes: `ERR_INVALID_PROVIDED_CONNECTION` and
  `ERR_UNKNOWN_PROVIDED_CONNECTION`.
- **Parameters** (blueprint). An organization API key deploys as the user who
  created it (`BP-PARAM-015`, `016`, ADR 0053). A parameter's value schema is
  the intersection of its inputs' (`BP-PARAM-002`, `004`, `017`, ADR 0054),
  with `WARN_GENERATOR_OUTSIDE_SCHEMA`. `ui.options`, `ui.editable` and a
  disclosed generated value (`BP-UI-006` to `009`, ADR 0062).
- **Start order** (blueprint). `startAfter` (`BP-ORDER-001` to `005`, ADR
  0055), with `ERR_INVALID_START_ORDER` and `ERR_START_CYCLE`. A job run's time
  limit counts from its start and ends with a graceful stop (`COMP-JOB-008`,
  ADR 0063).
- **Bindings and access** (blueprint). String templates encoded by `format`
  (`BP-BIND-009` to `012`, ADR 0056), with `ERR_INVALID_TEMPLATE`. Many public
  hosts and mounts with one sign-in (`BP-HOST-001` to `005`, ADR 0057), with
  `ERR_INVALID_HOST_MOUNT`. A `ROLE` claim and OIDC client-secret rotation
  (`BP-ACCESS-013` to `015`, ADR 0060). A platform-checked API key and exact,
  segment-bounded exempt paths (`COMP-EP-021`, `BP-ACCESS-016` to `018`, ADR
  0061), with `ERR_INVALID_API_KEY_PARAMETER`.

Some released documents change in **defined meaning**, which no replay can
see. The platform adopts each of these, and each spec states it as an adoption
note:

- **[`BP-ACCESS-012`](../specifications/blueprint/v2/spec.md#BP-ACCESS-012).**
  An exemption opens path by path, once a rollout that exempts it is active.
  A released document carries no `startAfter`, so its exempt path opens once
  the node that exposes it is ready in that rollout, no longer as soon as the
  node serves; another node of the deployment does not hold it closed.
- **[`BP-ACCESS-009`](../specifications/blueprint/v2/spec.md#BP-ACCESS-009).**
  An exempt path matches exactly or by `/`-bounded prefix, so `/webhook` no
  longer covers `/webhooks`. The path is matched once decoded and with dot
  segments removed, and a path holding `;`, `\`, a NUL, an empty segment or an
  encoded `/`, `\` or `%` is never exempt.
- **[`BP-PARAM-016`](../specifications/blueprint/v2/spec.md#BP-PARAM-016).** A
  `deployment`-scope validation treats its caller as the creator, and reports a
  deployment fact the caller lacks as `ERR_DEPLOYMENT_FACT_UNAVAILABLE` rather
  than deferring it.
- **[`COMP-ENVVAR-005`](../specifications/component/v2/spec.md#COMP-ENVVAR-005).**
  An image that sets `HOSTNAME` keeps its value; the platform no longer writes
  the replica's name over it.
- **[`COMP-SECURITY-005`](../specifications/component/v2/spec.md#COMP-SECURITY-005).**
  Every workload runs with no-new-privileges and its runtime's default seccomp
  profile, so one that gains privilege through a setuid binary, or makes a
  call that profile blocks, fails until its component is revised.
- **[`COMP-JOB-008`](../specifications/component/v2/spec.md#COMP-JOB-008).** A
  run's limit counts from its command's start, after its `startAfter`
  conditions hold. At its limit a run gets its image's stop signal, `SIGTERM`
  by default, and at least 10 seconds before a forced end, and it has failed
  even if it then exits 0.
- **[`COMP-HEALTH-001`](../specifications/component/v2/spec.md#COMP-HEALTH-001).**
  A replica without a probe is started once its process runs, and ready once
  started. No platform requires a port other than a declared endpoint's, and a
  port-bind check is never stricter than a declared probe.

**Runtime obligations no case catches.** These requirements are platform
obligations: no document breaks them, and the conformance corpus records why
none pins them (`UNPINNED` in `tools/src/conformance/conformance.ts`).
platform-api and the host agent own their tests:

- the edge: exempt-path matching and when it takes effect (`BP-ACCESS-009`,
  `BP-ACCESS-012`, `BP-ACCESS-017`), the role claims it issues
  (`BP-ACCESS-014`), the rotated OIDC client secret applied as a rollout
  (`BP-ACCESS-015`), the API key checked in constant time with its previous
  generation (`BP-ACCESS-018`), and hosts and the one sign-in (`BP-HOST-001`,
  `BP-HOST-004`, `BP-HOST-005`);
- rollouts: holding a node until its `startAfter` conditions hold and when a
  rollout is active (`BP-ORDER-004`, `BP-ORDER-005`), and a job run's time
  limit and stop (`COMP-JOB-008`);
- the creator of an API-key deployment (`BP-PARAM-015`);
- workloads: start and readiness (`COMP-HEALTH-001`), the environment
  (`COMP-ENVVAR-005`), how the prober runs each mechanism (`COMP-PROBE-006`),
  configuration files (`COMP-FILE-004`), the compute floor
  (`COMP-COMPUTE-003`) and the security settings (`COMP-SECURITY-005`).

## <a id="adopting-240"></a>Adopting 2.4.0

Core, component and blueprint release `2.4.0`, in that order, and listing
releases `2.1.3` recorded against core `2.4.0`. A deployment can reach another
deployment's `PRIVATE` endpoint, in the same organization, through an export
and an import
([ADR 0058](adr/0058-a-deployment-exports-a-private-endpoint-to-a-named-consumer.md);
[blueprint v2 §5.5](../specifications/blueprint/v2/spec.md#exports)). Documents
carry roles; the platform's policy carries parties. What a consumer adopts:

- **The `exports` namespace** (core). Core reserves `exports`, defined only in
  a blueprint parameter's `from`. `${{ exports.x }}` written where no family
  permits it now reports `ERR_NAMESPACE_NOT_PERMITTED` instead of
  `ERR_UNKNOWN_PLACEHOLDER_NAMESPACE`. Both reject, so no verdict changes.
  Regenerate from core's vocabulary registry.
- **Validate the exporter** (blueprint). `spec.exports.<key>` is
  `{node, endpoint}`, closed, keyed by a DNS label, and names a `PRIVATE`
  endpoint of a `SERVICE` or `WORKER` node (`BP-EXPORT-001`, `002`). A document
  names no consumer.
- **Validate the importer** (blueprint). An import parameter, the seventh
  parameter origin, has `from: "${{ exports.<export-name> }}"`, exactly one
  DNS-label segment (`BP-EXPORT-003`), and is never submitted
  (`BP-PARAM-013`). A node binds it with `{parameter, property}`, `property`
  one of `privateHostname`, `privatePort` and `privateAddress`, or in a
  template as `${{ parameters.<import>.<property> }}`; `property` belongs to
  an import parameter alone, and an import is bound only with one
  (`BP-EXPORT-004`). New codes: `ERR_ENDPOINT_NOT_EXPORTABLE`,
  `ERR_INVALID_EXPORT_PATH` and `ERR_INVALID_IMPORT_BINDING`, all semantic.
  Regenerate SDK types from the bundle.
- **Resolve an import** (platform-api). Acquisition is authorized, persisted
  and recorded once per deployment and parameter, and reused by every retry,
  redeploy and update (`BP-EXPORT-005`). An unknown, withdrawn or not granted
  export is one code, `ERR_EXPORT_UNAVAILABLE`, at stage `connections`, so no
  caller can enumerate exports. A granted import yields the endpoint's three
  facts.
- **Own the policy** (platform-api). An export has an organization-scoped
  export name: a DNS label, unique among the organization's live and
  quarantined names, `<deployment-name>-<key>` by default. A rename
  quarantines the old name for 90 days with no redirect; existing selections,
  bound by ID, survive, and a fresh resolution of the old name is
  `ERR_EXPORT_UNAVAILABLE`. The consumers an export admits are bound by
  deployment ID through the platform API, never by a document. Same
  organization only.
- **Widen private reach** (the platform network).
  [`BP-ACCESS-011`](../specifications/blueprint/v2/spec.md#BP-ACCESS-011)
  admits, beside the deployment's own nodes and the probing host, the
  consumers an export grant admits, to that endpoint alone.
- **Run the new cases** (every adapter). A resolution fixture's context gains
  an `imports` key, which the
  [fixture format](conformance.md#resolution-context) defines beside
  `connections`.

**Runtime obligations no case catches**, each recorded in `UNPINNED`:

- `BP-EXPORT-006`: network admission covers only the exported endpoint, from
  a granted consumer. A revoke denies new connections within 4 seconds;
  established connections may survive it.
- `BP-EXPORT-007`: an importer keeps the exporter's facts until its own next
  rollout, and follows an exporter's redeploy on that rollout.
- `BP-EXPORT-008`: deleting an exporter whose export is imported is refused
  unless forced. A forced delete withdraws the export, ends the imports and
  degrades the consumers.

## musher-cli

- Write and validate v2 documents only, with the v2 bundles, and report the v2
  codes and phases above.
- Fix the `kind: App` drift: the kinds are `COMPONENT`, `BLUEPRINT` and
  `LISTING`.
- Name a build recipe in the document; never detect one at build time. A tool
  MAY write a recipe into the document before publication.
- Rename `target.envVarKey` to `target.envVar`, and an endpoint's
  `accessExemptions: {paths, bearer}` to `exemptibleRequests: {paths,
  bearerToken}`. A probe's `auth.bearer` does not change.

## Pelorus

- Rename `Installer` to `Creator`, and record `Release` as Pelorus's name for a
  rollout, one applied generation of a deployment.
- Retire the definition of a connection as a blueprint edge. A **binding**
  supplies an input from an origin; a **connection** is one origin kind,
  reached through a connection parameter.
- Map `source_build.cml` onto the component's source and build recipe: one
  source snapshot (`GITHUB | UPLOAD`) plus one build recipe, and
  `recipeDigest` as the digest of the recipe in canonical form.
- Link the platform glossary to the term records for document vocabulary.

## SDKs

Regenerate every model and validator from the v2 bundles. The field renames
(`nodes`, `deploymentSnapshot`, `creator`, `envVar`, `exemptibleRequests`,
`overview`, `sourceRepositoryURL`, `validationScope`), the value rename
(`RESTRICTED`), the phase rename (`admission`) and the new connection
protocols, source kinds and build recipe all change generated types. Drop the
v1 types.

## The host agent

Probes now forward the probing host. A probe arrives from a peer inside
`trustedProxyCIDRs`, carries no viewer identity, and carries
`Forwarded: for=<address>` and `X-Forwarded-For: <address>`, both naming one
non-loopback address of the probing host, as the platform proxy does for viewer
traffic (issue #184;
[component v2 §5.4](../specifications/component/v2/spec.md#health)). A health
path must answer such a request. The change lands in the host agent's probe
request construction (`crates/core/src/dto.rs`).
