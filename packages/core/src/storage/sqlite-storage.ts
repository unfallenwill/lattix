import BetterSqlite3 from 'better-sqlite3'
import type { Database, RunResult } from 'better-sqlite3'
import { SCHEMA_STATEMENTS, SCHEMA_VERSION } from './schema.js'
import { SqliteTableStorage, type ITableStorage } from './tables.js'
import { SqliteFieldStorage, type IFieldStorage } from './fields.js'
import { SqliteRecordStorage, type IRecordStorage } from './records.js'

export interface IStorage {
  runInTransaction<T>(fn: () => T): T
  close(): void
  readonly tables: ITableStorage
  readonly fields: IFieldStorage
  readonly records: IRecordStorage
}

export interface StorageOptions {
  // Path to the SQLite file. Use ':memory:' for tests.
  dbPath: string
  // Disable WAL (mostly for in-memory tests). Defaults to false (i.e. WAL on).
  disableWAL?: boolean
}

// Single class that owns the SQLite connection. All DB access goes through
// this layer — Router/Service must not touch better-sqlite3 directly.
export class SqliteStorage implements IStorage {
  private readonly db: Database

  readonly tables: ITableStorage
  readonly fields: IFieldStorage
  readonly records: IRecordStorage

  constructor(opts: StorageOptions) {
    this.db = new BetterSqlite3(opts.dbPath)
    if (!opts.disableWAL) this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.applySchema()
    this.tables = new SqliteTableStorage(this.db)
    this.fields = new SqliteFieldStorage(this.db)
    this.records = new SqliteRecordStorage(this.db)
  }

  runInTransaction<T>(fn: () => T): T {
    // BEGIN IMMEDIATE acquires a write lock at the start of the tx,
    // matching PRD §6.3 (single tx per request, no write skew).
    const tx = this.db.transaction(fn)
    return tx.immediate()
  }

  close(): void {
    this.db.close()
  }

  private applySchema(): void {
    const run = this.db.transaction(() => {
      for (const stmt of SCHEMA_STATEMENTS) this.db.exec(stmt)
    })
    run()
    // Record schema version (idempotent).
    this.db
      .prepare(
        `INSERT INTO workspace_meta (key, value) VALUES ('schema_version', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(String(SCHEMA_VERSION))
  }
}

export type { RunResult }
