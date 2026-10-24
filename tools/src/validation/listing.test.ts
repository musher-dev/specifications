import { describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { discoverKinds } from '../lib/layout.ts'
import { dimensionProblem, imageDimensions, unknownLicenses } from './listing.ts'
import { validateDocument } from './validator.ts'

const listing = discoverKinds().find((f) => f.name === 'listing')!

function scratch(files: Record<string, string | Uint8Array>): string {
  const root = mkdtempSync(join(tmpdir(), 'musher-listing-'))
  for (const [path, bytes] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), bytes)
  }
  return root
}

const COMPONENT = `specVersion: v2
kind: COMPONENT
metadata:
  revision: 1
  description: Synthetic component.
spec:
  type: SERVICE
  workload:
    source:
      image: postgres:17.10-alpine
    endpoints:
      db:
        targetPort: 5432
        protocol: TCP
`
const LISTING = (extra: string) => `specVersion: v2
kind: LISTING
metadata:
  slug: item
spec:
  itemType: COMPONENT
  displayName: Item
  summary: A synthetic item
  category: DATABASES
  lifecycleStage: STABLE
${extra}`

function run(
  files: Record<string, string | Uint8Array>,
  scope: 'document' | 'publication',
  context = {},
) {
  const root = scratch(files)
  try {
    const documentPath = join(root, 'item/listing.yaml')
    return validateDocument(listing, readFileSync(documentPath), {
      validationScope: scope,
      itemRoot: dirname(documentPath),
      documentPath,
      ...context,
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('LIST-MEDIA-004: media size, by stat', () => {
  const MiB = 1024 * 1024
  test('an icon of exactly 1 MiB passes', () => {
    const result = run(
      {
        'item/listing.yaml': LISTING('  icon: media/icon.png\n'),
        'item/component.yaml': COMPONENT,
        'item/media/icon.png': new Uint8Array(MiB),
      },
      'document',
    )
    expect(result.diagnostics).toEqual([])
  })
  test('a screenshot of exactly 5 MiB passes, and one byte more fails', () => {
    for (const [size, codes] of [
      [5 * MiB, []],
      [5 * MiB + 1, ['ERR_MEDIA_TOO_LARGE@/spec/screenshots/0/file']],
    ] as const) {
      const result = run(
        {
          'item/listing.yaml': LISTING('  screenshots:\n    - file: media/shot.png\n'),
          'item/component.yaml': COMPONENT,
          'item/media/shot.png': new Uint8Array(size),
        },
        'document',
      )
      expect(result.diagnostics.map((d) => `${d.code}@${d.path}`)).toEqual([...codes])
    }
  })
  test('an overview image is held to the screenshot bound', () => {
    const result = run(
      {
        'item/listing.yaml': LISTING('  gettingStarted: "![Shot](media/shot.png)"\n'),
        'item/component.yaml': COMPONENT,
        'item/media/shot.png': new Uint8Array(5 * MiB + 1),
      },
      'document',
    )
    expect(result.diagnostics.map((d) => `${d.code}@${d.path}`)).toEqual([
      'ERR_MEDIA_TOO_LARGE@/spec/gettingStarted',
    ])
  })
})

describe('LIST-ITEM-002', () => {
  test('is deferred, never reported, without an item root', () => {
    const result = validateDocument(listing, LISTING(''), { validationScope: 'document' })
    expect(result.status).toBe('INCOMPLETE')
    expect(result.deferred.map((d) => d.rule)).toContain('LIST-ITEM-002')
  })
  test('counts a component document anywhere under the root', () => {
    const result = run(
      { 'item/listing.yaml': LISTING(''), 'item/deep/er/postgres.yml': COMPONENT },
      'document',
    )
    expect(result.status).toBe('VALID')
  })
})

describe('LIST-MEDIA-005: image headers', () => {
  const header = (bytes: number[]) => new Uint8Array(bytes)
  const jpeg = (width: number, height: number) =>
    header([
      0xff,
      0xd8, // SOI
      0xff,
      0xe0,
      0x00,
      0x10,
      ...Array(14).fill(0), // APP0, skipped by its length
      0xff,
      0xc0,
      0x00,
      0x11,
      0x08,
      height >> 8,
      height & 0xff,
      width >> 8,
      width & 0xff,
      3,
      ...Array(9).fill(0),
      0xff,
      0xd9,
    ])
  const riff = (chunk: string, body: number[]) =>
    header([
      ...Buffer.from('RIFF'),
      0,
      0,
      0,
      0,
      ...Buffer.from('WEBP'),
      ...Buffer.from(chunk),
      10,
      0,
      0,
      0,
      ...body,
    ])
  const cases: [string, Uint8Array, { width: number; height: number } | undefined][] = [
    ['a.jpg', jpeg(640, 480), { width: 640, height: 480 }],
    ['a.JPEG', jpeg(4097, 1), { width: 4097, height: 1 }],
    // VP8X: flags, three reserved bytes, then width-1 and height-1 as 24-bit LE.
    ['a.webp', riff('VP8X', [0, 0, 0, 0, 0xff, 0, 0, 0xff, 0, 0]), { width: 256, height: 256 }],
    // VP8L: the signature byte, then 14-bit width-1 and height-1.
    ['b.webp', riff('VP8L', [0x2f, 99, 0xc0, 0x18, 0]), { width: 100, height: 100 }],
    // VP8: frame tag, start code, then 14-bit width and height.
    [
      'c.webp',
      riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 0x00, 0x01, 0x00, 0x01]),
      { width: 256, height: 256 },
    ],
    ['a.png', jpeg(640, 480), undefined],
    ['d.webp', header([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WAVE')]), undefined],
    ['empty.png', header([]), undefined],
  ]
  for (const [name, bytes, expected] of cases)
    test(`${name} reads ${JSON.stringify(expected)}`, () => {
      const root = scratch({ [name]: bytes })
      try {
        expect(imageDimensions(join(root, name))).toEqual(expected)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })
  test('bounds', () => {
    expect(dimensionProblem('icon', { width: 256, height: 256 })).toBeUndefined()
    expect(dimensionProblem('icon', { width: 4096, height: 4096 })).toBeUndefined()
    expect(dimensionProblem('icon', { width: 255, height: 255 })).toBeDefined()
    expect(dimensionProblem('icon', { width: 256, height: 257 })).toBeDefined()
    expect(dimensionProblem('screenshot', { width: 4096, height: 4096 })).toBeUndefined()
    expect(dimensionProblem('image', { width: 1, height: 4097 })).toBeDefined()
    expect(dimensionProblem('image', undefined)).toBeDefined()
  })
})

describe('the listing admission corpus, executed', () => {
  // conformance.ts skips `admission` cases, because the phase is the server's.
  // These are executed here so the headers they carry are known to say what
  // their diagnostics claim.
  const dir = join(listing.conformanceDir, 'admission')
  for (const name of existsSync(dir) ? readdirSync(dir).sort() : []) {
    test(name, () => {
      const caseDir = join(dir, name)
      const metadata = JSON.parse(readFileSync(join(caseDir, 'metadata.json'), 'utf8'))
      const documentPath = join(caseDir, 'tree', metadata.document)
      const result = validateDocument(listing, readFileSync(documentPath), {
        validationScope: 'publication',
        itemRoot: dirname(documentPath),
        documentPath,
      })
      const produced = result.diagnostics.map((d) => `${d.code}@${d.path}`)
      if (metadata.expected === 'pass') expect(produced).toEqual([])
      else {
        expect(result.phase).toBe('admission')
        const declared = JSON.parse(readFileSync(join(caseDir, 'diagnostics.json'), 'utf8'))
        for (const d of declared) expect(produced).toContain(`${d.code}@${d.path}`)
      }
    })
  }
})

describe('LIST-LICENSE-002', () => {
  const list = { licenses: ['MIT', 'Apache-2.0', 'GPL-2.0-only'], exceptions: ['LLVM-exception'] }
  test('compares case-insensitively, strips "+", and accepts LicenseRef-', () => {
    expect(unknownLicenses('mit OR APACHE-2.0+ AND licenseRef-Acme', list)).toEqual([])
  })
  test('looks an exception up on the exception list only', () => {
    expect(unknownLicenses('Apache-2.0 WITH LLVM-exception', list)).toEqual([])
    expect(unknownLicenses('Apache-2.0 WITH MIT', list)).toEqual(['MIT'])
    expect(unknownLicenses('LLVM-exception', list)).toEqual(['LLVM-exception'])
  })
  test('reads through a group', () => {
    expect(unknownLicenses('(MIT OR MTI) AND Apache-2.0', list)).toEqual(['MTI'])
  })
  test('is deferred without the pinned list', () => {
    const result = validateDocument(listing, LISTING('  license: MIT\n'), {
      validationScope: 'publication',
    })
    expect(result.status).toBe('INCOMPLETE')
    expect(result.deferred.map((d) => d.rule)).toContain('LIST-LICENSE-002')
  })
})
