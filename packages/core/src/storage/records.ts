import type { Database, Statement } from 'better-sqlite3'
import { ulid } from 'ulidx'
import { ProtocolException } from '@lattix/protocol'
import type { RecordRow } from '@lattix/shared'

export interface ListRecordsOptions {
  tableId: string
  limit: number
  offset: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  /**
   * When sortBy is a field id (not a system column like 'updated_at' /
   * 'created_at'), the caller passes the resolved sort SQL mode so we
   * know how to coerce the JSON value extracted from `data`:
   *   - 'numeric'  →  CAST(... AS REAL)
   *   - 'date'     →  text compare (ISO dates sort lexicographically)
   *   - 'boolean'  →  CAST(... AS INTEGER)
   *   - 'natural'  →  plain text compare
   * If omitted the caller is expected to use a system column key.
   */
  sortFieldMode?: 'numeric' | 'date' | 'boolean' | 'natural'
}

export interface IRecordStorage {
  list(opts: ListRecordsOptions): { records: RecordRow[]; total: number }
  get(tableId: string, recordId: string): RecordRow | null
  create(tableId: string, data: Record<string, unknown>): RecordRow
  update(tableId: string, recordId: string, data: Record<string, unknown>): RecordRow
  delete(tableId: string, recordId: string): void
  countByTable(tableId: string): number
}

interface RecRow {
  id: string
  table_id: string
  data: string
  created_at: number
  updated_at: number
}

function rowToRecord(r: RecRow): RecordRow {
  return {
    id: r.id,
    tableId: r.table_id,
    data: safeJsonParse(r.data),
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

export class SqliteRecordStorage implements IRecordStorage {
  private readonly insert: Statement
  private readonly selectById: Statement
  private readonly updateStmt: Statement
  private readonly deleteStmt: Statement
  private readonly countStmt: Statement

  constructor(private readonly db: Database) {
    this.insert = db.prepare(
      `INSERT INTO tbl_record (id, table_id, data, created_at, updated_at)
       VALUES (@id, @table_id, @data, @created_at, @updated_at)`,
    )
    this.selectById = db.prepare(`SELECT * FROM tbl_record WHERE id = ? AND table_id = ?`)
    this.updateStmt = db.prepare(
      `UPDATE tbl_record
       SET data = @data, updated_at = @updated_at
       WHERE id = @id AND table_id = @table_id`,
    )
    this.deleteStmt = db.prepare(`DELETE FROM tbl_record WHERE id = ? AND table_id = ?`)
    this.countStmt = db.prepare(`SELECT COUNT(*) as n FROM tbl_record WHERE table_id = ?`)
  }

  list(opts: ListRecordsOptions): { records: RecordRow[]; total: number } {
    const total = (this.countStmt.get(opts.tableId) as { n: number }).n
    const dir = opts.sortDir === 'desc' ? 'DESC' : 'ASC'
    const sortKey = opts.sortBy ?? 'updated_at'
    // Two sort paths:
    //   1. system column (updated_at / created_at) — order by column directly
    //   2. field id (caller passes sortFieldMode) — order by JSON_EXTRACT
    let orderBy: string
    if (opts.sortFieldMode) {
      // sortBy is a field id; SQLite's JSON1 path syntax is literal-only,
      // so the id has to be safe. We accept only ULID-ish chars to keep
      // raw-SQL safe even if the caller forgot to validate.
      if (!/^[A-Za-z0-9_-]+$/.test(sortKey)) {
        throw new ProtocolException('BAD_REQUEST', `Invalid field id for sort: ${sortKey}`)
      }
      const extract = `JSON_EXTRACT(data, '$.${sortKey}')`
      switch (opts.sortFieldMode) {
        case 'numeric':
          orderBy = `CAST(${extract} AS REAL) ${dir}`
          break
        case 'boolean':
          orderBy = `CAST(${extract} AS INTEGER) ${dir}`
          break
        case 'date':
        case 'natural':
        default:
          orderBy = `${extract} ${dir}`
      }
    } else {
      if (!['updated_at', 'created_at'].includes(sortKey)) {
        throw new ProtocolException('BAD_REQUEST', `Unsupported sort key: ${sortKey}`)
      }
      orderBy = `${sortKey} ${dir}`
    }
    const sql = `SELECT * FROM tbl_record WHERE table_id = ?
                 ORDER BY ${orderBy}, id ${dir}
                 LIMIT ? OFFSET ?`
    const rows = this.db.prepare(sql).all(opts.tableId, opts.limit, opts.offset) as RecRow[]
    return { records: rows.map(rowToRecord), total }
  }

  get(tableId: string, recordId: string): RecordRow | null {
    const row = this.selectById.get(recordId, tableId) as RecRow | undefined
    return row ? rowToRecord(row) : null
  }

  create(tableId: string, data: Record<string, unknown>): RecordRow {
    const now = Date.now()
    const row: RecRow = {
      id: ulid(),
      table_id: tableId,
      data: JSON.stringify(data),
      created_at: now,
      updated_at: now,
    }
    this.insert.run(row)
    return rowToRecord(row)
  }

  update(tableId: string, recordId: string, data: Record<string, unknown>): RecordRow {
    const existing = this.get(tableId, recordId)
    if (!existing) throw new ProtocolException('NOT_FOUND', `Record not found: ${recordId}`)
    const next: RecordRow = {
      ...existing,
      data: { ...existing.data, ...data },
      updatedAt: Date.now(),
    }
    this.updateStmt.run({
      id: next.id,
      table_id: next.tableId,
      data: JSON.stringify(next.data),
      updated_at: next.updatedAt,
    })
    return next
  }

  delete(tableId: string, recordId: string): void {
    const info = this.deleteStmt.run(recordId, tableId)
    if (info.changes === 0) {
      throw new ProtocolException('NOT_FOUND', `Record not found: ${recordId}`)
    }
  }

  countByTable(tableId: string): number {
    return (this.countStmt.get(tableId) as { n: number }).n
  }
}
