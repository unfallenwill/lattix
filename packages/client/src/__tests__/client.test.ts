/**
 * Typed client SDK — end-to-end against a real loopback Core. We assert:
 *   - `client.<domain>.<action>()` reaches the right wire method,
 *   - the typed return shape matches what we get back,
 *   - bogus action names return undefined (and fail at runtime, not
 *     silently),
 *   - typed compile-time signatures don't crash on the path where the
 *     wire spec evolves (we only smoke a few methods, not all 19).
 */
import { createBuiltinFieldRegistry } from '@lattix/shared'
import {
  CoreServer,
  EventBus,
  Router,
  SqliteStorage,
  TableService,
  FieldService,
  RecordService,
} from '@lattix/core'
import { LattixConnection, createClient } from '../index.js'

interface Harness {
  url: string
  closeServer(): Promise<void>
}

async function bootServer(): Promise<Harness> {
  const storage = new SqliteStorage({ dbPath: ':memory:', disableWAL: true })
  const bus = new EventBus()
  const fields = createBuiltinFieldRegistry()
  const tableService = new TableService({ storage, bus })
  const fieldService = new FieldService({ storage, bus, fields })
  const recordService = new RecordService({ storage, bus, fields })
  const router = new Router({
    storage,
    fields,
    tableService,
    fieldService,
    recordService,
    serverVersion: '0.1.0-sdk-test',
  })
  const server = new CoreServer({
    port: 0,
    host: '127.0.0.1',
    router,
    bus,
    serverVersion: '0.1.0-sdk-test',
  })
  const running = await server.start()
  return {
    url: running.url,
    closeServer: async () => {
      await server.stop()
      storage.close()
    },
  }
}

describe('LattixClient typed SDK', () => {
  let h: Harness
  let conn: LattixConnection

  beforeEach(async () => {
    h = await bootServer()
    conn = new LattixConnection({ url: h.url, reconnect: false })
    await conn.connect()
  })

  afterEach(async () => {
    await conn.close().catch(() => undefined)
    await h.closeServer()
  })

  it('client.tables.list() reaches table.list and returns {tables}', async () => {
    const client = createClient(conn)
    const result = await client.tables.list({})
    expect(result.tables).toEqual([])
  })

  it('CRUD round-trip via the typed SDK', async () => {
    const client = createClient(conn)
    const { table } = await client.tables.create({ name: 'SDK Test' })
    expect(table.name).toBe('SDK Test')

    const { field } = await client.fields.create({
      tableId: table.id,
      name: 'Title',
      type: 'text',
      options: {},
      required: true,
    })
    expect(field.name).toBe('Title')

    const { record } = await client.records.create({
      tableId: table.id,
      data: { [field.id]: 'hello' },
    })
    expect(record.data[field.id]).toBe('hello')

    const list = await client.records.list({ tableId: table.id, limit: 10 })
    expect(list.records).toHaveLength(1)
    expect(list.total).toBe(1)
  })

  it('client.core.health() returns {ok, ts}', async () => {
    const client = createClient(conn)
    const health = await client.core.health({})
    expect(health.ok).toBe(true)
    expect(typeof health.ts).toBe('number')
  })

  it('unknown action on a known domain is undefined', () => {
    const client = createClient(conn)
    const action = (client.tables as unknown as Record<string, unknown>)['nope']
    expect(action).toBeUndefined()
  })

  it('unknown domain still yields a (vacant) namespace proxy, but actions are undefined', () => {
    const client = createClient(conn)
    const domain = (client as unknown as Record<string, unknown>)['nopeDomain']
    expect(domain).toBeDefined()
    const action = (domain as Record<string, unknown>)['list']
    expect(action).toBeUndefined()
  })

  it('caches per-domain proxy so repeated access returns ===', () => {
    const client = createClient(conn)
    expect(client.tables).toBe(client.tables)
  })
})
