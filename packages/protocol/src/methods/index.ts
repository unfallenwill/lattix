/**
 * MethodDef SSOT — every wire method declared once, with paramsSchema,
 * resultSchema, and a one-line summary. Anything that wants to know about
 * a method (Router for handler registration, client SDK for typed
 * generation, future docs/schema dumps) imports from here.
 */
import { z } from 'zod'
import { defineMethod } from '../method-def.js'
import {
  EmptyParamsSchema,
  FieldCreateParamsSchema,
  FieldIdParamsSchema,
  FieldReorderParamsSchema,
  FieldSchema,
  FieldUpdateParamsSchema,
  FIELD_TYPES,
  ListRecordsParamsSchema,
  RecordBatchParamsSchema,
  RecordCreateParamsSchema,
  RecordIdParamsSchema,
  RecordImportParamsSchema,
  RecordRowSchema,
  RecordUpdateParamsSchema,
  TableCreateParamsSchema,
  TableIdParamsSchema,
  TableSchema,
  TableUpdateParamsSchema,
} from '../methods.js'

// --- field type manifest (wire shape) ----------------------------------
//
// Mirrors @lattix/shared's FieldTypeManifestWire — duplicated here because
// protocol must not import from shared, and result schemas have to be
// zod objects living inside protocol. Keep in lockstep.
const FilterOpEnum = z.enum([
  'eq',
  'neq',
  'lt',
  'lte',
  'gt',
  'gte',
  'contains',
  'starts_with',
  'ends_with',
  'is_empty',
  'is_not_empty',
])
const SortModeEnum = z.enum(['natural', 'numeric', 'date', 'boolean', 'none'])
const AggregateOpEnum = z.enum(['count', 'count_unique', 'count_empty', 'sum', 'avg', 'min', 'max'])
const FieldCategoryEnum = z.enum(['primitive', 'reference', 'computed', 'system', 'attachment'])

const FieldTypeManifestWireSchema = z.object({
  id: z.enum(FIELD_TYPES),
  version: z.number().int(),
  category: FieldCategoryEnum,
  display: z.object({
    displayName: z.string(),
    description: z.string(),
    icon: z
      .object({
        emoji: z.string().optional(),
        ascii: z.string().optional(),
      })
      .optional(),
  }),
  storage: z.object({
    sqlType: z.enum(['TEXT', 'INTEGER', 'REAL', 'BLOB']),
    indexable: z.boolean(),
  }),
  operators: z.object({
    filter: z.array(FilterOpEnum),
    sort: SortModeEnum,
    aggregate: z.array(AggregateOpEnum),
  }),
  // any() is non-optional in zod's inference, unlike unknown(). The wire
  // shape always carries these fields; consumers should treat them as
  // arbitrary JSON, not as zod-validated.
  optionsSchema: z.any(),
  valueSchema: z.any(),
})

// --- core --------------------------------------------------------------

export const coreHealth = defineMethod({
  name: 'core.health',
  summary: 'Liveness check; returns {ok, ts}.',
  paramsSchema: EmptyParamsSchema,
  resultSchema: z.object({ ok: z.boolean(), ts: z.number() }),
})

export const coreVersion = defineMethod({
  name: 'core.version',
  summary: 'Server + protocol version and storage backend identifier.',
  paramsSchema: EmptyParamsSchema,
  resultSchema: z.object({
    serverVersion: z.string(),
    protocolVersion: z.number(),
    storage: z.string(),
  }),
})

// --- table --------------------------------------------------------------

export const tableList = defineMethod({
  name: 'table.list',
  summary: 'List all tables in the workspace.',
  paramsSchema: EmptyParamsSchema,
  resultSchema: z.object({ tables: z.array(TableSchema) }),
})

export const tableGet = defineMethod({
  name: 'table.get',
  summary: 'Get one table by id.',
  paramsSchema: TableIdParamsSchema,
  resultSchema: z.object({ table: TableSchema }),
})

export const tableCreate = defineMethod({
  name: 'table.create',
  summary: 'Create a new table.',
  paramsSchema: TableCreateParamsSchema,
  resultSchema: z.object({ table: TableSchema }),
})

export const tableUpdate = defineMethod({
  name: 'table.update',
  summary: 'Update a table (name and/or description).',
  paramsSchema: TableUpdateParamsSchema,
  resultSchema: z.object({ table: TableSchema }),
})

export const tableDelete = defineMethod({
  name: 'table.delete',
  summary: 'Delete a table and cascade its fields + records.',
  paramsSchema: TableIdParamsSchema,
  resultSchema: z.object({ deleted: z.literal(true) }),
})

// --- field --------------------------------------------------------------

export const fieldList = defineMethod({
  name: 'field.list',
  summary: 'List fields of a table in position order.',
  paramsSchema: TableIdParamsSchema,
  resultSchema: z.object({ fields: z.array(FieldSchema) }),
})

export const fieldCreate = defineMethod({
  name: 'field.create',
  summary: 'Create a field on a table.',
  paramsSchema: FieldCreateParamsSchema,
  resultSchema: z.object({ field: FieldSchema }),
})

export const fieldUpdate = defineMethod({
  name: 'field.update',
  summary: 'Update a field name / options / required flag.',
  paramsSchema: FieldUpdateParamsSchema,
  resultSchema: z.object({ field: FieldSchema }),
})

export const fieldDelete = defineMethod({
  name: 'field.delete',
  summary: 'Delete a field; cells in that field disappear from every record.',
  paramsSchema: FieldIdParamsSchema,
  resultSchema: z.object({ deleted: z.literal(true) }),
})

export const fieldReorder = defineMethod({
  name: 'field.reorder',
  summary: 'Reorder fields by id list; affects field.position.',
  paramsSchema: FieldReorderParamsSchema,
  resultSchema: z.object({ ok: z.literal(true) }),
})

export const fieldTypesList = defineMethod({
  name: 'field.types.list',
  summary:
    'Describe every field type the runtime currently exposes — what they validate, what storage they use, what operators they support.',
  paramsSchema: EmptyParamsSchema,
  resultSchema: z.object({ types: z.array(FieldTypeManifestWireSchema) }),
})

// --- record -------------------------------------------------------------

export const recordList = defineMethod({
  name: 'record.list',
  summary: 'List records (paged + optional sort).',
  paramsSchema: ListRecordsParamsSchema,
  resultSchema: z.object({
    records: z.array(RecordRowSchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
  }),
})

export const recordGet = defineMethod({
  name: 'record.get',
  summary: 'Get one record by id.',
  paramsSchema: RecordIdParamsSchema,
  resultSchema: z.object({ record: RecordRowSchema }),
})

export const recordCreate = defineMethod({
  name: 'record.create',
  summary: 'Create a record.',
  paramsSchema: RecordCreateParamsSchema,
  resultSchema: z.object({ record: RecordRowSchema }),
})

export const recordUpdate = defineMethod({
  name: 'record.update',
  summary: 'Patch a record (partial data merge).',
  paramsSchema: RecordUpdateParamsSchema,
  resultSchema: z.object({ record: RecordRowSchema }),
})

export const recordDelete = defineMethod({
  name: 'record.delete',
  summary: 'Delete a record.',
  paramsSchema: RecordIdParamsSchema,
  resultSchema: z.object({ deleted: z.literal(true) }),
})

export const recordBatch = defineMethod({
  name: 'record.batch',
  summary: 'Apply up to 1000 create/update/delete operations atomically.',
  paramsSchema: RecordBatchParamsSchema,
  resultSchema: z.object({ results: z.array(RecordRowSchema.nullable()) }),
})

export const recordImport = defineMethod({
  name: 'record.import',
  summary: 'Bulk-import rows into a table.',
  paramsSchema: RecordImportParamsSchema,
  resultSchema: z.object({ imported: z.number() }),
})

// --- registry -----------------------------------------------------------

/**
 * Single source of truth: the complete set of wire methods.
 *
 * Keys are wire names (must match each def.name); values are the defs
 * themselves. The Router enumerates this to auto-register handlers; the
 * client SDK enumerates it to project typed methods.
 */
export const ALL_METHODS = {
  'core.health': coreHealth,
  'core.version': coreVersion,
  'table.list': tableList,
  'table.get': tableGet,
  'table.create': tableCreate,
  'table.update': tableUpdate,
  'table.delete': tableDelete,
  'field.list': fieldList,
  'field.create': fieldCreate,
  'field.update': fieldUpdate,
  'field.delete': fieldDelete,
  'field.reorder': fieldReorder,
  'field.types.list': fieldTypesList,
  'record.list': recordList,
  'record.get': recordGet,
  'record.create': recordCreate,
  'record.update': recordUpdate,
  'record.delete': recordDelete,
  'record.batch': recordBatch,
  'record.import': recordImport,
} as const

export type AllMethods = typeof ALL_METHODS
export type MethodKey = keyof AllMethods
