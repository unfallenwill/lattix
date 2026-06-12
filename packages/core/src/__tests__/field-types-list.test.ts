/**
 * field.types.list — exercises the new RPC end-to-end via the typed SDK.
 * Returns one wire manifest per registered builtin type; the data
 * crossing the wire is the input to a future "new field" picker UI in
 * any client without having to hardcode the type list.
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
import { LattixConnection, createClient } from '@lattix/client'

interface Harness {
  url: string
  close(): Promise<void>
}

async function boot(): Promise<Harness> {
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
    serverVersion: '0.1.0-field-types-test',
  })
  const server = new CoreServer({
    port: 0,
    host: '127.0.0.1',
    router,
    bus,
    serverVersion: '0.1.0-field-types-test',
  })
  const running = await server.start()
  return {
    url: running.url,
    close: async () => {
      await server.stop()
      storage.close()
    },
  }
}

describe('field.types.list', () => {
  let h: Harness
  let conn: LattixConnection

  beforeEach(async () => {
    h = await boot()
    conn = new LattixConnection({ url: h.url, reconnect: false })
    await conn.connect()
  })
  afterEach(async () => {
    await conn.close().catch(() => undefined)
    await h.close()
  })

  it('returns the 5 builtin types with full wire manifests', async () => {
    const client = createClient(conn)
    const { types } = await client.field.types.list({})
    const ids = types.map((t) => t.id).sort()
    expect(ids).toEqual(['checkbox', 'date', 'number', 'select', 'text'])
  })

  it('each manifest carries display + storage + operators', async () => {
    const client = createClient(conn)
    const { types } = await client.field.types.list({})
    for (const t of types) {
      expect(t.display.displayName.length).toBeGreaterThan(0)
      expect(['TEXT', 'INTEGER', 'REAL', 'BLOB']).toContain(t.storage.sqlType)
      expect(t.operators.filter.length).toBeGreaterThan(0)
      expect(['natural', 'numeric', 'date', 'boolean', 'none']).toContain(t.operators.sort)
    }
  })

  it('number type advertises sum/avg/min/max aggregates', async () => {
    const client = createClient(conn)
    const { types } = await client.field.types.list({})
    const n = types.find((t) => t.id === 'number')!
    expect(n.operators.aggregate).toContain('sum')
    expect(n.operators.aggregate).toContain('avg')
    expect(n.operators.aggregate).toContain('min')
    expect(n.operators.aggregate).toContain('max')
    expect(n.operators.sort).toBe('numeric')
  })

  it('text type sort is natural, number type sort is numeric', async () => {
    const client = createClient(conn)
    const { types } = await client.field.types.list({})
    expect(types.find((t) => t.id === 'text')?.operators.sort).toBe('natural')
    expect(types.find((t) => t.id === 'number')?.operators.sort).toBe('numeric')
  })
})

describe('record.list sortBy goes through the manifest', () => {
  let h: Harness
  let conn: LattixConnection

  beforeEach(async () => {
    h = await boot()
    conn = new LattixConnection({ url: h.url, reconnect: false })
    await conn.connect()
  })
  afterEach(async () => {
    await conn.close().catch(() => undefined)
    await h.close()
  })

  async function seed(): Promise<{
    tableId: string
    numberFieldId: string
    checkboxFieldId: string
  }> {
    const client = createClient(conn)
    const { table } = await client.table.create({ name: 'SortTest' })
    const { field: numField } = await client.field.create({
      tableId: table.id,
      name: 'Priority',
      type: 'number',
      options: {},
    })
    const { field: cbField } = await client.field.create({
      tableId: table.id,
      name: 'Done',
      type: 'checkbox',
      options: {},
    })
    // Three records out of order numerically: 30, 10, 20.
    for (const n of [30, 10, 20]) {
      await client.record.create({
        tableId: table.id,
        data: { [numField.id]: n, [cbField.id]: false },
      })
    }
    return { tableId: table.id, numberFieldId: numField.id, checkboxFieldId: cbField.id }
  }

  it('sort by number field returns numeric order (asc)', async () => {
    const { tableId, numberFieldId } = await seed()
    const client = createClient(conn)
    const { records } = await client.record.list({
      tableId,
      limit: 10,
      sortBy: numberFieldId,
      sortDir: 'asc',
    })
    const values = records.map((r) => r.data[numberFieldId])
    expect(values).toEqual([10, 20, 30])
  })

  it('sort by number field, desc', async () => {
    const { tableId, numberFieldId } = await seed()
    const client = createClient(conn)
    const { records } = await client.record.list({
      tableId,
      limit: 10,
      sortBy: numberFieldId,
      sortDir: 'desc',
    })
    const values = records.map((r) => r.data[numberFieldId])
    expect(values).toEqual([30, 20, 10])
  })

  it('sort by unknown field id returns BAD_REQUEST', async () => {
    const { tableId } = await seed()
    const client = createClient(conn)
    await expect(client.record.list({ tableId, limit: 10, sortBy: 'nope' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('sort by system column (updated_at) still works', async () => {
    const { tableId } = await seed()
    const client = createClient(conn)
    const { records } = await client.record.list({
      tableId,
      limit: 10,
      sortBy: 'updated_at',
      sortDir: 'asc',
    })
    expect(records).toHaveLength(3)
  })
})
