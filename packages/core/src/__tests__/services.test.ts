import { ProtocolException } from '@lattix/protocol'
import { makeFixture, type CoreFixture } from './_fixture.js'

describe('TableService', () => {
  let f: CoreFixture
  beforeEach(() => {
    f = makeFixture()
  })
  afterEach(() => f.close())

  it('lists empty', () => {
    expect(f.tableService.list()).toEqual([])
  })

  it('create/get/update/delete + events', () => {
    const t = f.tableService.create({ name: 'Tasks' })
    expect(t.id).toBeDefined()
    expect(f.tableService.get(t.id).name).toBe('Tasks')
    const u = f.tableService.update(t.id, { name: 'Tasks 2' })
    expect(u.name).toBe('Tasks 2')
    f.tableService.delete(t.id)
    expect(f.events.map((e) => e.type)).toEqual(['table.created', 'table.updated', 'table.deleted'])
    expect(f.events[0]!.channel).toBe(`table.${t.id}`)
  })

  it('get() throws NOT_FOUND', () => {
    expect(() => f.tableService.get('missing')).toThrow(ProtocolException)
  })
})

describe('FieldService', () => {
  let f: CoreFixture
  beforeEach(() => {
    f = makeFixture()
  })
  afterEach(() => f.close())

  it('list() rejects unknown table', () => {
    expect(() => f.fieldService.list('nope')).toThrow(/Table not found/)
  })

  it('create/update/delete + reorder + events', () => {
    const t = f.tableService.create({ name: 'T' })
    const a = f.fieldService.create({ tableId: t.id, name: 'A', type: 'text' })
    const b = f.fieldService.create({
      tableId: t.id,
      name: 'B',
      type: 'number',
      required: true,
    })
    expect(f.fieldService.list(t.id).map((x) => x.name)).toEqual(['A', 'B'])
    const updated = f.fieldService.update(a.id, { name: 'A1', required: true })
    expect(updated.name).toBe('A1')
    expect(updated.required).toBe(true)
    f.fieldService.reorder(t.id, [b.id, a.id])
    expect(f.fieldService.list(t.id).map((x) => x.id)).toEqual([b.id, a.id])
    f.fieldService.delete(a.id)
    expect(f.fieldService.list(t.id).map((x) => x.id)).toEqual([b.id])
    const types = f.events.map((e) => e.type)
    expect(types).toContain('field.created')
    expect(types).toContain('field.updated')
    expect(types).toContain('field.reordered')
    expect(types).toContain('field.deleted')
  })

  it('delete() unknown field throws NOT_FOUND', () => {
    expect(() => f.fieldService.delete('nope')).toThrow(/Field not found/)
  })

  it('create() rejects unknown table', () => {
    expect(() => f.fieldService.create({ tableId: 'no', name: 'X', type: 'text' })).toThrow(
      /Table not found/,
    )
  })
})

describe('RecordService', () => {
  let f: CoreFixture
  let tableId: string
  let titleId: string
  let priorityId: string
  let doneId: string

  beforeEach(() => {
    f = makeFixture()
    const t = f.tableService.create({ name: 'T' })
    tableId = t.id
    titleId = f.fieldService.create({
      tableId,
      name: 'Title',
      type: 'text',
      required: true,
    }).id
    priorityId = f.fieldService.create({
      tableId,
      name: 'Priority',
      type: 'number',
    }).id
    doneId = f.fieldService.create({ tableId, name: 'Done', type: 'checkbox' }).id
    f.events.length = 0 // reset, focus on record events
  })
  afterEach(() => f.close())

  it('create() validates + fills defaults for optional fields', () => {
    const r = f.recordService.create({ tableId, data: { [titleId]: 'hello' } })
    expect(r.data[titleId]).toBe('hello')
    expect(r.data[priorityId]).toBeNull() // default for number
    expect(r.data[doneId]).toBe(false) // default for checkbox
    expect(f.events[0]!.type).toBe('record.created')
  })

  it('create() throws BAD_REQUEST when required field is missing', () => {
    expect(() => f.recordService.create({ tableId, data: {} })).toThrow(/Missing required field/)
  })

  it('create() throws BAD_REQUEST for invalid field value', () => {
    expect(() =>
      f.recordService.create({
        tableId,
        data: { [titleId]: 'ok', [priorityId]: 'not-a-number' },
      }),
    ).toThrow(/Invalid value/)
  })

  it('create() silently drops unknown keys (forward-compat)', () => {
    const r = f.recordService.create({
      tableId,
      data: { [titleId]: 'x', unknownField: 'discarded' },
    })
    expect(r.data['unknownField']).toBeUndefined()
  })

  it('update() is partial (does not require all fields)', () => {
    const r = f.recordService.create({ tableId, data: { [titleId]: 'old' } })
    const upd = f.recordService.update({
      tableId,
      recordId: r.id,
      data: { [titleId]: 'new' },
    })
    expect(upd.data[titleId]).toBe('new')
  })

  it('list() returns total + page', () => {
    f.recordService.create({ tableId, data: { [titleId]: 'a' } })
    f.recordService.create({ tableId, data: { [titleId]: 'b' } })
    const res = f.recordService.list({ tableId, limit: 10, offset: 0 })
    expect(res.total).toBe(2)
    expect(res.records).toHaveLength(2)
    expect(res.limit).toBe(10)
    expect(res.offset).toBe(0)
  })

  it('list() passes sortBy/sortDir through', () => {
    f.recordService.create({ tableId, data: { [titleId]: 'a' } })
    const res = f.recordService.list({
      tableId,
      limit: 10,
      offset: 0,
      sortBy: 'created_at',
      sortDir: 'desc',
    })
    expect(res.total).toBe(1)
  })

  it('list() throws on unknown table', () => {
    expect(() => f.recordService.list({ tableId: 'no', limit: 10, offset: 0 })).toThrow(
      /Table not found/,
    )
  })

  it('get() returns the record or throws NOT_FOUND', () => {
    const r = f.recordService.create({ tableId, data: { [titleId]: 'x' } })
    expect(f.recordService.get(tableId, r.id).id).toBe(r.id)
    expect(() => f.recordService.get(tableId, 'missing')).toThrow(/Record not found/)
  })

  it('delete() removes and emits', () => {
    const r = f.recordService.create({ tableId, data: { [titleId]: 'x' } })
    f.events.length = 0
    f.recordService.delete(tableId, r.id)
    expect(f.events.some((e) => e.type === 'record.deleted')).toBe(true)
  })

  it('batch() runs mixed ops atomically and emits one batch event', () => {
    const r = f.recordService.create({ tableId, data: { [titleId]: 'one' } })
    f.events.length = 0
    const out = f.recordService.batch({
      tableId,
      operations: [
        { op: 'create', data: { [titleId]: 'two' } },
        { op: 'update', recordId: r.id, data: { [titleId]: 'one-prime' } },
        { op: 'delete', recordId: r.id }, // delete what we just updated
      ],
    })
    expect(out.results).toHaveLength(3)
    expect(out.results[2]).toBeNull() // delete returns null in batch
    const batchEv = f.events.filter((e) => e.type === 'record.batch')
    expect(batchEv).toHaveLength(1)
    expect((batchEv[0]!.payload as { count: number }).count).toBe(3)
  })

  it('import() accepts partial rows and emits import.progress', () => {
    const out = f.recordService.import({
      tableId,
      rows: [
        { [titleId]: 'a' },
        { [titleId]: 'b', [priorityId]: 1 },
        { [titleId]: 'c', [doneId]: true },
      ],
    })
    expect(out.imported).toBe(3)
    expect(f.events.some((e) => e.type === 'import.progress')).toBe(true)
    expect(f.recordService.list({ tableId, limit: 10, offset: 0 }).total).toBe(3)
  })
})
