# ADR 0062: A parameter offers options, and a generated secret can be disclosed

- **Status:** Proposed
- **Date:** 2026-11-13
- **Refines:** [ADR 0018](0018-install-form-presentation.md) §3, what a form field declares
- **Refines:** [ADR 0035](0035-how-identity-and-credentials-reach-a-workload.md) §6, disclosure of a generated value
- **Relies on:** [ADR 0007](0007-naming-conventions.md) §1, a boolean is an adjective

## Context

Authoring the Ollama and Metabase catalog items on 2026-11-13 found two gaps
in how a parameter reaches the deploy form
([platform-console#328](https://github.com/musher-dev/platform-console/issues/328)).

1. **No suggested values.** A parameter whose value is an open string, such as
   Ollama's `model`, can show only examples. A deployer types a model too
   large for the node, and learns so when the workload fails to start. An
   `enum` in the input's schema would close the value, which Ollama's model
   name must not be.
2. **No place for a secret to keep.** Metabase's `MB_ENCRYPTION_SECRET_KEY`
   must accompany any backup of its application database. The only way to let
   the deployer read a generated value is a `ui` on the parameter, which reads
   as a form field, and nothing says the value must be kept.

## Decision

### 1. `ui.options` lists the values a form offers

A submitted parameter's `ui` may carry `options`, a list of `value` and
`label` pairs, and `editable`:

```yaml
parameters:
  model:
    ui:
      label: Model
      options:
        - { value: "llama3.2:1b", label: Llama 3.2 1B }
        - { value: "qwen2.5:0.5b", label: Qwen 2.5 0.5B }
      editable: true
```

A form offers the options as a choice among their labels. Without
`editable`, or with `editable: false`, the list is closed: the form offers
nothing else, and admission rejects a submitted value that is not an option's.
With `editable: true` the form also accepts a value typed in, and every value
is still held to the receiving inputs' schemas.

Every option's value satisfies the value schema of every input the parameter
binds, and a `default` of a parameter with closed options is one of them.
Options belong to the presentation, not to the value schema, so they are not
an `enum`: a component's input stays as open as its workload, and the
blueprint narrows what its form offers. `enumLabels` already labels a closed
schema enum, so a parameter carries one or the other. A generated, variable,
deployment-fact or connection parameter is never an editable field, so none
carries options.

`editable` is an adjective, as a boolean is
([ADR 0007](0007-naming-conventions.md) §1), and is what interface libraries call a
selection list that also takes text: an editable combo box.

### 2. `ui.disclosed` marks a generated value the deployer keeps

A generated parameter's `ui` may set `disclosed: true`. The platform then
MUST disclose the value, behind an explicit reveal, to the people who manage
the deployment, apart from the deploy form, and say that it is to be kept,
because losing it loses data, such as a key that encrypts what a backup
holds. Without it, a generated parameter with `ui` MAY be disclosed, as
before. Only a generated parameter carries `disclosed`. The value is a
credential like any other: it never appears in a published artifact, a
public response, a preview or a diagnostic.

Only a person the platform API lets change the deployment reveals it, never
one whose only role is `viewer`. Every reveal is recorded for audit, without
the value. After a rotation, the earlier generation stays disclosable while
anything still accepts it, and afterwards the platform says it is gone rather
than show nothing, because data encrypted under it may still need it.

### 3. Everything here is a relaxation

`options`, `editable` and `disclosed` were each rejected before, as unknown
fields. Every document accepted before keeps its meaning, so blueprint
releases this in a minor version.

## Consequences

- Blueprint gains `BP-UI-006` to `BP-UI-008` for options, and `BP-UI-009`
  for disclosure. The form observation of the fixture format gains `options`
  and `editable`, and the control `options`.
- platform-console renders options as a select, or a combo box when
  editable, and shows disclosed values behind a reveal in the deployment's
  settings. platform-api rejects a value outside closed options.
- The Ollama item offers its models that fit the node, editable; Metabase
  marks `encryptionKey` disclosed.

## Alternatives considered

**An `enum` on the component input.** Rejected: it closes the value for every
blueprint, and Ollama's model must stay open.

**`freeText` for the open list.** Rejected because a boolean is an adjective.

**A `disclosure` enum, such as `KEEP`.** Rejected as one value that a boolean
says as well; a second reason to disclose can make it an enum in a later
major.

**A separate `secrets` section of the blueprint for values to keep.**
Rejected because the value is already a parameter, and a second place to
declare it would be a second name for one value.
