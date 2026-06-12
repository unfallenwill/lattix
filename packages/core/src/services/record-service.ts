import { ProtocolException, recordsChannel } from '@lattix/protocol'
import type { Field, FieldRegistry, RecordRow } from '@lattix/shared'
import type { IStorage } from '../storage/index.js'
import type { EventBus } from '../event-bus.js'

export interface RecordServiceDeps {
  storage: IStorage
  bus: EventBus
  fields: FieldRegistry
}

export class RecordService {
  constructor(private readonly deps: RecordServiceDeps) {}

  list(input: {
    tableId: string
    limit: number
    offset: number
    sortBy?: string
    sortDir?: 'asc' | 'desc'
  }): { records: RecordRow[]; total: number; limit: number; offset: number } {
    this.assertTable(input.tableId)
    // If sortBy names one of our fields, look up the manifest's sort mode
    // and pass it through; storage uses that to pick the right SQL
    // coercion (numeric vs text vs date vs boolean). System columns
    // ('updated_at' / 'created_at') skip this branch.
    let sortFieldMode: 'numeric' | 'date' | 'boolean' | 'natural' | undefined
    if (input.sortBy && input.sortBy !== 'updated_at' && input.sortBy !== 'created_at') {
      const fields = this.deps.storage.fields.listByTable(input.tableId)
      const target = fields.find((f) => f.id === input.sortBy || f.name === input.sortBy)
      if (!target) {
        throw new ProtocolException('BAD_REQUEST', `Unknown sort field: ${input.sortBy}`)
      }
      const manifest = this.deps.fields.get(target.type)
      const mode = manifest.operators.sort
      if (mode === 'none') {
        throw new ProtocolException(
          'BAD_REQUEST',
          `Field type "${target.type}" does not support sort`,
        )
      }
      sortFieldMode = mode
      // Always pass the field id (not name) to storage so JSON_EXTRACT
      // matches the on-disk shape.
      input = { ...input, sortBy: target.id }
    }
    const { records, total } = this.deps.storage.records.list({
      tableId: input.tableId,
      limit: input.limit,
      offset: input.offset,
      ...(input.sortBy !== undefined ? { sortBy: input.sortBy } : {}),
      ...(input.sortDir !== undefined ? { sortDir: input.sortDir } : {}),
      ...(sortFieldMode !== undefined ? { sortFieldMode } : {}),
    })
    return { records, total, limit: input.limit, offset: input.offset }
  }

  get(tableId: string, recordId: string): RecordRow {
    const r = this.deps.storage.records.get(tableId, recordId)
    if (!r) throw new ProtocolException('NOT_FOUND', `Record not found: ${recordId}`)
    return r
  }

  create(input: { tableId: string; data: Record<string, unknown> }): RecordRow {
    const fields = this.fieldsOf(input.tableId)
    const validated = this.validateRecordData(fields, input.data, /* partial */ false)
    const r = this.deps.storage.runInTransaction(() =>
      this.deps.storage.records.create(input.tableId, validated),
    )
    this.deps.bus.emit('record.created', { record: r }, recordsChannel(input.tableId))
    return r
  }

  update(input: { tableId: string; recordId: string; data: Record<string, unknown> }): RecordRow {
    const fields = this.fieldsOf(input.tableId)
    const validated = this.validateRecordData(fields, input.data, /* partial */ true)
    const r = this.deps.storage.runInTransaction(() =>
      this.deps.storage.records.update(input.tableId, input.recordId, validated),
    )
    this.deps.bus.emit('record.updated', { record: r }, recordsChannel(input.tableId))
    return r
  }

  delete(tableId: string, recordId: string): void {
    this.assertTable(tableId)
    this.deps.storage.runInTransaction(() => this.deps.storage.records.delete(tableId, recordId))
    this.deps.bus.emit('record.deleted', { tableId, recordId }, recordsChannel(tableId))
  }

  batch(input: {
    tableId: string
    operations: Array<
      | { op: 'create'; data: Record<string, unknown> }
      | { op: 'update'; recordId: string; data: Record<string, unknown> }
      | { op: 'delete'; recordId: string }
    >
  }): { results: Array<RecordRow | null> } {
    const fields = this.fieldsOf(input.tableId)
    const results: Array<RecordRow | null> = []
    this.deps.storage.runInTransaction(() => {
      for (const op of input.operations) {
        if (op.op === 'create') {
          const data = this.validateRecordData(fields, op.data, false)
          results.push(this.deps.storage.records.create(input.tableId, data))
        } else if (op.op === 'update') {
          const data = this.validateRecordData(fields, op.data, true)
          results.push(this.deps.storage.records.update(input.tableId, op.recordId, data))
        } else {
          this.deps.storage.records.delete(input.tableId, op.recordId)
          results.push(null)
        }
      }
    })
    this.deps.bus.emit(
      'record.batch',
      { tableId: input.tableId, count: input.operations.length },
      recordsChannel(input.tableId),
    )
    return { results }
  }

  import(input: { tableId: string; rows: Array<Record<string, unknown>> }): { imported: number } {
    const fields = this.fieldsOf(input.tableId)
    let imported = 0
    this.deps.storage.runInTransaction(() => {
      for (const row of input.rows) {
        const data = this.validateRecordData(fields, row, true)
        this.deps.storage.records.create(input.tableId, data)
        imported++
      }
    })
    this.deps.bus.emit(
      'import.progress',
      { tableId: input.tableId, imported, total: input.rows.length },
      recordsChannel(input.tableId),
    )
    return { imported }
  }

  // -- helpers ----------------------------------------------------------------

  private assertTable(tableId: string): void {
    if (!this.deps.storage.tables.get(tableId)) {
      throw new ProtocolException('NOT_FOUND', `Table not found: ${tableId}`)
    }
  }

  private fieldsOf(tableId: string): Field[] {
    this.assertTable(tableId)
    return this.deps.storage.fields.listByTable(tableId)
  }

  private validateRecordData(
    fields: Field[],
    data: Record<string, unknown>,
    partial: boolean,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    const fieldById = new Map(fields.map((f) => [f.id, f]))
    for (const [key, value] of Object.entries(data)) {
      const field = fieldById.get(key)
      if (!field) {
        // Allow unknown keys for forward-compat; strip them silently.
        continue
      }
      const def = this.deps.fields.get(field.type)
      const result = def.validate(value, field.options)
      if (!result.ok) {
        throw new ProtocolException(
          'BAD_REQUEST',
          `Invalid value for field "${field.name}": ${result.reason}`,
        )
      }
      out[key] = def.serialize(result.value, field.options)
    }
    if (!partial) {
      for (const f of fields) {
        if (!(f.id in out)) {
          if (f.required) {
            throw new ProtocolException('BAD_REQUEST', `Missing required field: ${f.name}`)
          }
          const def = this.deps.fields.get(f.type)
          out[f.id] = def.serialize(def.defaultValue(f.options), f.options)
        }
      }
    }
    return out
  }
}
