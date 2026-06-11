import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { LattixConnection } from '@lattix/client'
import type { Field, Table } from '@lattix/shared'
import { runImport } from '../commands/import-csv.js'

class FakeConn {
  tables: Table[] = []
  fields: Field[] = []
  batches: unknown[] = []
  closed = false
  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (method === 'table.list') return Promise.resolve({ tables: this.tables } as T)
    if (method === 'field.list') return Promise.resolve({ fields: this.fields } as T)
    if (method === 'record.batch') {
      const p = params as { operations: unknown[] }
      this.batches.push(p.operations)
      return Promise.resolve({ results: p.operations.map(() => null) } as T)
    }
    if (method === 'table.create') {
      const p = params as { name: string }
      const t: Table = {
        id: 't_new',
        name: p.name,
        description: null,
        createdAt: 0,
        updatedAt: 0,
      }
      this.tables.push(t)
      return Promise.resolve({ table: t } as T)
    }
    if (method === 'field.create') {
      const p = params as { name: string; type: Field['type'] }
      const f: Field = {
        id: `f_${this.fields.length + 1}`,
        tableId: 't_new',
        name: p.name,
        type: p.type,
        options: {},
        position: this.fields.length + 1,
        required: false,
        createdAt: 0,
        updatedAt: 0,
      }
      this.fields.push(f)
      return Promise.resolve({ field: f } as T)
    }
    return Promise.reject(new Error(`unmocked: ${method}`))
  }
  close(): Promise<void> {
    this.closed = true
    return Promise.resolve()
  }
}

function writeTmpCsv(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattix-csv-'))
  const file = path.join(dir, 'data.csv')
  fs.writeFileSync(file, content)
  return file
}

describe('runImport', () => {
  it('imports CSV rows into an existing table', async () => {
    const fake = new FakeConn()
    fake.tables = [{ id: 't1', name: 'Tasks', description: null, createdAt: 0, updatedAt: 0 }]
    fake.fields = [
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
    ]
    const file = writeTmpCsv('Title\nhello\nworld\n')

    const res = await runImport({
      file,
      tableName: 'Tasks',
      connect: () => Promise.resolve(fake as unknown as LattixConnection),
    })
    expect(res.imported).toBe(2)
    expect(res.errors).toBe(0)
    expect(fake.closed).toBe(true)
  })

  it('autoCreate path creates table + fields from header', async () => {
    const fake = new FakeConn()
    const file = writeTmpCsv('Name,Count\nfoo,1\nbar,2\n')
    const res = await runImport({
      file,
      autoCreate: true,
      connect: () => Promise.resolve(fake as unknown as LattixConnection),
    })
    expect(res.imported).toBe(2)
    expect(fake.tables).toHaveLength(1)
    expect(fake.fields).toHaveLength(2)
  })

  it('throws when no header matches any field', async () => {
    const fake = new FakeConn()
    fake.tables = [{ id: 't1', name: 'Tasks', description: null, createdAt: 0, updatedAt: 0 }]
    fake.fields = [] // no fields → no matches
    const file = writeTmpCsv('A,B\n1,2\n')
    await expect(
      runImport({
        file,
        tableName: 'Tasks',
        connect: () => Promise.resolve(fake as unknown as LattixConnection),
      }),
    ).rejects.toThrow(/No CSV columns match/)
  })

  it('throws on empty CSV', async () => {
    const fake = new FakeConn()
    const file = writeTmpCsv('')
    await expect(
      runImport({
        file,
        tableName: 'X',
        connect: () => Promise.resolve(fake as unknown as LattixConnection),
      }),
    ).rejects.toThrow(/CSV is empty/)
  })

  it('throws on CSV with header only (no data rows)', async () => {
    const fake = new FakeConn()
    const file = writeTmpCsv('A,B\n')
    await expect(
      runImport({
        file,
        tableName: 'X',
        connect: () => Promise.resolve(fake as unknown as LattixConnection),
      }),
    ).rejects.toThrow(/no data rows/)
  })

  it('counts errors when a batch fails', async () => {
    const fake = new FakeConn()
    fake.tables = [{ id: 't1', name: 'T', description: null, createdAt: 0, updatedAt: 0 }]
    fake.fields = [
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
    ]
    // override request: fail record.batch only
    const orig = fake.request.bind(fake)
    fake.request = ((m: string, p?: unknown) => {
      if (m === 'record.batch') return Promise.reject(new Error('boom'))
      return orig(m, p)
    }) as typeof fake.request

    const file = writeTmpCsv('Title\nA\nB\nC\n')
    const res = await runImport({
      file,
      tableName: 'T',
      batchSize: 2,
      connect: () => Promise.resolve(fake as unknown as LattixConnection),
    })
    expect(res.imported).toBe(0)
    expect(res.errors).toBe(3)
  })
})
