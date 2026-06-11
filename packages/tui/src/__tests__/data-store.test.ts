import type { LattixConnection } from '@lattix/client'
import type { Table, Field, RecordRow } from '@lattix/shared'
import type { ServerFrame } from '@lattix/protocol'
import { DataStore } from '../store/data-store.js'

// Hand-rolled fake of just the parts DataStore touches.
class FakeConn {
  tables: Table[] = []
  fields = new Map<string, Field[]>() // tableId -> fields
  records = new Map<string, RecordRow[]>() // tableId -> records
  /** push handlers registered via subscribe(), by channel */
  pushers = new Map<string, Array<(f: ServerFrame) => void>>()
  /** spy on every request that goes out */
  calls: Array<{ method: string; params?: unknown }> = []

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    this.calls.push({ method, params })
    switch (method) {
      case 'table.list':
        return Promise.resolve({ tables: [...this.tables] } as T)
      case 'table.create': {
        const p = params as { name: string; description: string | null }
        const t: Table = {
          id: `t_${this.tables.length + 1}`,
          name: p.name,
          description: p.description,
          createdAt: 0,
          updatedAt: 0,
        }
        this.tables.push(t)
        return Promise.resolve({ table: t } as T)
      }
      case 'table.delete': {
        const p = params as { tableId: string }
        this.tables = this.tables.filter((t) => t.id !== p.tableId)
        return Promise.resolve({ deleted: true } as T)
      }
      case 'field.list': {
        const p = params as { tableId: string }
        return Promise.resolve({ fields: this.fields.get(p.tableId) ?? [] } as T)
      }
      case 'field.create': {
        const p = params as { tableId: string; name: string }
        const list = this.fields.get(p.tableId) ?? []
        const field = {
          id: `f_${list.length + 1}`,
          tableId: p.tableId,
          name: p.name,
          type: 'text',
          options: {},
          position: list.length + 1,
          required: false,
          createdAt: 0,
          updatedAt: 0,
        } as unknown as Field
        list.push(field)
        this.fields.set(p.tableId, list)
        return Promise.resolve({ field } as T)
      }
      case 'record.list': {
        const p = params as { tableId: string }
        const recs = this.records.get(p.tableId) ?? []
        return Promise.resolve({ records: recs, total: recs.length } as T)
      }
      case 'record.create': {
        const p = params as { tableId: string; data: Record<string, unknown> }
        const recs = this.records.get(p.tableId) ?? []
        const rec = {
          id: `r_${recs.length + 1}`,
          tableId: p.tableId,
          data: p.data,
          createdAt: 0,
          updatedAt: 0,
        } as RecordRow
        recs.push(rec)
        this.records.set(p.tableId, recs)
        return Promise.resolve({ record: rec } as T)
      }
      case 'record.update': {
        const p = params as {
          tableId: string
          recordId: string
          data: Record<string, unknown>
        }
        const recs = this.records.get(p.tableId) ?? []
        const i = recs.findIndex((r) => r.id === p.recordId)
        if (i >= 0) recs[i] = { ...recs[i]!, data: { ...recs[i]!.data, ...p.data } }
        return Promise.resolve({ ok: true } as T)
      }
      case 'record.delete': {
        const p = params as { tableId: string; recordId: string }
        const recs = this.records.get(p.tableId) ?? []
        this.records.set(
          p.tableId,
          recs.filter((r) => r.id !== p.recordId),
        )
        return Promise.resolve({ deleted: true } as T)
      }
      default:
        return Promise.reject(new Error(`unmocked: ${method}`))
    }
  }

  subscribe(channel: string, handler: (f: ServerFrame) => void): Promise<() => void> {
    const list = this.pushers.get(channel) ?? []
    list.push(handler)
    this.pushers.set(channel, list)
    return Promise.resolve(() => {
      const cur = this.pushers.get(channel)
      if (cur)
        this.pushers.set(
          channel,
          cur.filter((h) => h !== handler),
        )
    })
  }

  /** test helper: push a frame to a channel as the server would */
  emitPush(channel: string): void {
    for (const h of this.pushers.get(channel) ?? []) {
      h({ type: 'push', event: 'x', channel, data: {} } as ServerFrame)
    }
  }
}

function makeStore(): { store: DataStore; fake: FakeConn } {
  const fake = new FakeConn()
  const store = new DataStore(fake as unknown as LattixConnection)
  return { store, fake }
}

describe('DataStore', () => {
  it('loadTables() populates and auto-selects the first table', async () => {
    const { store, fake } = makeStore()
    fake.tables = [
      { id: 't1', name: 'A', description: null, createdAt: 0, updatedAt: 0 },
      { id: 't2', name: 'B', description: null, createdAt: 0, updatedAt: 0 },
    ]
    await store.loadTables()
    expect(store.getTables()).toHaveLength(2)
    expect(store.getCurrentTableId()).toBe('t1')
    expect(store.getCurrentTable()?.name).toBe('A')
  })

  it('selectTable() loads fields + records for the chosen table', async () => {
    const { store, fake } = makeStore()
    fake.tables = [{ id: 't1', name: 'A', description: null, createdAt: 0, updatedAt: 0 }]
    fake.fields.set('t1', [
      {
        id: 'f1',
        tableId: 't1',
        name: 'Title',
        type: 'text',
        options: {},
        position: 1,
        required: false,
        createdAt: 0,
        updatedAt: 0,
      },
    ])
    fake.records.set('t1', [
      { id: 'r1', tableId: 't1', data: { f1: 'hi' }, createdAt: 0, updatedAt: 0 },
    ])
    await store.loadTables()
    const s = store.getTableState('t1')
    expect(s?.fields).toHaveLength(1)
    expect(s?.records).toHaveLength(1)
    expect(s?.loading).toBe(false)
  })

  it('selectTable() short-circuits when already current', async () => {
    const { store, fake } = makeStore()
    fake.tables = [{ id: 't1', name: 'A', description: null, createdAt: 0, updatedAt: 0 }]
    await store.loadTables()
    fake.calls.length = 0
    await store.selectTable('t1')
    expect(fake.calls).toHaveLength(0)
  })

  it('subscribe()-style listener gets called on state changes', async () => {
    const { store, fake } = makeStore()
    let count = 0
    const unsub = store.subscribe(() => count++)
    fake.tables = [{ id: 't1', name: 'A', description: null, createdAt: 0, updatedAt: 0 }]
    await store.loadTables()
    expect(count).toBeGreaterThan(0)
    unsub()
    const before = count
    await store.loadTables()
    expect(count).toBe(before) // unsubscribed
  })

  it('push event on records channel triggers a reload', async () => {
    const { store, fake } = makeStore()
    fake.tables = [{ id: 't1', name: 'A', description: null, createdAt: 0, updatedAt: 0 }]
    await store.loadTables()
    const before = fake.calls.filter((c) => c.method === 'record.list').length
    fake.emitPush('table.t1.records')
    // loadTableData runs asynchronously
    await new Promise((r) => setTimeout(r, 10))
    const after = fake.calls.filter((c) => c.method === 'record.list').length
    expect(after).toBeGreaterThan(before)
  })

  it('createTable() adds and selects when no current table', async () => {
    const { store } = makeStore()
    const t = await store.createTable('New')
    expect(t.name).toBe('New')
    expect(store.getCurrentTableId()).toBe(t.id)
  })

  it('createTable() does not switch selection if one is already current', async () => {
    const { store, fake } = makeStore()
    fake.tables = [{ id: 't1', name: 'A', description: null, createdAt: 0, updatedAt: 0 }]
    await store.loadTables()
    await store.createTable('Second')
    expect(store.getCurrentTableId()).toBe('t1')
    expect(store.getTables()).toHaveLength(2)
  })

  it('deleteTable() removes the table and switches selection', async () => {
    const { store, fake } = makeStore()
    fake.tables = [
      { id: 't1', name: 'A', description: null, createdAt: 0, updatedAt: 0 },
      { id: 't2', name: 'B', description: null, createdAt: 0, updatedAt: 0 },
    ]
    await store.loadTables()
    await store.deleteTable('t1')
    expect(store.getTables().map((t) => t.id)).toEqual(['t2'])
    expect(store.getCurrentTableId()).toBe('t2')
  })

  it('deleteTable() clears currentTableId if no tables remain', async () => {
    const { store, fake } = makeStore()
    fake.tables = [{ id: 't1', name: 'A', description: null, createdAt: 0, updatedAt: 0 }]
    await store.loadTables()
    await store.deleteTable('t1')
    expect(store.getCurrentTableId()).toBeNull()
  })

  it('createField() reloads table data', async () => {
    const { store, fake } = makeStore()
    fake.tables = [{ id: 't1', name: 'A', description: null, createdAt: 0, updatedAt: 0 }]
    await store.loadTables()
    fake.calls.length = 0
    await store.createField({ tableId: 't1', name: 'X', type: 'text' })
    expect(fake.calls.some((c) => c.method === 'field.create')).toBe(true)
    expect(fake.calls.some((c) => c.method === 'field.list')).toBe(true)
  })

  it('updateRecord() optimistically patches in-memory state', async () => {
    const { store, fake } = makeStore()
    fake.tables = [{ id: 't1', name: 'A', description: null, createdAt: 0, updatedAt: 0 }]
    fake.fields.set('t1', [
      {
        id: 'f1',
        tableId: 't1',
        name: 'T',
        type: 'text',
        options: {},
        position: 1,
        required: false,
        createdAt: 0,
        updatedAt: 0,
      },
    ])
    fake.records.set('t1', [
      { id: 'r1', tableId: 't1', data: { f1: 'old' }, createdAt: 0, updatedAt: 0 },
    ])
    await store.loadTables()
    await store.updateRecord({ tableId: 't1', recordId: 'r1', fieldId: 'f1', value: 'new' })
    const rec = store.getTableState('t1')?.records[0]
    expect(rec?.data['f1']).toBe('new')
  })

  it('createRecord() reloads table data', async () => {
    const { store, fake } = makeStore()
    fake.tables = [{ id: 't1', name: 'A', description: null, createdAt: 0, updatedAt: 0 }]
    await store.loadTables()
    fake.calls.length = 0
    await store.createRecord('t1')
    expect(fake.calls.some((c) => c.method === 'record.create')).toBe(true)
  })

  it('deleteRecord() reloads table data', async () => {
    const { store, fake } = makeStore()
    fake.tables = [{ id: 't1', name: 'A', description: null, createdAt: 0, updatedAt: 0 }]
    fake.records.set('t1', [{ id: 'r1', tableId: 't1', data: {}, createdAt: 0, updatedAt: 0 }])
    await store.loadTables()
    await store.deleteRecord('t1', 'r1')
    expect(fake.calls.some((c) => c.method === 'record.delete')).toBe(true)
  })

  it('records error state when the load fails', async () => {
    const { store, fake } = makeStore()
    fake.tables = [{ id: 't1', name: 'A', description: null, createdAt: 0, updatedAt: 0 }]
    // make field.list throw
    const orig = fake.request.bind(fake)
    fake.request = ((m: string, p?: unknown) => {
      if (m === 'field.list') return Promise.reject(new Error('boom'))
      return orig(m, p)
    }) as typeof fake.request
    await store.loadTables()
    const s = store.getTableState('t1')
    expect(s?.error).toBe('boom')
    expect(s?.loading).toBe(false)
  })

  it('dispose() removes all subscriptions', async () => {
    const { store, fake } = makeStore()
    fake.tables = [{ id: 't1', name: 'A', description: null, createdAt: 0, updatedAt: 0 }]
    await store.loadTables()
    await store.dispose()
    fake.emitPush('table.t1.records')
    // no error and no further request
    const before = fake.calls.length
    await new Promise((r) => setTimeout(r, 10))
    expect(fake.calls.length).toBe(before)
  })
})
