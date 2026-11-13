# ADR 0050: Entrypoint, configuration files and mixed-case environment names

- **Status:** Accepted
- **Date:** 2026-11-13
- **Relies on:** [ADR 0033](0033-inputs-are-the-only-way-into-a-component.md) §1, inputs are the only way in
- **Relies on:** [ADR 0032](0032-correcting-a-released-family-within-its-major.md) §3, a relaxation is declared
- **Refines:** [ADR 0007](0007-naming-conventions.md) §4, environment-variable names may be lower case
- **Closes:** [platform-api#1447](https://github.com/musher-dev/platform-api/issues/1447)

## Context

A component can set environment variables and replace the image's `CMD`, and
nothing else
([platform-api#1447](https://github.com/musher-dev/platform-api/issues/1447)).
Three gaps force shell wrappers, and where an image's `ENTRYPOINT` ignores its
arguments no wrapper works:

1. `command` keeps the image's `ENTRYPOINT`. searxng, anythingllm and
   `simstudioai/cron` ignore `"$@"`; `ollama/ollama`'s entrypoint is the binary,
   so `sh -c` becomes an unknown subcommand.
2. No file can be placed in the container. searxng ships HTML-only for want of
   a `settings.yml`, librechat cannot take `librechat.yaml`, and other items
   render configuration through three quoting layers of heredoc.
3. `target.envVar` is upper case only. Neo4j maps
   `NEO4J_server_memory_heap_max__size` onto `neo4j.conf` case-sensitively.

## Decision

### 1. `entrypoint`

`COMP-CMD-002`: `workload.entrypoint` is optional, and is a non-empty list of
strings in exec form, as `command` is. It replaces the image's `ENTRYPOINT`.
With it, the image's `CMD` is not used: `command` supplies the arguments, and
without `command` the entrypoint runs with none. This is what
`docker run --entrypoint` and Compose's `entrypoint` do, and what Kubernetes'
`command` does. Structural: a string is `ERR_INVALID_TYPE`, an empty list
`ERR_INVALID_VALUE`. `COMP-TYPE-007` relaxes to "a published `JOB` carries
`command` or `entrypoint`", because either names what runs.

### 2. `files`

`workload.files` maps a name, in core's DNS-label grammar, to a file the
platform writes into the container before the process starts:

```yaml
files:
  settings:
    path: /etc/searxng/settings.yml
    mode: "0444"
    content: { input: settingsYaml }
```

- `COMP-FILE-001`, structural: `path` REQUIRED, beginning with `/`, at most
  512 characters; `mode` a string `^0[0-7]{3}$`, default `"0444"`; `content`
  REQUIRED, exactly one of a literal `value`, at most 65536 characters, and an
  `input`. At most 32 files. `mode` is a string because YAML 1.1 and 1.2 read
  an unquoted `0644` differently.
- `COMP-FILE-002`, semantic: a content `input` names one of the component's
  own string inputs that is always supplied, with `ERR_UNKNOWN_INPUT`,
  `ERR_VALUE_CONSTRAINT` and `ERR_INPUT_NOT_GUARANTEED`. It may be sensitive:
  that is the non-environment delivery path for a secret. It counts as read for
  `COMP-INPUT-001`.
- `COMP-FILE-003`, semantic: `path` is canonical, as a volume's `mountPath`
  is, and is neither equal to, nor an ancestor of, another file's path or a
  volume's `mountPath`. `ERR_INVALID_MOUNT`, the code `COMP-VOL-001` already
  uses. A file under a volume's mount is permitted.
- `COMP-FILE-004`, platform obligation: the file holds exactly the UTF-8
  bytes of its content, with no newline added; its permission bits are `mode`;
  its owner is the user the process runs as; it is placed afresh at every
  start, overlaid at its path and never written into a volume's data; a
  missing parent directory is created owned by `root` with mode `0755`; and
  content from a sensitive input is sensitive wherever it travels.
- `COMP-FILE-005`, structural: `path` is not `/proc`, `/sys` or `/dev` or
  below them, nor `/etc/hosts`, `/etc/hostname` or `/etc/resolv.conf`, which
  the runtime mounts itself. `ERR_INVALID_VALUE` at `path`.

Content comes from one input, not a template over several. Composition
belongs upstream, in a blueprint binding's template, and a component template
over inputs would be a new placeholder namespace. A later minor can add one.

### 3. Mixed-case environment names

`COMP-ENVVAR-004` relaxes to `^[A-Za-z_][A-Za-z0-9_]*$`, POSIX's portable set,
at most 128 characters. Names are case-sensitive: `FOO` and `foo` are two
variables, and `COMP-ENVVAR-002` compares names exactly. Build argument and
secret keys keep the upper-case grammar (`COMP-BUILD-003`), which is now
written out rather than borrowed from §5.3, because a build secret ID is
compared against arguments and must not collide in a different spelling.

The released case `structural/032` (`database-url`) still fails: a hyphen is
outside both grammars.

## Alternatives considered

**`command` replaces both, as in Kubernetes.** Changes the meaning of every
released document that sets `command`.

**A file input target beside `envVar`.** It would deliver one input to one
file, with no mode and no literal content; a `files` entry reading an input
does the same and more, and keeps targets about the environment.

## Consequences

searxng, librechat and Ollama lose their shell preludes. The host agent
honours `entrypoint` and writes `files` before start.
