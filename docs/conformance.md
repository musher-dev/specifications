# Conformance Suite

A language-neutral corpus of test vectors. An implementation conforms to a
Musher specification family when it produces the declared outcome for every
case in that family's tree and in the core corpus
([core v2 §8](../specifications/core/v2/spec.md#conformance)) that its claimed
[validation scope](#validation-scopes) requires. Each corpus lives inside the
family version it tests, at `specifications/<family>/v<major>/conformance/`.

**Where this sits.** A corpus is its family's executable form for observable
outcomes, and this page, the fixture format, is normative for how a corpus is
read. What else is normative, and how the parts relate, is set out once in
[specifications/README.md → What is normative](../specifications/README.md#what-is-normative).
A fixture that contradicts the prose is a defect in this repository: it blocks
a release, and is never a licence to implement the fixture. What within a case
is normative and what is not is set out in [What is normative](#what-is-normative)
below.

There is deliberately **no normative runner**. A reference implementation
becomes the de facto standard, hides normative behaviour inside compiled code,
and biases the specification toward one language's standard library. Each
implementation writes its own thin adapter over this data instead. That is what
makes cross-language parity provable rather than asserted.

`tools/src/conformance/conformance.ts` is one such adapter. It exists to keep the fixtures
honest inside this repository and carries no special authority.

## Layout

```
specifications/<family>/v<major>/conformance/
  cases.json                   index of document cases
  behavior.json                optional behavioural cases
  <phase>/<case-id>/
    metadata.json              declared outcome
    case.yaml                  the document under test, with no item root
    tree/                      …or the item it sits inside
    diagnostics.json           required when expected == "fail"
```

`<phase>` is one of `parser`, `structural`, `semantic` and `admission`. A case
declares its subject as **exactly one** of `case.yaml` or `tree/`. See
[Case trees](#case-trees).

### <a id="core-corpus"></a>Core corpus

The [Musher Document Core Specification](../specifications/core/v2/spec.md) has
a corpus of its own, at `specifications/core/v2/conformance/`, whose `cases.json`
declares `"family": "core"`. It follows every rule on this page, and four more,
which [core v2 §8.1](../specifications/core/v2/spec.md#core-corpus) states:

- **Every core case is a `parser` case.** A `structural` case needs a schema,
  and core publishes none; a case about an item needs a document of some family
  inside a directory. A core case is therefore a `case.yaml`, never a `tree/`,
  and never declares `effective`.
- **An adapter runs a core case through its parser alone.** `expected: "pass"`
  means the parser accepts the document, and no later phase runs.
- **A core `case.yaml` asserts that there is no kind**, as every `case.yaml`
  asserts that there is no item root. An adapter MUST NOT dispatch on a kind.
  Parser boundary cases may contain arbitrary bytes or structures that never
  reach an envelope check.
- **A core case cites core only.** Its `clause` and every one of its
  `requirements` are declared in `specifications/core/v2/spec.md`.

The parser runs before a family is chosen, so an implementation covering
more than one family runs the core corpus once rather than once per family. Each
family corpus keeps one `parser` case, `parser-001-reject-duplicate-keys`, to
show that the family's pipeline applies the profile at all.

## `cases.json`

The examples on this page are illustrative. `structural-001-missing-kind` stands
for any failing case; the real `structural/001` in each kind family corpus is
`structural-001-minimal-valid`.

```json
{
  "family": "component",
  "specVersion": "v2",
  "cases": [
    { "id": "structural-001-missing-kind", "phase": "structural", "path": "structural/001-missing-kind" }
  ]
}
```

An adapter reads this index rather than walking the filesystem, so adding a
directory without indexing it is a no-op: index entries are the contract.

## `metadata.json`

```json
{
  "id": "structural-001-missing-kind",
  "phase": "structural",
  "expected": "fail",
  "clause": "specifications/component/v2/spec.md#envelope",
  "summary": "A document omitting the kind discriminator is rejected."
}
```

| Field | Requirement |
|---|---|
| `id` | REQUIRED. MUST equal the `cases.json` entry and follow `<phase>-<NNN>-<description>`. |
| `phase` | REQUIRED. One of `parser`, `structural`, `semantic`, `admission`. Never `resolution`: see [Phases](#phases). |
| `expected` | REQUIRED. `pass`, `fail`, or `incomplete`. |
| `clause` | RECOMMENDED. Link to the normative clause the case exercises. Every case should trace to prose. Where the case also declares `requirements`, the two MUST be consistent: every specification declaring one of the requirements is the case's own family, core, or a normative dependency the family's §2 declares; `clause` cites the family's own `spec.md` or one of those declaring specifications; and where it cites a declaring specification, its anchor is the section holding the requirement's anchor or a section enclosing that one. A core case cites core only. |
| `requirements` | RECOMMENDED. Stable requirement IDs this case pins, e.g. `["CORE-ENV-002"]`. Each MUST resolve to an anchor in a `spec.md`. |
| `summary` | RECOMMENDED. One sentence, present tense. |
| `document` | REQUIRED for a tree case, forbidden otherwise. Path of the document under test, relative to `tree/`. |
| `symlinks` | OPTIONAL, tree cases only. Link path → link target, both verbatim. |
| `effective` | OPTIONAL, `expected: "pass"` only. Effective values this case pins, keyed by JSON Pointer. See [Effective values](#effective-values). |

### <a id="requirements"></a>Requirement IDs

`clause` names a section; a section may state more than one rule. Many cases cite
core's `#envelope`, which covers `specVersion`, `kind`, unknown fields, and an
unsupported version, so the citation says where to look and not what is being
pinned. `requirements` says which rule.

```json
{ "clause": "specifications/core/v2/spec.md#envelope",
  "requirements": ["CORE-ENV-002"] }
```

An ID is `<FAMILY>-<SECTION>-<NNN>`, is declared beside the rule it names, and
is stable: renaming a heading moves the anchor a `clause` points at, and leaves
the ID alone.

**An ID names an observable obligation.** Document acceptance, normalization,
resolution, safe rendering and credential persistence can all carry IDs.
Every declared ID must be pinned by a case or have a reviewed explanation in
the adapter's coverage exceptions. A missing fixture shape is a reason to
extend the corpus, not to leave an implementation obligation untested.

[`docs/traceability.md`](traceability.md) is generated from these and
shows every requirement against the clause stating it and the cases pinning it.

## <a id="case-trees"></a>Case trees

Some rules are about a document's *surroundings* rather than its contents: that
its slug matches the directory holding it, that a document reference resolves
to a file, that a media path stays inside the item. A single `case.yaml` cannot
state any of them, so a case may instead carry a `tree/`:

```
specifications/blueprint/v2/conformance/semantic/003-slug-disagrees-with-directory/
  metadata.json      "document": "acme-wiki/blueprint.yaml"
  diagnostics.json
  tree/
    acme-wiki/                  <- the item root
      blueprint.yaml
      listing.yaml
      components/postgres.yaml
```

The **item root** is the directory containing `document`. `tree/` is its
parent, not the item root itself: `ERR_SLUG_MISMATCH` tests the item
directory's *name*, so the tree has to contain a directory that has one.

**`case.yaml` is not the legacy form.** It asserts that the document has **no**
item root, which [core v2 §4.1](../specifications/core/v2/spec.md#item-directory)
makes a real state: a document submitted over an API arrives without a
directory, and an implementation in that position MUST NOT report any rule
measured against one. Required item checks remain deferred and the document
result is `INCOMPLETE`. An adapter must not invent an item root.

**Symlinks are declared, not committed.** `ERR_PATH_ESCAPE` needs a link
resolving outside the item, and a committed one does not survive a checkout
without `core.symlinks`, is invisible in a diff, and would ship inside a release
tarball pointing outside the archive. `metadata.symlinks` names them instead:

```json
{ "symlinks": { "acme-wiki/media/icon.png": "../../../secrets.png" } }
```

An adapter copies `tree/` somewhere writable, creates the links there, and runs
against the copy. The target need not exist: a dangling link resolving outside
the item root is still an escape, because containment is a property of the
resolved location rather than of the string.

**A media file in a tree is as large as its rule needs, and no larger.** In
the `parser`, `structural` and `semantic` phases nothing decodes an image
([listing §5](../specifications/listing/v2/spec.md#media)): the rules there are
existence, containment and file size, read by stat. A file those cases only
need to exist is zero bytes, which is within every size bound. A file-size case
carries a file of exactly the size under test, such as listing's
`semantic/019-icon-too-large`, a zero-filled icon one byte over 1 MiB. Image
dimensions are an `admission` rule, read from image headers only, so the
dimensions of a semantic case's files never matter. A case that exercises them
is an `admission` case, and its files are images whose headers state the
dimensions under test, such as the real PNG headers of listing's
`admission/001-media-within-bounds`.

An adapter that cannot materialise a tree SKIPs those cases. It MUST NOT report
them as passed.

The contract is set by
[ADR 0002](adr/0002-conformance-case-trees.md).

## `diagnostics.json`

Required when `expected` is `fail`. A non-empty array:

```json
[{ "code": "ERR_MISSING_FIELD", "path": "" }]
```

`path` is a JSON Pointer into the submitted document; `""` is the root.
For a referenced component, the primary pointer identifies its authored binding
or `componentRef`. Optional `related` locations carry the component `artifact`
reference and its actual component-contract `path`; no synthetic blueprint
output field stands in for a component output. A code may list more than one
permitted phase in its registry; the condition is stable while the phase
reports when it was discovered.

An implementation passes a failing case when it rejects the document **in the
declared phase** and produces **at least** the declared diagnostics. Producing
additional diagnostics is permitted: a validator reporting every problem at
once is more useful than one that stops at the first.

## <a id="what-is-normative"></a>What is normative

| Normative | Not normative |
|---|---|
| The diagnostic `code` | The human-readable message |
| The `path` the diagnostic anchors to | The order diagnostics are emitted |
| The `phase` at which validation fails, and a resolution diagnostic's `stage` | Whether extra diagnostics accompany the declared ones |
| An `effective` value | Whether an implementation stores it or computes it on demand |

Different language parsers emit wildly different error text: `serde_yaml` and
`gopkg.in/yaml.v3` do not agree on a single string. Pinning codes and phases
instead of messages is what lets Go, Rust, Python, and TypeScript run the
identical corpus.

## <a id="effective-values"></a>Effective values

A case declares whether a document is **accepted**. That is not the whole of
what a document means, and [ADR 0008](adr/0008-effective-values.md) is
about the rest of it.

`default` in JSON Schema is an annotation. Validators do not insert it, so two
implementations can both accept the same document and still disagree about what
it says: one materialising `periodSeconds: 10` into its object model, one
leaving the field absent and reading the default when it needs to, and a third
treating an explicit `null` as different from an omission. All three pass an
acceptance fixture. Only one of them can be right about how often to poll.

`effective` is where the corpus says which:

```json
{
  "expected": "pass",
  "effective": {
    "/spec/workload/health/readiness/periodSeconds": 10,
    "/spec/workload/health/readiness/timeoutSeconds": 5
  }
}
```

The claim is about **behaviour, not representation**. An implementation MAY hold
the field as absent; what it MUST NOT do is behave differently from one holding
the value the map declares. Nothing here obliges anyone to rewrite a document.

A key is a JSON Pointer into the document under test. A pointer may name a field
the author wrote (pinning it asserts the corpus and the document agree) or one
they omitted, pinning what the specification supplies in its place. A pointer
that resolves to neither is an error in the fixture: an absent field with no
default has no effective value, and a case claiming otherwise is claiming
something the specification does not say.

`effective` is forbidden on a failing or incomplete case. A rejected document
has diagnostics, not values.

## <a id="phases"></a>Phases

[Core v2 §6](../specifications/core/v2/spec.md#validation-phases) declares five
validation phases:

| Phase | Enforces | Network | Pinned in |
|---|---|---|---|
| `parser` | The Musher YAML profile: [core v2 §6.2](../specifications/core/v2/spec.md#yaml-profile) | Never | Document cases |
| `structural` | The family's JSON Schema 2020-12 bundle | Never | Document cases |
| `semantic` | Placeholder grammar and namespaces, path containment, cross-document agreement | Never | Document cases, and behavioural cases |
| `admission` | Account, region and quota checks, and catalog and publication obligations | Server only | Document cases, and behavioural cases |
| `resolution` | Turning an admitted blueprint revision into one deployment's values | Server only | Behavioural cases only |

An implementation MUST apply the phases in order and MUST NOT report a
later-phase diagnostic before the earlier phases pass.

**A resolution-phase diagnostic appears only in `behavior.json`.** Resolving
needs a deployment context (parameters, allocations, connections, sources),
and only a behavioural entry carries one. So `resolution` is never a document
case's `phase`, there is no `resolution/` case directory, and a `diagnostics`
entry of a behavioural case is the one place that declares
`"phase": "resolution"`. Such an entry MUST also declare its `stage`, one of
[core v2 §6.4](../specifications/core/v2/spec.md#resolution-stages)'s, in order:
`sources`, `parameters`, `allocation`, `connections`, `values`, `build`,
`environment` and `record`. A `stage` on a diagnostic of any other phase is a
malformed fixture.

## <a id="profiles"></a><a id="validation-scopes"></a>Validation scopes

Not every implementation runs every phase, and that is by design: `admission`
needs an account, a region and a quota, which is a server. An editor plugin
that checks structure is a useful thing to be, and it is not the same thing as a
control plane.

So "Musher conformant" is not a claim anyone can make on its own. An
implementation claims a **validation scope**, from the same lattice
[core v2 §6.1](../specifications/core/v2/spec.md#validation-scope) gives a
validation result, and each scope names the cases it must pass every one of:

| Scope | Document cases in phases | Behaviour suites | Typical implementation |
|---|---|---|---|
| `parser` | `parser` | None | A linter or formatter that reads documents but does not validate them |
| `structural` | `parser`, `structural` | None | An editor integration binding the published schema |
| `document` | `parser`, `structural`, `semantic` | None | A CLI validating a working tree, with no network |
| `publication` | all four | None | A catalog publisher |
| `deployment` | all four | `resolution` | A control plane deploying blueprints |

The scopes are cumulative: `document` includes everything `structural`
requires. An implementation MUST NOT claim a scope while skipping any case that
scope requires: a skipped case is never a passed one ([above](#case-trees)).

`document` is the highest scope reachable without a network, and it is
deliberately a named stopping point rather than a shortfall. No phase before
`admission` may reach the network, so an implementation running everything a
client is permitted to run conforms at `document`. This is a claim about adapter
behaviour across the corpus, not proof that every document it encounters has
sufficient context.

The behaviour suites `normalization`, `rendering` and `lifecycle` are claimed
beside a scope, never instead of one ([Behavioural cases](#behavioural-cases)).

### Reporting a result

An implementation publishing a conformance result SHOULD publish it in this
shape, so that two claims can be compared:

```json
{
  "implementation": "musher-cli",
  "implementationVersion": "2.4.0",
  "family": "component",
  "specificationRelease": "2.2.0",
  "coreRelease": "2.1.0",
  "suiteCommit": "af2dec0…",
  "scope": "document",
  "suites": ["normalization"],
  "passed": 184,
  "failed": 0,
  "skipped": 4
}
```

`suiteCommit` matters as much as `specificationRelease`: a case may be added to
the corpus between releases, so "which cases were run" is not answered by a
version number alone.

`coreRelease` is the core release the family release records, and names the
core corpus the claim covers alongside the family's own
([core v2 §8](../specifications/core/v2/spec.md#conformance)). It is the
recorded core release, not a later core v2 corpus the implementation may also
have run.

A result with `failed` greater than zero is not a conformance claim. A result
with `skipped` greater than zero is a claim only if every skipped case lies
outside what the declared scope and suites require.

## <a id="behavioural-cases"></a>Behavioural cases

Each family's optional `behavior.json` is an array. It is an explicit index;
adapters MUST read it alongside `cases.json`. Each entry has a unique `id`, a
`suite`, an `operation`, `requirements`, and `expect`. The latter maps JSON
Pointers into an operation's observation to exact JSON values. Mapping order has
no meaning; sequence order does. Optional `diagnostics` is a list of a required
`code` and optional `path`, `phase`, `stage` and `related` observations. Every
supplied property must match one produced diagnostic, without imposing
diagnostic order or forbidding additional diagnostics. A declared `phase` must
be one the code's registry lists, exactly as for a document case, and a
`resolution` diagnostic declares its `stage` ([Phases](#phases)).

An entry supplies either logical `input`, or `tree` (item-relative path to
UTF-8 document text) plus `document` naming the document within that tree.
The document's parent is its item root. Paths must remain within the fixture.
Optional `context` supplies the synthetic deployment context of
[Resolution context](#resolution-context). No operation uses a live account or
fetches document-selected URLs. Fixtures use synthetic values, including when
testing sensitivity.

| Suite | Operation | Observation |
|---|---|---|
| `normalization` | `normalize` | `value`, with effective schema defaults materialized only beneath existing ancestors; `idempotent`, true when a second normalization changes nothing |
| `resolution` | `validate` | Core validation `status`, `validationScope`, `phase`, `diagnostics` and `deferred`, over the supplied context, at the `validationScope` the context names (default `document`) |
| `resolution` | `resolve` | Pre-start value-resolution status, diagnostics, deferred obligations, private inputs/outputs/environment, and redacted public inspection |
| `resolution` | `record` | `VALID` plus the generated resolution record, or `INVALID` with `ERR_INVALID_RESOLUTION_CONTEXT` at stage `record` |
| `rendering` | `render` | `html` produced from `input.markdown` and the full-path `input.media` URL mapping under the listing rendering rules |
| `rendering` | `form` | Ordered array of `name`, `label`, `control`, `order` (null when omitted), and effective `prominence` |
| `lifecycle` | `revision` | `VALID` when `input.revision` exceeds `input.highestPublishedRevision`; otherwise `INVALID` with `ERR_REVISION_NOT_INCREASING` at `/metadata/revision` |
| `lifecycle` | `credential` | Count `generated` and ordered `values` for `input.steps`, each `{deployment, parameter, rotation}` |
| `lifecycle` | `connection` | Counts `issued` and `persisted`, and ordered `observations` (`status`, and for a selection its `identity`, `version`, `credential` and `rotation`) for `input.steps`, each `{deployment, parameter, generation?, defaultVersion?, fault?, revoked?}` |

### <a id="resolution-context"></a>Resolution context

`context` holds what an authorized resolver would have acquired and pinned
before resolving one deployment. Each key is optional; an absent key is context
that was not acquired, which defers the obligations that need it.

| Key | Shape | Stage |
|---|---|---|
| `componentDocuments` | `identity@revision` → `{source, digest}`: the catalog component documents a blueprint references | Before resolution, for the `document` scope |
| `sources` | node → `{gitCommit?, uploadDigest?, builderDigest?, imageDigest?}` | `sources` |
| `parameters` | parameter name → `{value, sensitive}`: submitted values | `parameters` |
| `variables` | exact dotted path → `{value, sensitive, identity, version, authorized}` | `parameters` |
| `credentials` | parameter name → `{value, sensitive}`: stored generated or hash credentials | `parameters` |
| `deployment` | `{creator: {identity?, email?, name?}}`: deployment facts | `parameters` |
| `allocations` | node → endpoint → `{identity, version, privateHostname?, public?, oidcClient?}` | `allocation` |
| `connections` | `{deployment, parameters: {<parameter>: <acquisition>}}` | `connections` |
| `builds` | node → `{imageDigest?, recipeDigest?}` | `build` |

**`sources`.** One entry per node whose content the `sources` stage pinned;
nothing in it is built. `gitCommit` is the commit a git source's ref resolved
to, 40 or 64 lowercase hexadecimal characters. `uploadDigest` is the verified
digest of an upload source's archive, and MUST equal the digest the document
names. `builderDigest` is the digest a buildpacks recipe's `builderImage`
resolved to, and appears only for a buildpacks recipe. `imageDigest` is the
digest an image source's reference resolved to, and appears only for an image
source. Each digest is `sha256:<64 hex>`. A key the node's source does not
take, a value of the wrong shape, or a value that disagrees with the document
is `ERR_INVALID_RESOLUTION_CONTEXT` at stage `sources`. A fixture carries no
archive bytes, so extraction ([component v2 §5.1](../specifications/component/v2/spec.md#COMP-SRC-007))
is never exercised here.

**`builds`.** One entry per git or upload node that the `build` stage built.
`imageDigest` is the image the build produced, and `recipeDigest`, when
present, is the recipe the platform reports building with, which MUST equal the
digest recomputed from the component's `workload.build`. Each is
`sha256:<64 hex>`. An entry for a node that is not built, a value of the wrong
shape, or a `recipeDigest` that disagrees is `ERR_INVALID_RESOLUTION_CONTEXT` at
stage `build`. An absent `imageDigest` leaves the resolution INCOMPLETE. What
each fact means, and which a node requires, belongs to blueprint.

**`credentials`.** A hash parameter's stored credential is keyed by its own
name.

**`deployment`.** An absent fact is not yet acquired, and `null` is one the
platform knows it lacks.

**`allocations`.** `public` holds the routing facts and the viewer identity
facts of the endpoint's mode. `oidcClient` is `{identity, version, issuerURL,
clientID, secret}`, beside `public` and never inside it.

**`connections`.** `deployment` is the deployment's identity. Each parameter
maps to an acquisition: `{status}`, where `status` is `NOT_ACQUIRED`,
`NOT_FOUND`, `DENIED`, `INCOMPATIBLE` or `SELECTED`. A `SELECTED` acquisition
also carries `persisted: true` and the persisted `selection` of
[blueprint §5.3](../specifications/blueprint/v2/spec.md#connections),
represented as:

```json
{
  "identity": "connection-1",
  "version": "1",
  "deployment": "deployment-1",
  "parameter": "primary",
  "request": { "from": "${{ connections.llm.default }}", "identity": "default-policy", "version": "1" },
  "selectionKind": "MANAGED",
  "provisioning": "GRANTED",
  "costOwner": "synthetic-org",
  "credential": {
    "identity": "credential-1",
    "rotation": 0,
    "value": "synthetic-1",
    "permittedBaseURLs": ["https://gateway.example/openai/v1"]
  },
  "views": {
    "OPENAI_CHAT_COMPLETIONS": {
      "baseURL": "https://gateway.example/openai/v1",
      "model": "model-1",
      "capabilities": ["STREAMING", "TOOL_CALLS"]
    }
  }
}
```

- `deployment` and `parameter` name the deployment and the connection parameter
  the selection was acquired for.
- `request` identifies the acquisition request, not the selected provider:
  `from` is the connection parameter's `from`, and `identity` and `version` name
  the policy that answered it.
- `selectionKind` is `MANAGED` or `USER`. `provisioning` is `GRANTED` or
  `PROVISIONED`, and only a `MANAGED` selection carries it.
- `credential.value` supplies the protocol's credential member (`apiKey` for
  `OPENAI_CHAT_COMPLETIONS` and `ANTHROPIC_MESSAGES`, `password` for `POSTGRES`
  and `REDIS`, `secretAccessKey` for `S3`). `permittedBaseURLs` is required
  when a view is of an HTTP-based protocol (the two LLM protocols and `S3`),
  and lists the URLs its URL member may take (`baseURL`, or the `S3`
  `endpointURL`). A selection of a `REDIS` server that requires no
  authentication carries no `credential`.
- `views` is keyed by protocol. Each view holds the members of that protocol
  ([component §6.4](../specifications/component/v2/spec.md#members)) except
  its credential member and the derived `url`, which resolution composes
  ([component §6.4](../specifications/component/v2/spec.md#derived-urls)) and
  the `resolve` observation shows in the input's value. A view omits an
  optional member it does not hold, and an LLM view also carries
  `capabilities`.

The context is trusted acquisition evidence, not an authored mechanism for
granting permission. Malformed evidence is `ERR_INVALID_RESOLUTION_CONTEXT`. An
unavailable entry is absent, never a fabricated empty value. The rules a
selection must satisfy (that `request.from` equals the parameter's `from`, that
managed credential identities are not reused across connection parameters, the
URL rules) are blueprint's; this section only fixes how a fixture writes the
evidence down.

### <a id="admission-context"></a>Admission context

A `validate` entry at the `publication` or `deployment` scope may supply the
platform state the `admission` rules read, beside `validationScope` in
`context`. Each key is optional, and an absent key defers the rules that read
it, so the result is `INCOMPLETE`, never `VALID`.

| Key | Shape | Read by |
|---|---|---|
| `licenseList` | `{licenses: [...], exceptions: [...]}`: the SPDX License List release the platform pins, deprecated identifiers included | listing `LIST-LICENSE-002` |
| `platform.privilegedPorts` | `true` when the platform's runtime binds a port below 1024, `false` when it cannot | component `COMP-EP-019` |
| `platform.region` | The region the admission is decided for | blueprint `BP-NODE-009` to `BP-NODE-012` |
| `platform.computeProfiles` | profile slug → `{hosts: [{region, cpuArchitecture?, cpuDedication?, acceleratorMemoryGiB?, acceleratorRuntimes?, acceleratorInterconnect?, acceleratorSKUClass?, networkClass?}]}` | blueprint `BP-NODE-009`, `BP-NODE-010` |
| `platform.storageClasses` | class → `{regions, maxIOPS, maxSizeGiB}` | blueprint `BP-NODE-011`, `BP-NODE-012` |
| `platform.defaultStorageClass` | The class that serves an allocation naming none | blueprint `BP-NODE-011`, `BP-NODE-012` |

A profile is available in the region when one of its hosts is in it, and a
node's placement is satisfiable when one such host meets every constraint at
once. Every value is synthetic: a fixture describes a catalog, never a real
one.

### Resolution observations

Private resolved keys are `node:in:input` and `node:out:output`; environment
maps node to environment variable name. Each private entry has `value` and
`sensitive`, and may retain variable identity and version. Public inspection
maps input keys to `{sensitive: true, redacted: true}` for sensitive values and
`{sensitive: false, value}` otherwise. No materialization is released for
`INVALID` or `INCOMPLETE` resolution.

The `record` operation supplies `blueprint` text, `specifications`, `nodes`
(the record's node map), `variables`, `credentials` and `recordContext` in
`input`. `recordContext` holds the private deployment `snapshot` and the
`specificationDependencies` acquired with the pinned specifications. It
generates the shape defined in
[blueprint §5.2](../specifications/blueprint/v2/spec.md#resolution-record) and
projects variable and credential identities without resolved plaintext.

A lifecycle adapter substitutes a deterministic synthetic generator: successive
new identities receive `synthetic-1`, `synthetic-2`, and so on. Repeated
get-or-create calls must not invoke it again. This tests persistence and
rotation, not a particular cryptographic random-number implementation.

### Suites, scopes and results

The result field `validationScope` names how far a validation result reaches
([core v2 §6.1](../specifications/core/v2/spec.md#validation-scope)). A
conformance claim names a scope from the same lattice, but a validation result
does not make one: a result at `publication` says what was checked for one
document, not what an implementation conforms to.

Behaviour suites are claimed in addition to a validation scope. An
implementation claiming a suite MUST run its own family's and its normative
dependencies' cases in that suite. Unknown operations or unsupported suites are
reported as skipped, never passed. Document cases and behavioural cases both
contribute to requirement and diagnostic coverage.

### Validation coverage

Every document result distinguishes `VALID`, `INVALID` and `INCOMPLETE` for its
validation scope. A `structural` case runs at the `structural` scope; a
`semantic` case runs at the `document` scope with its declared context.
`expected: incomplete` requires `INCOMPLETE`, not `INVALID` or skipped. Missing
context must be listed in deferred obligations. A passing structural case makes
no deployment-validity claim.

A `publication` or `deployment` result MUST complete every obligation of its
scope ([`CORE-ADMISSION-001`](../specifications/core/v2/spec.md#CORE-ADMISSION-001)).
The local adapter reports unresolved catalog and policy admission rather than
inventing an authorization result. Its value-resolution and credential adapters
are test implementations, not a production deployment engine.

### Historical compatibility

Compatibility replay reads the historical index, bytes, item trees, declared
symlinks, effective values and behavioural expectations from each released tag
of the same major version. It evaluates them with candidate semantics under the
same supplied context. Editing or deleting today's fixtures cannot replace that
historical evidence. A missing historical part is an error. A finite corpus is
evidence, not a proof: schema review and boundary tests remain required. A
retired major version's tags are history, not candidates: nothing replays v1
cases against v2.

The coverage gate requires every declared diagnostic and requirement to have
a fixture in its family or a consuming family's reachable corpus, or a reviewed
exception. Publication revision fixtures supply a synthetic lineage snapshot;
implementations acquire and verify the real catalog context before applying
that rule.

## Adding a case

1. Pick the phase and the next free sequence number in that phase. A
   resolution-phase case is a behavioural entry instead: add it to
   `behavior.json` under the `resolution` suite.
2. Create `<phase>/<NNN>-<description>/` under
   `specifications/<family>/v<major>/conformance/`, with `metadata.json`, and
   either a `case.yaml` or a `tree/` plus a `document` naming the file inside
   it.
3. For a failing case, add `diagnostics.json`.
4. Add the entry to that corpus's `cases.json`. A directory that is not indexed
   runs nowhere, and `task check:conformance` reports it rather than leaving it
   to be assumed green.
5. Run `task check:conformance`.

A case that does not cite a `clause` will be questioned in review. Fixtures
exist to pin down prose, not to freeze current implementation behaviour.

`task check:conformance` checks three separate things, and only the first needs
an implemented phase.

**Executing** a case runs the document through the pipeline and compares the
outcome. `tools/src/conformance/conformance.ts` implements `parser`, `structural` and
`semantic`, and so conforms at the `document` scope; an `admission` document
case is skipped. It also runs every behavioural case, including the `validate`
entries that decide `admission` rules over a supplied
[admission context](#admission-context).

**Validating** a case runs whether or not its phase does: the `id` leads with
its phase, `cases.json` and `metadata.json` agree on that phase, the case
declares exactly one of `case.yaml` or `tree/`, the `clause` resolves to an
anchor that exists in the cited `spec.md`, and every declared `code` appears in
a diagnostics table reachable from the family's own, at a phase that table
assigns it. A behavioural entry's suite, operation, diagnostic phases and
stages are checked the same way.

**Auditing** the corpus asks the questions no individual case can: does every
declared diagnostic code have a fixture, and does every case directory on disk
appear in `cases.json`.
