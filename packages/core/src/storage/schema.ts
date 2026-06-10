// The full SQL schema applied at Core startup. Keep this idempotent
// (use IF NOT EXISTS) so re-running it is safe. Schema version is
// recorded in workspace_meta and incremented in a migration step.

export const SCHEMA_VERSION = 1

export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS workspace_meta (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS tbl_table (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     description TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS tbl_field (
     id TEXT PRIMARY KEY,
     table_id TEXT NOT NULL REFERENCES tbl_table(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     type TEXT NOT NULL CHECK(type IN ('text','number','select','checkbox','date')),
     options TEXT NOT NULL DEFAULT '{}',
     position INTEGER NOT NULL,
     required INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS tbl_record (
     id TEXT PRIMARY KEY,
     table_id TEXT NOT NULL REFERENCES tbl_table(id) ON DELETE CASCADE,
     data TEXT NOT NULL DEFAULT '{}',
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_record_table ON tbl_record(table_id, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_field_table ON tbl_field(table_id, position)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_table_name ON tbl_table(name)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_field_table_name ON tbl_field(table_id, name)`,
]
