/**
 * Validate every example document against its family's bundle, built fresh
 * from the working tree's sources.
 *
 * Examples are copied verbatim into the documentation site, so an example that
 * does not validate is a documentation bug that ships. This check is why the
 * README can promise the quick-start actually works.
 */
import { readFileSync } from 'node:fs'
import { discoverFamilies, exampleFiles, Failures, relativeToRepo } from '../lib/layout.ts'
import { familyBundle } from '../schema/bundle.ts'
import { validateDocument } from '../validation/validator.ts'

function main(): void {
  const failures = new Failures()
  let checked = 0

  for (const family of discoverFamilies()) {
    const examples = exampleFiles(family)
    if (familyBundle(family) === null) {
      if (examples.length > 0) {
        failures.add(
          `${family.name}/${family.major}: ${examples.length} example(s) present but no ` +
            'schema modules are authored to validate them against',
        )
      }
      continue
    }

    for (const path of examples) {
      const result = validateDocument(family, readFileSync(path))
      checked += 1

      if (result.status === 'INCOMPLETE') {
        console.log(
          `  · ${relativeToRepo(path)}: valid structure; incomplete document checks (${result.deferred.map((d) => d.missing).join(', ')})`,
        )
        continue
      }
      if (result.ok) {
        console.log(`  ✓ ${relativeToRepo(path)}`)
        continue
      }
      const detail = result.diagnostics
        .map((d) => `        ${d.code} at ${d.path || '/'} — ${d.message}`)
        .join('\n')
      failures.add(`${relativeToRepo(path)} failed in the ${result.phase} phase:\n${detail}`)
    }
  }

  failures.report(
    checked === 0
      ? 'No examples to validate.'
      : `${checked} example(s) checked; incomplete document context is reported above.`,
  )
}

if (import.meta.main) main()
