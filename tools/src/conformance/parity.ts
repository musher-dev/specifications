/**
 * Structural agreement between two independent validators.
 *
 * Every executable claim this repository makes is currently decided by Ajv.
 * The conformance corpus proves the fixtures behave, `check:examples` proves
 * the examples validate — and both ask the same library. A schema that Ajv
 * happens to interpret differently from everyone else would pass every gate
 * here and fail in the CLI, the API, and every SDK, which is the one failure
 * this repository exists to prevent.
 *
 * So each structural subject is validated twice: once by Ajv, once by Blaze
 * through the Sourcemeta CLI, which is a separate implementation of 2020-12 in
 * a different language. Only the verdict is compared. Diagnostic text is not
 * normative (docs/conformance.md), and Blaze does not emit Musher codes —
 * requiring it to would be requiring a second implementation to be the first.
 *
 * Skipped rather than failed when the CLI is absent, so a contributor without
 * it can still run `task check`. Under `CI=true` an absent CLI fails instead:
 * CI installs it, and a skip there would pass a gate that never ran.
 *
 * NON-NORMATIVE, like everything under tools/.
 */
import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { join, resolve } from 'node:path'
import {
  discoverFamilies,
  Failures,
  type Family,
  isObject,
  type Json,
  REPO_ROOT,
  readJson,
  relativeToRepo,
} from '../lib/layout.ts'
import { ensureBundleFile } from '../schema/bundle.ts'
import { reportAbsentCli } from '../schema/standards.ts'
import { parseDocument } from '../validation/document.ts'
import { compileFamily } from '../validation/validator.ts'

const CLI = join(REPO_ROOT, 'tools', 'node_modules', '.bin', 'jsonschema')

interface Subject {
  readonly path: string
  /** What the corpus says should happen at the structural phase. */
  readonly expectValid: boolean | null
}

/**
 * Instances per invocation.
 *
 * Batched because nearly all the cost is process startup and compiling a
 * 36 KiB schema: one instance takes ~1.5s and twenty take barely longer, so a
 * call per subject would put this check into the minutes and it would be turned
 * off. Chunked because the CLI mishandles a long argument list — past roughly
 * fifty paths it concatenates them into one non-existent filename and exits 6.
 * Twenty is comfortably inside that and still amortises the startup.
 */
const BATCH = 20

/**
 * Batches in flight at once. Each is its own process, so they run on separate
 * cores; beyond the core count they only contend with each other.
 */
const CONCURRENCY = Math.max(1, availableParallelism())

/** Run one CLI invocation to completion, collecting what it printed. */
function run(args: string[]): Promise<{ status: number | null; output: string }> {
  return new Promise((done, fail) => {
    const child = spawn(CLI, args, { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.setEncoding('utf8').on('data', (text: string) => {
      output += text
    })
    child.stderr.setEncoding('utf8').on('data', (text: string) => {
      output += text
    })
    child.on('error', fail)
    child.on('close', (status) => done({ status, output }))
  })
}

/** A rejected instance is announced on its own line. */
const FAIL_LINE = /^fail:\s*(.+)$/

/** What the CLI appends when the instance is one entry of a multi-document file. */
const MULTI_DOCUMENT_ENTRY = /\s*\(entry #\d+\)$/

/**
 * Read the instances a `validate` run rejected out of its output.
 *
 * This is the whole of what the check depends on about another project's CLI,
 * so it is written down rather than left implied:
 *
 *   - a rejected instance is announced by a line reading `fail: <path>`;
 *   - `<path>` is printed relative to the working directory from 16.10.0, and
 *     absolutely before it, so it is resolved against `cwd` either way —
 *     `resolve` returns an already-absolute path unchanged;
 *   - a multi-document entry carries a trailing ` (entry #N)`;
 *   - `validate` stops at the first failing instance unless `--continue` is
 *     passed, which is why the caller passes it.
 *
 * Every name read must be one of the instances the run was asked about, and a
 * name that is not throws. A rejection this parser fails to recognise becomes
 * an agreement, which is the one way this check can report success while
 * comparing nothing: 16.10.0 moved to relative paths, every lookup missed, and
 * Blaze appeared to accept all 193 subjects at once.
 */
export function parseRejections(output: string, instances: string[], cwd: string): Set<string> {
  const asked = new Set(instances.map((instance) => resolve(cwd, instance)))
  const rejected = new Set<string>()

  for (const line of output.split('\n')) {
    const named = FAIL_LINE.exec(line.trim())?.[1]
    if (named === undefined) continue

    const path = resolve(cwd, named.replace(MULTI_DOCUMENT_ENTRY, ''))
    if (!asked.has(path)) {
      throw new Error(
        `jsonschema validate named "${named}", which is not one of the instances it was asked ` +
          'about — its output no longer has the shape this parser reads.',
      )
    }
    rejected.add(path)
  }

  return rejected
}

/** Ask Blaze about a family's subjects, returning the set it rejected. */
async function blazeRejects(schema: string, instances: string[]): Promise<Set<string>> {
  const chunks: string[][] = []
  for (let start = 0; start < instances.length; start += BATCH)
    chunks.push(instances.slice(start, start + BATCH))

  // `--continue` because `validate` otherwise stops at the first instance of
  // the batch that fails, and a batch is what makes this check affordable.
  // `cwd` is pinned so the paths it prints resolve against a known directory
  // rather than against wherever the task runner happened to start.
  const ask = async (chunk: string[]): Promise<Set<string>> => {
    const { status, output } = await run(['validate', '--continue', schema, ...chunk])
    if (status !== 0 && status !== 2) {
      throw new Error(`jsonschema validate exited ${status} — ${output.trim()}`)
    }
    const named = parseRejections(output, chunk, REPO_ROOT)
    // A rejection the output does not name would silently become an agreement.
    // If the CLI's output shape ever changes, fail rather than pass everything.
    if (status === 2 && named.size === 0) {
      throw new Error(`jsonschema validate reported failure but named no file — ${output.trim()}`)
    }
    return named
  }

  // A fixed pool of workers, each taking the next chunk until none is left.
  const rejected = new Set<string>()
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < chunks.length) {
      const chunk = chunks[next++] as string[]
      for (const path of await ask(chunk)) rejected.add(path)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker))
  return rejected
}

/**
 * Structural subjects: every example, plus every conformance case whose
 * document can be validated on its own.
 *
 * `parser` cases are excluded — they are about YAML this schema never sees, and
 * a document Blaze cannot parse says nothing about schema agreement. `semantic`
 * and `capability` cases are included only for their structural verdict, which
 * is "valid": a semantic fixture is structurally well-formed by construction,
 * which is what lets it reach the semantic phase at all.
 */
function subjectsFor(family: Family): Subject[] {
  const subjects: Subject[] = []

  if (existsSync(family.examplesDir)) {
    for (const name of readdirSync(family.examplesDir).sort()) {
      if (!name.endsWith('.yaml') && !name.endsWith('.yml')) continue
      subjects.push({ path: join(family.examplesDir, name), expectValid: true })
    }
  }

  const indexPath = join(family.conformanceDir, 'cases.json')
  if (!existsSync(indexPath)) return subjects

  const index = readJson(indexPath)
  const cases = isObject(index) && Array.isArray(index.cases) ? index.cases : []

  for (const entry of cases as Json[]) {
    if (!isObject(entry) || typeof entry.path !== 'string' || entry.phase === 'parser') continue
    const dir = join(family.conformanceDir, entry.path)
    const metadata = readJson(join(dir, 'metadata.json'))
    if (!isObject(metadata)) continue

    // A tree case's document sits inside `tree/`; a flat case is `case.yaml`.
    const document =
      typeof metadata.document === 'string'
        ? join(dir, 'tree', metadata.document)
        : join(dir, 'case.yaml')
    if (!existsSync(document)) continue

    // Only a `structural` case that is expected to fail is expected to be
    // structurally invalid. Everything else reaching this point is valid.
    const expectValid = !(entry.phase === 'structural' && metadata.expected === 'fail')
    subjects.push({ path: document, expectValid })
  }

  return subjects
}

async function main(): Promise<void> {
  if (!existsSync(CLI)) {
    reportAbsentCli('check:parity', CLI)
    return
  }

  const failures = new Failures()
  let compared = 0
  let disagreements = 0

  for (const family of discoverFamilies()) {
    // Blaze is another program, so it needs the bundle as a file.
    const bundlePath = ensureBundleFile(family)
    if (bundlePath === null) continue
    const validate = compileFamily(family)

    // Only subjects the Musher parser accepts reach the schema at all, so the
    // batch Blaze is asked about is exactly the set Ajv is asked about.
    const subjects = subjectsFor(family).filter(
      (subject) => !('errors' in parseDocument(readFileSync(subject.path, 'utf8'))),
    )
    console.log(`  · ${family.name}/${family.major}: asking Blaze about ${subjects.length}…`)
    const rejected = await blazeRejects(
      bundlePath,
      subjects.map((subject) => subject.path),
    )

    for (const subject of subjects) {
      const parsed = parseDocument(readFileSync(subject.path, 'utf8'))
      if ('errors' in parsed) continue

      const ajv = validate(parsed.value) as boolean
      const blaze = !rejected.has(resolve(REPO_ROOT, subject.path))
      compared += 1

      if (ajv !== blaze) {
        disagreements += 1
        failures.add(
          `${relativeToRepo(subject.path)}: Ajv ${ajv ? 'accepts' : 'rejects'} it and Blaze ` +
            `${blaze ? 'accepts' : 'rejects'} it. Two validators reading one schema differently ` +
            'is a defect in the schema, not a preference between libraries.',
        )
        continue
      }

      // Agreement is not enough on its own: both could be wrong together, and
      // the corpus is what says which verdict is correct.
      if (subject.expectValid !== null && ajv !== subject.expectValid) {
        failures.add(
          `${relativeToRepo(subject.path)}: both validators ${ajv ? 'accept' : 'reject'} it, ` +
            `but the corpus declares it structurally ${subject.expectValid ? 'valid' : 'invalid'}.`,
        )
      }
    }
  }

  failures.report(
    `${compared} subject(s) agreed across Ajv and Blaze (${disagreements} disagreement(s)).`,
  )
}

if (import.meta.main) await main()
