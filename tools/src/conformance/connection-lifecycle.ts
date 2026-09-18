/** Synthetic implementation of the durable/idempotent boundary, never production storage. */
import type { Json } from '../lib/layout.ts'
import { type ConnectionSelection, selectConnection } from '../validation/connections.ts'
import { at } from '../validation/semantic.ts'
export function observeConnectionLifecycle(input: Json): Json {
  const persisted = new Map<string, ConnectionSelection>(),
    issued = new Map<string, ConnectionSelection>()
  const observations: Json[] = []
  const steps = at(input, 'steps')
  if (!Array.isArray(steps)) throw new Error('connection lifecycle requires steps')
  for (const step of steps) {
    const installation = String(at(step, 'installation')),
      slot = String(at(step, 'slot'))
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
        installation,
        slot,
        generation,
        (key) => {
          // The same acquisition operation must not mint twice, even if local persistence failed.
          if (!issued.has(key)) {
            const id = String(issued.size + 1),
              version = String(at(step, 'defaultVersion') ?? '1')
            issued.set(key, {
              identity: 'connection-' + id,
              version,
              installation,
              slot,
              kind: 'MANAGED',
              costOwner: 'synthetic-org',
              source: {
                reference: '${{ config.llm.default }}',
                identity: 'default-policy',
                version,
              },
              credential: {
                identity: 'credential-' + id,
                rotation: generation,
                value: 'synthetic-' + id,
                permittedBaseUrls: ['https://gateway.example/openai/v1'],
              },
              views: {
                OPENAI_CHAT_COMPLETIONS: {
                  baseUrl: 'https://gateway.example/openai/v1',
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
              credential: result.selection.credential.identity,
              rotation: result.selection.credential.rotation,
            }
          : { status: result.status },
      )
    } catch {
      observations.push({ status: 'INTERRUPTED' })
    }
  }
  return { issued: issued.size, persisted: persisted.size, observations }
}
