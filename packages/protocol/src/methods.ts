import { z } from 'zod'

/**
 * Method names supported by the Core in MVP v0. Adding a new method requires
 * defining a MethodDef (see method-def.ts and methods/) — METHOD_NAMES is
 * kept as a derived constant for backward compatibility but is no longer
 * the source of truth.
 */
export const METHOD_NAMES = [
  'core.health',
  'core.version',
  'table.list',
  'table.get',
  'table.create',
  'table.update',
  'table.delete',
  'field.list',
  'field.create',
  'field.update',
  'field.delete',
  'field.reorder',
  'record.list',
  'record.get',
  'record.create',
  'record.update',
  'record.delete',
  'record.batch',
  'record.import',
] as const

export type MethodName = (typeof METHOD_NAMES)[number]

// ---------------------------------------------------------------------------
// Field option schemas (used in table/field methods)
// ---------------------------------------------------------------------------

export const SelectOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional(),
})
export type SelectOption = z.infer<typeof SelectOptionSchema>

export const TextOptionsSchema = z.object({ multiline: z.boolean().optional() }).strict()
export type TextOptions = z.infer<typeof TextOptionsSchema>

export const NumberOptionsSchema = z
  .object({
    precision: z.number().int().min(0).max(10).optional(),
    format: z.enum(['decimal', 'integer', 'percent', 'currency']).optional(),
  })
  .strict()
export type NumberOptions = z.infer<typeof NumberOptionsSchema>

export const SelectOptionsSchema = z.object({ options: z.array(SelectOptionSchema) }).strict()
export type SelectOptions = z.infer<typeof SelectOptionsSchema>

export const CheckboxOptionsSchema = z.object({}).strict()
export type CheckboxOptions = z.infer<typeof CheckboxOptionsSchema>

export const DateOptionsSchema = z
  .object({
    includeTime: z.boolean().optional(),
    format: z.enum(['YYYY-MM-DD', 'YYYY-MM-DDTHH:mm:ssZ']).optional(),
  })
  .strict()
export type DateOptions = z.infer<typeof DateOptionsSchema>

export const FIELD_TYPES = ['text', 'number', 'select', 'checkbox', 'date'] as const
export type FieldType = (typeof FIELD_TYPES)[number]

// ---------------------------------------------------------------------------
// Reusable param schemas — referenced from method-def files in ./methods/
// ---------------------------------------------------------------------------

export const EmptyParamsSchema = z.object({}).strict()
export const TableIdParamsSchema = z.object({ tableId: z.string().min(1) }).strict()
export const FieldIdParamsSchema = z.object({ fieldId: z.string().min(1) }).strict()
export const RecordIdParamsSchema = z
  .object({ tableId: z.string().min(1), recordId: z.string().min(1) })
  .strict()

export const ListRecordsParamsSchema = z
  .object({
    tableId: z.string().min(1),
    limit: z.number().int().min(1).max(1000).default(100),
    offset: z.number().int().min(0).default(0),
    sortBy: z.string().min(1).optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
  })
  .strict()

// ---------------------------------------------------------------------------
// CRUD param schemas — moved here from shared/types.ts so MethodDef files
// (which live in protocol) can reference them without an upward dep on
// shared. The shared package re-exports them for backward compat.
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
    type: z.enum(FIELD_TYPES),
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

// ---------------------------------------------------------------------------
// Domain result schemas — minimal zod shapes for the wire payloads. They
// duplicate the TS interfaces in @lattix/shared on purpose: protocol must
// not import from shared, and zod schemas are what MethodDef result types
// flow from. Keep these in lockstep when types evolve.
// ---------------------------------------------------------------------------

export const TableSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export const FieldSchema = z.object({
  id: z.string(),
  tableId: z.string(),
  name: z.string(),
  type: z.enum(FIELD_TYPES),
  options: z.record(z.unknown()),
  position: z.number(),
  required: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export const RecordRowSchema = z.object({
  id: z.string(),
  tableId: z.string(),
  data: z.record(z.unknown()),
  createdAt: z.number(),
  updatedAt: z.number(),
})
