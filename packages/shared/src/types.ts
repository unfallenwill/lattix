import type { FieldType } from '@lattix/protocol'

/**
 * Domain types for the multi-dimensional table engine.
 *
 * These shapes are the source of truth for what crosses the protocol
 * boundary, what gets stored in SQLite, and what the TUI renders.
 *
 * NOTE: the row type is `RecordRow` rather than `Record` to avoid
 * shadowing the built-in `Record<K, V>` utility type.
 *
 * The matching zod schemas live in @lattix/protocol (TableSchema /
 * FieldSchema / RecordRowSchema) so MethodDef result types can flow
 * through them; the TS interfaces here are kept for ergonomics and
 * because not everyone wants to import zod just to type a record.
 */

export interface Table {
  id: string
  name: string
  description: string | null
  createdAt: number
  updatedAt: number
}

export interface Field {
  id: string
  tableId: string
  name: string
  type: FieldType
  options: Record<string, unknown>
  position: number
  required: boolean
  createdAt: number
  updatedAt: number
}

export interface RecordRow {
  id: string
  tableId: string
  data: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface RecordWithCells extends RecordRow {
  /** Values laid out in field order. Always aligned with `fields` of the same table. */
  cells: unknown[]
}

// ---------------------------------------------------------------------------
// CRUD param schemas — moved to @lattix/protocol so MethodDef objects can
// reference them. Re-exported here so existing call sites keep working.
// ---------------------------------------------------------------------------

export {
  TableCreateParamsSchema,
  TableUpdateParamsSchema,
  FieldCreateParamsSchema,
  FieldUpdateParamsSchema,
  FieldReorderParamsSchema,
  RecordCreateParamsSchema,
  RecordUpdateParamsSchema,
  RecordBatchOpSchema,
  RecordBatchParamsSchema,
  RecordImportParamsSchema,
  type RecordBatchOp,
} from '@lattix/protocol'
