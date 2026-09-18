# Migrating the unreleased draft

The foundation reset in [ADR 0028](adr/0028-explicit-binding-and-resolution-before-release.md)
changes draft syntax before any family has a formal release. There is no legacy
compatibility mode. Keep component contracts reusable and put installation supply
on the consuming blueprint node.

| Previous declaration | Replacement |
|---|---|
| Implicit matching parameter names; toNode/toInput; connections | One explicit binding per consuming input |
| resourceType on values or external components | Remove it; use a source reference to select supply |
| Component CONFIG_REF environment values | Component input with target.envVarKey, supplied by a blueprint CONFIG_REF binding |
| STRING, NUMBER, BOOLEAN, JSON, STRING_LIST | Bounded logical schemas with lowercase JSON Schema types |
| schema.default, schema.sensitive, schema.format | Sibling default, sensitive and presentationHint |
| valueFrom, input and value on outputs | Explicit LITERAL, INPUT, ENDPOINT or TEMPLATE source |
| Omitted endpoint names | Name the endpoint in every probe and address source |
| Component visibility and sizeGiB | Blueprint exposure and volume allocations; component minimumSizeGiB |
| Tagged image or compute slug treated as an immutable deployment | Generated resolution record with artifact digests and selected versions |

## Organization configuration

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

Its consuming blueprint node selects the authorized organization value:

```yaml
bindings:
  llmBaseUrl:
    type: CONFIG_REF
    source: "${{ config.llm.baseUrl }}"
```

The reference is a whole source reference. The dotted path is an exact
configuration key. It does not grant access; installation context supplies an
authorized value, sensitivity, identity and version. No resource registry or
matching input name implicitly selects it. See the paired
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
