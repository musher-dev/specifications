/** Effective document defaults without coercion or invented ancestors. */
import { isObject, type Json } from '../lib/layout.ts'
import { strictAjv } from '../schema/lint.ts'
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
            schema = { ...schema, ...schemaOf(branch, value, depth + 1) }
            break
          }
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
