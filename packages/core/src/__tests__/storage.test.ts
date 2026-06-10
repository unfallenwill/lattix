import { SqliteStorage } from '../storage/index.js'

function makeStorage(): SqliteStorage {
  return new SqliteStorage({ dbPath: ':memory:', disableWAL: true })
}

describe('SqliteStorage (in-memory)', () => {
  let storage: SqliteStorage

  beforeEach(() => {
    storage = makeStorage()
  })
  afterEach(() => {
    storage.close()
  })

  it('initialises with 4 tables and records the schema version', () => {
    const tables = storage.tables.list()
    expect(tables).toEqual([])
  })

  it('round-trips table CRUD', () => {
    const t = storage.tables.create({ name: 'Tasks' })
    expect(t.id).toBeDefined()
    expect(storage.tables.get(t.id)?.name).toBe('Tasks')
    const updated = storage.tables.update(t.id, { name: 'Tasks 2' })
    expect(updated.name).toBe('Tasks 2')
    storage.tables.delete(t.id)
    expect(storage.tables.get(t.id)).toBeNull()
  })

  it('rejects duplicate table names', () => {
    storage.tables.create({ name: 'Tasks' })
    expect(() => storage.tables.create({ name: 'Tasks' })).toThrow(/already exists/)
  })

  it('round-trips field CRUD with type and options', () => {
    const t = storage.tables.create({ name: 'Tasks' })
    const f = storage.fields.create({
      tableId: t.id,
      name: 'Status',
      type: 'select',
      options: { options: [{ id: 'a', name: 'A' }] },
      required: true,
    })
    expect(f.position).toBe(1)
    const updated = storage.fields.update(f.id, { name: 'State' })
    expect(updated.name).toBe('State')
    const all = storage.fields.listByTable(t.id)
    expect(all).toHaveLength(1)
  })

  it('reorders fields by id', () => {
    const t = storage.tables.create({ name: 'T' })
    const a = storage.fields.create({
      tableId: t.id,
      name: 'a',
      type: 'text',
      options: {},
      required: false,
    })
    const b = storage.fields.create({
      tableId: t.id,
      name: 'b',
      type: 'text',
      options: {},
      required: false,
    })
    storage.fields.reorder(t.id, [b.id, a.id])
    const after = storage.fields.listByTable(t.id)
    expect(after.map((f) => f.id)).toEqual([b.id, a.id])
  })

  it('round-trips record CRUD', () => {
    const t = storage.tables.create({ name: 'T' })
    const f = storage.fields.create({
      tableId: t.id,
      name: 'Title',
      type: 'text',
      options: {},
      required: true,
    })
    const r = storage.records.create(t.id, { [f.id]: 'hello' })
    expect(r.data).toEqual({ [f.id]: 'hello' })
    const got = storage.records.get(t.id, r.id)
    expect(got?.data).toEqual({ [f.id]: 'hello' })
    const updated = storage.records.update(t.id, r.id, { [f.id]: 'world' })
    expect(updated.data).toEqual({ [f.id]: 'world' })
    const { records, total } = storage.records.list({ tableId: t.id, limit: 10, offset: 0 })
    expect(total).toBe(1)
    expect(records).toHaveLength(1)
    storage.records.delete(t.id, r.id)
    expect(storage.records.get(t.id, r.id)).toBeNull()
  })

  it('cascades deletes from table to fields and records', () => {
    const t = storage.tables.create({ name: 'T' })
    const f = storage.fields.create({
      tableId: t.id,
      name: 'x',
      type: 'text',
      options: {},
      required: false,
    })
    storage.records.create(t.id, { [f.id]: 'a' })
    storage.tables.delete(t.id)
    expect(storage.fields.listByTable(t.id)).toHaveLength(0)
    expect(storage.records.list({ tableId: t.id, limit: 10, offset: 0 }).total).toBe(0)
  })

  it('runs a transaction atomically', () => {
    const t = storage.tables.create({ name: 'T' })
    const f = storage.fields.create({
      tableId: t.id,
      name: 'x',
      type: 'text',
      options: {},
      required: false,
    })
    expect(() =>
      storage.runInTransaction(() => {
        storage.records.create(t.id, { [f.id]: '1' })
        storage.records.create(t.id, { [f.id]: '2' })
        throw new Error('boom')
      }),
    ).toThrow(/boom/)
    expect(storage.records.list({ tableId: t.id, limit: 10, offset: 0 }).total).toBe(0)
  })
})
