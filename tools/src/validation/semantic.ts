/** Offline semantic checks over explicit contracts. NON-NORMATIVE. */
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, join, posix, relative, resolve } from 'node:path'
import { canonicalJson, type Family, isObject, type Json } from '../lib/layout.ts'
import { scanReferences } from '../lib/references.ts'
import {
  CONNECTION_MEMBERS,
  CONNECTION_PROTOCOL_MEMBERS,
  guaranteedMember,
  isConnectionInput,
  isConnectionProtocol,
  protocolMember,
} from './connections.ts'
import { type Diagnostic, parseDocumentBytes } from './document.ts'
import { type LicenseList, MEDIA_BYTES, markdownFields, mediaReferences, walk } from './listing.ts'
import { MEDIA_PATH, schemeIsPermitted } from './listing-policy.ts'
import {
  connectionBindingDiagnostics,
  parameterOrigin,
  parameterOriginDiagnostics,
} from './selections.ts'
import { scanTemplate, templateTarget, urlComponents } from './templates.ts'
import {
  compatible,
  generatorConflicts,
  intersectionConflicts,
  schemaKey,
  schemaProblem,
  valueFits,
} from './values.ts'

export type { Diagnostic }
export interface DeferredObligation {
  readonly rule: string
  readonly path: string
  readonly missing: string
}
export interface PinnedContract {
  readonly source: string
  readonly digest: string
}
export interface SemanticContext {
  readonly itemRoot?: string
  readonly documentPath?: string
  readonly componentDocuments?: Readonly<Record<string, PinnedContract>>
  readonly validationScope?: 'structural' | 'document' | 'publication' | 'deployment'
  readonly checkComponent?: (source: Uint8Array) => boolean
  /** Listing `LIST-LICENSE-002`: the SPDX License List release the platform pins. */
  readonly licenseList?: LicenseList
}
export const record = (value: Json | undefined): Record<string, Json> =>
  isObject(value) ? Object.assign(Object.create(null), value) : Object.create(null)
export const at = (value: Json | undefined, ...keys: string[]): Json | undefined =>
  keys.reduce<Json | undefined>((v, k) => record(v)[k], value)
const child = (value: Json | undefined, key: string) => at(value, key)
const asString = (value: Json | undefined) => (typeof value === 'string' ? value : undefined)
export const token = (value: string) => value.replaceAll('~', '~0').replaceAll('/', '~1')
const issue = (out: Diagnostic[], code: string, path: string) =>
  out.push({ code, path, message: code, phase: 'semantic' })
/**
 * Component §5.2's endpoint properties. `protocols` is the set an endpoint's
 * protocol must be in (COMP-EP-004, COMP-EP-012), `requires` is the exposure a
 * blueprint must select before the property exists (BP-NODE-005, BP-NODE-007),
 * `mode` and `claim` are the viewer identity mode and released claim a viewer
 * identity property belongs to, `sensitive` marks a platform-issued secret, and
 * `type` is the logical type an `endpoint` origin produces.
 */
export type ViewerMode = 'HEADER' | 'ASSERTION' | 'OIDC'
export type ViewerClaim = 'EMAIL' | 'NAME'
export interface AddressProperty {
  readonly protocols?: readonly string[]
  readonly mismatch?: string
  readonly requires?: 'PUBLIC' | 'VIEWER_IDENTITY'
  readonly mode?: ViewerMode
  readonly claim?: ViewerClaim
  readonly sensitive?: boolean
  readonly type: 'string' | 'integer' | 'array'
}
/** Component §5.2's protocol sets, each defined once there. */
export const URL_ADDRESSED = ['HTTP', 'HTTPS', 'WS', 'GRPC']
export const PORT_ADDRESSED = ['TCP', 'UDP']
export const HTTP_ROUTED = ['HTTP', 'HTTPS', 'WS']
export const HTTP_PROBE = ['HTTP', 'HTTPS']
/** Component §5.4 COMP-PROBE-001: carried over TCP, and cleartext on the hop to the workload. */
export const TCP_PROBE = ['TCP', 'HTTP', 'WS', 'GRPC']
const VIEWER = HTTP_ROUTED
const publicHTTP = {
  protocols: URL_ADDRESSED,
  mismatch: 'ERR_ENDPOINT_NOT_URL_ADDRESSED',
  requires: 'PUBLIC',
} as const
const publicL4 = {
  protocols: PORT_ADDRESSED,
  mismatch: 'ERR_ENDPOINT_NOT_PORT_ADDRESSED',
  requires: 'PUBLIC',
} as const
const viewer = (mode: ViewerMode, claim?: ViewerClaim) =>
  ({
    protocols: VIEWER,
    mismatch: 'ERR_ENDPOINT_NOT_HTTP',
    requires: 'VIEWER_IDENTITY',
    mode,
    ...(claim ? { claim } : {}),
  }) as const
export const ADDRESS_PROPERTIES: Readonly<Record<string, AddressProperty>> = {
  publicURL: { ...publicHTTP, type: 'string' },
  publicHostname: { ...publicHTTP, type: 'string' },
  publicAddress: { ...publicL4, type: 'string' },
  publicPort: { ...publicL4, type: 'integer' },
  privateHostname: { type: 'string' },
  privatePort: { type: 'integer' },
  privateAddress: { type: 'string' },
  viewerIdentityHeader: { ...viewer('HEADER'), type: 'string' },
  trustedProxyCIDRs: { ...viewer('HEADER'), type: 'array' },
  viewerEmailHeader: { ...viewer('HEADER', 'EMAIL'), type: 'string' },
  viewerNameHeader: { ...viewer('HEADER', 'NAME'), type: 'string' },
  viewerAssertionHeader: { ...viewer('ASSERTION'), type: 'string' },
  viewerAssertionIssuer: { ...viewer('ASSERTION'), type: 'string' },
  viewerAssertionAudience: { ...viewer('ASSERTION'), type: 'string' },
  viewerAssertionKeysURL: { ...viewer('ASSERTION'), type: 'string' },
  oidcIssuerURL: { ...viewer('OIDC'), type: 'string' },
  oidcClientID: { ...viewer('OIDC'), type: 'string' },
  oidcClientSecret: { ...viewer('OIDC'), sensitive: true, type: 'string' },
}
/**
 * Blueprint §4.5: an exposure is a bare `PUBLIC` or `PRIVATE`, or the object
 * form, and an endpoint left out is `PRIVATE`. Bare `PUBLIC` is the object form
 * with every default, so every rule reads this rather than the authored value.
 */
export interface Exposure {
  readonly visibility: 'PUBLIC' | 'PRIVATE'
  readonly access: 'OPEN' | 'RESTRICTED'
  readonly viewerIdentity: 'NONE' | ViewerMode
  readonly viewerClaims: readonly ViewerClaim[]
  readonly accessExemptions: readonly ('PATHS' | 'BEARER')[]
}
const MODES: readonly string[] = ['HEADER', 'ASSERTION', 'OIDC']
const list = <T extends string>(value: Json | undefined, members: readonly T[]): T[] =>
  Array.isArray(value) ? members.filter((m) => value.includes(m)) : []
export function effectiveExposure(exposures: Json | undefined, endpoint: string): Exposure {
  const authored = Object.hasOwn(record(exposures), endpoint)
    ? record(exposures)[endpoint]
    : undefined
  const visibility =
    (typeof authored === 'string' ? authored : at(authored, 'visibility')) === 'PUBLIC'
      ? 'PUBLIC'
      : 'PRIVATE'
  const mode = at(authored, 'viewerIdentity')
  return {
    visibility,
    access: at(authored, 'access') === 'RESTRICTED' ? 'RESTRICTED' : 'OPEN',
    viewerIdentity:
      typeof mode === 'string' && MODES.includes(mode) ? (mode as ViewerMode) : 'NONE',
    viewerClaims: list(at(authored, 'viewerClaims'), ['EMAIL', 'NAME'] as const),
    accessExemptions: list(at(authored, 'accessExemptions'), ['PATHS', 'BEARER'] as const),
  }
}
/** BP-NODE-007: whether an exposure forwards what a viewer identity property describes. */
export const forwards = (exposure: Exposure, property: AddressProperty): boolean =>
  exposure.viewerIdentity === property.mode &&
  (property.claim === undefined || exposure.viewerClaims.includes(property.claim))
export const addressProperty = (property: string): AddressProperty | undefined =>
  Object.hasOwn(ADDRESS_PROPERTIES, property) ? ADDRESS_PROPERTIES[property] : undefined
export function endpointProblem(
  component: Json,
  endpoint: string,
  property: string,
): string | undefined {
  const declared = at(component, 'spec', 'workload', 'endpoints', endpoint)
  if (!declared) return 'ERR_UNKNOWN_ENDPOINT'
  // COMP-PLACEHOLDER-001: a declared endpoint, then a property §5.2 does not define.
  const known = addressProperty(property)
  if (!known) return 'ERR_UNKNOWN_ENDPOINT_PROPERTY'
  // COMP-EP-004, COMP-EP-012: a property exists only on the protocols that carry it.
  if (known.protocols && !known.protocols.includes(String(at(declared, 'protocol'))))
    return known.mismatch
  // COMP-TYPE-003, COMP-EP-012: a WORKER endpoint is never PUBLIC, so nothing
  // that exists only on an exposed endpoint exists on it.
  if (known.requires && at(component, 'spec', 'type') === 'WORKER')
    return 'ERR_ENDPOINT_NOT_EXPOSABLE'
  // COMP-EP-014: an OpenID Connect client's facts exist only where one is declared.
  if (known.mode === 'OIDC' && at(declared, 'oidc') === undefined)
    return 'ERR_ENDPOINT_NOT_OIDC_CLIENT'
  return undefined
}
const CRON_FIELDS: readonly (readonly [number, number])[] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6],
]
/** COMP-JOB-002: every field of a five-field cron expression, against §5.7's grammar. */
export function cronIsValid(cron: string): boolean {
  const fields = cron.split(/[ \t]+/)
  if (fields.length !== CRON_FIELDS.length) return true // the field count is structural
  const number = (text: string, [min, max]: readonly [number, number]) =>
    /^[0-9]+$/.test(text) && Number(text) >= min && Number(text) <= max
  return fields.every((field, i) => {
    const range = CRON_FIELDS[i]
    if (range === undefined) throw new Error(`no range for cron field ${i}`)
    return field.split(',').every((element) => {
      const [base = '', step, ...rest] = element.split('/')
      if (rest.length || (step !== undefined && !(/^[0-9]+$/.test(step) && Number(step) > 0)))
        return false
      if (base === '*') return true
      const [from = '', to, ...more] = base.split('-')
      if (more.length || !number(from, range)) return false
      return to === undefined || (number(to, range) && Number(from) <= Number(to))
    })
  })
}
/** Component §5.7: the values one field of a valid cron expression matches, in ascending order. */
function cronValues(field: string, [min, max]: readonly [number, number]): number[] {
  const values = new Set<number>()
  for (const element of field.split(',')) {
    const [base = '', step] = element.split('/')
    const [first = '', last] = base.split('-')
    // `*` is the whole range, and `n/s` means `n-max/s`.
    const from = base === '*' ? min : Number(first)
    const to = base === '*' ? max : last !== undefined ? Number(last) : step ? max : from
    for (let value = from; value <= to; value += Number(step ?? 1)) values.add(value)
  }
  return [...values].sort((a, b) => a - b)
}
/** 400 Gregorian years in days: exactly 20871 weeks, after which the calendar repeats. */
export const GREGORIAN_CYCLE_DAYS = 146097
/**
 * Component §5.7: a schedule's period in seconds, the shortest interval between
 * two consecutive times it falls due, or undefined for one that never does.
 *
 * The times a schedule falls due repeat every 146097 days, and every day it
 * falls due on holds the same times, so the period is the shorter of the
 * shortest interval within one day and the interval from the last time of one
 * due day to the first time of the nearest next one. This walks one cycle, from
 * 2000-01-01, a Saturday, and counts the gap from its last due day to the first
 * one of the next cycle.
 */
export function cronPeriodSeconds(cron: string): number | undefined {
  const fields = cron.split(/[ \t]+/)
  if (fields.length !== CRON_FIELDS.length || !cronIsValid(cron)) return undefined
  const [minutes = [], hours = [], dates = [], months = [], weekdays = []] = fields.map(
    (field, i) => cronValues(field, CRON_FIELDS[i] ?? [0, 0]),
  )
  // COMP-JOB-002: when both day fields are restricted, a day matches either.
  const either = fields[2] !== '*' && fields[4] !== '*'
  const due: number[] = []
  let day = 0
  for (let year = 2000; year < 2400; year++) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    for (let month = 1; month <= 12; month++) {
      const length = month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31
      for (let date = 1; date <= length; date++, day++) {
        if (!months.includes(month)) continue
        const byDate = dates.includes(date)
        const byWeekday = weekdays.includes((day + 6) % 7)
        if (either ? byDate || byWeekday : byDate && byWeekday) due.push(day)
      }
    }
  }
  const [firstDay, lastDay] = [due[0], due.at(-1)]
  if (firstDay === undefined || lastDay === undefined) return undefined
  let fewestDays = firstDay + GREGORIAN_CYCLE_DAYS - lastDay
  for (let i = 1; i < due.length; i++)
    fewestDays = Math.min(fewestDays, Number(due[i]) - Number(due[i - 1]))
  const times = hours.flatMap((hour) => minutes.map((minute) => 60 * hour + minute))
  let shortest = 1440 * fewestDays - (Number(times.at(-1)) - Number(times[0]))
  for (let i = 1; i < times.length; i++)
    shortest = Math.min(shortest, Number(times[i]) - Number(times[i - 1]))
  return 60 * shortest
}
export function sourceEndpoints(from: Json): { endpoint: string; property: string }[] {
  const s = record(from)
  if (typeof s.endpoint === 'string')
    return [{ endpoint: s.endpoint, property: String(s.property) }]
  if (typeof s.template !== 'string') return []
  // Component §6.2: a self path is exactly `endpoints.<endpoint>.<property>`.
  return scanReferences(s.template, ['self']).references.map((ref) => ({
    endpoint: ref.path[0] === 'endpoints' && ref.path.length === 3 ? (ref.path[1] ?? '') : '',
    property: ref.path[0] === 'endpoints' && ref.path.length === 3 ? (ref.path[2] ?? '') : '',
  }))
}
/** A template without references is a statically known logical string. */
export function constantTemplate(from: Json | undefined): string | undefined {
  const template = at(from, 'template')
  if (typeof template !== 'string') return
  const scanned = scanReferences(template, ['self'])
  if (!scanned.failures.length && !scanned.references.length)
    return template.replaceAll('$${{', '${{')
}
/**
 * Component §4 and §5: what a component must carry before it is published.
 *
 * Each is an `admission` rule, because absent and not written yet are the same
 * bytes and only a publisher can tell them apart. `metadata: false` leaves out
 * COMP-DESC-003, which the blueprint dependency check does not apply
 * (blueprint §4.1).
 */
export function componentObligations(document: Json, { metadata = true } = {}): Diagnostic[] {
  const out: Diagnostic[] = []
  const obligation = (code: string, path: string) =>
    out.push({ code, path, message: code, phase: 'admission' })
  if (metadata && at(document, 'metadata', 'description') === undefined)
    obligation('ERR_DESCRIPTION_REQUIRED', '/metadata')
  const spec = record(at(document, 'spec')),
    type = spec.type
  // The object that lacks a field is where its absence is reported; a field
  // that is present and empty is reported at itself.
  if (type === 'EXTERNAL') {
    const contract = spec.contract
    if (!isObject(contract)) obligation('ERR_OUTPUT_REQUIRED', '/spec')
    else if (!isObject(contract.outputs)) obligation('ERR_OUTPUT_REQUIRED', '/spec/contract')
    else if (!Object.keys(contract.outputs).length)
      obligation('ERR_OUTPUT_REQUIRED', '/spec/contract/outputs')
  } else if (typeof type === 'string') {
    const workload = spec.workload
    if (!isObject(workload)) obligation('ERR_WORKLOAD_REQUIRED', '/spec')
    else {
      if (workload.source === undefined) obligation('ERR_SOURCE_REQUIRED', '/spec/workload')
      if (type === 'SERVICE') {
        if (!isObject(workload.endpoints)) obligation('ERR_ENDPOINT_REQUIRED', '/spec/workload')
        else if (!Object.keys(workload.endpoints).length)
          obligation('ERR_ENDPOINT_REQUIRED', '/spec/workload/endpoints')
      }
      // COMP-TYPE-007: either names what a JOB runs to completion.
      if (type === 'JOB' && workload.command === undefined && workload.entrypoint === undefined)
        obligation('ERR_COMMAND_REQUIRED', '/spec/workload')
    }
  }
  for (const direction of ['inputs', 'outputs'])
    for (const [name, value] of Object.entries(record(at(spec.contract, direction))))
      if (at(value, 'description') === undefined)
        obligation('ERR_DESCRIPTION_REQUIRED', `/spec/contract/${direction}/${token(name)}`)
  return out
}
/**
 * Component §5.2 COMP-EP-006 and §5.4 COMP-EP-010: workload configuration that
 * reads one of the component's own inputs reads a string input that is always
 * supplied, and a secret one reads a sensitive input.
 */
/** The endpoint protocol each locator scheme speaks on the private hop (component §5.2). */
const LOCATOR_SCHEME_PROTOCOL: Readonly<Record<string, string>> = { http: 'HTTP', https: 'HTTPS' }

/**
 * Component §6.5 COMP-CONNECTION-005: a locator output is a `template` that is
 * `http://` or `https://`, then exactly the private authority of one of the
 * component's own endpoints whose protocol speaks that scheme, then an
 * optional fixed path. The authority is `privateAddress`, or `privateHostname`
 * optionally followed by `:` and the same endpoint's `privatePort`; nothing
 * else, so no literal host, user information, query or fragment can point the
 * consumer's credential somewhere else.
 */
export function locatorReadsOwnEndpoint(
  from: Json | undefined,
  endpoints: Readonly<Record<string, Json>>,
): boolean {
  const template = at(from, 'template')
  if (typeof template !== 'string') return false
  const scanned = scanReferences(template, ['self'])
  const scheme = /^([A-Za-z]+):\/\//.exec(template)
  const [host, port] = scanned.references
  if (scanned.failures.length || !scheme || !host || host.offset !== scheme[0].length) return false
  const [kind, endpoint, property] = host.path
  if (kind !== 'endpoints' || host.path.length !== 3 || endpoint === undefined) return false
  const protocol = LOCATOR_SCHEME_PROTOCOL[(scheme[1] ?? '').toLowerCase()]
  if (protocol === undefined || at(endpoints, endpoint, 'protocol') !== protocol) return false
  let end = host.offset + host.raw.length
  let used = 1
  if (property === 'privateHostname') {
    if (
      port !== undefined &&
      port.offset === end + 1 &&
      template[end] === ':' &&
      port.path.join('.') === `endpoints.${endpoint}.privatePort`
    ) {
      end = port.offset + port.raw.length
      used = 2
    }
  } else if (property !== 'privateAddress') return false
  const path = template.slice(end)
  return (
    scanned.references.length === used &&
    (path === '' || (path.startsWith('/') && !/[?#]/.test(path)))
  )
}

/**
 * Component §6.5 COMP-CONNECTION-005: a provided connection maps every
 * required member of its protocol, and only members it supplies, each to an
 * output that can carry it; its locator is a private address of one of the
 * component's own endpoints ({@link locatorReadsOwnEndpoint}). A protocol the
 * registry does not define was rejected structurally.
 */
function providedConnectionDiagnostics(
  contract: Record<string, Json>,
  endpoints: Record<string, Json>,
): Diagnostic[] {
  const out: Diagnostic[] = []
  for (const [name, provided] of Object.entries(record(contract.providedConnections))) {
    const base = `/spec/contract/providedConnections/${token(name)}`
    const protocol = at(provided, 'connection', 'protocol')
    const contracts = isConnectionProtocol(protocol)
      ? CONNECTION_PROTOCOL_MEMBERS[protocol]
      : undefined
    if (!contracts) continue
    const members = record(at(provided, 'members'))
    if (
      Object.entries(contracts).some(
        ([member, c]) => c.required && c.derived !== true && !Object.hasOwn(members, member),
      )
    )
      issue(out, 'ERR_INVALID_PROVIDED_CONNECTION', `${base}/members`)
    for (const [member, outputName] of Object.entries(members)) {
      const path = `${base}/members/${token(member)}`
      const c = Object.hasOwn(contracts, member) ? contracts[member] : undefined
      const output = record(at(contract, 'outputs', String(outputName)))
      if (
        !c ||
        c.derived === true ||
        typeof outputName !== 'string' ||
        !Object.hasOwn(record(contract.outputs), outputName) ||
        at(output.schema, 'type') !== c.type ||
        (c.sensitive && output.sensitive !== true) ||
        (c.role === 'locator' && !locatorReadsOwnEndpoint(output.from, endpoints))
      )
        issue(out, 'ERR_INVALID_PROVIDED_CONNECTION', path)
    }
  }
  return out
}

/** Blueprint BP-ACCESS-016: the parameters the exposures' `apiKey`s name. */
export function apiKeyParameters(nodes: Readonly<Record<string, Json>>): Set<string> {
  const names = new Set<string>()
  for (const n of Object.values(nodes))
    for (const exposure of Object.values(record(at(n, 'exposure')))) {
      const key = at(exposure, 'apiKey', 'parameter')
      if (typeof key === 'string') names.add(key)
    }
  return names
}

function inputReferenceDiagnostics(
  out: Diagnostic[],
  contract: Record<string, Json>,
  name: string,
  path: string,
  secret: boolean,
): void {
  const input = at(contract, 'inputs', name)
  if (!isObject(input)) issue(out, 'ERR_UNKNOWN_INPUT', path)
  else if (at(input, 'schema', 'type') !== 'string' || (secret && input.sensitive !== true))
    issue(out, 'ERR_VALUE_CONSTRAINT', path)
  else if (input.required === false && input.default === undefined)
    issue(out, 'ERR_INPUT_NOT_GUARANTEED', path)
}
/**
 * The advisory checks of a component's semantic phase, reported at WARNING
 * (core v2 §7). Component §5.2 COMP-EP-020: an `HTTPS` endpoint whose trust
 * policy verifies, `SYSTEM` (the default) or `BUNDLE`, SHOULD name its
 * `serverName`. `BUNDLE` already requires one structurally, so in practice this
 * is a `SYSTEM` endpoint without one.
 */
export function componentWarnings(document: Json): Diagnostic[] {
  const out: Diagnostic[] = []
  const endpoints = record(at(document, 'spec', 'workload', 'endpoints'))
  for (const [name, endpoint] of Object.entries(endpoints)) {
    if (at(endpoint, 'protocol') !== 'HTTPS') continue
    const verify = at(endpoint, 'tls', 'verify') ?? 'SYSTEM'
    if (verify === 'NONE' || at(endpoint, 'tls', 'serverName') !== undefined) continue
    out.push({
      code: 'WARN_ENDPOINT_SERVER_NAME',
      path: `/spec/workload/endpoints/${token(name)}`,
      message: 'an endpoint that verifies its certificate should name its serverName',
      severity: 'WARNING',
      phase: 'semantic',
    })
  }
  return out
}
export function componentDiagnostics(document: Json): Diagnostic[] {
  const out: Diagnostic[] = []
  // Every input something other than the environment reads (COMP-INPUT-001).
  const read = new Set<string>()
  const workload = record(at(document, 'spec', 'workload'))
  const contract = record(at(document, 'spec', 'contract'))
  const cron = at(workload, 'schedule', 'cron')
  if (typeof cron === 'string' && !cronIsValid(cron))
    issue(out, 'ERR_INVALID_SCHEDULE', '/spec/workload/schedule/cron')
  // COMP-JOB-006: a scheduled JOB's time limit is shorter than its schedule's
  // period. A schedule that never falls due, or whose cron is invalid, has none.
  const limit = workload.timeLimitSeconds
  const period =
    typeof limit === 'number' && typeof cron === 'string' ? cronPeriodSeconds(cron) : undefined
  if (typeof limit === 'number' && period !== undefined && limit >= period)
    issue(out, 'ERR_TIME_LIMIT_NOT_UNDER_SCHEDULE', '/spec/workload/timeLimitSeconds')
  for (const [name, probe] of Object.entries(record(workload.health))) {
    // COMP-PROBE-001, COMP-PROBE-002: a TCP or gRPC probe names a declared
    // endpoint of a protocol it can connect to.
    for (const [mechanism, protocols, code] of [
      ['tcp', TCP_PROBE, 'ERR_ENDPOINT_NOT_TCP'],
      ['grpc', ['GRPC'], 'ERR_ENDPOINT_NOT_GRPC'],
    ] as const) {
      const named = at(probe, mechanism, 'endpoint')
      if (typeof named !== 'string') continue
      const endpoint = at(workload, 'endpoints', named),
        path = `/spec/workload/health/${token(name)}/${mechanism}/endpoint`
      if (!endpoint) issue(out, 'ERR_UNKNOWN_ENDPOINT', path)
      else if (!(protocols as readonly string[]).includes(String(at(endpoint, 'protocol'))))
        issue(out, code, path)
    }
    const http = at(probe, 'http')
    if (!isObject(http)) continue
    // COMP-PROBE-005: a header reads an input the probe can always read, which
    // may be sensitive.
    for (const [header, origin] of Object.entries(record(http.headers))) {
      const input = at(origin, 'input')
      if (typeof input !== 'string') continue
      read.add(input)
      inputReferenceDiagnostics(
        out,
        contract,
        input,
        `/spec/workload/health/${token(name)}/http/headers/${token(header)}/input`,
        false,
      )
    }
    const endpoint = at(workload, 'endpoints', String(at(http, 'endpoint'))),
      path = `/spec/workload/health/${token(name)}/http/endpoint`
    if (!endpoint) issue(out, 'ERR_UNKNOWN_ENDPOINT', path)
    else if (!HTTP_PROBE.includes(String(at(endpoint, 'protocol'))))
      issue(out, 'ERR_ENDPOINT_NOT_HTTP', path)
    // COMP-EP-010: a credential comes from an input the probe can always read,
    // and a password or token is never a literal.
    const base = `/spec/workload/health/${token(name)}/http/auth`
    const credentials: [string, Json | undefined, boolean][] = [
      ['basic/username', at(http, 'auth', 'basic', 'username'), false],
      ['basic/password', at(http, 'auth', 'basic', 'password'), true],
      ['bearer/token', at(http, 'auth', 'bearer', 'token'), true],
    ]
    for (const [key, credential, secret] of credentials) {
      if (!isObject(credential)) continue
      if (secret && Object.hasOwn(credential, 'value'))
        issue(out, 'ERR_SENSITIVE_LITERAL', `${base}/${key}/value`)
      if (typeof credential.input === 'string') {
        read.add(credential.input)
        inputReferenceDiagnostics(out, contract, credential.input, `${base}/${key}/input`, secret)
      }
    }
  }
  // COMP-EP-006: a trust bundle's roots come from an input that is always there.
  for (const [name, endpoint] of Object.entries(record(workload.endpoints))) {
    const input = at(endpoint, 'tls', 'trustBundle', 'input')
    if (typeof input === 'string') {
      read.add(input)
      inputReferenceDiagnostics(
        out,
        contract,
        input,
        `/spec/workload/endpoints/${token(name)}/tls/trustBundle/input`,
        false,
      )
    }
  }
  // COMP-BUILD-004: a build secret reads a sensitive string input that is always
  // supplied, and its ID is not also a build argument.
  const build = record(workload.build)
  for (const [id, secret] of Object.entries(record(build.secrets))) {
    const input = at(secret, 'input'),
      path = `/spec/workload/build/secrets/${token(id)}`
    if (typeof input === 'string') {
      read.add(input)
      inputReferenceDiagnostics(out, contract, input, `${path}/input`, true)
    }
    if (Object.hasOwn(record(build.arguments), id)) issue(out, 'ERR_CONFLICTING_ENV_VAR', path)
  }
  const mounts: string[] = []
  for (const [name, volume] of Object.entries(record(workload.volumes))) {
    const path = String(at(volume, 'mountPath'))
    if (
      path !== posix.normalize(path) ||
      !path.startsWith('/') ||
      (path.length > 1 && path.endsWith('/')) ||
      mounts.some(
        (other) =>
          path === other ||
          path.startsWith(other === '/' ? '/' : `${other}/`) ||
          other.startsWith(path === '/' ? '/' : `${path}/`),
      )
    )
      issue(out, 'ERR_INVALID_MOUNT', `/spec/workload/volumes/${token(name)}/mountPath`)
    mounts.push(path)
  }
  // COMP-FILE-002, COMP-FILE-003: a file reads an input that is always there,
  // and its path is canonical, not the root, and neither equal to nor an
  // ancestor of a mount or another file. Files are checked after volumes.
  const files: string[] = []
  const under = (child: string, parent: string) =>
    child === parent || child.startsWith(parent === '/' ? '/' : `${parent}/`)
  for (const [name, file] of Object.entries(record(workload.files))) {
    const base = `/spec/workload/files/${token(name)}`
    const input = at(file, 'content', 'input')
    if (typeof input === 'string') {
      read.add(input)
      inputReferenceDiagnostics(out, contract, input, `${base}/content/input`, false)
    }
    const path = at(file, 'path')
    if (typeof path !== 'string') continue
    if (
      path === '/' ||
      path !== posix.normalize(path) ||
      !path.startsWith('/') ||
      path.endsWith('/') ||
      mounts.some((mount) => under(mount, path)) ||
      files.some((other) => under(other, path) || under(path, other))
    )
      issue(out, 'ERR_INVALID_MOUNT', `${base}/path`)
    files.push(path)
  }
  // COMP-COMPUTE-002: a recommendation is at or above the minimum it sits beside.
  const minimum = at(workload, 'compute', 'minimum'),
    recommended = at(workload, 'compute', 'recommended')
  if (isObject(minimum) && isObject(recommended))
    for (const figure of ['vcpus', 'memoryMiB'])
      if (Number(recommended[figure]) < Number(minimum[figure]))
        issue(out, 'ERR_INVALID_COMPUTE', `/spec/workload/compute/recommended/${figure}`)
  // Component §5.3: every environment variable is an input's target, and no two
  // inputs claim one name.
  const env = new Set<string>()
  for (const direction of ['inputs', 'outputs']) {
    for (const [name, value] of Object.entries(record(contract[direction])).sort(([a], [b]) =>
      Buffer.compare(Buffer.from(a), Buffer.from(b)),
    )) {
      const v = record(value),
        path = `/spec/contract/${direction}/${token(name)}`
      // A connection input has no schema: its protocol fixes its members (§6.4).
      if (direction === 'inputs' && isConnectionInput(v)) continue
      if (v.schema === undefined || schemaProblem(v.schema))
        issue(out, 'ERR_INVALID_VALUE_SCHEMA', `${path}/schema`)
      // Component §6.2: the key present in `from` is the output's origin.
      const from = record(v.from)
      const literal =
        direction === 'inputs'
          ? v.default
          : Object.hasOwn(from, 'value')
            ? from.value
            : constantTemplate(from)
      const literalPath =
        direction === 'inputs'
          ? `${path}/default`
          : path + (Object.hasOwn(from, 'value') ? '/from/value' : '/from/template')
      if (literal !== undefined && v.schema !== undefined && !valueFits(v.schema, literal))
        issue(out, 'ERR_VALUE_CONSTRAINT', literalPath)
      if (literal !== undefined && v.sensitive === true)
        issue(out, 'ERR_SENSITIVE_LITERAL', literalPath)
      const target = at(v.target, 'envVar')
      if (typeof target === 'string') {
        if (env.has(target)) issue(out, 'ERR_CONFLICTING_ENV_VAR', `${path}/target/envVar`)
        env.add(target)
      }
      if (direction !== 'outputs') continue
      if (typeof from.input === 'string') {
        read.add(from.input)
        const input = at(contract, 'inputs', from.input)
        const member = asString(from.member)
        if (!input) issue(out, 'ERR_UNKNOWN_INPUT', `${path}/from/input`)
        // COMP-OUT-004: a connection input is read one member at a time, and a
        // value input has no members.
        else if (isConnectionInput(record(input)) !== (member !== undefined))
          issue(
            out,
            'ERR_UNKNOWN_INPUT',
            path + (member === undefined ? '/from/input' : '/from/member'),
          )
        else if (member !== undefined) {
          // COMP-OUT-004: the member is one the input's protocol defines, of the
          // type it fixes, and a sensitive member is forwarded only as sensitive.
          const contract = protocolMember(at(input, 'connection', 'protocol'), member)
          if (!contract) {
            if (CONNECTION_MEMBERS.includes(member))
              issue(out, 'ERR_UNKNOWN_CONNECTION_MEMBER', `${path}/from/member`)
          } else if (!compatible({ schema: { type: contract.type } }, v))
            issue(out, 'ERR_VALUE_CONSTRAINT', `${path}/from/input`)
          else if (contract.sensitive && v.sensitive !== true)
            issue(out, 'ERR_VALUE_CONSTRAINT', `${path}/from/member`)
          // COMP-OUT-003: an optional member without a default may be absent.
          else if (!guaranteedMember(contract))
            issue(out, 'ERR_INPUT_NOT_GUARANTEED', `${path}/from/member`)
        } else if (!compatible(record(input), v))
          issue(out, 'ERR_VALUE_CONSTRAINT', `${path}/from/input`)
        // COMP-OUT-003: an origin that can be absent cannot produce the output.
        // It is checked after the type rule so that a document breaking both
        // keeps the code v1.0.0 gave it.
        else if (at(input, 'required') === false && at(input, 'default') === undefined)
          issue(out, 'ERR_INPUT_NOT_GUARANTEED', `${path}/from/input`)
      }
      const template = typeof from.template === 'string' ? from.template : undefined
      if (template !== undefined) {
        const scanned = scanReferences(template, ['self'])
        for (const failure of scanned.failures)
          issue(
            out,
            failure.kind === 'malformed'
              ? 'ERR_MALFORMED_PLACEHOLDER'
              : failure.kind === 'unknown-namespace'
                ? 'ERR_UNKNOWN_PLACEHOLDER_NAMESPACE'
                : 'ERR_NAMESPACE_NOT_PERMITTED',
            `${path}/from/template`,
          )
      }
      // COMP-PLACEHOLDER-001: a `self` path of any shape but `endpoints.<endpoint>.<property>`
      // names no endpoint explicitly, so `sourceEndpoints` gives it none and it is
      // ERR_UNKNOWN_ENDPOINT, as the withdrawn `self.<property>.<endpoint>` is.
      for (const ref of sourceEndpoints(from)) {
        const problem = endpointProblem(document, ref.endpoint, ref.property)
        if (problem)
          issue(out, problem, path + (template === undefined ? '/from' : '/from/template'))
        // COMP-EP-012: a template produces a string, and an array has no text form in one.
        else if (template !== undefined && addressProperty(ref.property)?.type === 'array')
          issue(out, 'ERR_VALUE_CONSTRAINT', `${path}/from/template`)
      }
      if (template !== undefined && at(v.schema, 'type') !== 'string')
        issue(out, 'ERR_VALUE_CONSTRAINT', `${path}/schema`)
      if (typeof from.endpoint === 'string') {
        const type = addressProperty(String(from.property))?.type ?? 'string'
        const declared = at(v.schema, 'type')
        if (
          type === 'array'
            ? declared !== 'array' || at(v.schema, 'items', 'type') !== 'string'
            : declared !== type && !(type === 'integer' && declared === 'number')
        )
          issue(out, 'ERR_VALUE_CONSTRAINT', `${path}/schema`)
      }
    }
  }
  out.push(...providedConnectionDiagnostics(contract, record(workload.endpoints)))
  // COMP-INPUT-001: a workload input with no target never reaches the
  // environment, so something else reads it or it is declared for nothing.
  const type = at(document, 'spec', 'type')
  if (type === 'SERVICE' || type === 'WORKER' || type === 'JOB')
    for (const [name, input] of Object.entries(record(contract.inputs)))
      if (
        isObject(input) &&
        !isConnectionInput(input) &&
        input.target === undefined &&
        !read.has(name)
      )
        issue(out, 'ERR_UNUSED_INPUT', `/spec/contract/inputs/${token(name)}`)
  return out
}

function checkScreenshotPaths(document: Json, out: Diagnostic[]): void {
  const screenshots = child(child(document, 'spec'), 'screenshots')
  if (!Array.isArray(screenshots)) return

  const seen = new Map<string, number>()
  for (const [position, screenshot] of screenshots.entries()) {
    const file = asString(child(screenshot, 'file'))
    if (file === undefined) continue
    const name = file
    const earlier = seen.get(name)
    if (earlier === undefined) {
      seen.set(name, position)
      continue
    }
    // Reported at the later of the two: the first declaration is the one that
    // stands, so the second is the one an author has to change.
    out.push({
      code: 'ERR_DUPLICATE_MEDIA_PATH',
      path: `/spec/screenshots/${position}/file`,
      message: `media path is already used by screenshot ${earlier}`,
    })
  }
}

/**
 * Listing §4.1: the three rules the overview Markdown profile carries, over
 * `overview` and `gettingStarted` alike. Every diagnostic anchors at the field:
 * it is one scalar, so there is no finer pointer to give, and the offending
 * destination rides in the message instead. Message text is not normative
 * (docs/conformance.md). A destination CommonMark could not resolve to a URL at
 * all is not a scheme the permitted set contains, so it fails with the rest.
 */
function checkListingMarkdown(document: Json, out: Diagnostic[]): void {
  for (const { pointer, ast } of markdownFields(document))
    for (const node of walk(ast)) {
      // A code span and a fenced code block are their own constructs in
      // CommonMark's grammar, never `html_block` or `html_inline`, which is why
      // a listing may document `<script>` inside a fence and stay conforming.
      if (node.type === 'html_block' || node.type === 'html_inline') {
        out.push({
          code: 'ERR_RAW_HTML',
          path: pointer,
          message: `contains raw HTML: ${summarise(node.literal ?? '')}`,
        })
        continue
      }
      const destination = node.destination ?? ''
      if (node.type === 'link' && !schemeIsPermitted(destination))
        out.push({
          code: 'ERR_DISALLOWED_SCHEME',
          path: pointer,
          message: `link destination "${summarise(destination)}" is not https, http, mailto, or a fragment`,
        })
      if (node.type === 'image' && !MEDIA_PATH.test(destination))
        out.push({
          code: 'ERR_IMAGE_NOT_LOCAL',
          path: pointer,
          message: `image destination "${summarise(destination)}" is not a media path under media/`,
        })
    }
}

/** A diagnostic message quotes the offender; it does not reproduce it. */
function summarise(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat
}

// ===========================================================================
// item-scoped rules
// ===========================================================================

/**
 * True when `target` lies strictly inside `root`. Both are expected to be
 * resolved already: this compares locations, and the caller is the one that
 * decides what resolution means.
 */
function contains(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * The resolved location of `path`, following symlinks. Containment is a
 * property of the resolved location rather than of the spelling; listing §5
 * and blueprint §4.1 both turn on that distinction.
 */
function resolveReal(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    // A dangling symlink still has a target, and a target outside the item root
    // is an escape whether or not anything is there. `readlinkSync` reads the
    // link itself, which `realpathSync` cannot once the chain is broken.
    try {
      return resolve(dirname(path), readlinkSync(path))
    } catch {
      // Not a link, or unreadable; the caller reports it as missing instead.
      return resolve(path)
    }
  }
}

/**
 * Listing §5: existence, containment and size, each of which needs the
 * filesystem. Size is read by stat, never by decoding (`LIST-MEDIA-004`), and
 * only for a file that exists inside the item root.
 */
function checkMediaOnDisk(document: Json, itemRoot: string, out: Diagnostic[]): void {
  for (const { path, pointer, role } of mediaReferences(document)) {
    const target = join(itemRoot, path)
    if (!existsSync(target) && !isSymlink(target)) {
      out.push({
        code: 'ERR_MEDIA_NOT_FOUND',
        path: pointer,
        message: `${path} does not exist in the item`,
      })
      continue
    }
    const real = resolveReal(target)
    if (!contains(itemRoot, real)) {
      out.push({
        code: 'ERR_PATH_ESCAPE',
        path: pointer,
        message: `${path} resolves outside the item root`,
      })
      continue
    }
    let size: number | undefined
    try {
      size = statSync(real).size
    } catch {
      size = undefined
    }
    if (size !== undefined && size > MEDIA_BYTES[role])
      out.push({
        code: 'ERR_MEDIA_TOO_LARGE',
        path: pointer,
        message: `${path} is ${size} bytes, over the ${MEDIA_BYTES[role]} byte bound for ${role === 'icon' ? 'an icon' : 'an image'}`,
      })
  }
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * Every `*.yaml`/`*.yml` under `root`, recursively, as absolute paths, outside
 * the item's `media/` directory: the files core v2 §4.1 reads to decide which
 * are the item's component documents.
 */
function yamlFiles(root: string): string[] {
  const found: string[] = []
  const media = join(root, 'media')
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (path !== media) walk(path)
      } else if (/\.ya?ml$/.test(entry.name)) found.push(path)
    }
  }
  walk(root)
  return found.sort()
}

/**
 * `CORE-ITEM-002`, core v2 §4.1: every YAML file of the item outside `media/`
 * parses under the YAML profile, because deciding whether it is a component
 * document reads it. The file is another file of the item, so the diagnostic
 * anchors at the document's root and names the file in `related`.
 */
function checkItemFiles(itemRoot: string, out: Diagnostic[]): void {
  for (const path of yamlFiles(itemRoot)) {
    let ok = false
    try {
      ok = 'value' in parseDocumentBytes(readFileSync(path))
    } catch {
      ok = false
    }
    if (ok) continue
    const artifact = relative(itemRoot, path).split('\\').join('/')
    out.push({
      code: 'ERR_INVALID_YAML',
      path: '',
      message: `${artifact} does not parse under the YAML profile`,
      phase: 'semantic',
      related: [{ artifact, path: '' }],
    })
  }
}

/** Parse a document off disk, or `undefined` when it is unreadable. */
function readDocument(path: string): Json | undefined {
  let parsed: Json | undefined
  try {
    const result = parseDocumentBytes(readFileSync(path))
    parsed = 'value' in result ? result.value : undefined
  } catch {
    // Unreadable or malformed. The item's own parser-phase run reports that;
    // this one declines to describe a document it could not read.
    parsed = undefined
  }
  return parsed
}

/**
 * Core §4.2: an item document's `metadata.slug` MUST equal the item directory
 * name. Blueprint §3 and listing §3 are where each family cites it.
 */
function checkSlug(document: Json, itemRoot: string, out: Diagnostic[]): void {
  const slug = asString(child(child(document, 'metadata'), 'slug'))
  const directory = basename(itemRoot)
  if (slug === undefined || slug === directory) return
  out.push({
    code: 'ERR_SLUG_MISMATCH',
    path: '/metadata/slug',
    message: `slug "${slug}" disagrees with the item directory "${directory}"`,
  })
}

/**
 * `LIST-ITEM-001`, listing §3. `spec.itemType` is `BLUEPRINT` if and only if
 * the item root holds `blueprint.yaml`.
 *
 * The rule reads the directory rather than the document, which is what makes it
 * `semantic` rather than something the bundle could state. An item root is
 * required to decide it at all; the caller has already returned where there is
 * none, as core §4.1 requires.
 */
function checkItemType(document: Json, itemRoot: string, out: Diagnostic[]): void {
  const declared = asString(child(child(document, 'spec'), 'itemType'))
  if (declared === undefined) return
  const holdsBlueprint = existsSync(join(itemRoot, 'blueprint.yaml'))
  const actual = holdsBlueprint ? 'BLUEPRINT' : 'COMPONENT'
  if (declared === actual) return
  out.push({
    code: 'ERR_ITEM_TYPE_MISMATCH',
    path: '/spec/itemType',
    message: holdsBlueprint
      ? `itemType is ${declared}, but the item root holds a blueprint.yaml`
      : `itemType is ${declared}, but the item root holds no blueprint.yaml`,
  })
}

/**
 * `LIST-ITEM-002`, listing §3: a component item holds exactly one component
 * document, any YAML file under the item root that parses with
 * `kind: COMPONENT`.
 */
function checkComponentCount(document: Json, itemRoot: string, out: Diagnostic[]): void {
  if (asString(child(child(document, 'spec'), 'itemType')) !== 'COMPONENT') return
  const count = yamlFiles(itemRoot).filter(
    (path) => at(readDocument(path), 'kind') === 'COMPONENT',
  ).length
  if (count === 1) return
  out.push({
    code: 'ERR_COMPONENT_COUNT',
    path: '/spec/itemType',
    message: `a component item holds exactly one component document, and this one holds ${count}`,
  })
}

export interface SemanticReport {
  diagnostics: Diagnostic[]
  deferred: DeferredObligation[]
  components: Map<string, Json>
  componentDigests: Map<string, string>
  valueOrder?: string[]
}
/** bcrypt reads at most this many bytes of its input and ignores the rest. */
const BCRYPT_INPUT_BYTES = 72
/** BP-PARAM-004: the length of the string a generator produces. */
export function encodedLength(generator: Json | undefined): number {
  const bytes = Number(at(generator, 'byteLength') ?? 32)
  const encoding = at(generator, 'encoding') ?? 'HEX'
  if (encoding === 'BASE64') return 4 * Math.ceil(bytes / 3)
  if (encoding === 'BASE64URL') return Math.ceil((4 * bytes) / 3)
  return 2 * bytes
}
export function semanticReport(
  family: Pick<Family, 'name'>,
  document: Json,
  context: SemanticContext = {},
): SemanticReport {
  const out: Diagnostic[] = [],
    deferred: DeferredObligation[] = [],
    resolved = new Map<string, Json>(),
    componentDigests = new Map<string, string>()
  const defer = (rule: string, path: string, missing: string) =>
    deferred.push({ rule, path, missing })
  if (family.name === 'component') out.push(...componentDiagnostics(document))
  if (family.name === 'listing') {
    checkScreenshotPaths(document, out)
    checkListingMarkdown(document, out)
    if (context.itemRoot) {
      checkSlug(document, context.itemRoot, out)
      checkItemFiles(context.itemRoot, out)
      checkItemType(document, context.itemRoot, out)
      checkComponentCount(document, context.itemRoot, out)
      checkMediaOnDisk(document, context.itemRoot, out)
    } else {
      defer('LIST-ITEM-001', '/spec/itemType', 'itemRoot')
      if (at(document, 'spec', 'itemType') === 'COMPONENT')
        defer('LIST-ITEM-002', '/spec/itemType', 'itemRoot')
    }
  }
  if (family.name !== 'blueprint')
    return { diagnostics: out, deferred, components: resolved, componentDigests }
  const spec = record(at(document, 'spec')),
    nodes = record(spec.nodes),
    parameters = record(spec.parameters)
  const referenced = new Set<string>()
  if (context.itemRoot) {
    checkSlug(document, context.itemRoot, out)
    checkItemFiles(context.itemRoot, out)
  } else defer('CORE-ITEM-001', '/metadata/slug', 'itemRoot')
  for (const [name, node] of Object.entries(nodes)) {
    const n = record(node),
      ref = String(n.componentRef),
      path = `/spec/nodes/${token(name)}/componentRef`
    let bytes: Uint8Array | undefined
    if (/^\.\.?\//.test(ref)) {
      if (!context.itemRoot) {
        defer('BP-REF-002', path, 'itemRoot')
        continue
      }
      const target = resolve(
        dirname(context.documentPath ?? join(context.itemRoot, 'blueprint.yaml')),
        ref,
      )
      if (!contains(context.itemRoot, resolveReal(target))) {
        issue(out, 'ERR_REFERENCE_ESCAPE', path)
        continue
      }
      if (!existsSync(target)) {
        issue(out, 'ERR_COMPONENT_NOT_FOUND', path)
        continue
      }
      try {
        referenced.add(realpathSync(target))
        bytes = readFileSync(target)
      } catch {
        issue(out, 'ERR_COMPONENT_NOT_FOUND', path)
        continue
      }
    } else {
      const key = `${ref}@${n.revision}`
      const pinned =
        context.componentDocuments && Object.hasOwn(context.componentDocuments, key)
          ? context.componentDocuments[key]
          : undefined
      if (!pinned) {
        defer('BP-REF-002', path, `contract:${ref}@${n.revision}`)
        continue
      }
      if (
        typeof pinned.source !== 'string' ||
        createHash('sha256').update(pinned.source).digest('hex') !== pinned.digest
      ) {
        issue(out, 'ERR_INVALID_DEPENDENCY', path)
        continue
      }
      bytes = Buffer.from(pinned.source)
    }
    const parsed = parseDocumentBytes(bytes)
    if (
      'errors' in parsed ||
      at(parsed.value, 'kind') !== 'COMPONENT' ||
      (context.checkComponent && !context.checkComponent(bytes)) ||
      (!('errors' in parsed) && componentDiagnostics(parsed.value).length) ||
      // A node deploys a finished component. Its own metadata description is
      // the one obligation a blueprint does not ask of it (blueprint §4.1).
      (!('errors' in parsed) && componentObligations(parsed.value, { metadata: false }).length)
    ) {
      issue(out, 'ERR_INVALID_DEPENDENCY', path)
      continue
    }
    if (!/^\.\.?\//.test(ref) && at(parsed.value, 'metadata', 'revision') !== n.revision) {
      issue(out, 'ERR_INVALID_DEPENDENCY', path)
      continue
    }
    resolved.set(name, parsed.value)
    componentDigests.set(name, createHash('sha256').update(bytes).digest('hex'))
  }
  out.push(...connectionBindingDiagnostics(document, resolved))
  if (context.itemRoot)
    for (const path of yamlFiles(context.itemRoot)) {
      const target = resolveReal(path)
      if (!contains(context.itemRoot, target) || referenced.has(target)) continue
      if (at(readDocument(path), 'kind') === 'COMPONENT')
        issue(out, 'ERR_UNREFERENCED_COMPONENT', '/spec/nodes')
    }
  /** Parameters a template names, with the inputs those templates bind (BP-BIND-009). */
  const templated = new Map<string, Record<string, Json>[]>()
  // BP-BIND-009 and BP-BIND-010: what a template binding names, and where.
  const templateDiagnostics = (
    binding: Record<string, Json>,
    where: string,
    consumer: Record<string, Json>,
    declared: boolean,
  ) => {
    const text = String(binding.template),
      scan = scanTemplate(text)
    for (const failure of scan.failures)
      issue(
        out,
        failure.kind === 'malformed'
          ? 'ERR_MALFORMED_PLACEHOLDER'
          : failure.kind === 'unknown-namespace'
            ? 'ERR_UNKNOWN_PLACEHOLDER_NAMESPACE'
            : 'ERR_NAMESPACE_NOT_PERMITTED',
        where,
      )
    if (scan.failures.length) return
    // A template produces a string, so the input it binds takes one.
    if (declared && !isConnectionInput(consumer) && at(consumer.schema, 'type') !== 'string')
      issue(out, 'ERR_INCOMPATIBLE_TYPE', where)
    for (const target of scan.references.map(templateTarget)) {
      if (target.kind === 'unknown-parameter') issue(out, 'ERR_UNKNOWN_PARAMETER', where)
      else if (target.kind === 'unknown-output') issue(out, 'ERR_UNKNOWN_OUTPUT', where)
      else if (target.kind === 'parameter') {
        const p = Object.hasOwn(parameters, target.parameter)
          ? parameters[target.parameter]
          : undefined
        if (p === undefined) issue(out, 'ERR_UNKNOWN_PARAMETER', where)
        else if (parameterOrigin(p)?.namespace === 'connections')
          issue(out, 'ERR_INVALID_CONNECTION_BINDING', where)
        else {
          const list = templated.get(target.parameter) ?? []
          if (declared) list.push(consumer)
          templated.set(target.parameter, list)
        }
      } else if (!Object.hasOwn(nodes, target.node)) issue(out, 'ERR_UNKNOWN_NODE', where)
      else {
        const producer = resolved.get(target.node),
          output = at(producer, 'spec', 'contract', 'outputs', target.output)
        if (producer && !output) issue(out, 'ERR_UNKNOWN_OUTPUT', where)
        // A placeholder yields the string form of a scalar (BP-BIND-009).
        if (
          output &&
          !['string', 'integer', 'number', 'boolean'].includes(String(at(output, 'schema', 'type')))
        )
          issue(out, 'ERR_INCOMPATIBLE_TYPE', where)
      }
    }
    if (binding.format === 'URL' && !urlComponents(text, scan.references))
      issue(out, 'ERR_INVALID_TEMPLATE', where)
    // A template without placeholders is a literal (BP-BIND-008, BP-BIND-009).
    if (!scan.references.length && declared && consumer.sensitive === true)
      issue(out, 'ERR_SENSITIVE_LITERAL', where)
  }
  /** Each parameter's receiving inputs, with where each is declared (BP-PARAM-002). */
  const consumers = new Map<string, Record<string, Json>[]>()
  const receiving = new Map<string, { node: string; input: string; componentRef: string }[]>()
  const dependencies = new Map<string, string[]>()
  for (const [name, node] of Object.entries(nodes)) {
    const n = record(node),
      base = `/spec/nodes/${token(name)}`,
      component = resolved.get(name)
    const inputs = record(at(component, 'spec', 'contract', 'inputs')),
      outputs = record(at(component, 'spec', 'contract', 'outputs'))
    const workload = at(component, 'spec', 'workload'),
      category = at(component, 'spec', 'type')
    // BP-NODE-001..002: compute agrees with whether the component runs.
    if (component && category === 'EXTERNAL' && n.compute !== undefined)
      issue(out, 'ERR_COMPUTE_FORBIDDEN', `${base}/compute`)
    if (component && category !== 'EXTERNAL' && n.compute === undefined)
      issue(out, 'ERR_COMPUTE_REQUIRED', base)
    if (component) {
      const declared = record(at(workload, 'volumes')),
        allocated = record(n.volumes)
      for (const volume of new Set([...Object.keys(declared), ...Object.keys(allocated)])) {
        if (
          !declared[volume] ||
          !allocated[volume] ||
          Number(at(allocated[volume], 'sizeGiB')) < Number(at(declared[volume], 'minSizeGiB'))
        )
          issue(out, 'ERR_INVALID_VOLUME_ALLOCATION', `${base}/volumes/${token(volume)}`)
      }
      for (const endpoint of Object.keys(record(n.exposure))) {
        const e = at(workload, 'endpoints', endpoint)
        const exposure = effectiveExposure(n.exposure, endpoint)
        const where = `${base}/exposure/${token(endpoint)}`
        // BP-ACCESS-016: the key the platform checks is a generated parameter.
        const key = at(record(n.exposure)[endpoint], 'apiKey', 'parameter')
        if (typeof key === 'string') {
          if (!Object.hasOwn(parameters, key))
            issue(out, 'ERR_UNKNOWN_PARAMETER', `${where}/apiKey/parameter`)
          else if (at(parameters[key], 'generator') === undefined)
            issue(out, 'ERR_INVALID_API_KEY_PARAMETER', `${where}/apiKey/parameter`)
        }
        if (!e) issue(out, 'ERR_UNKNOWN_ENDPOINT', where)
        else if (exposure.visibility === 'PUBLIC' && category === 'WORKER')
          issue(out, 'ERR_ENDPOINT_NOT_EXPOSABLE', where)
        else {
          if (
            exposure.visibility === 'PUBLIC' &&
            URL_ADDRESSED.includes(String(at(e, 'protocol'))) &&
            // COMP-EP-003: a readiness probe, of any mechanism (§5.4).
            !isObject(at(workload, 'health', 'readiness'))
          )
            issue(out, 'ERR_READINESS_REQUIRED', where)
          // BP-NODE-007: sign-in and a request header exist only on HTTP, HTTPS and WS.
          if (exposure.access === 'RESTRICTED' && !VIEWER.includes(String(at(e, 'protocol'))))
            issue(out, 'ERR_ENDPOINT_NOT_HTTP', `${where}/access`)
          // BP-NODE-008: an OpenID Connect client, and each request taken without a
          // viewer, is one the component declares.
          if (exposure.viewerIdentity === 'OIDC' && at(e, 'oidc') === undefined)
            issue(out, 'ERR_ENDPOINT_NOT_OIDC_CLIENT', `${where}/viewerIdentity`)
          const exemptions = at(record(n.exposure)[endpoint], 'accessExemptions')
          if (Array.isArray(exemptions))
            exemptions.forEach((value, i) => {
              const declared =
                value === 'PATHS'
                  ? at(e, 'exemptibleRequests', 'paths') !== undefined
                  : at(e, 'exemptibleRequests', 'bearerToken') === true
              if (!declared)
                issue(out, 'ERR_EXEMPTION_NOT_DECLARED', `${where}/accessExemptions/${i}`)
            })
        }
      }
      for (const [output, v] of Object.entries(outputs)) {
        const from = record(at(v, 'from'))
        dependencies.set(
          `${name}:out:${output}`,
          typeof from.input === 'string' ? [`${name}:in:${from.input}`] : [],
        )
        for (const ref of sourceEndpoints(from)) {
          const property = addressProperty(ref.property)
          const exposure = effectiveExposure(n.exposure, ref.endpoint)
          // BP-NODE-005 and BP-NODE-007: an output reading a property that only an
          // exposed endpoint, or one forwarding that mode and claim, has.
          const code =
            property?.requires === 'PUBLIC' && exposure.visibility !== 'PUBLIC'
              ? 'ERR_ENDPOINT_NOT_PUBLIC'
              : property?.requires === 'VIEWER_IDENTITY' && !forwards(exposure, property)
                ? 'ERR_VIEWER_IDENTITY_NOT_FORWARDED'
                : undefined
          if (code)
            out.push({
              code,
              path: Object.hasOwn(record(n.exposure), ref.endpoint)
                ? `${base}/exposure/${token(ref.endpoint)}`
                : `${base}/componentRef`,
              message: code,
              phase: 'semantic',
              related: [
                {
                  artifact: String(n.componentRef),
                  path: `/spec/contract/outputs/${token(output)}`,
                },
              ],
            })
        }
      }
      for (const [input, v] of Object.entries(inputs)) {
        dependencies.set(`${name}:in:${input}`, [])
        if (
          at(n.bindings, input) === undefined &&
          at(v, 'default') === undefined &&
          at(v, 'required') !== false
        )
          out.push({
            code: 'ERR_UNSATISFIED_REQUIRED_INPUT',
            path: `${base}/componentRef`,
            message: 'ERR_UNSATISFIED_REQUIRED_INPUT',
            phase: 'semantic',
            related: [
              { artifact: String(n.componentRef), path: `/spec/contract/inputs/${token(input)}` },
            ],
          })
      }
    }
    for (const [input, binding] of Object.entries(record(n.bindings))) {
      const s = record(binding),
        path = `${base}/bindings/${token(input)}`,
        consumer = record(inputs[input])
      if (component && !inputs[input]) issue(out, 'ERR_UNKNOWN_INPUT', path)
      // BP-BIND-002: a node binding, and each node output a template names, is a
      // value dependency of the input. BP-CONNECTION-004: an input bound to a
      // provided connection depends on every output the provided connection maps.
      const provided =
        typeof s.node === 'string' && typeof s.connection === 'string'
          ? at(resolved.get(s.node), 'spec', 'contract', 'providedConnections', s.connection)
          : undefined
      dependencies.set(
        `${name}:in:${input}`,
        typeof s.node === 'string'
          ? typeof s.connection === 'string'
            ? Object.values(record(at(provided, 'members'))).map((o) => `${s.node}:out:${o}`)
            : [`${s.node}:out:${s.output}`]
          : typeof s.template === 'string'
            ? scanTemplate(s.template)
                .references.map(templateTarget)
                .flatMap((t) => (t.kind === 'output' ? [`${t.node}:out:${t.output}`] : []))
            : [],
      )
      if (typeof s.parameter === 'string') {
        const p = parameters[s.parameter]
        if (!p) {
          issue(out, 'ERR_UNKNOWN_PARAMETER', `${path}/parameter`)
          continue
        }
        // BP-CONNECTION-001 decides whether a connection and an input agree in kind,
        // and a connection input declares no schema, default or sensitivity to check.
        if (parameterOrigin(p)?.namespace === 'connections' || isConnectionInput(consumer)) continue
        if (inputs[input]) {
          const receivers = consumers.get(String(s.parameter)) ?? []
          receivers.push(consumer)
          consumers.set(String(s.parameter), receivers)
          const where = receiving.get(String(s.parameter)) ?? []
          where.push({ node: name, input, componentRef: String(n.componentRef) })
          receiving.set(String(s.parameter), where)
          const value = at(p, 'default')
          if (
            value !== undefined &&
            consumer.schema !== undefined &&
            !valueFits(consumer.schema, value)
          )
            issue(
              out,
              'ERR_VALUE_CONSTRAINT',
              `/spec/parameters/${token(String(s.parameter))}/default`,
            )
          if (value !== undefined && consumer.sensitive === true)
            issue(
              out,
              'ERR_SENSITIVE_LITERAL',
              `/spec/parameters/${token(String(s.parameter))}/default`,
            )
        }
      } else if (typeof s.node === 'string' && typeof s.connection === 'string') {
        // BP-CONNECTION-004: a provided connection of the node's component, of the
        // input's protocol, offering every capability the input requires. A value
        // input bound this way is BP-CONNECTION-001's.
        if (!nodes[s.node]) issue(out, 'ERR_UNKNOWN_NODE', `${path}/node`)
        const producer = resolved.get(s.node)
        if (producer && !isObject(provided))
          issue(out, 'ERR_UNKNOWN_PROVIDED_CONNECTION', `${path}/connection`)
        else if (isObject(provided) && isConnectionInput(consumer)) {
          const offered = at(provided, 'connection'),
            wanted = at(consumer, 'connection'),
            capabilities = at(offered, 'capabilities')
          if (
            at(offered, 'protocol') !== at(wanted, 'protocol') ||
            [
              ...(Array.isArray(at(wanted, 'capabilities'))
                ? (at(wanted, 'capabilities') as Json[])
                : []),
            ].some((c) => !(Array.isArray(capabilities) && capabilities.includes(c)))
          )
            issue(out, 'ERR_INVALID_CONNECTION_BINDING', `${path}/connection`)
        }
      } else if (typeof s.node === 'string') {
        if (!nodes[s.node]) issue(out, 'ERR_UNKNOWN_NODE', `${path}/node`)
        const producer = resolved.get(s.node),
          output = at(producer, 'spec', 'contract', 'outputs', String(s.output))
        if (producer && !output) issue(out, 'ERR_UNKNOWN_OUTPUT', `${path}/output`)
        if (
          output &&
          inputs[input] &&
          !isConnectionInput(consumer) &&
          !compatible(record(output), consumer)
        )
          issue(out, 'ERR_INCOMPATIBLE_TYPE', `${path}/output`)
        const literal =
          at(output, 'from', 'value') !== undefined
            ? at(output, 'from', 'value')
            : constantTemplate(at(output, 'from'))
        if (
          literal !== undefined &&
          consumer.schema !== undefined &&
          !valueFits(consumer.schema, literal)
        )
          issue(out, 'ERR_VALUE_CONSTRAINT', path)
      } else if (typeof s.template === 'string') {
        templateDiagnostics(s, `${path}/template`, consumer, Boolean(inputs[input]))
      } else if (Object.hasOwn(s, 'value') && inputs[input]) {
        if (
          consumer.schema !== undefined &&
          s.value !== undefined &&
          !valueFits(consumer.schema, s.value)
        )
          issue(out, 'ERR_VALUE_CONSTRAINT', `${path}/value`)
        if (consumer.sensitive === true) issue(out, 'ERR_SENSITIVE_LITERAL', `${path}/value`)
      }
    }
  }
  // BP-HOST-003: a mounted endpoint is served under a path of another node's
  // public, HTTP-routed endpoint, which has a host of its own, and no two mounts
  // on one host overlap. Each reads the components, so it is decided only for
  // those that are available.
  const mounts = new Map<string, { path: string; where: string }[]>()
  const protocolOf = (node: string, endpoint: string) =>
    String(at(resolved.get(node), 'spec', 'workload', 'endpoints', endpoint, 'protocol'))
  for (const [name, node] of Object.entries(nodes))
    for (const [endpoint, exposure] of Object.entries(record(at(node, 'exposure')))) {
      const mount = at(exposure, 'mount')
      if (!isObject(mount)) continue
      const where = `/spec/nodes/${token(name)}/exposure/${token(endpoint)}/mount`
      const host = asString(mount.node) ?? '',
        hostEndpoint = asString(mount.endpoint) ?? '',
        path = asString(mount.path) ?? ''
      if (!Object.hasOwn(nodes, host)) {
        issue(out, 'ERR_UNKNOWN_NODE', `${where}/node`)
        continue
      }
      const target = record(at(nodes[host], 'exposure'))[hostEndpoint]
      const hostComponent = resolved.get(host)
      if (hostComponent && !at(hostComponent, 'spec', 'workload', 'endpoints', hostEndpoint)) {
        issue(out, 'ERR_UNKNOWN_ENDPOINT', `${where}/endpoint`)
        continue
      }
      const segments = path.split('/').slice(1)
      if (
        (host === name && hostEndpoint === endpoint) ||
        effectiveExposure(at(nodes[host], 'exposure'), hostEndpoint).visibility !== 'PUBLIC' ||
        at(target, 'mount') !== undefined ||
        segments.some((segment) => segment === '.' || segment === '..') ||
        segments[0] === '.musher' ||
        (resolved.get(name) && !HTTP_ROUTED.includes(protocolOf(name, endpoint))) ||
        (hostComponent && !HTTP_ROUTED.includes(protocolOf(host, hostEndpoint)))
      ) {
        issue(out, 'ERR_INVALID_MOUNT', where)
        continue
      }
      const key = `${host}\u0000${hostEndpoint}`,
        siblings = mounts.get(key) ?? []
      const under = (a: string, b: string) => a === b || a.startsWith(`${b}/`)
      if (siblings.some((other) => under(path, other.path) || under(other.path, path)))
        issue(out, 'ERR_INVALID_MOUNT', where)
      siblings.push({ path, where })
      mounts.set(key, siblings)
    }
  // BP-ORDER-002: a start condition fits the node it names, and only a node a
  // rollout starts waits. Each reads a component, so it is decided only for one
  // that is available.
  const startEdges = new Map<string, string[]>()
  const starts = (component: Json | undefined) => {
    const type = at(component, 'spec', 'type')
    return type === 'SERVICE' || type === 'WORKER'
      ? 'READY'
      : type === 'JOB' && at(component, 'spec', 'workload', 'schedule') === undefined
        ? 'SUCCEEDED'
        : undefined
  }
  for (const [name, node] of Object.entries(nodes)) {
    const order = at(node, 'startAfter')
    if (!Array.isArray(order)) continue
    const base = `/spec/nodes/${token(name)}/startAfter`,
      own = resolved.get(name)
    if (own && starts(own) === undefined) issue(out, 'ERR_INVALID_START_ORDER', base)
    const edges: string[] = []
    order.forEach((entry, i) => {
      const target = asString(at(entry, 'node'))
      if (target === undefined) return
      if (!Object.hasOwn(nodes, target)) {
        issue(out, 'ERR_UNKNOWN_NODE', `${base}/${i}/node`)
        return
      }
      edges.push(target)
      const component = resolved.get(target)
      if (component && starts(component) !== at(entry, 'condition'))
        issue(out, 'ERR_INVALID_START_ORDER', `${base}/${i}/condition`)
    })
    startEdges.set(name, edges)
  }
  // BP-ORDER-003: the start graph is acyclic. Kahn's ordering terminates, and
  // what it cannot order lies on a cycle.
  {
    const done = new Set<string>()
    let progressed = true
    while (progressed) {
      progressed = false
      for (const [n, edges] of startEdges) {
        if (done.has(n)) continue
        if (edges.every((e) => done.has(e) || !startEdges.has(e))) {
          done.add(n)
          progressed = true
        }
      }
    }
    if (done.size !== startEdges.size) issue(out, 'ERR_START_CYCLE', '/spec/nodes')
  }
  for (const [name, p] of Object.entries(parameters)) {
    const receivers = consumers.get(name) ?? [],
      path = `/spec/parameters/${token(name)}`
    // BP-PARAM-001: a generated value a hash names, and that carries `ui`, reaches
    // the deployer through disclosure without a binding of its own.
    const used =
      Object.values(nodes).some((n) =>
        Object.values(record(at(n, 'bindings'))).some((b) => at(b, 'parameter') === name),
      ) ||
      templated.has(name) ||
      // BP-ACCESS-016: an exposure's apiKey uses the parameter it names.
      apiKeyParameters(nodes).has(name) ||
      (at(p, 'generator') !== undefined &&
        at(p, 'ui') !== undefined &&
        Object.values(parameters).some((other) => at(other, 'hash', 'parameter') === name))
    if (!used) issue(out, 'ERR_UNBOUND_PARAMETER', path)
    // BP-UI-005: a submitted parameter the form never offers, and that has no
    // default, cannot reach a required input through a form deployment.
    if (
      ['generator', 'hash', 'from', 'ui', 'default'].every((key) => at(p, key) === undefined) &&
      [...receivers, ...(templated.get(name) ?? [])].some((v) => v.required !== false)
    )
      issue(out, 'ERR_PARAMETER_NOT_OFFERED', path)
    out.push(...parameterOriginDiagnostics(name, p))
    // BP-PARAM-012: a hash names a generated parameter that bcrypt can read whole.
    const hashed = at(p, 'hash', 'parameter')
    if (typeof hashed === 'string') {
      const source = Object.hasOwn(parameters, hashed) ? parameters[hashed] : undefined
      if (source === undefined) issue(out, 'ERR_UNKNOWN_PARAMETER', `${path}/hash/parameter`)
      else if (at(source, 'generator') === undefined)
        issue(out, 'ERR_INVALID_HASHED_PARAMETER', `${path}/hash/parameter`)
      else if (
        at(p, 'hash', 'algorithm') === 'BCRYPT' &&
        encodedLength(at(source, 'generator')) > BCRYPT_INPUT_BYTES
      )
        issue(out, 'ERR_INVALID_HASHED_PARAMETER', `${path}/hash/algorithm`)
    }
    // BP-PARAM-002: the parameter's value schema is the intersection of its
    // receivers'. Schemas that differ only in mapping order or in the order of a
    // set (`required`, `enum`) are the same schema.
    const schemas = receivers.map((v) => v.schema ?? null)
    const differ = schemas.some((v) => schemaKey(v) !== schemaKey(schemas[0]))
    const conflicts = new Set(differ ? intersectionConflicts(schemas) : [])
    // BP-PARAM-002 and BP-PARAM-017: every string a generator can produce lies in
    // the intersection. Where the receivers declare one schema, which 2.1.0
    // accepted, a generator outside it is a warning rather than an error.
    const generator = at(p, 'generator')
    if (
      generator !== undefined &&
      schemas.length &&
      schemas.every((v) => at(v, 'type') === 'string')
    ) {
      const failing = [...new Set(schemas.flatMap((v) => generatorConflicts(generator, v)))]
      if (differ) for (const keyword of failing) conflicts.add(keyword)
      else if (failing.length)
        out.push({
          code: 'WARN_GENERATOR_OUTSIDE_SCHEMA',
          path: `${path}/generator`,
          message: `a generated value can fail ${failing.join(', ')}`,
          phase: 'semantic',
          severity: 'WARNING',
        })
    }
    if (conflicts.size)
      out.push({
        code: 'ERR_CONFLICTING_INPUT_SCHEMA',
        path,
        message: `no value satisfies every input the parameter binds: ${[...conflicts].join(', ')}`,
        phase: 'semantic',
        related: (receiving.get(name) ?? []).map((r) => ({
          artifact: r.componentRef,
          path: `/spec/contract/inputs/${token(r.input)}/schema`,
        })),
      })
    // BP-UI-003: the enum a form offers is the intersection's, in the order of
    // the first receiver declaring one.
    const enumOf = (v: Json | undefined) =>
      Array.isArray(at(v, 'enum'))
        ? (at(v, 'enum') as Json[])
        : Array.isArray(at(v, 'items', 'enum'))
          ? (at(v, 'items', 'enum') as Json[])
          : undefined
    const declaring = schemas.find((v) => enumOf(v) !== undefined)
    const members = (enumOf(declaring) ?? []).filter((member) =>
      schemas.every((v) => {
        const own = enumOf(v)
        return own === undefined || own.some((m) => schemaKey(m) === schemaKey(member))
      }),
    )
    for (const member of Object.keys(record(at(p, 'ui', 'enumLabels'))))
      if (
        receivers.length &&
        !members.some(
          (v) =>
            (v === null || ['string', 'number', 'boolean'].includes(typeof v)) &&
            String(v) === member,
        )
      )
        issue(out, 'ERR_UNKNOWN_ENUM_MEMBER', `${path}/ui/enumLabels/${token(member)}`)
    // BP-UI-007: every option fits every receiver, and a closed list holds the default.
    const options = at(p, 'ui', 'options')
    if (Array.isArray(options)) {
      options.forEach((option, i) => {
        const value = at(option, 'value')
        if (
          value !== undefined &&
          receivers.some((v) => v.schema !== undefined && !valueFits(v.schema, value))
        )
          issue(out, 'ERR_VALUE_CONSTRAINT', `${path}/ui/options/${i}/value`)
      })
      const fallback = at(p, 'default')
      if (
        fallback !== undefined &&
        at(p, 'ui', 'editable') !== true &&
        !options.some((o) => canonicalJson(at(o, 'value') ?? null) === canonicalJson(fallback))
      )
        issue(out, 'ERR_VALUE_CONSTRAINT', `${path}/default`)
    }
    for (const supply of ['generator', 'hash'])
      if (at(p, supply) !== undefined && receivers.some((v) => at(v.schema, 'type') !== 'string'))
        issue(out, 'ERR_VALUE_CONSTRAINT', `${path}/${supply}`)
  }
  // Kahn ordering separates value dependencies from discovery relationships.
  const pending = new Map<string, number>(),
    dependents = new Map<string, string[]>()
  for (const [key, deps] of dependencies) {
    pending.set(key, deps.filter((d) => dependencies.has(d)).length)
    for (const dep of deps) {
      const list = dependents.get(dep) ?? []
      list.push(key)
      dependents.set(dep, list)
    }
  }
  const ready = [...pending].filter(([, n]) => n === 0).map(([key]) => key),
    ordered: string[] = []
  // A key appended to `ready` while it is iterated is still visited.
  for (const key of ready) {
    ordered.push(key)
    for (const dependent of dependents.get(key) ?? []) {
      const count = pending.get(dependent)
      if (count === undefined) throw new Error(`no pending count for ${dependent}`)
      const n = count - 1
      pending.set(dependent, n)
      if (n === 0) ready.push(dependent)
    }
  }
  if (ordered.length !== pending.size) issue(out, 'ERR_VALUE_CYCLE', '/spec/nodes')
  // Propagate statically known values through arbitrarily many forwarding nodes.
  const known = new Map<string, Json>()
  for (const key of ordered) {
    const [node, direction, name] = key.split(':') as [string, string, string]
    const definition = record(
      at(resolved.get(node), 'spec', 'contract', direction === 'in' ? 'inputs' : 'outputs', name),
    )
    const binding =
      direction === 'in' ? record(at(nodes[node], 'bindings', name)) : record(definition.from)
    let value: Json | undefined
    // A provided connection is several members, never one known value.
    if (typeof binding.connection === 'string') continue
    if (Object.hasOwn(binding, 'value')) value = binding.value
    else if (typeof binding.template === 'string') value = constantTemplate(binding)
    else if (typeof binding.parameter === 'string')
      value = at(parameters, binding.parameter, 'default')
    else if (!Object.keys(binding).length && direction === 'in') value = definition.default
    else {
      const dependency = dependencies.get(key)?.[0]
      if (dependency) value = known.get(dependency)
    }
    if (value === undefined) continue
    known.set(key, value)
    const path =
      direction === 'in'
        ? `/spec/nodes/${token(node)}/bindings/${token(name)}`
        : `/spec/nodes/${token(node)}/componentRef`
    if (
      definition.schema &&
      !valueFits(definition.schema, value) &&
      !out.some((d) => d.code === 'ERR_VALUE_CONSTRAINT' && d.path === path)
    )
      out.push({
        code: 'ERR_VALUE_CONSTRAINT',
        path,
        message: 'ERR_VALUE_CONSTRAINT',
        phase: 'semantic',
        ...(direction === 'out'
          ? {
              related: [
                {
                  artifact: String(at(nodes[node], 'componentRef')),
                  path: `/spec/contract/outputs/${token(name)}`,
                },
              ],
            }
          : {}),
      })
    if (
      definition.sensitive === true &&
      (typeof binding.node === 'string' || typeof binding.input === 'string')
    )
      out.push({
        code: 'ERR_SENSITIVE_LITERAL',
        path,
        message: 'ERR_SENSITIVE_LITERAL',
        phase: 'semantic',
        ...(direction === 'out'
          ? {
              related: [
                {
                  artifact: String(at(nodes[node], 'componentRef')),
                  path: `/spec/contract/outputs/${token(name)}`,
                },
              ],
            }
          : {}),
      })
  }
  return { diagnostics: out, deferred, components: resolved, componentDigests, valueOrder: ordered }
}
