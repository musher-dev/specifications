/** Non-normative presentation adapter over validated contracts. */
import { HtmlRenderer, Parser } from 'commonmark'
import type { Json } from '../lib/layout.ts'
import { MEDIA_PATH, schemeIsPermitted } from './listing-policy.ts'
import { at, record } from './semantic.ts'
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
  for (const [name, parameter] of Object.entries(record(at(blueprint, 'spec', 'parameters')))) {
    const p = record(parameter),
      ui = record(p.ui)
    if (!p.ui || p.generator) continue
    const receivers: Record<string, Json>[] = []
    for (const [node, n] of Object.entries(record(at(blueprint, 'spec', 'components'))).sort())
      for (const [key, b] of Object.entries(record(at(n, 'bindings'))).sort())
        if (at(b, 'type') === 'PARAMETER' && at(b, 'parameter') === name)
          receivers.push(record(at(components.get(node), 'spec', 'contract', 'inputs', key)))
    const schema = record(receivers[0]?.schema)
    const control = receivers.some((v) => v.sensitive === true)
      ? 'secret'
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
    })
  }
  fields.sort(
    (a, b) =>
      Number(a.order ?? Infinity) - Number(b.order ?? Infinity) ||
      Buffer.compare(Buffer.from(String(a.name)), Buffer.from(String(b.name))),
  )
  return fields
}
