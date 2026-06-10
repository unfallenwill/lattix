import { z } from 'zod'

/**
 * Method names supported by the Core in MVP v0. Adding a new method requires
 * defining its params + result zod schema here, then registering a handler in
 * the Core Router.
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
// Param schemas — `z.unknown()` is used for `params` so the Router can pass
// raw data to per-method validators. Concrete schemas live in shared/.
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
