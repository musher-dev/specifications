# ADR 0059: An embeddings protocol, and connections a node provides

- **Status:** Accepted
- **Date:** 2026-11-13
- **Refines:** [ADR 0045](0045-connection-protocols-are-a-registry.md) §7, a protocol with a member §6.4 does not yet state
- **Refines:** [ADR 0033](0033-inputs-are-the-only-way-into-a-component.md) §2, a connection enters through one
- **Relies on:** [ADR 0039](0039-provenance-is-chosen-at-deployment.md) §5, an HTTP-based view is HTTPS
- **Relies on:** [ADR 0031](0031-one-grammar-for-the-authored-documents.md) §1, the key present names the origin

## Context

Deploy-testing catalog items on production on 2026-11-13 found two gaps in
the connection model
([platform-api#1455](https://github.com/musher-dev/platform-api/issues/1455)).

1. **No embeddings protocol.** Mem0, Graphiti, LibreChat's RAG and the
   knowledge bases of LobeHub and Sim need an embeddings endpoint. The
   registry has two language-model protocols, both for conversation, so an
   organization cannot configure a default embeddings connection and a
   blueprint cannot read one.
2. **A node cannot provide a connection.** Only a connection parameter fills a
   connection input ([`BP-CONNECTION-001`](../../specifications/blueprint/v2/spec.md#BP-CONNECTION-001)),
   so an in-deployment provider, such as a text-embeddings-inference, llama.cpp
   or SeaweedFS node, publishes loose outputs, and every consumer wires each
   one by hand. The component that stands for "an embeddings API" cannot be
   reused between a blueprint that reads the organization's connection and one
   that runs its own model. And the HTTPS rule for a locator cannot be met by
   an in-deployment address, such as `http://tei:80`, which never leaves the
   deployment's private network.

## Decision

### 1. `OPENAI_EMBEDDINGS` joins, in category `LANGUAGE_MODEL`

| Member | Role | Type | Presence |
|---|---|---|---|
| `baseURL` | locator | string, HTTPS | required |
| `apiKey` | credential | string, sensitive | required |
| `model` | parameter | string | required |
| `dimensions` | parameter | integer, 1 to 65536 | required |

It is the OpenAI embeddings wire protocol, `POST /embeddings` under
`baseURL`, spoken by OpenAI and by every compatible server: Hugging Face's
text-embeddings-inference, vLLM, Ollama and llama.cpp among them. It follows
the `LANGUAGE_MODEL` conventions, `apiKey` and `baseURL`, so it needs no new
category. It takes no capabilities. The category's description widens from
conversations to requests.

`dimensions` is new, and is why this needs a decision rather than a record
([ADR 0045](0045-connection-protocols-are-a-registry.md) §7): it is the length
of every vector the client receives. It is required because a consumer sizes
its vector index from it, and an output may forward only a member every
connection holds. Whether the client sends it in each request, as OpenAI's
reduced-dimension models accept, or receives vectors of that length from a
model with one size, is the client's affair; the member is the length.

An organization's default embeddings connection is configured as any other
connection is, such as `${{ connections.embeddings.default }}`. Which
providers back it, and whether Musher's gateway serves embeddings, are
platform decisions.

### 2. A workload component may provide a connection

A `SERVICE` or `WORKER` declares, in `contract.providedConnections`, a named
connection it serves. Each one names a protocol in `connection`, the same
object a connection input carries, and maps each member it supplies to one
of the component's outputs:

```yaml
contract:
  providedConnections:
    embeddings:
      description: The embeddings API this server answers.
      connection: { protocol: OPENAI_EMBEDDINGS }
      members:
        baseURL: baseURL
        apiKey: apiKey
        model: model
        dimensions: dimensions
```

A provided connection maps every required member, never a derived one, each to
an output of the member's type, and a sensitive member only to a sensitive
output. Its locator is read from one of the component's own endpoints, by an
`endpoint` origin or a template that reads one, so that the URL a provided
connection hands on is the provider's, not a literal pointing anywhere.

### 3. A node binding may name a provided connection

A blueprint binds a connection input to a sibling's provided connection with
`{ node, connection }`, as it binds a value input to a sibling's output with
`{ node, output }`. The key present names the origin
([ADR 0031](0031-one-grammar-for-the-authored-documents.md) §1). The protocol
must be the input's, and the provider must declare every capability the input
requires. The consumer is still the `EXTERNAL` node that stands for the
connection, so the component that wraps "an embeddings API" is the same
whether a parameter or a sibling fills it.

### 4. Resolution reads the members from the provider's outputs

In the `values` stage, the input receives each member the provided connection
maps, read from the provider's outputs, the default of each optional member it
omits, and any derived `url`, composed as for a selection. Each member is
checked against its protocol's schema, with one relaxation: a locator a node
provides may be an `http` URL as well as an `https` one, because it addresses
an endpoint of the same deployment, which only that deployment's nodes reach
([`BP-ACCESS-011`](../../specifications/blueprint/v2/spec.md#BP-ACCESS-011)).
There is no acquisition, selection, scoped credential or persisted state: the
values are the provider's outputs, which the record already pins through the
provider node.

### 5. Everything here is a relaxation

A component that declares `providedConnections`, an input naming
`OPENAI_EMBEDDINGS` and a binding naming `connection` were each rejected
before, as an unknown field, an unknown protocol and a binding with no origin.
Every document accepted before keeps its meaning, so component and blueprint
release this in a minor version.

## Consequences

- Component gains §6.5, `COMP-CONNECTION-004` and `COMP-CONNECTION-005`, and
  the code `ERR_INVALID_PROVIDED_CONNECTION`. Blueprint gains
  `BP-CONNECTION-004` and `BP-CONNECTION-005`, and the code
  `ERR_UNKNOWN_PROVIDED_CONNECTION`. `ERR_INVALID_CONNECTION_BINDING` also
  covers a binding to a provided connection of another protocol, or one that
  lacks a capability the input requires.
- The generator writes the member union into `providedConnections.members` as
  it does into `from.member`.
- platform-api adds the protocol, lets an organization configure a default
  for it, and resolves a `{ node, connection }` binding. The catalog's
  text-embeddings-inference, llama.cpp and SeaweedFS items can declare what
  they provide, and Graphiti can bind its embedder through a connection.
- The S3 locator a provider hands on may be `http`, which lets an in-mesh
  SeaweedFS fill an `S3` input. A selection's locator is still HTTPS.

## Alternatives considered

**Put embeddings inside `OPENAI_CHAT_COMPLETIONS`.** One connection for both
endpoints of one vendor. Rejected because the two are different client
contracts that providers serve separately, with different models; a selection
that answers one rarely answers the other with the same `model`.

**Make `dimensions` optional.** Rejected because an output cannot forward an
optional member without a default, and no default length is right.

**Let a workload declare a connection input.** The consumer would bind the
provider directly. Rejected because it would make every consuming workload
depend on the protocol's member names instead of its own inputs, and would
reverse [ADR 0033](0033-inputs-are-the-only-way-into-a-component.md)'s rule
that a workload receives connection members as ordinary values.

**A blueprint-level `connections` map assembling outputs into a connection.**
Rejected because it would restate, in every blueprint, a mapping only the
provider's author knows, and the mapping would be checked against no
component.

**Optional nodes, so a deployer chooses hosted or self-hosted at deploy
time.** Out of scope, as the issue says; a provided connection is what such a
choice would bind.
