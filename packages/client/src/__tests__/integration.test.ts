/**
 * Real loopback integration: a CoreServer on an ephemeral port talking to a
 * LattixConnection. Covers the request/response/error/subscribe/push paths
 * across both server.ts and connection.ts without mocking either side.
 *
 * Skips heartbeat (30s timer) — covered separately if at all.
 */
import { createBuiltinFieldRegistry } from '@lattix/shared'
import { recordsChannel } from '@lattix/protocol'
import {
  CoreServer,
  EventBus,
  Router,
  SqliteStorage,
  TableService,
  FieldService,
  RecordService,
} from '@lattix/core'
import { LattixConnection } from '../connection.js'

interface Harness {
  url: string
  storage: SqliteStorage
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
    serverVersion: '0.1.0-integration',
  })
  const server = new CoreServer({
    port: 0,
    host: '127.0.0.1',
    router,
    bus,
    serverVersion: '0.1.0-integration',
  })
  const running = await server.start()
  return {
    url: running.url,
    storage,
    closeServer: async () => {
      await server.stop()
      storage.close()
    },
  }
}

describe('client ↔ server loopback', () => {
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

  it('completes a handshake (connect resolves, state=connected)', () => {
    expect(conn.getState()).toBe('connected')
  })

  it('round-trips core.health via request()', async () => {
    const r = (await conn.request('core.health')) as { ok: boolean; ts: number }
    expect(r.ok).toBe(true)
    expect(typeof r.ts).toBe('number')
  })

  it('returns a protocol error response that rejects the promise', async () => {
    await expect(conn.request('does.not.exist')).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    })
  })

  it('round-trips a full CRUD flow', async () => {
    const created = (await conn.request('table.create', { name: 'Tasks' })) as {
      table: { id: string; name: string }
    }
    expect(created.table.name).toBe('Tasks')
    const tables = (await conn.request('table.list')) as { tables: { id: string }[] }
    expect(tables.tables).toHaveLength(1)

    const field = (await conn.request('field.create', {
      tableId: created.table.id,
      name: 'Title',
      type: 'text',
      options: {},
      required: true,
    })) as { field: { id: string } }
    expect(field.field.id).toBeDefined()
  })

  it('subscribe → server fan-out → handler invocation', async () => {
    const created = (await conn.request('table.create', { name: 'Push' })) as {
      table: { id: string }
    }
    const tableId = created.table.id

    const received: unknown[] = []
    await conn.subscribe(recordsChannel(tableId), (frame) => received.push(frame))

    const field = (await conn.request('field.create', {
      tableId,
      name: 'Title',
      type: 'text',
      options: {},
      required: true,
    })) as { field: { id: string } }
    await conn.request('record.create', {
      tableId,
      data: { [field.field.id]: 'hi' },
    })

    // server.fanOut is synchronous after our event arrives on the bus; allow
    // a microtask flush for the socket write/read to land
    await new Promise((r) => setTimeout(r, 50))
    expect(received.length).toBeGreaterThan(0)
  })

  it('rejects in-flight requests when the connection closes', async () => {
    // start a request, then close before the server can write the response.
    // The pending request must reject with the connection-closed error.
    const p = conn.request('core.health')
    await conn.close()
    await expect(p).rejects.toBeDefined()
  })

  it('refuses to send requests when not connected', async () => {
    const fresh = new LattixConnection({ url: h.url, reconnect: false })
    await expect(fresh.request('core.health')).rejects.toMatchObject({
      code: 'INTERNAL',
      message: /not connected/,
    })
  })

  it('exposes state changes via onState()', async () => {
    const fresh = new LattixConnection({ url: h.url, reconnect: false })
    const states: string[] = []
    fresh.onState((s) => states.push(s))
    await fresh.connect()
    await fresh.close()
    expect(states).toContain('idle')
    expect(states).toContain('connected')
    expect(states).toContain('closed')
  })
})
