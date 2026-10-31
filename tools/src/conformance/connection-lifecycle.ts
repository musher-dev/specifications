/** Synthetic implementation of the durable/idempotent boundary, never production storage. */
import type { Json } from '../lib/layout.ts'
import { type ConnectionSelection, selectConnection } from '../validation/selections.ts'
import { at } from '../validation/semantic.ts'
export function observeConnectionLifecycle(input: Json): Json {
  const persisted = new Map<string, ConnectionSelection>(),
    issued = new Map<string, ConnectionSelection>()
  const observations: Json[] = []
  const steps = at(input, 'steps')
  if (!Array.isArray(steps)) throw new Error('connection lifecycle requires steps')
  for (const step of steps) {
    const deployment = String(at(step, 'deployment')),
      parameter = String(at(step, 'parameter'))
    const generation = Number(at(step, 'generation') ?? 0),
      fault = at(step, 'fault')
    try {
      const store = {
        getOrCreate(key: string, create: () => ConnectionSelection) {
          const existing = persisted.get(key)
          if (existing !== undefined) return existing
          if (fault === 'beforeAcquisition') throw new Error('interrupted')
          const selected = create()
          if (fault === 'beforePersistence') throw new Error('interrupted')
          persisted.set(key, structuredClone(selected))
          if (fault === 'afterPersistence') throw new Error('interrupted')
          return selected
        },
      }
      const result = selectConnection(
        store,
        deployment,
        parameter,
        generation,
        (key) => {
          // The same acquisition operation must not mint twice, even if local persistence failed.
          let selection = issued.get(key)
          if (selection === undefined) {
            const id = String(issued.size + 1),
              version = String(at(step, 'defaultVersion') ?? '1')
            selection = {
              identity: `connection-${id}`,
              version,
              deployment,
              parameter,
              selectionKind: 'MANAGED',
              costOwner: 'synthetic-org',
              request: {
                // biome-ignore lint/suspicious/noTemplateCurlyInString: a Musher `${{ }}` placeholder is data here, not a template literal
                from: '${{ connections.llm.default }}',
                identity: 'default-policy',
                version,
              },
              credential: {
                identity: `credential-${id}`,
                rotation: generation,
                value: `synthetic-${id}`,
                permittedBaseURLs: ['https://gateway.example/openai/v1'],
              },
              views: {
                OPENAI_CHAT_COMPLETIONS: {
                  baseURL: 'https://gateway.example/openai/v1',
                  model: `model-${version}`,
                  capabilities: ['STREAMING', 'TOOL_CALLS'],
                },
              },
            }
            issued.set(key, selection)
          }
          if (fault === 'afterIssuance') throw new Error('interrupted')
          return structuredClone(selection)
        },
        () => at(step, 'revoked') !== true,
      )
      if (fault === 'beforeMaterialization') throw new Error('interrupted')
      observations.push(
        result.status === 'SELECTED'
          ? {
              status: 'SELECTED',
              identity: result.selection.identity,
              version: result.selection.version,
              credential: result.selection.credential?.identity ?? null,
              rotation: result.selection.credential?.rotation ?? null,
            }
          : { status: result.status },
      )
    } catch {
      observations.push({ status: 'INTERRUPTED' })
    }
  }
  return { issued: issued.size, persisted: persisted.size, observations }
}
