/** Non-normative presentation adapter over validated contracts. */
import { HtmlRenderer, Parser } from 'commonmark'
import type { Json } from '../lib/layout.ts'
import { MEDIA_PATH, schemeIsPermitted } from './listing-policy.ts'
import { parameterOrigin } from './selections.ts'
import { at, record } from './semantic.ts'
import { isSensitive, parameterReceivers } from './templates.ts'
export function renderListing(
  markdown: string,
  media: Readonly<Record<string, string>> = {},
): string {
  const ast = new Parser().parse(markdown),
    walker = ast.walker()
  let step = walker.next()
  while (step) {
    if (
      step.entering &&
      step.node.type === 'link' &&
      !schemeIsPermitted(step.node.destination ?? '')
    )
      throw new Error('disallowed link destination')
    if (step.entering && step.node.type === 'image') {
      if (!MEDIA_PATH.test(step.node.destination ?? '')) throw new Error('invalid media path')
      const target = media[step.node.destination ?? '']
      if (!target) throw new Error('unresolved media')
      step.node.destination = target
    }
    step = walker.next()
  }
  return new HtmlRenderer({ safe: true }).render(ast)
}
export function formControls(blueprint: Json, components: ReadonlyMap<string, Json>): Json {
  const fields: Record<string, Json>[] = []
  // BP-UI-004: a parameter is concealed when any input it reaches, through a
  // `parameter` binding or a template, is sensitive (BP-BIND-011).
  const reaches = parameterReceivers(record(at(blueprint, 'spec', 'nodes')), (node, input) =>
    at(components.get(node), 'spec', 'contract', 'inputs', input),
  )
  for (const [name, parameter] of Object.entries(record(at(blueprint, 'spec', 'parameters')))) {
    const p = record(parameter),
      ui = record(p.ui)
    // Blueprint §5.4: generated values, hashes, variables and deployment facts are
    // never editable fields. A connection is offered as a whole selection, never
    // as its members.
    const origin = parameterOrigin(p)
    if (
      !p.ui ||
      p.generator ||
      p.hash ||
      origin?.namespace === 'variables' ||
      origin?.namespace === 'deployment'
    )
      continue
    const reached = reaches.get(name) ?? [],
      receivers = reached.filter((r) => r.via === 'parameter').map((r) => record(r.declaration))
    // Blueprint BP-PARAM-002: the form's schema is the intersection of the
    // receivers', so a choice any receiver restricts to an enum is offered as one.
    const schema = record(
      receivers.find((v) => at(v.schema, 'enum') || at(v.schema, 'items', 'enum'))?.schema ??
        receivers[0]?.schema,
    )
    const control =
      origin?.namespace === 'connections'
        ? 'connection'
        : reached.some((r) => isSensitive(r.declaration))
          ? 'secret'
          : Array.isArray(ui.options)
            ? 'options'
            : schema.enum
              ? 'enum'
              : schema.type === 'array' &&
                  at(schema.items, 'type') === 'string' &&
                  at(schema.items, 'enum')
                ? 'multiChoice'
                : schema.type === 'boolean'
                  ? 'boolean'
                  : ['array', 'object'].includes(String(schema.type))
                    ? 'json'
                    : 'text'
    fields.push({
      name,
      label: ui.label ?? name,
      control,
      order: ui.order ?? null,
      prominence: ui.prominence ?? 'PRIMARY',
      // BP-UI-008: the options in their order, and whether a value may be typed in.
      ...(control === 'options'
        ? { options: ui.options ?? [], editable: ui.editable ?? false }
        : {}),
    })
  }
  fields.sort(
    (a, b) =>
      Number(a.order ?? Infinity) - Number(b.order ?? Infinity) ||
      Buffer.compare(Buffer.from(String(a.name)), Buffer.from(String(b.name))),
  )
  return fields
}
