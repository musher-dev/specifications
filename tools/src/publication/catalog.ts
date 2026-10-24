/**
 * Regenerate the SchemaStore-compatible catalog, as build output under `dist/`.
 * The site serves it at `/catalog.json`.
 *
 * The catalog is how a generic editor discovers the right schema for a file
 * without the author writing a modeline. It intentionally points at the
 * major-version alias, not an immutable version: editors should pick up
 * backward-compatible additions without a config change.
 *
 * `versions` names every major an editor may bind: each one the ledger records,
 * retired majors included, since their aliases keep serving released bytes,
 * and each one the working tree authors. `url` is the newest released major,
 * so editors move to a new major only once it is tagged. A family with no
 * release yet points at its newest authored major.
 *
 * `bundle.ts` imports this module, so it reads the ledger with `node:`
 * builtins rather than through `ledger.ts`.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  bundleUrl,
  CATALOG_FILE,
  CORE_FAMILY,
  canonicalJson,
  discoverKinds,
  inRepo,
  isObject,
  type Json,
  LEDGER_FILE,
  REPO_ROOT,
  readJson,
} from '../lib/layout.ts'

const CATALOG_PATH = inRepo(REPO_ROOT, CATALOG_FILE)

/**
 * Glob patterns an editor uses to bind a family's schema to a file.
 *
 * A blueprint's `component` reference is a relative path, so a component
 * document is not obliged to live under `components/` — a flat directory
 * beside the blueprint is equally valid. The component patterns cover both;
 * binding only the directory form would leave the flat layout with no editor
 * support for the exact layout the reference form exists to permit.
 */
const FILE_MATCH: Record<string, string[]> = {
  component: [
    '**/components/*.yaml',
    '**/components/*.yml',
    '**/component.yaml',
    '**/component.yml',
    '**/component-*.yaml',
    '**/component-*.yml',
  ],
  blueprint: ['**/blueprint.yaml', '**/blueprint.yml'],
  listing: ['**/listing.yaml', '**/listing.yml'],
}

const DESCRIPTION: Record<string, string> = {
  component: 'Musher component document: one reusable, versioned workload definition.',
  blueprint: 'Musher blueprint document: a graph of nodes deployed together.',
  listing: 'Musher listing document: the catalog entry for a blueprint or component.',
}

const TITLE: Record<string, string> = {
  component: 'Musher Component Document',
  blueprint: 'Musher Blueprint Document',
  listing: 'Musher Listing Document',
}

const RELEASE_TAG = /^([a-z][a-z0-9-]*)\/v(\d+)\.\d+\.\d+$/

/** Kind family name to the majors the ledger records a release of. */
function releasedMajors(repoRoot: string): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>()
  const path = inRepo(repoRoot, LEDGER_FILE)
  if (!existsSync(path)) return out
  const ledger = readJson(path)
  const releases = isObject(ledger) && isObject(ledger.releases) ? ledger.releases : {}
  for (const tag of Object.keys(releases)) {
    const match = RELEASE_TAG.exec(tag)
    if (match?.[1] === undefined || match[1] === CORE_FAMILY) continue
    const majors = out.get(match[1]) ?? new Set<number>()
    majors.add(Number(match[2]))
    out.set(match[1], majors)
  }
  return out
}

export function buildCatalog(repoRoot: string = REPO_ROOT): Json {
  const schemas: Json[] = []
  const released = releasedMajors(repoRoot)
  const authored = new Map<string, Set<number>>()
  // Kind families only: core has no schema for an editor to bind, and no file
  // is a core document; every document is of some kind.
  for (const family of discoverKinds(repoRoot)) {
    const majors = authored.get(family.name) ?? new Set<number>()
    majors.add(Number(family.major.slice(1)))
    authored.set(family.name, majors)
  }

  const names = [...new Set([...authored.keys(), ...released.keys()])].sort(
    (a, b) => Object.keys(FILE_MATCH).indexOf(a) - Object.keys(FILE_MATCH).indexOf(b),
  )
  for (const name of names) {
    const fileMatch = FILE_MATCH[name]
    if (fileMatch === undefined) {
      throw new Error(
        `catalog: family "${name}" has no fileMatch patterns. Add them in ` +
          'tools/src/publication/catalog.ts; an unlisted family is invisible to editors.',
      )
    }
    const ofRelease = [...(released.get(name) ?? [])]
    const all = [...new Set([...ofRelease, ...(authored.get(name) ?? [])])].sort((a, b) => a - b)
    const current = ofRelease.length > 0 ? Math.max(...ofRelease) : Math.max(...all)
    const versions: { [major: string]: Json } = {}
    for (const major of all) versions[`v${major}`] = bundleUrl(name, `v${major}`)
    schemas.push({
      name: TITLE[name] ?? name,
      description: DESCRIPTION[name] ?? '',
      fileMatch,
      url: bundleUrl(name, `v${current}`),
      versions,
    })
  }

  return {
    $schema: 'https://json.schemastore.org/schema-catalog.json',
    version: 1,
    schemas,
  }
}

function main(): void {
  const catalog = buildCatalog()
  mkdirSync(dirname(CATALOG_PATH), { recursive: true })
  writeFileSync(CATALOG_PATH, canonicalJson(catalog), 'utf8')
  const count = ((catalog as { schemas: Json[] }).schemas ?? []).length
  console.log(`  ✓ ${CATALOG_FILE} (${count} schema(s))`)
}

if (import.meta.main) main()
