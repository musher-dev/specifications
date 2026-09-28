import { afterEach, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  canonicalCIDR,
  type RecordContext,
  resolutionRecord,
  validIdentityHeader,
} from './resolution.ts'
import { effectiveExposure } from './semantic.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

test('canonical CIDRs: dotted IPv4 and RFC 5952 IPv6, no host bits, never /0', () => {
  for (const cidr of ['10.88.0.0/16', '192.0.2.7/32', 'fd00:88::/64', '2001:db8::/32', '::1/128'])
    expect(canonicalCIDR(cidr)).toBe(true)
  for (const cidr of [
    '10.88.0.1/16',
    '0.0.0.0/0',
    '::/0',
    '10.088.0.0/16',
    '10.88.0.0/33',
    '10.88.0.0/016',
    '10.88.0.0',
    'FD00:88::/64',
    'fd00:88:0:0::/64',
    'fd00:0088::/64',
    '2001:db8:0:0:1:0:0:1/128',
    '1:2:3:4:5:6:7::/128',
    'example.invalid/24',
    42,
  ])
    expect(canonicalCIDR(cidr)).toBe(false)
  // RFC 5952 §4.2.3: the first of two equally long zero runs is the one compressed.
  expect(canonicalCIDR('2001:db8::1:0:0:1/128')).toBe(true)
  expect(canonicalCIDR('2001:db8:0:0:1::1/128')).toBe(false)
})

test('identity header names are lowercase tokens the platform does not reserve', () => {
  for (const name of ['x-platform-user', 'x-musher-user', 'remote-user'])
    expect(validIdentityHeader(name)).toBe(true)
  for (const name of [
    'X-Platform-User',
    'x-forwarded-user',
    'forwarded',
    'authorization',
    'cookie',
    'host',
    'origin',
    'x-real-ip',
    'x platform user',
    '',
    'x'.repeat(129),
  ])
    expect(validIdentityHeader(name)).toBe(false)
})

test('bare exposure is shorthand for the object form with every default', () => {
  const exposures = {
    open: 'PUBLIC',
    hidden: 'PRIVATE',
    signedIn: { visibility: 'PUBLIC', access: 'AUTHENTICATED', viewerIdentity: 'HEADER' } as const,
  }
  expect(effectiveExposure(exposures, 'open')).toEqual(
    effectiveExposure({ open: { visibility: 'PUBLIC' } }, 'open'),
  )
  expect(effectiveExposure(exposures, 'open')).toEqual({
    visibility: 'PUBLIC',
    access: 'OPEN',
    viewerIdentity: 'NONE',
  })
  expect(effectiveExposure(exposures, 'hidden').visibility).toBe('PRIVATE')
  expect(effectiveExposure(exposures, 'absent').visibility).toBe('PRIVATE')
  expect(effectiveExposure(exposures, 'signedIn')).toEqual(exposures.signedIn)
})

test('a resolution record carries the object form of an exposure', () => {
  const exposure = { visibility: 'PUBLIC', access: 'AUTHENTICATED', viewerIdentity: 'HEADER' }
  const component = {
    specVersion: 'v1',
    kind: 'COMPONENT',
    metadata: { revision: 1, description: 'A synthetic service.' },
    spec: {
      type: 'SERVICE',
      workload: {
        source: { image: 'example/web:1' },
        endpoints: { web: { targetPort: 8080, protocol: 'HTTP' } },
        health: { readiness: { http: { endpoint: 'web', path: '/healthz' } } },
      },
      contract: { inputs: {}, outputs: {} },
    },
  }
  const document = {
    specVersion: 'v1',
    kind: 'BLUEPRINT',
    metadata: { slug: 'app', revision: 1, description: 'A synthetic application.' },
    spec: {
      parameters: {},
      components: {
        web: {
          componentRef: './web.yaml',
          compute: { profile: 'general.standard.small' },
          exposure: { web: exposure },
          bindings: {},
        },
      },
    },
  }
  const root = mkdtempSync(join(tmpdir(), 'musher-access-'))
  roots.push(root)
  const itemRoot = join(root, 'app')
  mkdirSync(itemRoot)
  writeFileSync(join(itemRoot, 'web.yaml'), JSON.stringify(component))
  const documentPath = join(itemRoot, 'blueprint.yaml')
  writeFileSync(documentPath, JSON.stringify(document))
  const context: RecordContext = {
    itemRoot,
    documentPath,
    snapshot: {
      formatVersion: 1,
      identity: 'installation-snapshot',
      version: '1',
      parameters: {},
      variables: {},
      credentials: {},
      allocations: {
        web: {
          web: {
            identity: 'allocation-1',
            version: '1',
            public: {
              hostname: 'example.invalid',
              scheme: 'https',
              viewerIdentityHeader: 'x-platform-user',
              trustedProxyCIDRs: ['10.88.0.0/16'],
            },
          },
        },
      },
    },
    specificationDependencies: {
      core: {},
      component: { core: '1.0.0' },
      blueprint: { core: '1.0.0', component: '1.0.0' },
    },
  }
  const components = {
    web: {
      source: 'IMAGE' as const,
      compute: { identity: 'general.standard.small', version: '1' },
      identity: './web.yaml',
      revision: 1,
      digest: createHash('sha256').update(JSON.stringify(component)).digest('hex'),
      imageDigest: 'sha256:' + 'b'.repeat(64),
      volumes: {},
      exposure: { web: exposure },
    },
  }
  const versions = { core: '1.0.0', component: '1.0.0', blueprint: '1.0.0' }
  const bytes = Buffer.from(JSON.stringify(document))
  const record = resolutionRecord(bytes, versions, components, {}, {}, context)
  expect(record.components.web?.exposure).toEqual({ web: exposure })
  expect(() =>
    resolutionRecord(
      bytes,
      versions,
      { web: { ...components.web, exposure: { web: 'PUBLIC' } } },
      {},
      {},
      context,
    ),
  ).toThrow()
})
