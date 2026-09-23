/** Effective document defaults without coercion or invented ancestors. */
import { isObject, type Json } from '../lib/layout.ts'
import { strictAjv } from '../schema/lint.ts'

/**
 * Narrow a parent's properties by a branch's. A branch that only names a
 * property (`true`) to select itself leaves the parent's declaration, and its
 * default, in place; a branch forbidding one (`false`) leaves it no default.
 */
function narrowProperties(
  parent: Json | undefined,
  branch: Json | undefined,
): Record<string, Json> {
  const out: Record<string, Json> = { ...(isObject(parent) ? parent : {}) }
  for (const [key, value] of Object.entries(isObject(branch) ? branch : {}))
    if (value !== true) out[key] = value
  return out
}
export function normalizeDocument(bundle: Json, document: Json): Json {
  const defs = isObject(bundle) && isObject(bundle.$defs) ? bundle.$defs : {}
  function schemaOf(raw: Json, value: Json, depth = 0): Record<string, Json> {
    if (!isObject(raw) || depth > 64) return {}
    let schema = { ...raw }
    if (typeof schema.$ref === 'string') {
      const target = defs[schema.$ref.slice('#/$defs/'.length)]
      if (target) return schemaOf(target, value, depth + 1)
    }
    for (const keyword of ['oneOf', 'anyOf']) {
      const branches = schema[keyword]
      if (Array.isArray(branches))
        for (const branch of branches) {
          if (!isObject(branch)) continue
          if (strictAjv().compile({ ...branch, $defs: defs })(value)) {
            const selected = schemaOf(branch, value, depth + 1)
            schema = {
              ...schema,
              ...selected,
              properties: narrowProperties(schema.properties, selected.properties),
            }
            break
          }
        }
    }
    // A conditional that holds can forbid a field, and a forbidden field has no
    // default. Only the prohibition is taken: what a `then` requires of a field
    // it allows is validation, not a default.
    if (Array.isArray(schema.allOf))
      for (const branch of schema.allOf) {
        if (!isObject(branch) || !isObject(branch.if) || !isObject(branch.then)) continue
        // Strict mode wants every required key declared; naming it is enough.
        const named = Array.isArray(branch.if.required) ? branch.if.required.map(String) : []
        const condition = {
          ...branch.if,
          properties: {
            ...Object.fromEntries(named.map((key) => [key, true])),
            ...(isObject(branch.if.properties) ? branch.if.properties : {}),
          },
          $defs: defs,
        }
        if (!strictAjv().compile(condition)(value)) continue
        const forbidden = Object.entries(
          isObject(branch.then.properties) ? branch.then.properties : {},
        ).filter(([, v]) => v === false)
        schema = {
          ...schema,
          properties: narrowProperties(schema.properties, Object.fromEntries(forbidden)),
        }
      }
    return schema
  }
  function visit(raw: Json, value: Json, depth = 0): Json {
    if (depth > 64) throw new Error('normalization depth exceeded')
    const schema = schemaOf(raw, value)
    if (Array.isArray(value)) return value.map((v) => visit(schema.items ?? {}, v, depth + 1))
    if (!isObject(value)) return value
    const properties = isObject(schema.properties) ? schema.properties : {}
    const output: Record<string, Json> = Object.create(null)
    for (const key of [...new Set([...Object.keys(value), ...Object.keys(properties)])].sort()) {
      const field =
        (Object.hasOwn(properties, key) ? properties[key] : undefined) ??
        schema.additionalProperties ??
        {}
      if (Object.hasOwn(value, key)) output[key] = visit(field, value[key]!, depth + 1)
      else {
        const resolved = schemaOf(field, null)
        if (Object.hasOwn(resolved, 'default'))
          output[key] = visit(field, resolved.default!, depth + 1)
      }
    }
    return output
  }
  return visit(bundle, document)
}
