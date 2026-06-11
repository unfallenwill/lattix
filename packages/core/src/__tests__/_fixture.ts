import { createBuiltinFieldRegistry, type FieldRegistry } from '@lattix/shared'
import { EventBus } from '../event-bus.js'
import { SqliteStorage, type IStorage } from '../storage/index.js'
import { TableService } from '../services/table-service.js'
import { FieldService } from '../services/field-service.js'
import { RecordService } from '../services/record-service.js'
import { Router } from '../router.js'

export interface CoreFixture {
  storage: SqliteStorage
  bus: EventBus
  fields: FieldRegistry
  tableService: TableService
  fieldService: FieldService
  recordService: RecordService
  router: Router
  /** All events emitted on the bus since startup. */
  events: Array<{ type: string; payload: unknown; channel?: string }>
  close(): void
}

export function makeFixture(): CoreFixture {
  const storage: SqliteStorage = new SqliteStorage({ dbPath: ':memory:', disableWAL: true })
  const bus = new EventBus()
  const fields = createBuiltinFieldRegistry()
  const events: CoreFixture['events'] = []
  bus.on('*', (e) => {
    events.push({
      type: e.type,
      payload: e.payload,
      ...(e.channel !== undefined ? { channel: e.channel } : {}),
    })
  })
  const tableService = new TableService({ storage: storage as IStorage, bus })
  const fieldService = new FieldService({ storage: storage as IStorage, bus, fields })
  const recordService = new RecordService({ storage: storage as IStorage, bus, fields })
  const router = new Router({
    storage: storage as IStorage,
    fields,
    tableService,
    fieldService,
    recordService,
    serverVersion: '0.1.0-test',
  })
  return {
    storage,
    bus,
    fields,
    tableService,
    fieldService,
    recordService,
    router,
    events,
    close: () => storage.close(),
  }
}
