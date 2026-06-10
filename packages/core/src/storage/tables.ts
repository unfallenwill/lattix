import type { Database, Statement } from 'better-sqlite3'
import { ulid } from 'ulidx'
import { ProtocolException } from '@lattix/protocol'
import type { Table } from '@lattix/shared'

export interface ITableStorage {
  list(): Table[]
  get(id: string): Table | null
  getByName(name: string): Table | null
  create(input: { name: string; description?: string | null }): Table
  update(id: string, input: { name?: string; description?: string | null }): Table
  delete(id: string): void
}

interface TableRow {
  id: string
  name: string
  description: string | null
  created_at: number
  updated_at: number
}

function rowToTable(r: TableRow): Table {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message
  return msg.includes('UNIQUE constraint failed') || msg.includes('SQLITE_CONSTRAINT_UNIQUE')
}

export class SqliteTableStorage implements ITableStorage {
  private readonly insert: Statement
  private readonly selectById: Statement
  private readonly selectByName: Statement
  private readonly selectAll: Statement
  private readonly updateStmt: Statement
  private readonly deleteStmt: Statement

  constructor(db: Database) {
    this.insert = db.prepare(
      `INSERT INTO tbl_table (id, name, description, created_at, updated_at)
       VALUES (@id, @name, @description, @created_at, @updated_at)`,
    )
    this.selectById = db.prepare(`SELECT * FROM tbl_table WHERE id = ?`)
    this.selectByName = db.prepare(`SELECT * FROM tbl_table WHERE name = ?`)
    this.selectAll = db.prepare(`SELECT * FROM tbl_table ORDER BY created_at ASC`)
    this.updateStmt = db.prepare(
      `UPDATE tbl_table
       SET name = @name, description = @description, updated_at = @updated_at
       WHERE id = @id`,
    )
    this.deleteStmt = db.prepare(`DELETE FROM tbl_table WHERE id = ?`)
  }

  list(): Table[] {
    const rows = this.selectAll.all() as TableRow[]
    return rows.map(rowToTable)
  }

  get(id: string): Table | null {
    const row = this.selectById.get(id) as TableRow | undefined
    return row ? rowToTable(row) : null
  }

  getByName(name: string): Table | null {
    const row = this.selectByName.get(name) as TableRow | undefined
    return row ? rowToTable(row) : null
  }

  create(input: { name: string; description?: string | null }): Table {
    const now = Date.now()
    const row: TableRow = {
      id: ulid(),
      name: input.name,
      description: input.description ?? null,
      created_at: now,
      updated_at: now,
    }
    try {
      this.insert.run(row)
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ProtocolException('CONFLICT', `Table name already exists: ${input.name}`)
      }
      throw err
    }
    return rowToTable(row)
  }

  update(id: string, input: { name?: string; description?: string | null }): Table {
    const existing = this.get(id)
    if (!existing) throw new ProtocolException('NOT_FOUND', `Table not found: ${id}`)
    const next: Table = {
      ...existing,
      name: input.name ?? existing.name,
      description: input.description === undefined ? existing.description : input.description,
      updatedAt: Date.now(),
    }
    try {
      this.updateStmt.run({
        id: next.id,
        name: next.name,
        description: next.description,
        updated_at: next.updatedAt,
      })
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ProtocolException('CONFLICT', `Table name already exists: ${next.name}`)
      }
      throw err
    }
    return next
  }

  delete(id: string): void {
    const info = this.deleteStmt.run(id)
    if (info.changes === 0) {
      throw new ProtocolException('NOT_FOUND', `Table not found: ${id}`)
    }
  }
}
