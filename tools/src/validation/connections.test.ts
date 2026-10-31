import { expect, test } from 'bun:test'
import { familyPaths, inRepo, REPO_ROOT } from '../lib/layout.ts'
import {
  CONNECTION_MEMBERS,
  CONNECTION_PROTOCOL_MEMBERS,
  CONNECTION_PROTOCOLS,
  CONNECTION_URL_MEMBER,
  composeConnectionURL,
  connectionMemberContract,
  guaranteedMember,
  HTTP_CONNECTION_PROTOCOLS,
  isConnectionInput,
  LLM_CONNECTION_PROTOCOLS,
  protocolMember,
} from './connections.ts'

test('the key present says an input is a connection input', () => {
  expect(isConnectionInput({ connection: { protocol: 'POSTGRES' } })).toBe(true)
  expect(isConnectionInput({ schema: { type: 'string' } })).toBe(false)
})

test('every protocol fixes its members', () => {
  expect(Object.keys(CONNECTION_PROTOCOL_MEMBERS.POSTGRES)).toEqual([
    'host',
    'port',
    'database',
    'username',
    'password',
    'sslMode',
    'url',
  ])
})

test('optional members state a default or may be absent, and url is derived', () => {
  expect(protocolMember('REDIS', 'database')).toEqual({
    type: 'integer',
    sensitive: false,
    required: false,
    default: 0,
  })
  expect(protocolMember('S3', 'pathStyle')?.default).toBe(false)
  const redis = (name: string) => {
    const contract = protocolMember('REDIS', name)
    if (contract === undefined) throw new Error(`REDIS defines no ${name}`)
    return contract
  }
  for (const name of ['username', 'password']) expect(guaranteedMember(redis(name))).toBe(false)
  for (const name of ['database', 'url', 'tls']) expect(guaranteedMember(redis(name))).toBe(true)
  expect(protocolMember('POSTGRES', 'url')?.derived).toBe(true)
})

test('the derived url has one canonical composition', () => {
  expect(
    composeConnectionURL('POSTGRES', {
      host: 'DB.Example',
      port: 5432,
      database: 'app',
      username: 'a b',
      password: "p!'()*",
      sslMode: 'require',
    }),
  ).toBe('postgresql://a%20b:p%21%27%28%29%2A@db.example:5432/app?sslmode=require')
  expect(composeConnectionURL('REDIS', { host: '::1', port: 6379, tls: false })).toBe(
    'redis://[::1]:6379/0',
  )
  expect(composeConnectionURL('S3', { host: 'x', port: 1 })).toBeUndefined()
})

test('the member table agrees with the schema member enum', async () => {
  const schema = JSON.parse(
    await Bun.file(
      inRepo(REPO_ROOT, `${familyPaths('component', 'v2').src}/component.schema.json`),
    ).text(),
  )
  expect([...CONNECTION_MEMBERS].sort()).toEqual(
    [...schema.$defs.ComponentOutputFrom.properties.member.enum].sort(),
  )
  expect([...CONNECTION_PROTOCOLS].sort()).toEqual(
    [...schema.$defs.ComponentConnection.properties.protocol.enum].sort(),
  )
})

test('members carry their protocol type and sensitivity', () => {
  expect(protocolMember('POSTGRES', 'port')).toEqual({
    type: 'integer',
    sensitive: false,
    required: true,
  })
  expect(protocolMember('REDIS', 'url')).toEqual({
    type: 'string',
    sensitive: true,
    required: true,
    derived: true,
  })
  expect(protocolMember('S3', 'secretAccessKey')?.sensitive).toBe(true)
  expect(protocolMember('POSTGRES', 'apiKey')).toBeUndefined()
  expect(protocolMember('UNKNOWN', 'host')).toBeUndefined()
  expect(connectionMemberContract('port', 'REDIS')).toEqual({
    schema: { type: 'integer' },
    sensitive: false,
  })
  expect(connectionMemberContract('apiKey')).toEqual({
    schema: { type: 'string' },
    sensitive: true,
  })
})

test('only the language-model protocols take capabilities, and S3 is HTTP-based', () => {
  expect([...LLM_CONNECTION_PROTOCOLS].sort()).toEqual([
    'ANTHROPIC_MESSAGES',
    'OPENAI_CHAT_COMPLETIONS',
  ])
  expect(HTTP_CONNECTION_PROTOCOLS.has('S3')).toBe(true)
  expect(HTTP_CONNECTION_PROTOCOLS.has('POSTGRES')).toBe(false)
  for (const protocol of HTTP_CONNECTION_PROTOCOLS) {
    const url = CONNECTION_URL_MEMBER[protocol]
    if (url === undefined) throw new Error(`${protocol} names no URL member`)
    expect(protocolMember(protocol, url)).toBeDefined()
  }
})
