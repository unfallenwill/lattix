import type { Database, Statement } from 'better-sqlite3'
import { ulid } from 'ulidx'
import { ProtocolException, type FieldType } from '@lattix/protocol'
import type { Field } from '@lattix/shared'

export interface IFieldStorage {
  listByTable(tableId: string): Field[]
  get(id: string): Field | null
  create(input: {
    tableId: string
    name: string
    type: FieldType
    options: Record<string, unknown>
    required: boolean
  }): Field
  update(
    id: string,
    input: { name?: string; options?: Record<string, unknown>; required?: boolean },
  ): Field
  delete(id: string): void
  reorder(tableId: string, order: string[]): void
  nextPosition(tableId: string): number
}

interface FieldRow {
  id: string
  table_id: string
  name: string
  type: FieldType
  options: string
  position: number
  required: number
  created_at: number
  updated_at: number
}

function rowToField(r: FieldRow): Field {
  return {
    id: r.id,
    tableId: r.table_id,
    name: r.name,
    type: r.type,
    options: safeJsonParse(r.options),
    position: r.position,
    required: r.required !== 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function safeJsonParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const m = err.message
  return m.includes('UNIQUE constraint failed') || m.includes('SQLITE_CONSTRAINT_UNIQUE')
}

export class SqliteFieldStorage implements IFieldStorage {
  private readonly insert: Statement
  private readonly selectById: Statement
  private readonly selectByTable: Statement
  private readonly updateStmt: Statement
  private readonly deleteStmt: Statement
  private readonly countByTable: Statement
  private readonly reorderStmt: Statement

  constructor(private readonly db: Database) {
    this.insert = db.prepare(
      `INSERT INTO tbl_field (id, table_id, name, type, options, position, required, created_at, updated_at)
       VALUES (@id, @table_id, @name, @type, @options, @position, @required, @created_at, @updated_at)`,
    )
    this.selectById = db.prepare(`SELECT * FROM tbl_field WHERE id = ?`)
    this.selectByTable = db.prepare(
      `SELECT * FROM tbl_field WHERE table_id = ? ORDER BY position ASC`,
    )
    this.updateStmt = db.prepare(
      `UPDATE tbl_field
       SET name = @name, options = @options, required = @required, updated_at = @updated_at
       WHERE id = @id`,
    )
    this.deleteStmt = db.prepare(`DELETE FROM tbl_field WHERE id = ?`)
    this.countByTable = db.prepare(`SELECT COUNT(*) as n FROM tbl_field WHERE table_id = ?`)
    this.reorderStmt = db.prepare(`UPDATE tbl_field SET position = ? WHERE id = ? AND table_id = ?`)
  }

  listByTable(tableId: string): Field[] {
    const rows = this.selectByTable.all(tableId) as FieldRow[]
    return rows.map(rowToField)
  }

  get(id: string): Field | null {
    const row = this.selectById.get(id) as FieldRow | undefined
    return row ? rowToField(row) : null
  }

  nextPosition(tableId: string): number {
    const r = this.countByTable.get(tableId) as { n: number } | undefined
    return (r?.n ?? 0) + 1
  }

  create(input: {
    tableId: string
    name: string
    type: FieldType
    options: Record<string, unknown>
    required: boolean
  }): Field {
    const now = Date.now()
    const row: FieldRow = {
      id: ulid(),
      table_id: input.tableId,
      name: input.name,
      type: input.type,
      options: JSON.stringify(input.options),
      position: this.nextPosition(input.tableId),
      required: input.required ? 1 : 0,
      created_at: now,
      updated_at: now,
    }
    try {
      this.insert.run(row)
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ProtocolException('CONFLICT', `Field name already exists in table: ${input.name}`)
      }
      throw err
    }
    return rowToField(row)
  }

  update(
    id: string,
    input: { name?: string; options?: Record<string, unknown>; required?: boolean },
  ): Field {
    const existing = this.get(id)
    if (!existing) throw new ProtocolException('NOT_FOUND', `Field not found: ${id}`)
    const next: Field = {
      ...existing,
      name: input.name ?? existing.name,
      options: input.options ?? existing.options,
      required: input.required ?? existing.required,
      updatedAt: Date.now(),
    }
    try {
      this.updateStmt.run({
        id: next.id,
        name: next.name,
        options: JSON.stringify(next.options),
        required: next.required ? 1 : 0,
        updated_at: next.updatedAt,
      })
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ProtocolException('CONFLICT', `Field name already exists: ${next.name}`)
      }
      throw err
    }
    return next
  }

  delete(id: string): void {
    const info = this.deleteStmt.run(id)
    if (info.changes === 0) {
      throw new ProtocolException('NOT_FOUND', `Field not found: ${id}`)
    }
  }

  reorder(tableId: string, order: string[]): void {
    const existing = this.listByTable(tableId)
    const known = new Set(existing.map((f) => f.id))
    if (order.length !== existing.length || !order.every((id) => known.has(id))) {
      throw new ProtocolException('BAD_REQUEST', 'Reorder list does not match table fields')
    }
    const tx = this.db.transaction((pairs: Array<[number, string]>) => {
      for (const [position, id] of pairs) this.reorderStmt.run(position, id, tableId)
    })
    tx(order.map((id, i) => [i + 1, id] as [number, string]))
  }
}
