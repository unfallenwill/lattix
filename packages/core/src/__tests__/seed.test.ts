import { seedIfEmpty } from '../seed.js'
import { makeFixture, type CoreFixture } from './_fixture.js'

describe('seedIfEmpty', () => {
  let f: CoreFixture
  beforeEach(() => {
    f = makeFixture()
  })
  afterEach(() => f.close())

  it('seeds one table with 5 fields and 5 records when empty', () => {
    seedIfEmpty(f.storage, f.fields)
    const tables = f.storage.tables.list()
    expect(tables).toHaveLength(1)
    const tableId = tables[0]!.id
    expect(f.storage.fields.listByTable(tableId)).toHaveLength(5)
    expect(f.storage.records.list({ tableId, limit: 100, offset: 0 }).total).toBe(5)
  })

  it('is idempotent: running again does not duplicate data', () => {
    seedIfEmpty(f.storage, f.fields)
    seedIfEmpty(f.storage, f.fields)
    expect(f.storage.tables.list()).toHaveLength(1)
  })

  it('does not seed if any table already exists', () => {
    f.storage.tables.create({ name: 'Pre-existing' })
    seedIfEmpty(f.storage, f.fields)
    expect(f.storage.tables.list()).toHaveLength(1)
    expect(f.storage.tables.list()[0]!.name).toBe('Pre-existing')
  })
})
