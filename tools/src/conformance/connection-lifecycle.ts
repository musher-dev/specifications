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
          if (persisted.has(key)) return persisted.get(key)!
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
          if (!issued.has(key)) {
            const id = String(issued.size + 1),
              version = String(at(step, 'defaultVersion') ?? '1')
            issued.set(key, {
              identity: 'connection-' + id,
              version,
              deployment,
              parameter,
              selectionKind: 'MANAGED',
              costOwner: 'synthetic-org',
              request: {
                from: '${{ connections.llm.default }}',
                identity: 'default-policy',
                version,
              },
              credential: {
                identity: 'credential-' + id,
                rotation: generation,
                value: 'synthetic-' + id,
                permittedBaseURLs: ['https://gateway.example/openai/v1'],
              },
              views: {
                OPENAI_CHAT_COMPLETIONS: {
                  baseURL: 'https://gateway.example/openai/v1',
                  model: 'model-' + version,
                  capabilities: ['STREAMING', 'TOOL_CALLS'],
                },
              },
            })
          }
          if (fault === 'afterIssuance') throw new Error('interrupted')
          return structuredClone(issued.get(key)!)
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
