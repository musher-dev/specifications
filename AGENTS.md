# AGENTS.md

A router for coding agents that do not read `.claude/CLAUDE.md` (Codex, Gemini,
Copilot). It restates no rules; it points at the files that hold them
([ADR 0036 §4](docs/adr/0036-the-repository-adopts-the-engineering-conventions.md)).

- **[`.claude/CLAUDE.md`](.claude/CLAUDE.md)**: the non-negotiables for any
  change here, and where things are. A line starting with `@` there is a
  Claude Code import; open the file it names.
- **[`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md)**: how to make a
  change, the commit types and scopes, and the sign-off.
- **`task check`**: every check CI runs. [`tools/README.md`](tools/README.md)
  says what each one enforces.
- **[`docs/adr/`](docs/adr/README.md)**: why the repository is shaped the way it
  is.
