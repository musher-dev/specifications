# ADR 0040: Source and build recipe

- **Status:** Accepted
- **Date:** 2026-10-24
- **Extends:** [ADR 0028](0028-explicit-binding-and-resolution-before-release.md) §3, §4, two stages, the record
- **Extends:** [ADR 0029](0029-reproducible-release-and-installation-contracts.md) §2, what the record pins
- **Refines:** [ADR 0033](0033-inputs-are-the-only-way-into-a-component.md) §1, an input with no target
- **Relies on:** [ADR 0038](0038-v2-one-vocabulary-and-v1-retires.md) §5, §7, phases, stages and origins
- **Closes:** [#190](https://github.com/musher-dev/specifications/issues/190)
- **Closes:** [#191](https://github.com/musher-dev/specifications/issues/191)
- **Closes:** [#192](https://github.com/musher-dev/specifications/issues/192)
- **Closes:** [#193](https://github.com/musher-dev/specifications/issues/193)
- **Closes:** [#194](https://github.com/musher-dev/specifications/issues/194)

## Context

In v1 a component's image came from `workload.source`, which held either
`image` or `git`, and a Git source carried its own `build`: a Dockerfile path
relative to the repository root, or a buildpacks builder, plus build
arguments. Five issues found where that stops:

- **Monorepos (#190).** One repository cannot hold several components usefully.
  The whole repository is the build context, so a platform cannot tell which
  components a push touched, and every push rebuilds everything.
- **Build secrets (#191).** A build that needs a token, for a private package
  registry say, can only take it as a build argument, and an argument lands in
  the image history, the build provenance and the build log.
- **Resolution of a Git node (#192).** Blueprint resolution records a commit
  and an image digest for a Git build, but no stage pins them, and no fixture
  resolves a Git node at all.
- **Uploaded source (#193).** Source that is not in a Git host cannot be built.
- **Detection (#194).** Whether a recipe is ever guessed from the source, as
  zero-configuration platforms do, was never decided.

Pelorus already models this, in its
[`source_build.cml`](https://github.com/musher-dev/pelorus/blob/c031ce3/pelorus/context-mapper/domains/workload/contexts/source_build.cml)
context. A `SourceSnapshot` is one commit of a connected repository, or one
uploaded archive, fixed with the digest of its contents, and its
`SnapshotOrigin` is `GITHUB` or `UPLOAD`. A `BuildRecipe` is how an image is
built from a snapshot, "as the component document writes it: a Dockerfile, or
a Cloud Native Buildpacks builder; never guessed", with a `recipeDigest` over
its canonical form. An `ImageBuild` is one image built from exactly one
snapshot with one recipe, named by its digest. An upload arrives through an `UploadSlot` that accepts only the
bytes of the digest declared when it was opened.

The recipe is not a property of the Git source. Building an upload needs the
same recipe, so v1's `git.build` is in the wrong place.

## Decision

### 1. Source and build recipe are two concepts

The **source** says where the content comes from. The **build recipe** says how
an image is made from it. `workload.source` holds the first and
`workload.build` the second, as `SourceSnapshot` and `BuildRecipe` are two
things in Pelorus. "source" means only this, a workload source
([ADR 0038](0038-v2-one-vocabulary-and-v1-retires.md) §7).

```yaml
workload:
  source:
    git:
      repositoryURL: https://github.com/musher-dev/examples
      ref: { branch: main }
  build:
    context: services/api
    dockerfile: Dockerfile
    arguments: { NODE_ENV: production }
    secrets:
      NPM_TOKEN: { input: npmToken }
```

### 2. A source is an image, a Git commit or an uploaded archive

`COMP-SRC-001`: `workload.source` holds exactly one of `image`, `git` and
`upload`. Naming none is `ERR_MISSING_FIELD` at `/spec/workload/source`, and
naming two or more is `ERR_INVALID_VALUE` there, structural.

- **`image`** is unchanged: an OCI image reference
  ([`COMP-SRC-002`](../../specifications/component/v2/spec.md#COMP-SRC-002)).
- **`git: {repositoryURL, ref}`** no longer holds `build`; a `git.build` is
  `ERR_UNKNOWN_FIELD`. `ref`, when present, holds exactly one of `branch`,
  `tag` and `commit`, and an omitted `ref` requests the default branch. A tag
  is a request like a branch, because a tag can be moved. `ref.commit` is a full
  commit object ID, `^[0-9a-f]{40}$` or `^[0-9a-f]{64}$`, never an
  abbreviation, which can become ambiguous as a repository grows.
  `repositoryURL` is an absolute `https` URL without userinfo, query or
  fragment. Each is `ERR_INVALID_VALUE` at its field otherwise, structural
  (`COMP-SRC-006`). A document never names a Git credential: private
  repository access is the platform's source connection, which the organization
  configures outside the document.
- **`upload: {digest}`** (#193) names an archive by the digest of its bytes,
  exactly as uploaded. `digest` is REQUIRED and matches
  `^sha256:[0-9a-f]{64}$`; anything else is `ERR_INVALID_VALUE` at
  `/spec/workload/source/upload/digest`, structural. The archive is a POSIX
  tar, in the ustar or pax format, optionally gzip-compressed, and the digest
  is of the bytes uploaded, compressed or not. Its size limit and the upload API
  belong to the platform.

**Extraction (`COMP-SRC-007`).** The platform extracts an upload with the
archive root as the source root, and rejects the whole archive, extracting
nothing, when it is not such a tar, or when an entry has an absolute path or a
`..` segment, two entries name one path, an entry is a device, a FIFO or a hard
link, or a symbolic link's target resolves outside the archive root. A rejected
archive is `ERR_INVALID_RESOLUTION_CONTEXT` in the `sources` stage. The rule is
a platform obligation: a fixture carries no archive bytes.

The **source root** is the repository's root at the resolved commit for `git`,
and the archive root for `upload`. The **source content key** of a `git` or
`upload` source names exactly the content a build reads: the resolved commit
for `git`, and `upload.digest` for `upload`. `COMP-SRC-004` is unchanged: a
published workload carries a source, checked at `admission`.

### 3. The build recipe is `workload.build`

`workload.build` is permitted beside a `git` or `upload` source and nowhere
else. Beside `image` it is `ERR_INVALID_VALUE` at `/spec/workload/build`, and a
`git` or `upload` source without it is `ERR_MISSING_FIELD` at
`/spec/workload`, both structural. A workload that has no source yet may carry
a build, as an unfinished component may carry anything its finished form
allows.

| Field | Rule |
|---|---|
| `context` | A directory relative to the source root. Default `.`. Either `.` or one or more segments joined by `/`, with no empty, `.` or `..` segment and no leading or trailing `/`; at most 512 characters |
| `dockerfile` | A file path relative to `context`, in the same grammar except that `.` is not a file |
| `buildpacks: {builderImage}` | A Cloud Native Buildpacks builder, as an OCI image reference |
| `arguments` | Build-time values keyed by name in the environment-variable grammar of [component §5.3](../../specifications/component/v2/spec.md#env-vars), each a non-sensitive literal string |
| `secrets` | `{<ID>: {input}}`, keyed in the same grammar ([§5](#5-build-secrets-and-inputs-with-no-target)) |

The recipe holds exactly one of `dockerfile` and `buildpacks`. Naming neither
is `ERR_MISSING_FIELD` and naming both `ERR_INVALID_VALUE`, at
`/spec/workload/build`, structural. A path outside the grammar is
`ERR_INVALID_VALUE` at its field, structural.

`dockerfile` is relative to `context`, as it is in Compose, and no longer to
the repository root. A v1 recipe migrates unchanged, because `context`
defaults to `.`.

### 4. A build reads nothing outside its context

**The context rule.** An implementation builds with `context` as the whole
build context: the Docker build context of a Dockerfile build, and the
application directory of a buildpacks build. A build MUST NOT read any file of
the source outside `context`, including through a symbolic link that resolves
outside it. The grammar keeps the Dockerfile inside the context too, because
the recipe file is an input to the build like any other.

That makes one question decidable by path alone (#190): **a change to a Git
source touches a component exactly when a changed path lies under its
`context`.** A platform tracking a branch can therefore rebuild and release
only the components a push touched. When it does so, and whether a push
releases anything at all, is continuous delivery, which belongs to the
platform and not to this specification.

The rule is a platform obligation, with a requirement ID that a behavioural
case pins or a runner exclusion explains.

### 5. Build secrets, and inputs with no target

**A build secret (#191)** is named in `build.secrets` by an ID and takes its
value from one of the component's own inputs. Each check below is semantic and
anchors at `/spec/workload/build/secrets/<ID>/input` unless it says otherwise:

| The named input | Otherwise |
|---|---|
| exists | `ERR_UNKNOWN_INPUT` |
| is a value input whose schema is a string | `ERR_VALUE_CONSTRAINT` |
| is `sensitive: true` | `ERR_VALUE_CONSTRAINT` |
| is always supplied: required, since a sensitive input carries no default | `ERR_INPUT_NOT_GUARANTEED` |

A secret ID that is also an `arguments` key is `ERR_CONFLICTING_ENV_VAR` at
`/spec/workload/build/secrets/<ID>`, semantic, because a buildpacks build
receives both through one environment.

A Dockerfile build mounts each secret as a BuildKit secret whose `id` is the
secret ID, read by `RUN --mount=type=secret,id=<ID>`. A buildpacks build
exposes it as the file `<platform>/env/<ID>`, which the detect and build steps
read. The platform MUST NOT write a build secret's value, or any hash of it,
into an image layer, the build provenance, the build log, the launch
environment or the resolution record. Provenance MAY name the secret ID.

A secret's value is not part of the recipe digest ([§6](#6-the-sources-stage-pins-the-build-stage-builds)),
so rotating a token does not change the recipe digest. Whether the platform
then builds again is its caching policy, outside the contract.

**An input's `target` becomes optional** on a workload component. An input
with no target is never written to the launch environment, and it MUST be read
by something: a build secret, a probe credential, a trust bundle or an output.
An input of a `SERVICE`, `WORKER` or `JOB` with no target that nothing reads is
the new **`ERR_UNUSED_INPUT`** at `/spec/contract/inputs/<name>`, semantic. An
input with a target is used by definition. An `EXTERNAL` component's inputs
still forbid a target, and this rule does not apply to them.

Without this, a build token would have to be a launch environment variable as
well, which is the leak the build secret exists to prevent.

### 6. The `sources` stage pins, the `build` stage builds

Blueprint resolution gains two stages, in the order `sources`, `parameters`,
`allocation`, `connections`, `values`, **`build`**, `environment`, `record`
(#192). Pinning content and building an image are separate, because a build
reads build secrets, and a secret's value is not known until `values` has
resolved it.

**`sources`** comes first, and only pins content:

- an `image` source with only a tag resolves its reference to an image digest;
- a `git` source resolves its `ref` to a full commit: the head of the branch,
  the commit the tag names, the head of the default branch when `ref` is
  omitted, or the named commit, which must exist;
- an `upload` source requires the platform to hold an archive whose SHA-256 is
  `upload.digest`, and that extracts under `COMP-SRC-007`. An archive not yet
  uploaded leaves resolution INCOMPLETE, and one whose bytes have another
  digest, or that extraction rejects, is `ERR_INVALID_RESOLUTION_CONTEXT`;
- a buildpacks `builderImage` resolves to an image digest.

The stage reads `repositoryURL`, image references and builder images as
acquisition by the authorized resolver under platform policy, not as a fetch by
a phase: the policy admits `https` alone, no `file:` and no address in a
private, loopback or link-local range (core v2 §6).

**`build`** runs after `values`. It builds each `git` or `upload` source, from
exactly the content `sources` pinned, with its recipe and the pinned builder,
into one image digest. A recipe that names secrets reads the values of those
inputs. They resolve through the node's bindings and the deployment's
parameters like every other value, and a failure in resolving them is reported
in the stage it belongs to, `parameters` or `values`, not in `build`. A failed
build is reported by the platform API, and resolution does not complete
without the image. Whether the platform builds again or reuses an image it
built before is its caching policy, outside the contract: the record pins the
image digest either way.

A diagnostic in either stage anchors at `/spec/nodes/<node>/componentRef`, with
a `related` location at the component's `/spec/workload/source`, or at its
`/spec/workload/build` for a builder or a recipe.

**The record.** Each node of the resolution record keeps
`source: IMAGE | GIT | UPLOAD | EXTERNAL` and gains these fields:

| Field | Pattern | `IMAGE` | `GIT` | `UPLOAD` | `EXTERNAL` |
|---|---|---|---|---|---|
| `imageDigest` | `^sha256:[0-9a-f]{64}$` | required | required | required | forbidden |
| `gitCommit` | `^(?:[0-9a-f]{40}\|[0-9a-f]{64})$` | forbidden | required | forbidden | forbidden |
| `uploadDigest` | `^sha256:[0-9a-f]{64}$` | forbidden | forbidden | required | forbidden |
| `recipeDigest` | `^sha256:[0-9a-f]{64}$` | forbidden | required | required | forbidden |
| `builderDigest` | `^sha256:[0-9a-f]{64}$` | forbidden | required for buildpacks | required for buildpacks | forbidden |

Every digest in the record is `sha256:`-prefixed, `blueprintDigest` and each
node's artifact `digest` included. A built node's `gitCommit` or
`uploadDigest` is its source content key, and `uploadDigest` is the
component's `upload.digest`. `builderDigest` is the digest `sources` resolved
the builder image to. `recipeDigest` is `sha256:` followed by the lowercase
hexadecimal SHA-256 of the [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785)
canonical JSON of the effective recipe: the `workload.build` object with
`context` present, `.` when it was omitted, `arguments` and `secrets` as
written, each secret as its ID and input name, and every member whose value is
an empty object or an empty array removed. Two equal recipes have one digest,
which is the Pelorus `recipeDigest`.

Accepting a record checks them against the pinned component: an
`uploadDigest` that is not its `upload.digest`, a `recipeDigest` that is not
the digest recomputed from its `workload.build`, or a `builderDigest` present
without a buildpacks recipe or absent with one, is
`ERR_INVALID_RESOLUTION_CONTEXT` in the `record` stage. The record's
`specifications` admit `core`, `component` and `blueprint` only. Redeploy reuses
the recorded image digest and builds nothing.

New behavioural fixtures resolve a Git node, a tagged Git node and a buildpacks
node, reject an upload whose digest does not match and a builder that
contradicts its pin, and pin a recipe digest.

### 7. A recipe is named, never detected

A build recipe is always written in the component document, and an
implementation MUST NOT infer one: not by finding a Dockerfile, not by choosing
between a Dockerfile and buildpacks, and not by assuming a default Dockerfile
path (#194). A buildpacks builder's own detect step, which chooses buildpacks
inside the named builder, is part of the named recipe.

A tool MAY write a recipe into the document before publication, such as a CLI
step that inspects a repository and writes `workload.build`. What is published
is then a named recipe like any other. The CLI experiment Pelorus plans for
this (increment I-38) needs no change here.

## Alternatives considered

**Keep `build` under `git`.** Rejected: an upload is built with the same recipe,
and two copies of the recipe shape under two sources would drift.

**Always build from the repository root, with a longer Dockerfile path.**
Rejected: the whole repository is then the build context, so any change
anywhere may affect any component, and #190's filtering is undecidable.

**Watch paths beside the context**, as Render's build filters and Railway's
watch paths are. Deferred: the context is the right default, and extra paths
can be added later as an optional field, which is a relaxation.

**Build secrets as arguments from inputs.** Rejected: a build argument is
recorded in the image history and the provenance, and BuildKit itself warns
when one carries a secret. A secret needs a channel that leaves nothing
behind.

**An upload named by URL.** Rejected: a URL is a request, and the bytes behind
it can change. A digest is a pin, and it is what an `UploadSlot` already
verifies.

**Detection at build time**, as zero-configuration platforms do. Rejected:
the same document would build differently when the detector changes, and a
recipe nobody wrote cannot be reviewed or reproduced. Pelorus excludes it
(X-20) for the same reasons.

## Consequences

**One repository, several components.** Each component names its own context,
and a push rebuilds only the components whose context it touched.

**Secrets reach the build and nothing else.** A private registry token no
longer has to be an argument or a launch variable.

**Every running node's content is pinned before any value resolves, and built
only after.** The record names the commit or the upload, the recipe, the
builder and the image, so an accepted record identifies exactly what was built
from what.

**Migration.** A v1 `git.build` moves to `workload.build`, and a Dockerfile
path that was relative to the repository root stays valid because `context`
defaults to `.`. An input that existed only to carry a build value becomes a
build secret or an argument.

**Not supported in v2.** Each gap closes by a relaxation.

| Gap | How it would close |
|---|---|
| Watch paths outside `context` | A new optional field |
| A Dockerfile build target stage | A new optional field |
| A build for a chosen platform or architecture | A new optional field |
| Git submodules and Git LFS content | A new optional field on `git` |
| A Git credential named by the document | A new optional field on `git` |
| A build secret delivered as an environment variable of the Dockerfile step | A new optional field on a secret |
