import { ProtocolException } from '@lattix/protocol'
import { makeFixture, type CoreFixture } from './_fixture.js'

describe('Router', () => {
  let f: CoreFixture
  beforeEach(() => {
    f = makeFixture()
  })
  afterEach(() => f.close())

  it('core.health returns ok+ts', async () => {
    const r = (await f.router.handle('core.health', {})) as { ok: boolean; ts: number }
    expect(r.ok).toBe(true)
    expect(typeof r.ts).toBe('number')
  })

  it('core.version returns server + protocol info', async () => {
    const r = (await f.router.handle('core.version', {})) as {
      serverVersion: string
      protocolVersion: number
      storage: string
    }
    expect(r.serverVersion).toBe('0.1.0-test')
    expect(r.protocolVersion).toBe(1)
    expect(r.storage).toBe('sqlite')
  })

  it('rejects an unknown method', async () => {
    await expect(f.router.handle('does.not.exist', {})).rejects.toBeInstanceOf(ProtocolException)
  })

  it('rejects malformed params (BAD_REQUEST)', async () => {
    // table.create requires `name`
    await expect(f.router.handle('table.create', { description: 'x' })).rejects.toThrow(
      /Invalid params/,
    )
  })

  it('runs a full table → field → record flow via dispatch', async () => {
    const created = (await f.router.handle('table.create', { name: 'T' })) as {
      table: { id: string }
    }
    const tableId = created.table.id

    const list = (await f.router.handle('table.list', {})) as { tables: unknown[] }
    expect(list.tables).toHaveLength(1)

    const got = (await f.router.handle('table.get', { tableId })) as {
      table: { name: string }
    }
    expect(got.table.name).toBe('T')

    await f.router.handle('table.update', { tableId, name: 'T2' })

    const field = (await f.router.handle('field.create', {
      tableId,
      name: 'Title',
      type: 'text',
      options: {},
      required: true,
    })) as { field: { id: string } }
    const fieldId = field.field.id

    expect(
      ((await f.router.handle('field.list', { tableId })) as { fields: unknown[] }).fields,
    ).toHaveLength(1)

    await f.router.handle('field.update', { fieldId, name: 'Title 2' })
    await f.router.handle('field.reorder', { tableId, order: [fieldId] })

    const rec = (await f.router.handle('record.create', {
      tableId,
      data: { [fieldId]: 'hello' },
    })) as { record: { id: string } }
    const recId = rec.record.id

    await f.router.handle('record.get', { tableId, recordId: recId })
    await f.router.handle('record.update', { tableId, recordId: recId, data: { [fieldId]: 'bye' } })

    const listed = (await f.router.handle('record.list', {
      tableId,
      limit: 10,
      offset: 0,
    })) as { total: number }
    expect(listed.total).toBe(1)

    const batched = (await f.router.handle('record.batch', {
      tableId,
      operations: [{ op: 'create', data: { [fieldId]: 'b1' } }],
    })) as { results: unknown[] }
    expect(batched.results).toHaveLength(1)

    const imported = (await f.router.handle('record.import', {
      tableId,
      rows: [{ [fieldId]: 'i1' }, { [fieldId]: 'i2' }],
    })) as { imported: number }
    expect(imported.imported).toBe(2)

    await f.router.handle('record.delete', { tableId, recordId: recId })
    await f.router.handle('field.delete', { fieldId })
    await f.router.handle('table.delete', { tableId })

    expect(
      ((await f.router.handle('table.list', {})) as { tables: unknown[] }).tables,
    ).toHaveLength(0)
  })

  it('routes core.health with missing params (undefined → {})', async () => {
    const r = (await f.router.handle('core.health', undefined)) as { ok: boolean }
    expect(r.ok).toBe(true)
  })
})
