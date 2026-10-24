/**
 * Generate the glossary page and the Vale styles from the term records:
 * `task docs`.
 *
 * `docs/terminology.yaml` is the source (docs/adr/0038). Three files are
 * projected from it and committed, because each is read where nothing builds:
 *
 * - `docs/terminology.md`, the glossary a reader browses: an alphabetical
 *   index, the concept system as a tree, every record by context, and the words
 *   to avoid.
 * - `Terms.yml` and `Discouraged.yml` in the MusherSpecifications Vale style:
 *   the prose-scope aliases as substitution rules, banned at level error and
 *   discouraged at level warning, the shape engineering-conventions generates
 *   for its own MusherConventions style.
 *
 * Output is deterministic: records sort by display name, then id, and nothing
 * reads the clock. `task check:docs` regenerates all three in memory and fails
 * when a committed copy differs.
 *
 * NON-NORMATIVE, like everything under tools/.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, posix } from 'node:path'
import {
  ADR_DIR,
  familyPaths,
  inRepo,
  REPO_ROOT,
  REPO_URL,
  relativeToRepo,
  TERMINOLOGY_DOC_FILE,
  TERMINOLOGY_FILE,
  VALE_DISCOURAGED_FILE,
  VALE_TERMS_FILE,
} from '../lib/layout.ts'
import { readOutline } from '../lib/outline.ts'
import {
  type Alias,
  CONTEXTS,
  type Context,
  claimedField,
  hasTerminology,
  IDENTIFIER_KINDS,
  loadTerminology,
  type Term,
} from '../policy/terms.ts'

/** The directory the glossary is read from, which every link in it is relative to. */
const DOC_DIR = posix.dirname(TERMINOLOGY_DOC_FILE)

const CONTEXT_TITLES: { readonly [context in Context]: string } = {
  core: 'Core: what every document shares',
  component: 'Component: one reusable definition',
  blueprint: 'Blueprint: nodes, bindings and parameters',
  deployment: 'Deployment: what a blueprint becomes when it runs',
  listing: 'Listing: how an item is presented',
  catalog: 'Catalog: where items are published',
  repository: 'Repository: how the specifications are made',
}

/** A record's anchor on the glossary page: its id, with dots as hyphens. */
export function termAnchor(id: string): string {
  return id.replace(/\./g, '-')
}

function byName(a: Term, b: Term): number {
  const left = a.display_name.toLowerCase()
  const right = b.display_name.toLowerCase()
  if (left !== right) return left < right ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** The width prose is wrapped at: the house style, well inside MD013's 120. */
const WRAP = 80
/** A word that would open a list, quote, heading, table or underlined heading at the start of a line. */
const BLOCK_START = /^([-+*>#=|]|[0-9]+[.)])/

/**
 * Prose as lines of at most `WRAP` characters where a word allows, the first
 * prefixed by `first` and the rest by `rest`. A word longer than the width,
 * such as a URL, keeps its own line rather than being broken.
 */
export function wrap(text: string, first = '', rest = first): string[] {
  const lines: string[] = []
  let line = first
  let empty = true
  for (const word of text.replace(/\s+/g, ' ').trim().split(' ')) {
    // A line must not begin with what Markdown reads as block syntax.
    if (!empty && line.length + 1 + word.length > WRAP && !BLOCK_START.test(word)) {
      lines.push(line)
      line = rest + word
    } else {
      line = empty ? line + word : `${line} ${word}`
    }
    empty = false
  }
  lines.push(line)
  return lines
}

/**
 * Record text as Markdown prose: a `<` outside a code span is escaped, so
 * `self.endpoints.<endpoint>` is not read as an HTML element.
 */
export function prose(text: string): string {
  return text
    .split('`')
    .map((part, i) => (i % 2 === 0 ? part.replace(/</g, '&lt;') : part))
    .join('`')
}

/** Text safe inside a table cell. */
function cell(text: string): string {
  return prose(text).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

/** A source entry as a link where it resolves, and as text where it does not. */
function sourceLink(source: string, repoRoot: string): string {
  const spec = /^(core|component|blueprint|listing) (v[0-9]+) §([0-9]+(?:\.[0-9]+)*)$/.exec(source)
  if (spec !== null) {
    const [, name = '', major = '', number = ''] = spec
    const path = familyPaths(name, major).spec
    const absolute = inRepo(repoRoot, path)
    if (!existsSync(absolute)) return source
    const anchor = readOutline(readFileSync(absolute, 'utf8')).byNumber.get(number)
    return anchor === undefined ? source : `[${source}](${posix.relative(DOC_DIR, path)}#${anchor})`
  }
  const adr = /^ADR ([0-9]{4})(?: §[0-9]+)?$/.exec(source)
  if (adr !== null) {
    const dir = inRepo(repoRoot, ADR_DIR)
    const file = existsSync(dir)
      ? readdirSync(dir).find((f) => f.startsWith(`${adr[1]}-`))
      : undefined
    return file === undefined
      ? source
      : `[${source}](${posix.relative(DOC_DIR, `${ADR_DIR}/${file}`)})`
  }
  const path = source.split('#')[0] ?? source
  return existsSync(inRepo(repoRoot, path))
    ? `[${source}](${posix.relative(DOC_DIR, path)}${source.includes('#') ? `#${source.split('#')[1]}` : ''})`
    : source
}

function termLink(id: string, terms: ReadonlyMap<string, Term>): string {
  const term = terms.get(id)
  return term === undefined ? id : `[${term.display_name}](#${termAnchor(id)})`
}

function identifierList(term: Term): string[] {
  const out: string[] = []
  for (const kind of IDENTIFIER_KINDS) {
    const entries = term.identifiers?.[kind] ?? []
    if (entries.length === 0) continue
    const shown = entries.map(
      (e) => `\`${kind === 'fields' && !e.startsWith('/') ? claimedField(e) : e}\``,
    )
    out.push(`${kind.replace('_', ' ')}: ${shown.join(', ')}`)
  }
  return out
}

function aliasLine(alias: Alias, term: Term): string {
  const instead = alias.suggest ?? term.display_name
  const scope = alias.scope.join(' and ')
  const note = alias.note === undefined ? '' : `. ${alias.note.replace(/\.$/, '')}`
  return `"${alias.text}" (${alias.status}, ${scope}): write "${instead}"${note}.`
}

/** The concept system as an indented tree: `part_of` children under each whole. */
function conceptTree(terms: readonly Term[]): string[] {
  const ids = new Set(terms.map((t) => t.id))
  const children = new Map<string, Term[]>()
  for (const term of terms) {
    for (const whole of term.part_of ?? []) {
      if (!ids.has(whole)) continue
      children.set(whole, [...(children.get(whole) ?? []), term])
    }
  }
  for (const list of children.values()) list.sort(byName)
  const roots = terms
    .filter((t) => (t.part_of ?? []).every((w) => !ids.has(w)) && children.has(t.id))
    .sort(byName)
  const lines: string[] = []
  const walk = (term: Term, depth: number, path: ReadonlySet<string>): void => {
    const kinds =
      (term.kind_of ?? []).length > 0 ? ` (a kind of ${(term.kind_of ?? []).join(', ')})` : ''
    lines.push(
      `${'  '.repeat(depth)}${depth === 0 ? '' : '- '}${term.display_name} [${term.id}]${kinds}`,
    )
    for (const child of children.get(term.id) ?? []) {
      if (path.has(child.id)) continue
      walk(child, depth + 1, new Set([...path, child.id]))
    }
  }
  for (const root of roots) {
    walk(root, 0, new Set([root.id]))
    lines.push('')
  }
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** The generated glossary page. */
export function buildTerminologyDoc(repoRoot: string = REPO_ROOT): string {
  const { terms } = loadTerminology(repoRoot)
  const sorted = [...terms].sort(byName)
  const index = new Map(terms.map((t) => [t.id, t]))
  const source = posix.relative(DOC_DIR, TERMINOLOGY_FILE)

  const lines: string[] = [
    '# Terminology',
    '',
    `**Generated by \`task docs\` from [\`${posix.basename(TERMINOLOGY_FILE)}\`](${source}). Do not edit.**`,
    '',
    'Each record names one concept in one context: what it is, how it relates to',
    'other concepts, the identifiers that spell it, and the words to write instead',
    'of it. A word with two meanings in two contexts is two records. `spec.md`',
    'stays normative: a record quotes the specification and may not disagree with',
    'it. `task check:terms` holds the records, the schemas and the prose together,',
    'and the words to avoid are enforced in prose by the generated',
    '`MusherSpecifications` Vale style.',
    '',
    `${terms.length} record(s). A record marked *proposed* is an open item, not yet a decision.`,
    '',
    '## Index',
    '',
    '| Term | Context | In one line |',
    '|---|---|---|',
  ]
  for (const term of sorted) {
    const status = term.status === 'proposed' ? ' *(proposed)*' : ''
    const short = term.shortDefinition ?? term.definition ?? ''
    lines.push(
      `| [${cell(term.display_name)}](#${termAnchor(term.id)})${status} | ${term.context} | ${cell(short)} |`,
    )
  }

  lines.push(
    '',
    '## Concept system',
    '',
    'Each concept under the whole it is part of, with the concept it is a kind of',
    'in brackets. A concept that is part of two wholes appears under both.',
    '',
    '```text',
    ...conceptTree(terms),
    '```',
    '',
    '## Terms by context',
  )

  for (const context of CONTEXTS) {
    const inContext = sorted.filter((t) => t.context === context)
    if (inContext.length === 0) continue
    lines.push('', `### ${CONTEXT_TITLES[context]}`)
    for (const term of inContext) {
      lines.push('', `#### <a id="${termAnchor(term.id)}"></a>${term.display_name}`, '')
      if (term.definition !== undefined) lines.push(...wrap(prose(term.definition)), '')
      if (term.authority !== undefined) {
        const anchor = term.authority.anchor === undefined ? '' : `#${term.authority.anchor}`
        lines.push(
          `Defined in [\`${term.authority.repo}\` ${term.authority.path}](https://github.com/${term.authority.repo}/blob/main/${term.authority.path}${anchor}).`,
          '',
        )
      }
      const facts: string[] = []
      if (term.deprecated !== undefined) {
        const by = term.deprecated.replaced_by
        facts.push(
          `**Deprecated:** ${term.deprecated.note}${by === undefined ? '' : ` Use ${termLink(by, index)}.`}`,
        )
      }
      if (term.kind_of !== undefined)
        facts.push(`**Kind of:** ${term.kind_of.map((id) => termLink(id, index)).join(', ')}`)
      if (term.part_of !== undefined)
        facts.push(`**Part of:** ${term.part_of.map((id) => termLink(id, index)).join(', ')}`)
      for (const a of term.associated ?? [])
        facts.push(`**${a.relation.replace(/-/g, ' ')}:** ${termLink(a.term, index)}`)
      const identifiers = identifierList(term)
      if (identifiers.length > 0) facts.push(`**Identifiers:** ${identifiers.join('; ')}`)
      if (term.verbs !== undefined) facts.push(`**Verbs:** ${term.verbs.join('; ')}`)
      if (term.example !== undefined) facts.push(`**Example:** ${term.example}`)
      for (const c of term.confusables ?? []) facts.push(`**Not to be confused with:** ${c}`)
      for (const alias of term.aliases ?? []) facts.push(`**Avoid:** ${aliasLine(alias, term)}`)
      if (term.source !== undefined) {
        facts.push(`**Source:** ${term.source.map((s) => sourceLink(s, repoRoot)).join(', ')}`)
      }
      facts.push(`**Status:** ${term.status}, ${term.stability}. Tags: ${term.tags.join(', ')}.`)
      for (const fact of facts) lines.push(...wrap(prose(fact), '- ', '  '))
    }
  }

  const avoided = terms
    .flatMap((term) => (term.aliases ?? []).map((alias) => ({ term, alias })))
    .sort((a, b) =>
      a.alias.text.toLowerCase() === b.alias.text.toLowerCase()
        ? a.term.id < b.term.id
          ? -1
          : 1
        : a.alias.text.toLowerCase() < b.alias.text.toLowerCase()
          ? -1
          : 1,
    )
  lines.push(
    '',
    '## Words we avoid',
    '',
    'A banned prose alias is a Vale error and a discouraged one a warning. An',
    'identifier alias is checked by `task check:terms` against the schema sources and',
    'the diagnostics tables of the families its record belongs to.',
    '',
    '| Avoid | Status | Scope | Write instead | Term |',
    '|---|---|---|---|---|',
  )
  for (const { term, alias } of avoided) {
    lines.push(
      `| ${cell(alias.text)} | ${alias.status} | ${alias.scope.join(', ')} | ${cell(alias.suggest ?? term.display_name)} | [${cell(term.display_name)}](#${termAnchor(term.id)}) |`,
    )
  }
  lines.push('')
  return lines.join('\n')
}

/** A JSON string literal, which is a valid YAML double-quoted scalar. */
function yamlString(text: string): string {
  return JSON.stringify(text)
}

/**
 * One Vale substitution style. A swap key is a regular expression; alias text
 * is limited to letters, digits, spaces, `.`, `_` and `-`, of which only `.` is
 * special outside a character class.
 */
export function buildValeStyle(terms: readonly Term[], status: Alias['status']): string {
  const swaps = terms
    .flatMap((term) =>
      (term.aliases ?? [])
        .filter((alias) => alias.status === status && alias.scope.includes('prose'))
        .map((alias) => ({ text: alias.text, suggest: alias.suggest ?? term.display_name })),
    )
    .sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0))
  const lines = [
    `# Generated by \`task docs\` from ${TERMINOLOGY_FILE}.`,
    '# Do not edit: change the prose-scope aliases there and regenerate.',
    'extends: substitution',
    `message: ${yamlString(status === 'banned' ? "Use '%s' instead of '%s'." : "Prefer '%s' over '%s'.")}`,
    `link: ${yamlString(`${REPO_URL}/blob/main/${TERMINOLOGY_DOC_FILE}`)}`,
    `level: ${status === 'banned' ? 'error' : 'warning'}`,
    'ignorecase: true',
  ]
  if (swaps.length === 0) lines.push('swap: {}')
  else {
    lines.push('swap:')
    for (const swap of swaps)
      lines.push(`  ${yamlString(swap.text.replace(/\./g, '\\.'))}: ${yamlString(swap.suggest)}`)
  }
  return `${lines.join('\n')}\n`
}

/**
 * Every file generated from the records, repo-relative, with a builder for its
 * bytes. Empty in a repository with no records, so `check:docs` has nothing of
 * this kind to compare there.
 */
export function terminologyOutputs(repoRoot: string = REPO_ROOT): [string, () => string][] {
  if (!hasTerminology(repoRoot)) return []
  return [
    [TERMINOLOGY_DOC_FILE, () => buildTerminologyDoc(repoRoot)],
    [VALE_TERMS_FILE, () => buildValeStyle(loadTerminology(repoRoot).terms, 'banned')],
    [VALE_DISCOURAGED_FILE, () => buildValeStyle(loadTerminology(repoRoot).terms, 'discouraged')],
  ]
}

function main(): void {
  for (const [path, build] of terminologyOutputs()) {
    const absolute = inRepo(REPO_ROOT, path)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, build(), 'utf8')
    console.log(`  ✓ ${relativeToRepo(absolute)}`)
  }
}

if (import.meta.main) main()
