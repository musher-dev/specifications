# Using the schemas

Every [kind family](../specifications/README.md#kind-family) publishes one
JSON Schema (draft 2020-12) bundle per major version, and one per exact release.
This page is for anyone validating Musher documents: in an editor, in
automation, or offline. Core publishes no document schema, for the reason
[How the families relate](../specifications/README.md#how-the-families-relate)
gives. What core and each family do publish as data, the registries and the
interface schemas, is in [Registries](#registries).

## <a id="which-url"></a>Which URL

| Name | URL | Serves | Changes? | Use for |
|---|---|---|---|---|
| Major-version alias | `https://specifications.musher.dev/<family>/v<MAJOR>/<family>.schema.json` | The newest release in the major, or a build of `main` before the major's first release | Yes, on every release | Editors and people |
| Exact release | `https://specifications.musher.dev/<family>/v<MAJOR>.<MINOR>.<PATCH>/<family>.schema.json` | Exactly one release | Never | CI, automation, and audit |

Each bundle's `$id` is the URL it is served at. Each exact release URL has a
`.sha256` file beside it, and `/<family>/versions.json` lists every release of a
family.

Every kind family has released v2, starting at `2.0.0`, so each has an exact
release URL to pin, such as
`https://specifications.musher.dev/component/v2.0.0/component.schema.json`.
Whether a given version has been released is explained in
[Draft or released](publication.md#draft-or-released).

## <a id="in-your-editor"></a>In your editor

v2 is the current major of every family, and a v2 document declares
`specVersion: v2`. Add a modeline to the top of a document, naming its
family's alias:

```yaml
# yaml-language-server: $schema=https://specifications.musher.dev/<family>/v2/<family>.schema.json
```

| Family | Modeline |
|---|---|
| component | `# yaml-language-server: $schema=https://specifications.musher.dev/component/v2/component.schema.json` |
| blueprint | `# yaml-language-server: $schema=https://specifications.musher.dev/blueprint/v2/blueprint.schema.json` |
| listing | `# yaml-language-server: $schema=https://specifications.musher.dev/listing/v2/listing.schema.json` |

Or bind by file name in VS Code's `settings.json`, with the Red Hat YAML
extension. These are the same patterns the catalog below publishes:

```json
{
  "yaml.schemas": {
    "https://specifications.musher.dev/component/v2/component.schema.json": [
      "**/components/*.yaml",
      "**/components/*.yml",
      "**/component.yaml",
      "**/component.yml",
      "**/component-*.yaml",
      "**/component-*.yml"
    ],
    "https://specifications.musher.dev/blueprint/v2/blueprint.schema.json": [
      "**/blueprint.yaml",
      "**/blueprint.yml"
    ],
    "https://specifications.musher.dev/listing/v2/listing.schema.json": [
      "**/listing.yaml",
      "**/listing.yml"
    ]
  }
}
```

The v2 alias serves the newest v2 release, so it moves only when a v2 release
ships.

A tool that reads SchemaStore-format catalogs can discover all of this from
`https://specifications.musher.dev/catalog.json`, which binds each family's
file patterns to its major-version alias. Its `url` names the newest released
major, v2 since `2.0.0`, and its `versions` lists every major, v1 included.

### <a id="v1-urls"></a>v1 URLs

v1 is retired ([ADR 0038](adr/0038-v2-one-vocabulary-and-v1-retires.md)). Its
URLs keep working, because released bytes never change: every exact v1 release
URL, such as `https://specifications.musher.dev/component/v1.6.1/component.schema.json`,
serves its release asset for good, and the v1 alias keeps serving the newest
v1 release. They validate v1 documents only. v1 takes no further release, so
move a document to v2 with the "Migration from v1" section of its family's
`spec.md`.

## <a id="pinning"></a>Pinning in automation

Automation MUST pin an exact release URL. A major-version alias exists so an
editor picks up backward-compatible additions without a configuration change,
which is exactly what makes it the wrong target for a build: the bytes behind it
change when a release ships. An exact release URL serves the same bytes for as
long as the site exists.

## <a id="offline"></a>Offline and vendoring

Every bundle is self-contained: every `$ref` resolves inside its own `$defs`,
so no validator ever makes a network request to evaluate a document.

To vendor a release, download its assets from
[GitHub Releases](https://github.com/musher-dev/specifications/releases). What
each release attaches, and what its archive holds, is listed in
[Publication → Release assets](publication.md#release-assets). The bundle in a
release is byte-for-byte what its exact release URL serves.

To inspect the schema a checkout would publish, run `task bundle`, which writes
it under `dist/`.

## <a id="registries"></a>Registries and interface schemas

From 2.1.0, every release archive carries facts a consumer used to port from
the prose by hand, as JSON
([ADR 0043](adr/0043-registries-are-released-data-interfaces.md)):

| File | In | Holds |
|---|---|---|
| `registry/requirements.json` | every family | The family version's own requirement IDs, each with its anchor in `spec.md` and the section stating it. |
| `registry/diagnostics.json` | every family | Every code a document of the family may report: core's, each dependency's and its own, with its phases, its severities and the family declaring it. |
| `registry/vocabulary.json` | core | The ordered phases, the scopes with their phases, the result statuses, the severities, the resolution stages, and the reserved namespaces with whether each is assigned. |
| `registry/terms.json` | core | Every term record, as `docs/terminology.yaml` holds it. |
| `interfaces/validation-result.schema.json` | core | The shape of a validation result ([ADR 0044](adr/0044-the-validation-result-is-a-released-schema.md)). |
| `interfaces/registry/*.schema.json` | core | The schema each registry file and the term records are valid against. |
| `protocols/*.json` | component | One record per connection protocol, with its members, and `categories.json` ([ADR 0045](adr/0045-connection-protocols-are-a-registry.md)). |
| `interfaces/connection-evidence.schema.json` | blueprint | The shape of the `connections` resolution context, generated from component's protocol records. |

Each is part of a gated interface in `.repo/outputs.toml`: `core-registry`,
`component-registry`, `blueprint-registry` and `listing-registry` for each
family's `registry/`, `core-validation-result` and `core-registry-schemas` for
core's `interfaces/`, `component-protocols` for `protocols/`, and
`blueprint-connection-evidence` for blueprint's `interfaces/`. Each is listed
with every file's SHA-256 in the archive's `release.json`, so a vendored copy is checked offline
like the bundle. `spec.md` stays normative: a registry is generated from it by
`task docs`, and `task check:docs` fails when the two disagree. Within a major
version an ID, a code, a term or a list entry is never removed, and a list
grows only at its end; `task check:compat:registry` holds each file to its last
release. The site does not serve these files yet: read them from the release
archive, or at a tag in this repository.

## <a id="verifying"></a>Verifying what you downloaded

Checksums, provenance attestations, and the ledger of every release's hash are
covered, with commands, in
[Verifying a release](../.github/SECURITY.md#verifying-a-release).

## <a id="headers"></a>Headers you will see

Every path is served with open CORS, so a browser-based validator can fetch a
schema directly. An exact release is cached as immutable, and an alias is
revalidated within five minutes of a release. The full table is in
[Publication → Cache policy](publication.md#cache-policy).

## <a id="moved-host"></a>Moved host

These schemas were first served from `schemas.musher.dev`. That host is being
retired: once the redirect is in place, it answers with a `301` to the same path
on `specifications.musher.dev`. Every `$id` names the new host, and nothing was
ever released under the old one, so no exact release URL moves. Point
automation, and every modeline and binding, at `specifications.musher.dev` now
rather than relying on the redirect. The redirect is not live yet, and not
every validator follows one.
