# ADR 0056: A binding composes a string, and encodes what it interpolates

- **Status:** Proposed
- **Date:** 2026-11-13
- **Extends:** [ADR 0027](0027-a-reference-names-a-fact-the-document-cannot-contain.md) §3, the namespace set
- **Relies on:** [ADR 0027](0027-a-reference-names-a-fact-the-document-cannot-contain.md) §4, no re-scanning
- **Relies on:** [ADR 0031](0031-one-grammar-for-the-authored-documents.md) §4, parameters are how values enter

## Context

A blueprint binding supplied an input from a parameter, another node's output
or a literal, and never from a string built of several of them. Component
templates read only the component's own endpoint properties
(`COMP-PLACEHOLDER-001`). Most applications read their database or cache from
one URL with the password inside it: `DATABASE_URL`, `REDIS_URL`, `MONGO_URI`.

Deploy-testing 25 catalog items on production on 2026-11-13, reported as
platform-api #1448, found 14 places in 11 items that built such a URL in a
shell prelude: percent-encode the parts, build the URL, exec the real
entrypoint. An image without a shell cannot run one. Every prelude also depended on
the generator happening to choose a URL-safe alphabet; a store's password
schema that admits `+`, `/` and `=` breaks the URL's user information.

Core v2 §5.2 already said that "families define where string composition is
permitted and the encoding used there", and reserved two namespaces with no
meaning yet, `parameters` and `nodes`.

## Decision

### 1. A `template` binding

A binding may name `template`, a string of literal text and placeholders, with
`format` beside it:

```yaml
cacheURL:
  template: "redis://:${{ parameters.cachePassword }}@${{ nodes.cache.outputs.address }}/0"
  format: URL
```

It is a fourth origin, beside `parameter`, `node` and `value`, and the key
present names it, as
[ADR 0031](0031-one-grammar-for-the-authored-documents.md) §1 has every origin
named. It extends the mechanism core already defines, single-pass `${{ }}`
substitution with the `$${{` escape, and adds no syntax.

### 2. Two namespaces gain a meaning

`${{ parameters.<parameter> }}` names a deployment parameter and
`${{ nodes.<node>.outputs.<output> }}` an output of a node. Both were reserved
and unassigned in core v2 §5.2; assigning a meaning to one is the growth core
permits within a major version. The core table says where each is defined.
Values from outside the documents still enter only through parameters
([ADR 0031](0031-one-grammar-for-the-authored-documents.md) §4): a template
names a parameter, never a variable, a deployment fact or a connection.

### 3. The encoding is part of the syntax, and is never inferred

`format` is required. `TEXT` writes each value's string form as it is. `URL`
reads the template as an absolute URI whose scheme is literal text, places each
placeholder in the component the literal text around it puts it in, and
percent-encodes a value in the user information, path, query or fragment: every
UTF-8 octet but RFC 3986's unreserved characters. A value in the host and port
is written as it is, and must hold only unreserved characters, `:`, `[` and
`]`.

One encoding serves four components because it is the strictest each accepts,
and a decoder reads an octet encoded more than it had to be exactly as one
encoded no more. A per-component table would let an author's password end the
path with a `/` that a strict path encoding allows.

The encoding is per template, not per placeholder. A per-placeholder function,
such as `${{ parameters.password | urlencode }}`, needs a placeholder
expression, which core v2 §10 lists as not supported, and puts the choice where
it can be forgotten once in a template of five placeholders. A format declared
once cannot be forgotten for one value.

### 4. Sensitivity follows the parts

A composed string is sensitive when any value it interpolates is, or when the
input it supplies is. A template without placeholders is a literal, and
supplies no sensitive input (`BP-BIND-008`).

### 5. A template is a binding of the parameters it names

It counts as a binding for `BP-PARAM-001`, and its input counts for whether a
parameter is optional and for its sensitivity. It adds no value schema to the
parameter, because the composed string, not the parameter, is what the input
receives.

## Alternatives considered

**Functions: `urlencode`, `trimSuffix`, `origin`.** The issue asked for them.
They need a placeholder expression syntax, which is a core change of its own,
and each is a small language to specify. Encoding is the one function a
connection URL cannot do without, and `format` gives it without a syntax.

**Component output templates over inputs**, so a store publishes its own
credentialed `url`. It is the better place for a store's own URL, and the
connection protocols already derive `url` for `POSTGRES` and `REDIS`. It is a
component change, recorded as not supported in blueprint §9 for the component
family to take up.

**A `privateURL` endpoint property.** A component change too, and independent
of this one.

## Consequences

- Items drop their URL-building preludes, and a generator no longer has to
  choose a URL-safe alphabet for a password that travels in a URL.
- Core v2 §5.2 records `parameters` and `nodes` as defined by blueprint, and
  §10 lists only `environment` and `organization` as unassigned.
- platform-api composes and encodes the string in the `values` stage, and
  conceals a sensitive one wherever it is echoed.
