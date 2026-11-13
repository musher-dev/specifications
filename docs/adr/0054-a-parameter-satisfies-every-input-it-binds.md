# ADR 0054: A parameter satisfies every input it binds

- **Status:** Accepted
- **Date:** 2026-11-13
- **Refines:** [ADR 0028](0028-explicit-binding-and-resolution-before-release.md) §2, values and sensitivity

## Context

One deployment parameter may bind inputs on several nodes: a generated password
that a database stores and an application presents. Blueprint `BP-PARAM-002`
required those inputs to declare equal value schemas, and reported anything
else as `ERR_CONFLICTING_INPUT_SCHEMA`.

Deploy-testing 25 catalog items on production on 2026-11-13, reported as
platform-api #1449, found that four of them could not say what they meant under that rule. A
consumer cannot be stricter than its producer: an application that puts a
password in a URL needs a URL-safe pattern the store does not, and a graph
database's eight-character minimum cannot sit beside a client that states none.
Authors copied each store's internal quoting rules into every consumer, or
dropped real constraints.

Two implementations also disagreed about what "equal" meant. The TypeScript
reference compared canonical JSON, so the order of `required` mattered; the
platform compared `required` as a set.

## Decision

### 1. The parameter's schema is the intersection

A parameter's value must satisfy every input it binds. Inputs that declare
different schemas may share a parameter as long as some value satisfies them
all. `ERR_CONFLICTING_INPUT_SCHEMA` now means that no value does, decided
keyword by keyword and recursively: different types (with `integer` beside
`number` intersecting to `integer`), an `enum` none of whose members fits every
schema, bounds that cross, a property one closed object requires and another
does not declare.

`pattern` is compared only with an `enum`'s members and a generator's output.
Whether two patterns share a string is decidable for regular languages, but it
is expensive and easy to implement differently; a value that misses a pattern
is still caught once it is known, as `ERR_VALUE_CONSTRAINT`.

### 2. A conflict names its inputs and keywords

The diagnostic carries a `related` location for each bound input, at the
component's `/spec/contract/inputs/<input>/schema`, and its message names the
keywords that cannot hold together. A reader learns which nodes to compare and
what to compare, not merely that a parameter is wrong.

### 3. A generator's output language

A generator produces a random string, so whether it fits a schema is a property
of every string it can produce. Blueprint defines that set, the **output
language**, as every string of the encoded length over the encoding's
alphabet, padding fixed. It is a superset of what an encoder emits, and it is
deliberately the same superset for every implementation, so that each decides
the same answer. Length bounds are compared with its length; a pattern is
decided by asking whether some string of the language fails it, which for the
value-schema pattern profile of component `COMP-VAL-007` is a bounded search.

### 4. Where the generator check is an error, and where it is a warning

A generator outside the intersection is an error where the parameter's inputs
declare different schemas: 2.1.0 and 2.2.0 rejected every such document, so
rejecting some of them still is no stricter. Where the inputs declare one
schema, 2.1.0 and 2.2.0 accepted the document, and core v2 §3 forbids
rejecting it now. That case is
`WARN_GENERATOR_OUTSIDE_SCHEMA`, under the SHOULD `BP-PARAM-017`, until a major
version can make it an error.

### 5. Sets compare as sets

Two schemas are the same when they differ only in mapping order, or in the
order of `required` or of an `enum`'s members. The reference implementation
compares them that way.

## Alternatives considered

**A schema on the parameter.** The parameter would declare its own value
schema, and each input would have to accept it. It restores a second place to
state what a value is, which
[ADR 0028](0028-explicit-binding-and-resolution-before-release.md) §1 removed
on purpose: the inputs own the value schema.

**Deciding pattern intersections.** It would catch a URL-safe pattern beside a
base64 one before resolution, but it puts an automaton construction in every
validator for a case a generator's output language, and resolution, already
catch.

**An error for every generator outside its schema.** Cleaner, and stricter than
2.1.0 and 2.2.0 for a document they accepted. It waits for a major version.

## Consequences

- Inputs may be stricter than their producers; the four items drop the
  copies of each store's constraints.
- The deploy form validates against every receiver's schema, and offers the
  members of an `enum` that every receiver accepts.
- `ERR_CONFLICTING_INPUT_SCHEMA` rejects fewer documents. Released case
  `semantic-008` still rejects: a string beside a number has no intersection.
