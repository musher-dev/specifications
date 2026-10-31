# Musher Document Specifications

This repository defines the formats of the documents people write for
[Musher](https://musher.dev), and the rules for interpreting them: normative
prose, the JSON Schemas built from it, example documents, and language-neutral
conformance corpora. The platform API and Musher's internal data models are
specified elsewhere. An implementation that disagrees with what is published
here is defective.

**Status:** v2 is the current major of every family, first released as `2.0.0`
on 2026-10-24. v1 is retired: its directories are gone from `main`, and every v1
release keeps serving at its pinned URL
([ADR 0038](docs/adr/0038-v2-one-vocabulary-and-v1-retires.md)).
[`published.json`](published.json) lists every release. What makes a version
released: [Draft or released](docs/publication.md#draft-or-released).

## Specifications

| Family | Specification | Front page | Rendered prose |
|---|---|---|---|
| core | [`core/v2/spec.md`](specifications/core/v2/spec.md) | [README](specifications/core/README.md) | [core v2](https://specifications.musher.dev/reference/core/v2/spec/) |
| component | [`component/v2/spec.md`](specifications/component/v2/spec.md) | [README](specifications/component/README.md) | [component v2](https://specifications.musher.dev/reference/component/v2/spec/) |
| blueprint | [`blueprint/v2/spec.md`](specifications/blueprint/v2/spec.md) | [README](specifications/blueprint/README.md) | [blueprint v2](https://specifications.musher.dev/reference/blueprint/v2/spec/) |
| listing | [`listing/v2/spec.md`](specifications/listing/v2/spec.md) | [README](specifications/listing/README.md) | [listing v2](https://specifications.musher.dev/reference/listing/v2/spec/) |

The rendered prose is generated and informative. What each family describes,
and how the families depend on one another, is set out in
[specifications/README.md](specifications/README.md), and which parts of a
family version are normative in
[What is normative](specifications/README.md#what-is-normative).

## I want to…

| I want to… | Start at |
|---|---|
| validate a document, or bind a schema in my editor | [Using the schemas](docs/using-schemas.md) |
| implement a parser or validator | [Implementing a family](specifications/README.md#implementing), then the [fixture format](docs/conformance.md) |
| look up a rule by its requirement ID | [Requirement traceability](docs/traceability.md) |
| know whether a version is released | [Draft or released](docs/publication.md#draft-or-released) |
| know what counts as a breaking change | [Compatibility review](docs/governance.md#compatibility-review) |
| change a specification | [Contributing](.github/CONTRIBUTING.md) |
| understand why something was decided | [Architecture decision records](docs/adr/README.md) |
| report a vulnerability | [Security policy](.github/SECURITY.md) |
| see every guide, by audience | [Documentation index](docs/README.md) |

## Repository map

```
specifications/   one directory per family; each major version, v<N>/, releases under its own tag prefix
docs/             guides, governance, the fixture format, traceability, and decisions
tools/            non-normative build and check scripts (Bun and TypeScript)
taskfiles/        the tasks behind `task check`
.config/          every linter, formatter, and hook configuration, and the tool pins
.devcontainer/    the development container, the supported environment
.github/          contributing, security, rulesets, and workflows
.repo/            what the repository is and publishes, for the engineering conventions
AGENTS.md         the brief for every coding agent, Claude Code included
published.json    append-only ledger of every release (docs/publication.md#the-ledger)
```

## Contributing

```sh
task setup   # install tooling and git hooks
task check   # run every check CI runs, except the CI-only steps
```

Read [CONTRIBUTING.md](.github/CONTRIBUTING.md) before opening a pull request,
[docs/conventions.md](docs/conventions.md) for how repository artifacts are
named, and [docs/governance.md](docs/governance.md) for how decisions are made.

## License

[Apache-2.0](LICENSE). See also [NOTICE](NOTICE).
