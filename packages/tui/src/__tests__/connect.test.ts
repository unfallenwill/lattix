/**
 * connectToCore against a real loopback CoreServer + a known-bad URL.
 * Covers the canReach + connect happy path and the autoStart=false reject.
 */
import { createBuiltinFieldRegistry } from '@lattix/shared'
import {
  CoreServer,
  EventBus,
  Router,
  SqliteStorage,
  TableService,
  FieldService,
  RecordService,
} from '@lattix/core'
import { connectToCore } from '../connection/connect.js'

interface Harness {
  url: string
  closeServer(): Promise<void>
}

async function bootServer(): Promise<Harness> {
  const storage = new SqliteStorage({ dbPath: ':memory:', disableWAL: true })
  const bus = new EventBus()
  const fields = createBuiltinFieldRegistry()
  const tableService = new TableService({ storage, bus })
  const fieldService = new FieldService({ storage, bus, fields })
  const recordService = new RecordService({ storage, bus, fields })
  const router = new Router({
    storage,
    fields,
    tableService,
    fieldService,
    recordService,
    serverVersion: '0.1.0',
  })
  const server = new CoreServer({
    port: 0,
    host: '127.0.0.1',
    router,
    bus,
    serverVersion: '0.1.0',
  })
  const running = await server.start()
  return {
    url: running.url,
    closeServer: async () => {
      await server.stop()
      storage.close()
    },
  }
}

describe('connectToCore', () => {
  it('connects to a reachable server (happy path, no auto-start needed)', async () => {
    const h = await bootServer()
    try {
      const conn = await connectToCore({ url: h.url, autoStart: false })
      expect(conn.getState()).toBe('connected')
      await conn.close()
    } finally {
      await h.closeServer()
    }
  })

  it('rejects with autoStart=false when nothing is listening', async () => {
    // OS-assigned-but-unused port: bind & immediately close to grab a free port number
    const h = await bootServer()
    const url = h.url
    await h.closeServer()
    // tiny race window here, but for this rejection path we just need
    // canReach to return false within its 200ms timeout — fine either way
    await expect(connectToCore({ url, autoStart: false })).rejects.toThrow(/not reachable/)
  })
})
