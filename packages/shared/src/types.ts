import { z } from 'zod'
import type { FieldType } from '@lattix/protocol'

/**
 * Domain types for the multi-dimensional table engine.
 *
 * These shapes are the source of truth for what crosses the protocol
 * boundary, what gets stored in SQLite, and what the TUI renders.
 *
 * NOTE: the row type is `RecordRow` rather than `Record` to avoid
 * shadowing the built-in `Record<K, V>` utility type.
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
// CRUD param schemas (used by Core service layer + protocol handlers)
// ---------------------------------------------------------------------------

export const TableCreateParamsSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(2000).nullable().optional(),
  })
  .strict()

export const TableUpdateParamsSchema = z
  .object({
    tableId: z.string().min(1),
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).nullable().optional(),
  })
  .strict()

export const FieldCreateParamsSchema = z
  .object({
    tableId: z.string().min(1),
    name: z.string().min(1).max(120),
    type: z.enum(['text', 'number', 'select', 'checkbox', 'date']),
    options: z.record(z.unknown()).default({}),
    required: z.boolean().default(false),
  })
  .strict()

export const FieldUpdateParamsSchema = z
  .object({
    fieldId: z.string().min(1),
    name: z.string().min(1).max(120).optional(),
    options: z.record(z.unknown()).optional(),
    required: z.boolean().optional(),
  })
  .strict()

export const FieldReorderParamsSchema = z
  .object({
    tableId: z.string().min(1),
    order: z.array(z.string().min(1)),
  })
  .strict()

export const RecordCreateParamsSchema = z
  .object({
    tableId: z.string().min(1),
    data: z.record(z.unknown()),
  })
  .strict()

export const RecordUpdateParamsSchema = z
  .object({
    tableId: z.string().min(1),
    recordId: z.string().min(1),
    data: z.record(z.unknown()),
  })
  .strict()

export const RecordBatchOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create'), data: z.record(z.unknown()) }).strict(),
  z
    .object({
      op: z.literal('update'),
      recordId: z.string().min(1),
      data: z.record(z.unknown()),
    })
    .strict(),
  z.object({ op: z.literal('delete'), recordId: z.string().min(1) }).strict(),
])
export type RecordBatchOp = z.infer<typeof RecordBatchOpSchema>

export const RecordBatchParamsSchema = z
  .object({
    tableId: z.string().min(1),
    operations: z.array(RecordBatchOpSchema).min(1).max(1000),
  })
  .strict()

export const RecordImportParamsSchema = z
  .object({
    tableId: z.string().min(1),
    rows: z.array(z.record(z.unknown())).min(1),
  })
  .strict()
