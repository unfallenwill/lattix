import { ProtocolException, type FieldType } from '@lattix/protocol'
import type { Field } from '@lattix/shared'
import type { IStorage } from '../storage/index.js'
import type { FieldRegistry } from '@lattix/shared'
import type { EventBus } from '../event-bus.js'

export interface FieldServiceDeps {
  storage: IStorage
  bus: EventBus
  fields: FieldRegistry
}

export class FieldService {
  constructor(private readonly deps: FieldServiceDeps) {}

  list(tableId: string): Field[] {
    this.assertTable(tableId)
    return this.deps.storage.fields.listByTable(tableId)
  }

  create(input: {
    tableId: string
    name: string
    type: FieldType
    options?: Record<string, unknown>
    required?: boolean
  }): Field {
    this.assertTable(input.tableId)
    const def = this.deps.fields.get(input.type)
    const options = input.options ?? {}
    // Validate that the field type accepts the provided options shape.
    // `validate` is not the right tool here; for now we just check that
    // a default value can be produced.
    def.defaultValue(options)
    const f = this.deps.storage.runInTransaction(() =>
      this.deps.storage.fields.create({
        tableId: input.tableId,
        name: input.name,
        type: input.type,
        options,
        required: input.required ?? false,
      }),
    )
    this.deps.bus.emit('field.created', { field: f }, `table.${f.tableId}`)
    return f
  }

  update(
    fieldId: string,
    input: { name?: string; options?: Record<string, unknown>; required?: boolean },
  ): Field {
    const f = this.deps.storage.runInTransaction(() =>
      this.deps.storage.fields.update(fieldId, input),
    )
    this.deps.bus.emit('field.updated', { field: f }, `table.${f.tableId}`)
    return f
  }

  delete(fieldId: string): void {
    const f = this.deps.storage.fields.get(fieldId)
    if (!f) throw new ProtocolException('NOT_FOUND', `Field not found: ${fieldId}`)
    this.deps.storage.runInTransaction(() => this.deps.storage.fields.delete(fieldId))
    this.deps.bus.emit('field.deleted', { fieldId, tableId: f.tableId }, `table.${f.tableId}`)
  }

  reorder(tableId: string, order: string[]): void {
    this.assertTable(tableId)
    this.deps.storage.runInTransaction(() => this.deps.storage.fields.reorder(tableId, order))
    this.deps.bus.emit('field.reordered', { tableId, order }, `table.${tableId}`)
  }

  private assertTable(tableId: string): void {
    if (!this.deps.storage.tables.get(tableId)) {
      throw new ProtocolException('NOT_FOUND', `Table not found: ${tableId}`)
    }
  }
}
