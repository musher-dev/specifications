/** Historical acceptance, effective values and observable behavior under pinned context. */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { runBehaviorCases } from '../conformance/behavior.ts'
import {
  type CaseIndexEntry,
  type CaseMetadata,
  loadContext,
  runCase,
} from '../conformance/conformance.ts'
import { listTreeFiles, readBlobAtRef } from '../lib/git.ts'
import {
  discoverFamilies,
  Failures,
  type Family,
  failCli,
  hasPart,
  isObject,
  type Json,
  LayoutError,
  REPO_ROOT,
  releaseDirPaths,
  requireTreeAtRef,
} from '../lib/layout.ts'
import { parseDocumentBytes } from '../validation/document.ts'
import { compileFamily } from '../validation/validator.ts'
import { type RecordedRelease, readLedger, taggedEntries } from './ledger.ts'

/**
 * Documents a release asserted were valid: its examples, and every conformance
 * case it declared `expected: "pass"`.
 *
 * Both are required at the tag. Reading an empty set there would replay nothing
 * and report the release as not having regressed, which is the one answer this
 * gate must never give by accident.
 */
function partFiles(
  repoRoot: string,
  { release, entry }: RecordedRelease,
  part: 'examples' | 'conformance',
): string[] {
  const path = releaseDirPaths(entry.path)[part]
  return hasPart(release.family, release.major, part)
    ? requireTreeAtRef(repoRoot, release.tag, path, `${release.family}/${release.major} ${part}`)
    : listTreeFiles(repoRoot, release.tag, path)
}

/**
 * Released cases a later release deliberately stopped rejecting, and why.
 *
 * This gate replays a release's rejections as well as its acceptances, because
 * a rejection pins observable meaning too. That is the right default and it is
 * stricter than the guarantee it enforces: core v1 §3 forbids validation
 * becoming *stricter* within a major, and says nothing against a relaxation. So
 * a release that deliberately stops rejecting a document has to say so here,
 * keyed `<tag>:<case id>`, in a diff a reviewer sees. It takes the same shape,
 * and for the same reason, as `UNPINNED` and `UNCOVERED` in the conformance
 * runner.
 *
 * An entry moves one historical verdict from `fail` to `pass` and nothing else.
 * The released document is still replayed, byte for byte, through today's
 * pipeline; only the verdict it is measured against moves. An entry whose
 * historical case did not reject is refused, because a `pass` to `fail` waiver
 * would hide the one thing this gate exists to catch. An entry whose case still
 * rejects is refused as well, by `runCase` reporting a pass that failed, so a
 * relaxation cannot outlive the release that needed it.
 */
const RELAXED: ReadonlyMap<string, string> = new Map([
  [
    'component/v1.0.0:structural-093-metadata-without-a-description',
    'component v1.1.0 makes metadata.description structurally optional and requires it of a ' +
      'published component instead (COMP-DESC-003), so a document this case rejected is now ' +
      'one an author may still be writing',
  ],
  [
    'blueprint/v1.0.0:structural-050-missing-metadata-description',
    'blueprint v1.1.0 makes metadata.description structurally optional and requires it of a ' +
      'published blueprint instead (BP-ID-005), for the reason above',
  ],
  [
    'blueprint/v1.0.0:structural-013-empty-component-graph',
    'blueprint v1.2.0 lets spec.components be empty and requires a node of a published ' +
      'blueprint instead (BP-GRAPH-001), so a blueprint can be stored before its first node ' +
      'is chosen',
  ],
  [
    'blueprint/v1.1.0:structural-013-empty-component-graph',
    'blueprint v1.2.0 lets spec.components be empty (BP-GRAPH-001), for the reason above',
  ],
  [
    'component/v1.2.0:structural-083-service-without-a-workload',
    'component v1.3.0 makes a workload structurally optional and requires it of a published ' +
      'component instead (COMP-TYPE-006), so a component can be stored before its runtime is ' +
      'written',
  ],
  [
    'component/v1.2.0:structural-008-job-without-command',
    'component v1.3.0 requires command of a published JOB instead (COMP-TYPE-007), for the ' +
      'reason above',
  ],
  [
    'component/v1.2.0:structural-033-service-without-endpoints',
    'component v1.3.0 requires an endpoint of a published SERVICE instead (COMP-TYPE-002), ' +
      'for the reason above',
  ],
  [
    'component/v1.2.0:structural-034-service-with-empty-endpoints',
    'component v1.3.0 requires an endpoint of a published SERVICE (COMP-TYPE-002), so a ' +
      'draft can drop its last endpoint while replacing it',
  ],
  [
    'component/v1.2.0:structural-064-external-publishing-nothing',
    'component v1.3.0 requires an output of a published EXTERNAL component instead ' +
      '(COMP-EXT-003), so a draft can drop its last output while replacing it',
  ],
  [
    'component/v1.2.0:structural-106-external-without-outputs',
    'component v1.3.0 requires an output of a published EXTERNAL component (COMP-EXT-003), ' +
      'for the reason above',
  ],
  [
    'component/v1.2.0:structural-075-input-without-a-description',
    'component v1.3.0 requires every input and output of a published component to be ' +
      'described instead (COMP-DESC-004), so an editor can store a row before its description ' +
      'is written',
  ],
  [
    'component/v1.2.0:structural-076-output-without-a-description',
    'component v1.3.0 requires every output of a published component to be described ' +
      '(COMP-DESC-004), for the reason above',
  ],
])

/**
 * Releases the compatibility guarantee no longer runs from, keyed by tag, with
 * the tree the ledger recorded for each.
 *
 * ADR 0033 §5 reset the component and blueprint v1 baselines once, before anyone
 * outside the project had adopted them. These releases stay published and their
 * ledger entries stay as they are; only the replay stops. The tree makes an
 * entry name one release rather than a tag name any repository could cut, and
 * `compat.test.ts` pins the map to exactly these five, because the reset is
 * spent: the next narrowing of either family is a `v2`.
 */
export const WITHDRAWN: ReadonlyMap<string, string> = new Map([
  ['component/v1.0.0', '5af4dcf60367343633d474826a36061e42981457'],
  ['component/v1.1.0', '736b712df60b955046968467b4c6a0d12d3f3ee9'],
  ['blueprint/v1.0.0', '7b353998bdb24adc2371709963fe25e2e8f08a0f'],
  ['blueprint/v1.1.0', 'a1a2b61358a4276f7c45c6cae77f2294854be5ad'],
  ['blueprint/v1.2.0', '88ec9331e54eb422ef7ffbeb1a84561ced93ed6d'],
])

/**
 * Apply a declared relaxation to the reconstructed case, in the scratch corpus.
 *
 * Rewriting the historical `metadata.json` is the whole of it: the document,
 * its tree and every other fixture file stay as the tag wrote them.
 */
function relax(scratch: string, tag: string, caseDir: string, metadata: CaseMetadata): void {
  if (!RELAXED.has(tag + ':' + metadata.id)) return
  if (metadata.expected !== 'fail')
    throw new LayoutError(
      tag +
        ' relaxes ' +
        metadata.id +
        ', which it did not reject. A relaxation only ' +
        'moves a verdict from fail to pass',
    )
  const dir = join(scratch, caseDir)
  writeFileSync(
    join(dir, 'metadata.json'),
    JSON.stringify({ ...metadata, expected: 'pass' }, null, 2) + '\n',
  )
  const diagnostics = join(dir, 'diagnostics.json')
  if (existsSync(diagnostics)) rmSync(diagnostics)
}

/** Missing or malformed historical evidence cannot silently become zero checks. */
function requiredBlob(repoRoot: string, tag: string, path: string): Buffer {
  const bytes = readBlobAtRef(repoRoot, tag, path)
  if (bytes === null) throw new LayoutError(tag + ' is missing historical evidence ' + path)
  return bytes
}

/**
 * Reconstruct the release's own corpus, including item trees and binary parser
 * subjects. Evaluate it with candidate semantics and schemas. Never execute
 * historical tooling, and never substitute today's fixture contents.
 */
export function replayRelease(
  repoRoot: string,
  family: Family,
  recorded: RecordedRelease,
  failures: Failures,
): number {
  const { release, entry } = recorded
  const scratch = mkdtempSync(join(tmpdir(), 'musher-compat-'))
  let count = 0
  try {
    const corpusPath = releaseDirPaths(entry.path).conformance
    for (const path of partFiles(repoRoot, recorded, 'conformance')) {
      const rel = relative(corpusPath, path)
      if (rel === '..' || rel.startsWith('../') || isAbsolute(rel))
        throw new LayoutError('historical fixture escapes corpus')
      const target = join(scratch, rel)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, requiredBlob(repoRoot, release.tag, path))
    }
    const index = JSON.parse(
      requiredBlob(repoRoot, release.tag, corpusPath + '/cases.json').toString('utf8'),
    ) as Json
    if (!isObject(index) || !Array.isArray(index.cases))
      throw new LayoutError(release.tag + ' has an invalid conformance index')
    const context = loadContext(repoRoot, failures)
    const candidate = { ...family, conformanceDir: scratch }
    for (const raw of index.cases) {
      if (
        !isObject(raw) ||
        typeof raw.path !== 'string' ||
        typeof raw.id !== 'string' ||
        typeof raw.phase !== 'string'
      )
        throw new LayoutError(release.tag + ' has an invalid case entry')
      if (raw.path.split('/').some((p) => p === '..') || isAbsolute(raw.path))
        throw new LayoutError('historical case escapes corpus')
      const metadata = JSON.parse(
        readFileSync(join(scratch, raw.path, 'metadata.json'), 'utf8'),
      ) as CaseMetadata
      relax(scratch, release.tag, raw.path, metadata)
      // Rejections also pin observable meaning; replay all implemented cases.
      const outcome = runCase(
        context,
        candidate,
        raw as unknown as CaseIndexEntry,
        failures,
        new Set(),
        new Set(),
        () => {},
      )
      if (outcome === 'skipped')
        failures.add(release.tag + ' historical obligation cannot be checked: ' + metadata.id)
      else count++
    }
    const behavior = runBehaviorCases(candidate, () => {})
    count += behavior.ran
    for (const failure of behavior.failures)
      failures.add(release.tag + ' behavioural regression: ' + failure)
    if (family.role !== 'core') {
      const validate = compileFamily(family)
      for (const path of partFiles(repoRoot, recorded, 'examples')) {
        if (!/\.ya?ml$/.test(path)) continue
        const parsed = parseDocumentBytes(requiredBlob(repoRoot, release.tag, path))
        count++
        if ('errors' in parsed)
          failures.add(release.tag + ' accepted ' + path + ', but the candidate parser rejects it')
        else if (!validate(parsed.value))
          failures.add(release.tag + ' accepted ' + path + ', but the candidate schema rejects it')
      }
    }
    return count
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

/** A release to replay, or the reason it is not replayed. */
type Planned =
  | { readonly replay: true; readonly recorded: RecordedRelease; readonly family: Family }
  | { readonly replay: false; readonly note: string }

/** Decide, for every tagged release, whether it is replayed and against which family. */
function plan(repoRoot: string): Planned[] {
  const families = new Map(discoverFamilies(repoRoot).map((f) => [`${f.name}/${f.major}`, f]))
  return taggedEntries(repoRoot, readLedger(repoRoot)).map((recorded): Planned => {
    const { release } = recorded
    if (WITHDRAWN.get(release.tag) === recorded.entry.tree)
      return { replay: false, note: `${release.tag}: withdrawn by ADR 0033 §5, not replayed` }
    const family = families.get(`${release.family}/${release.major}`)
    // A retired family still has published versions, but no current schema to
    // replay them against. Say so rather than counting it as clean.
    if (family === undefined)
      return {
        replay: false,
        note: `${release.tag}: no ${release.family}/${release.major} in the working tree`,
      }
    return { replay: true, recorded, family }
  })
}

/**
 * Replay every release against the working tree's schemas.
 *
 * Core's historical parser corpus is replayed as well. Context-dependent
 * observations come from the release's case trees and supplied context.
 */
export function replayAll(
  repoRoot: string,
  failures: Failures,
): { replayed: number; checked: number } {
  let replayed = 0
  let checked = 0
  for (const planned of plan(repoRoot)) {
    if (!planned.replay) {
      console.log(`  · ${planned.note}`)
      continue
    }
    const count = replayRelease(repoRoot, planned.family, planned.recorded, failures)
    console.log(`  ✓ ${planned.recorded.release.tag}: ${count} document(s) replayed`)
    replayed += count
    checked += 1
  }
  return { replayed, checked }
}

/** What one release's replay reports back to the process that asked for it. */
interface Replayed {
  readonly count: number
  readonly failures: readonly string[]
  readonly layoutError?: string
}

const RELEASE_FLAG = '--release'
const ROOT_FLAG = '--root'

/** Replay one release in this process and print its result as one line of JSON. */
function replayOne(repoRoot: string, tag: string): void {
  const planned = plan(repoRoot).find((p) => p.replay && p.recorded.release.tag === tag)
  if (planned === undefined || !planned.replay) throw new Error(`${tag} is not a replayed release`)
  const failures = new Failures()
  let result: Replayed
  try {
    const count = replayRelease(repoRoot, planned.family, planned.recorded, failures)
    result = { count, failures: failures.messages }
  } catch (error) {
    if (!(error instanceof LayoutError)) throw error
    result = { count: 0, failures: [], layoutError: error.message }
  }
  console.log(JSON.stringify(result))
}

/**
 * Replay each release in a process of its own, a core's worth at a time.
 *
 * A release's replay rebuilds its corpus in a scratch directory and shares
 * nothing with another's, and each one is minutes of synchronous validation,
 * so separate processes are what let them use more than one core. The result
 * is the one `replayAll` gives, reported in ledger order.
 */
export async function replayConcurrently(
  repoRoot: string,
  failures: Failures,
): Promise<{ replayed: number; checked: number }> {
  const planned = plan(repoRoot)
  const replays = planned.flatMap((p) => (p.replay ? [p.recorded.release.tag] : []))
  const results = new Map<string, Replayed>()
  const ask = (tag: string): Promise<Replayed> =>
    new Promise((done, fail) => {
      const child = spawn(
        process.execPath,
        [import.meta.path, ROOT_FLAG, repoRoot, RELEASE_FLAG, tag],
        {
          cwd: process.cwd(),
          stdio: ['ignore', 'pipe', 'inherit'],
        },
      )
      let output = ''
      child.stdout.setEncoding('utf8').on('data', (text: string) => {
        output += text
      })
      child.on('error', fail)
      child.on('close', (status) => {
        const line = output.trim().split('\n').pop() ?? ''
        if (status !== 0) return fail(new Error(`${tag}: replay exited ${status}`))
        try {
          done(JSON.parse(line) as Replayed)
        } catch {
          fail(new Error(`${tag}: replay printed no result — ${output.trim()}`))
        }
      })
    })
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < replays.length) {
      const tag = replays[next++] as string
      results.set(tag, await ask(tag))
    }
  }
  const pool = Math.max(1, Math.min(availableParallelism(), replays.length))
  await Promise.all(Array.from({ length: pool }, worker))

  let replayed = 0
  let checked = 0
  for (const p of planned) {
    if (!p.replay) {
      console.log(`  · ${p.note}`)
      continue
    }
    const tag = p.recorded.release.tag
    const result = results.get(tag) as Replayed
    if (result.layoutError !== undefined) throw new LayoutError(result.layoutError)
    for (const message of result.failures) failures.add(message)
    console.log(`  ✓ ${tag}: ${result.count} document(s) replayed`)
    replayed += result.count
    checked += 1
  }
  return { replayed, checked }
}

async function main(): Promise<void> {
  const flag = process.argv.indexOf(RELEASE_FLAG)
  if (flag !== -1) {
    const root = process.argv.indexOf(ROOT_FLAG)
    replayOne(
      root === -1 ? REPO_ROOT : String(process.argv[root + 1]),
      String(process.argv[flag + 1]),
    )
    return
  }
  const failures = new Failures()
  let result: { replayed: number; checked: number }
  try {
    result = await replayConcurrently(REPO_ROOT, failures)
  } catch (error) {
    // A release whose tag lacks a path the layout names: one line, not a trace.
    if (error instanceof LayoutError) failCli(error)
    throw error
  }
  const { replayed, checked } = result

  failures.report(
    checked === 0
      ? 'No releases to replay yet — the compatibility guarantee starts at the first tag.'
      : `Replayed ${replayed} document(s) from ${checked} release(s); none regressed.`,
  )
}

if (import.meta.main) await main()
