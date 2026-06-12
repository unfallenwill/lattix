import { ProtocolException, toProtocolError, type MethodDef } from '@lattix/protocol'
import {
  ALL_METHODS,
  type AllMethods,
  type MethodKey,
  type ParsedParamsOf,
  type ResultOf,
} from '@lattix/protocol'
import { type FieldRegistry, toWireManifest } from '@lattix/shared'
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

type Handler = (parsed: unknown) => Promise<unknown> | unknown

/**
 * Router is a typed dispatch table.
 *
 *   router.register(coreHealth, async () => ({ ok: true, ts: Date.now() }))
 *
 * The handler's params type comes from `def.paramsSchema`; its return
 * type must match `z.output<def.resultSchema>`. Both are enforced by
 * TypeScript at the `register()` call site.
 *
 * At dispatch time the Router runs `def.paramsSchema.safeParse(raw)`
 * before calling the handler; failure becomes a BAD_REQUEST protocol
 * error. Unknown methods become NOT_IMPLEMENTED.
 *
 * There is intentionally no per-method `case` and no `PARAM_SCHEMAS`
 * record — the MethodDef objects in @lattix/protocol are the single
 * source of truth. Adding a method = `defineMethod()` + `register()`.
 */
export class Router {
  private readonly handlers = new Map<string, Handler>()

  constructor(deps: RouterDeps) {
    registerBuiltinHandlers(this, deps)
  }

  register<D extends MethodDef>(
    def: D,
    handler: (params: ParsedParamsOf<D>) => Promise<ResultOf<D>> | ResultOf<D>,
  ): void {
    this.handlers.set(def.name, async (raw) => {
      const parsed = def.paramsSchema.safeParse(raw ?? {})
      if (!parsed.success) {
        throw new ProtocolException('BAD_REQUEST', 'Invalid params', parsed.error.format())
      }
      return handler(parsed.data as ParsedParamsOf<D>)
    })
  }

  async handle(method: string, rawParams: unknown): Promise<unknown> {
    const h = this.handlers.get(method)
    if (!h) {
      throw new ProtocolException('NOT_IMPLEMENTED', `Unknown method: ${method}`)
    }
    return h(rawParams)
  }
}

// All builtin handlers in one place. Each one is type-checked against the
// corresponding MethodDef's params + result schemas via Router.register.
function registerBuiltinHandlers(r: Router, deps: RouterDeps): void {
  const { tableService, fieldService, recordService, fields, serverVersion } = deps
  const m: AllMethods = ALL_METHODS

  r.register(m['core.health'], () => ({ ok: true, ts: Date.now() }))
  r.register(m['core.version'], () => ({
    serverVersion,
    protocolVersion: 1,
    storage: 'sqlite',
  }))

  r.register(m['table.list'], () => ({ tables: tableService.list() }))
  r.register(m['table.get'], (p) => ({ table: tableService.get(p.tableId) }))
  r.register(m['table.create'], (p) => ({ table: tableService.create(p) }))
  r.register(m['table.update'], (p) => ({ table: tableService.update(p.tableId, p) }))
  r.register(m['table.delete'], (p) => {
    tableService.delete(p.tableId)
    return { deleted: true as const }
  })

  r.register(m['field.list'], (p) => ({ fields: fieldService.list(p.tableId) }))
  r.register(m['field.create'], (p) => ({ field: fieldService.create(p) }))
  r.register(m['field.update'], (p) => ({ field: fieldService.update(p.fieldId, p) }))
  r.register(m['field.delete'], (p) => {
    fieldService.delete(p.fieldId)
    return { deleted: true as const }
  })
  r.register(m['field.reorder'], (p) => {
    fieldService.reorder(p.tableId, p.order)
    return { ok: true as const }
  })
  r.register(m['field.types.list'], () => ({
    types: fields.list().map((manifest) => toWireManifest(manifest)),
  }))

  r.register(m['record.list'], (p) => recordService.list(p))
  r.register(m['record.get'], (p) => ({ record: recordService.get(p.tableId, p.recordId) }))
  r.register(m['record.create'], (p) => ({ record: recordService.create(p) }))
  r.register(m['record.update'], (p) => ({ record: recordService.update(p) }))
  r.register(m['record.delete'], (p) => {
    recordService.delete(p.tableId, p.recordId)
    return { deleted: true as const }
  })
  r.register(m['record.batch'], (p) => recordService.batch(p))
  r.register(m['record.import'], (p) => recordService.import(p))
}

// Re-exported for callers that already import from '@lattix/core'.
export { toProtocolError }
// Re-export for tests that want to drive Router.handle by name.
export type { MethodKey }
