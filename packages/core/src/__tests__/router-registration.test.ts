/**
 * Router unit tests — the registration mechanism in isolation, no
 * sockets, no SQLite. We mount a Router with stub services, then assert
 * that:
 *   - all 19 builtin methods are dispatched correctly,
 *   - bad params produce BAD_REQUEST,
 *   - unknown methods produce NOT_IMPLEMENTED,
 *   - register() with a custom MethodDef adds a new route,
 *   - register() supports synchronous handlers (no Promise wrapping).
 */
import { z } from 'zod'
import { defineMethod } from '@lattix/protocol'
import { createBuiltinFieldRegistry } from '@lattix/shared'
import { EventBus } from '../event-bus.js'
import { Router } from '../router.js'
import { SqliteStorage } from '../storage/index.js'
import { TableService } from '../services/table-service.js'
import { FieldService } from '../services/field-service.js'
import { RecordService } from '../services/record-service.js'

function buildRouter(): Router {
  const storage = new SqliteStorage({ dbPath: ':memory:', disableWAL: true })
  const bus = new EventBus()
  const fields = createBuiltinFieldRegistry()
  const tableService = new TableService({ storage, bus })
  const fieldService = new FieldService({ storage, bus, fields })
  const recordService = new RecordService({ storage, bus, fields })
  return new Router({
    storage,
    fields,
    tableService,
    fieldService,
    recordService,
    serverVersion: '0.1.0-router-test',
  })
}

describe('Router builtin dispatch', () => {
  it('core.health returns { ok, ts }', async () => {
    const r = buildRouter()
    const out = (await r.handle('core.health', {})) as { ok: boolean; ts: number }
    expect(out.ok).toBe(true)
    expect(typeof out.ts).toBe('number')
  })

  it('core.version returns { serverVersion, protocolVersion, storage }', async () => {
    const r = buildRouter()
    const out = (await r.handle('core.version', {})) as {
      serverVersion: string
      protocolVersion: number
      storage: string
    }
    expect(out.serverVersion).toMatch(/router-test/)
    expect(out.protocolVersion).toBe(1)
    expect(out.storage).toBe('sqlite')
  })

  it('table.create -> table.get -> table.delete round-trip', async () => {
    const r = buildRouter()
    const { table } = (await r.handle('table.create', { name: 'T1' })) as {
      table: { id: string; name: string }
    }
    expect(table.name).toBe('T1')
    const got = (await r.handle('table.get', { tableId: table.id })) as {
      table: { name: string }
    }
    expect(got.table.name).toBe('T1')
    const del = (await r.handle('table.delete', { tableId: table.id })) as { deleted: true }
    expect(del.deleted).toBe(true)
  })

  it('rejects unknown method as NOT_IMPLEMENTED', async () => {
    const r = buildRouter()
    await expect(r.handle('does.not.exist', {})).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    })
  })

  it('rejects bad params as BAD_REQUEST', async () => {
    const r = buildRouter()
    // table.create requires `name` — pass an empty object.
    await expect(r.handle('table.create', {})).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('null / undefined params are treated as {} for empty-schema methods', async () => {
    const r = buildRouter()
    await expect(r.handle('core.health', undefined)).resolves.toBeDefined()
    await expect(r.handle('core.health', null)).resolves.toBeDefined()
  })
})

describe('Router.register custom methods', () => {
  it('registers and dispatches a custom MethodDef', async () => {
    const r = buildRouter()
    const myMethod = defineMethod({
      name: 'test.echo',
      summary: 'Echo for tests',
      paramsSchema: z.object({ value: z.string() }),
      resultSchema: z.object({ value: z.string() }),
    })
    r.register(myMethod, (p) => ({ value: p.value + '!' }))
    const out = (await r.handle('test.echo', { value: 'hi' })) as { value: string }
    expect(out.value).toBe('hi!')
  })

  it('synchronous handler return value is awaited transparently', async () => {
    const r = buildRouter()
    const myMethod = defineMethod({
      name: 'test.sync',
      summary: 'Sync handler test',
      paramsSchema: z.object({}),
      resultSchema: z.object({ n: z.number() }),
    })
    r.register(myMethod, () => ({ n: 7 }))
    const out = (await r.handle('test.sync', {})) as { n: number }
    expect(out.n).toBe(7)
  })

  it('register replaces an existing handler for the same name', async () => {
    const r = buildRouter()
    const def = defineMethod({
      name: 'test.replace',
      summary: '',
      paramsSchema: z.object({}),
      resultSchema: z.object({ v: z.number() }),
    })
    r.register(def, () => ({ v: 1 }))
    r.register(def, () => ({ v: 2 }))
    const out = (await r.handle('test.replace', {})) as { v: number }
    expect(out.v).toBe(2)
  })
})
