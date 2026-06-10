import { z } from 'zod'
import {
  EmptyParamsSchema,
  ListRecordsParamsSchema,
  METHOD_NAMES,
  ProtocolException,
  TableIdParamsSchema,
  toProtocolError,
  type MethodName,
} from '@lattix/protocol'
import {
  FieldCreateParamsSchema,
  FieldReorderParamsSchema,
  FieldUpdateParamsSchema,
  RecordBatchParamsSchema,
  RecordCreateParamsSchema,
  RecordUpdateParamsSchema,
  TableCreateParamsSchema,
  TableUpdateParamsSchema,
  type FieldRegistry,
} from '@lattix/shared'
import { type TableService } from './services/table-service.js'
import { type FieldService } from './services/field-service.js'
import { type RecordService } from './services/record-service.js'
import type { IStorage } from './storage/index.js'

export interface RouterDeps {
  storage: IStorage
  fields: FieldRegistry
  tableService: TableService
  fieldService: FieldService
  recordService: RecordService
  serverVersion: string
}

// Per-method param schemas. params is typed as unknown at the protocol
// boundary; the Router validates against the appropriate zod schema
// before delegating to the Service layer.
const PARAM_SCHEMAS: Record<MethodName, z.ZodTypeAny> = {
  'core.health': EmptyParamsSchema,
  'core.version': EmptyParamsSchema,
  'table.list': EmptyParamsSchema,
  'table.get': TableIdParamsSchema,
  'table.create': TableCreateParamsSchema,
  'table.update': TableUpdateParamsSchema,
  'table.delete': TableIdParamsSchema,
  'field.list': TableIdParamsSchema,
  'field.create': FieldCreateParamsSchema,
  'field.update': FieldUpdateParamsSchema,
  'field.delete': z.object({ fieldId: z.string().min(1) }).strict(),
  'field.reorder': FieldReorderParamsSchema,
  'record.list': ListRecordsParamsSchema,
  'record.get': z.object({ tableId: z.string().min(1), recordId: z.string().min(1) }).strict(),
  'record.create': RecordCreateParamsSchema,
  'record.update': RecordUpdateParamsSchema,
  'record.delete': z.object({ tableId: z.string().min(1), recordId: z.string().min(1) }).strict(),
  'record.batch': RecordBatchParamsSchema,
  'record.import': z
    .object({ tableId: z.string().min(1), rows: z.array(z.record(z.unknown())).min(1) })
    .strict(),
}

export class Router {
  private readonly known = new Set<string>(METHOD_NAMES)

  constructor(private readonly deps: RouterDeps) {}

  async handle(method: string, rawParams: unknown): Promise<unknown> {
    if (!this.known.has(method)) {
      throw new ProtocolException('NOT_IMPLEMENTED', `Unknown method: ${method}`)
    }
    const schema = PARAM_SCHEMAS[method as MethodName]
    const parsed = schema.safeParse(rawParams ?? {})
    if (!parsed.success) {
      throw new ProtocolException('BAD_REQUEST', 'Invalid params', parsed.error.format())
    }
    const params = parsed.data as Record<string, unknown>
    return this.dispatch(method, params)
  }

  private async dispatch(method: string, p: Record<string, unknown>): Promise<unknown> {
    const { tableService, fieldService, recordService } = this.deps
    switch (method) {
      case 'core.health':
        return { ok: true, ts: Date.now() }
      case 'core.version':
        return {
          serverVersion: this.deps.serverVersion,
          protocolVersion: 1,
          storage: 'sqlite',
        }
      case 'table.list':
        return { tables: tableService.list() }
      case 'table.get':
        return { table: tableService.get(p['tableId'] as string) }
      case 'table.create': {
        const params = p as unknown as z.infer<typeof TableCreateParamsSchema>
        return { table: tableService.create(params) }
      }
      case 'table.update': {
        const params = p as unknown as z.infer<typeof TableUpdateParamsSchema>
        return { table: tableService.update(params.tableId, params) }
      }
      case 'table.delete':
        tableService.delete(p['tableId'] as string)
        return { deleted: true }
      case 'field.list':
        return { fields: fieldService.list(p['tableId'] as string) }
      case 'field.create': {
        const params = p as unknown as z.infer<typeof FieldCreateParamsSchema>
        return { field: fieldService.create(params) }
      }
      case 'field.update': {
        const params = p as unknown as z.infer<typeof FieldUpdateParamsSchema>
        return { field: fieldService.update(params.fieldId, params) }
      }
      case 'field.delete':
        fieldService.delete(p['fieldId'] as string)
        return { deleted: true }
      case 'field.reorder': {
        const params = p as unknown as z.infer<typeof FieldReorderParamsSchema>
        fieldService.reorder(params.tableId, params.order)
        return { ok: true }
      }
      case 'record.list': {
        const params = p as unknown as z.infer<typeof ListRecordsParamsSchema>
        return recordService.list(params)
      }
      case 'record.get':
        return {
          record: recordService.get(p['tableId'] as string, p['recordId'] as string),
        }
      case 'record.create': {
        const params = p as unknown as z.infer<typeof RecordCreateParamsSchema>
        return { record: recordService.create(params) }
      }
      case 'record.update': {
        const params = p as unknown as z.infer<typeof RecordUpdateParamsSchema>
        return { record: recordService.update(params) }
      }
      case 'record.delete':
        recordService.delete(p['tableId'] as string, p['recordId'] as string)
        return { deleted: true }
      case 'record.batch': {
        const params = p as unknown as z.infer<typeof RecordBatchParamsSchema>
        return recordService.batch(params)
      }
      case 'record.import': {
        const params = p as unknown as {
          tableId: string
          rows: Array<Record<string, unknown>>
        }
        return recordService.import(params)
      }
    }
    throw new ProtocolException('NOT_IMPLEMENTED', `Method not implemented: ${method}`)
  }
}

export { toProtocolError }
