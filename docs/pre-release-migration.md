# Migrating the unreleased draft

The foundation reset in [ADR 0028](adr/0028-explicit-binding-and-resolution-before-release.md)
and the vocabulary pass in [ADR 0031](adr/0031-one-grammar-for-the-authored-documents.md)
change draft syntax before any family has a formal release. There is no legacy
compatibility mode. Keep component contracts reusable, declare everything an
installation takes from outside the documents as a blueprint parameter, and wire
it on the consuming blueprint node.

| Previous declaration | Replacement |
|---|---|
| Implicit matching parameter names; toNode/toInput; connections | One explicit binding per consuming input |
| resourceType on values or external components | Remove it; a blueprint parameter's `from` selects supply |
| Component CONFIG_REF environment values | Component input with target.envVarKey, bound to a blueprint parameter whose `from` names an organization variable |
| STRING, NUMBER, BOOLEAN, JSON, STRING_LIST | Bounded logical schemas with lowercase JSON Schema types |
| schema.default, schema.sensitive, schema.format | Sibling default, sensitive and presentationHint |
| valueFrom, input and value on outputs | Output `from`: `{value}`, `{input}`, `{endpoint, property}` or `{template}` |
| Omitted endpoint names | Name the endpoint in every probe and address source |
| Component visibility and sizeGiB | Blueprint exposure and volume allocations; component minSizeGiB |
| Tagged image or compute slug treated as an immutable deployment | Generated resolution record with artifact digests and selected versions |

## ADR 0031 renames

[ADR 0031](adr/0031-one-grammar-for-the-authored-documents.md) gives the authored
documents one grammar: a `type` names a category, the key that is present names
where a value comes from, and a field naming another key in the same document is
a bare noun. The generated resolution record keeps its `source` tag.

| Before | After |
|---|---|
| `workload` or `external: {}`, chosen by which key is present | `spec.type: SERVICE \| WORKER \| JOB \| EXTERNAL`; `workload` required unless `EXTERNAL`, forbidden on it |
| `workload.type: CRON` | `JOB` with `schedule.cron` (five fields, evaluated in UTC) |
| `workload.type` | `spec.type` |
| `source: {type: IMAGE, ref}` | `source: {image}` |
| `source: {type: GIT, …}` | `source: {git: {repositoryURL, ref?, build}}`, with `ref: {branch}` or `ref: {commit}` and `build: {dockerfile}` or `build: {buildpacks: {builderImage}}` |
| `command: "…"` | `command: [argv…]` (exec form, no shell) |
| `containerPort` | `targetPort` |
| `envVars: [{key, value: {type: LITERAL, value}}]` | `envVars: {NAME: text}` |
| probe `type: HTTP, endpoint, path` | probe `http: {endpoint, path}` beside the timing fields |
| `minimumSizeGiB` | `minSizeGiB` |
| `accessMode: READ_WRITE_ONCE \| READ_WRITE_MANY` | `shared: false \| true` |
| output `source: {type: LITERAL \| INPUT \| ENDPOINT \| TEMPLATE, …}` | output `from: {value}`, `{input}`, `{endpoint, property}` or `{template}` |
| `${{ self.publicHostname.web }}` | `${{ self.endpoints.web.publicHostname }}` |
| node `size` (`null` on an external node) | node `compute.profile`; `compute` is required on a workload node and forbidden on an `EXTERNAL` one |
| `placement` | `compute.placement` |
| `placement.storageClass`, `placement.minStorageIOPS` | `volumes.<name>.storageClass`, `volumes.<name>.minIOPS` |
| bindings `{type: PARAMETER, parameter}` | `{parameter}` |
| bindings `{type: OUTPUT, node, output}` | `{node, output}` |
| bindings `{type: LITERAL, value}` | `{value}` |
| bindings `{type: CONFIG_REF, source: "${{ config.… }}"}` | a parameter with `from: "${{ variables.… }}"`, bound as `{parameter}` |
| `spec.connectionSources` and `connectionBindings.<name>: {source}` | a parameter with `from: "${{ connections.… }}"`, bound as `connectionBindings.<name>: {parameter}` |
| `metadata` without a description | `metadata.description`, REQUIRED on component and blueprint: plain text, 1 to 280 characters |
| reference namespaces `config`, `params` | `variables`, `parameters`; `connections` is added |
| `ERR_INVALID_CONFIG_REFERENCE` | `ERR_INVALID_PARAMETER_SOURCE` |
| `ERR_CONFIG_NOT_AUTHORIZED` | `ERR_VARIABLE_NOT_AUTHORIZED` |
| `ERR_GENERATED_OVERRIDE` | `ERR_PARAMETER_NOT_SUBMITTABLE` |
| `COMP-ENVVAR-001`, `ERR_DUPLICATE_ENV_KEY` | withdrawn: the parser already rejects a duplicate key |

## Organization variables

A reusable worker declares an input and its workload destination:

```yaml
llmBaseUrl:
  description: Base URL of the model API.
  schema:
    type: string
    minLength: 1
  target:
    envVarKey: LLM_BASE_URL
```

Its consuming blueprint declares a parameter that takes the organization
variable, and the node binds the input to that parameter:

```yaml
spec:
  parameters:
    llmBaseUrl:
      from: "${{ variables.llm.baseUrl }}"
  components:
    worker:
      bindings:
        llmBaseUrl: { parameter: llmBaseUrl }
```

`from` is one whole reference. The dotted path is an exact variable key, resolved
against the configuration visible to the environment the installation deploys
into. It does not grant access; installation context supplies an authorized
value, sensitivity, identity and version. A person installing the blueprint
cannot submit a value for the parameter. No resource registry or matching input
name implicitly selects it. A connection works the same way, through a
parameter whose `from` names `${{ connections.… }}` and a
`connectionBindings` entry naming that parameter. See the paired
[worker](../specifications/component/v1/examples/llm-worker.yaml) and
[blueprint](../specifications/blueprint/v1/examples/organization-config.yaml)
examples; place the worker at the blueprint's referenced item path.

## Values and resolution

Write logical integers, booleans, arrays and objects as values, rather than
string encodings. Validate defaults and literal outputs at definition time.
Validate every resolved value against all receiving contracts before environment
encoding. A failed explicit source never falls back to an input default.
Sensitive values retain their classification across bindings, forwarding and
environment encoding; published artifacts cannot contain secret plaintext.

Generate credentials once for an installation, parameter and rotation generation.
Reuse persisted values on retry and ordinary update. Supported generators encode
16–64 random bytes as HEX, BASE64 or BASE64URL; custom alphabets are unsupported.

Every output is available before workload startup. Address discovery can be
mutual; value computation cannot be cyclic. Runtime job outputs and startup
dependency declarations remain unsupported.

## Adoption checks

Run `task check` after migrating source modules, prose, examples and fixtures
together. A downstream implementation should run the document and behavioural
profiles it claims using its own adapter over the language-neutral corpus.
The tooling here supplies test adapters, not a production control plane.

Report VALID, INVALID or INCOMPLETE for the claimed validation profile.
Missing contract or installation context leaves named obligations deferred.
Publication and deployment admission complete all required checks; a structural
success alone cannot authorize either.

Generate and securely retain a resolution record after authorized resolution.
Ordinary redeployment reuses it. Updating pins is explicit, and a missing pinned
artifact fails rather than silently selecting a newer one.
