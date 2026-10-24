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
stored document to v2 and then removes its v1 code path. The history of the v1
migration is in [Downstream v1 adoption](downstream-v1-adoption.md).

Every v2 `spec.md` ends its scope section with a **Migration from v1** table
that maps each renamed field, value, diagnostic code and requirement ID to its
v2 form. Generate renames from those tables rather than from this page.

## Pin the v2 releases

Pin exact releases once they are tagged, in release order: `core/v2.0.0`, then
`component/v2.0.0`, then `blueprint/v2.0.0` and `listing/v2.0.0`. Every core
release re-releases every dependent family in the same release set
([Publication → The dependency gate](publication.md#core-release-alignment)),
so all four always sit on one core release. Vendor each release archive, which
carries its schema, specification, examples, conformance corpus and whole
dependency closure, and verify it as
[Verifying a release](../.github/SECURITY.md#verifying-a-release) shows.

Before the tags exist, build from a pinned commit as
[Using the schemas → Pinning](using-schemas.md#pinning) describes. Never pin
`main`.

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
  Catalog references are **item-local** or **catalog** references. The glossary
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
- **Storefront and catalog.** The catalog is the published collection; the
  storefront is the browsing UI.

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
