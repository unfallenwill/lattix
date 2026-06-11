import type { LattixConnection } from '@lattix/client'
import type { Field, Table } from '@lattix/shared'
import {
  coerceForType,
  mapColumnsToFields,
  findTableByName,
  createTableFromHeader,
} from '../commands/import-csv-helpers.js'

function field(id: string, name: string, type: Field['type']): Field {
  return {
    id,
    tableId: 't',
    name,
    type,
    options: {},
    position: 1,
    required: false,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('coerceForType', () => {
  it('empty string → false for checkbox, null otherwise', () => {
    expect(coerceForType(field('f', 'x', 'checkbox'), '')).toBe(false)
    expect(coerceForType(field('f', 'x', 'number'), '   ')).toBeNull()
    expect(coerceForType(field('f', 'x', 'text'), '')).toBeNull()
    expect(coerceForType(field('f', 'x', 'date'), '')).toBeNull()
    expect(coerceForType(field('f', 'x', 'select'), '')).toBeNull()
  })

  it('checkbox truthy strings → true', () => {
    expect(coerceForType(field('f', 'x', 'checkbox'), 'true')).toBe(true)
    expect(coerceForType(field('f', 'x', 'checkbox'), 'YES')).toBe(true)
    expect(coerceForType(field('f', 'x', 'checkbox'), '1')).toBe(true)
    expect(coerceForType(field('f', 'x', 'checkbox'), 'no')).toBe(false)
    expect(coerceForType(field('f', 'x', 'checkbox'), 'whatever')).toBe(false)
  })

  it('number parses or returns null', () => {
    expect(coerceForType(field('f', 'x', 'number'), '42')).toBe(42)
    expect(coerceForType(field('f', 'x', 'number'), '3.14')).toBe(3.14)
    expect(coerceForType(field('f', 'x', 'number'), 'banana')).toBeNull()
  })

  it('date/select/text return the trimmed string', () => {
    expect(coerceForType(field('f', 'x', 'date'), ' 2026-01-01 ')).toBe('2026-01-01')
    expect(coerceForType(field('f', 'x', 'select'), 'opt1')).toBe('opt1')
    expect(coerceForType(field('f', 'x', 'text'), 'hello')).toBe('hello')
  })
})

describe('mapColumnsToFields', () => {
  it('matches columns to fields by normalised name', () => {
    const fields = [field('f1', 'Title', 'text'), field('f2', 'Priority', 'number')]
    const map = mapColumnsToFields([' title ', 'PRIORITY', 'Other'], fields)
    expect(map.get(0)?.id).toBe('f1')
    expect(map.get(1)?.id).toBe('f2')
    expect(map.has(2)).toBe(false)
  })

  it('returns an empty map when no columns match', () => {
    expect(mapColumnsToFields(['nope'], [field('f1', 'Other', 'text')])).toEqual(new Map())
  })
})

class FakeConn {
  tables: Table[] = []
  responses = new Map<string, unknown>()
  calls: Array<{ method: string; params?: unknown }> = []
  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    this.calls.push({ method, params })
    if (method === 'table.list') return Promise.resolve({ tables: this.tables } as T)
    if (this.responses.has(method)) return Promise.resolve(this.responses.get(method) as T)
    return Promise.resolve({} as T)
  }
}

describe('findTableByName', () => {
  it('throws when name is missing', async () => {
    const c = new FakeConn() as unknown as LattixConnection
    await expect(findTableByName(c, undefined)).rejects.toThrow(/Missing --table/)
  })
  it('throws when name does not exist', async () => {
    const c = new FakeConn()
    c.tables = [{ id: 't1', name: 'Other', description: null, createdAt: 0, updatedAt: 0 }]
    await expect(findTableByName(c as unknown as LattixConnection, 'Missing')).rejects.toThrow(
      /Table not found/,
    )
  })
  it('returns the matching table', async () => {
    const c = new FakeConn()
    const t: Table = { id: 't1', name: 'X', description: null, createdAt: 0, updatedAt: 0 }
    c.tables = [t]
    const r = await findTableByName(c as unknown as LattixConnection, 'X')
    expect(r.id).toBe('t1')
  })
})

describe('createTableFromHeader', () => {
  it('creates a table and one field per column', async () => {
    const c = new FakeConn()
    c.responses.set('table.create', {
      table: { id: 't1', name: 'Imported', description: null, createdAt: 0, updatedAt: 0 },
    })
    c.responses.set('field.create', { field: {} })
    const t = await createTableFromHeader(
      c as unknown as LattixConnection,
      ['a', 'b', ''],
      [['1', 'x', 'y']],
    )
    expect(t.id).toBe('t1')
    const fieldCreates = c.calls.filter((x) => x.method === 'field.create')
    expect(fieldCreates).toHaveLength(3)
    // empty header gets a fallback name
    const names = fieldCreates.map((x) => (x.params as { name: string }).name)
    expect(names[0]).toBe('a')
    expect(names[2]).toBe('col_3')
  })
})
