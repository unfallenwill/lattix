import { ProtocolException } from '@lattix/protocol'
import type { Table } from '@lattix/shared'
import type { IStorage } from '../storage/index.js'
import type { EventBus } from '../event-bus.js'

export interface TableServiceDeps {
  storage: IStorage
  bus: EventBus
}

export class TableService {
  constructor(private readonly deps: TableServiceDeps) {}

  list(): Table[] {
    return this.deps.storage.tables.list()
  }

  get(tableId: string): Table {
    const t = this.deps.storage.tables.get(tableId)
    if (!t) throw new ProtocolException('NOT_FOUND', `Table not found: ${tableId}`)
    return t
  }

  create(input: { name: string; description?: string | null }): Table {
    const t = this.deps.storage.runInTransaction(() => this.deps.storage.tables.create(input))
    this.deps.bus.emit('table.created', { table: t }, `table.${t.id}`)
    return t
  }

  update(tableId: string, input: { name?: string; description?: string | null }): Table {
    const t = this.deps.storage.runInTransaction(() =>
      this.deps.storage.tables.update(tableId, input),
    )
    this.deps.bus.emit('table.updated', { table: t }, `table.${t.id}`)
    return t
  }

  delete(tableId: string): void {
    this.deps.storage.runInTransaction(() => {
      this.deps.storage.tables.delete(tableId)
    })
    this.deps.bus.emit('table.deleted', { tableId }, `table.${tableId}`)
  }
}
