import {
  ClientFrameSchema,
  ServerFrameSchema,
  PROTOCOL_VERSION,
  PUSH_EVENTS,
  recordsChannel,
  tableChannel,
  SubscribeParamsSchema,
  UnsubscribeParamsSchema,
} from '../frames.js'

describe('channel helpers', () => {
  it('recordsChannel formats `table.<id>.records`', () => {
    expect(recordsChannel('t_abc')).toBe('table.t_abc.records')
  })

  it('tableChannel formats `table.<id>`', () => {
    expect(tableChannel('t_abc')).toBe('table.t_abc')
  })
})

describe('PROTOCOL_VERSION', () => {
  it('is a positive integer', () => {
    expect(PROTOCOL_VERSION).toBe(1)
  })
})

describe('PUSH_EVENTS', () => {
  it('covers the documented event names', () => {
    expect(PUSH_EVENTS).toContain('table.created')
    expect(PUSH_EVENTS).toContain('record.batch')
    expect(PUSH_EVENTS).toContain('import.progress')
  })
})

describe('ClientFrameSchema', () => {
  it('accepts a hello frame', () => {
    const r = ClientFrameSchema.safeParse({
      type: 'hello',
      protocolVersion: 1,
      clientId: 'c',
      clientVersion: '0.1.0',
    })
    expect(r.success).toBe(true)
  })

  it('accepts a req frame with params', () => {
    const r = ClientFrameSchema.safeParse({
      type: 'req',
      id: 'x',
      method: 'table.list',
      params: {},
    })
    expect(r.success).toBe(true)
  })

  it('accepts a ping frame', () => {
    const r = ClientFrameSchema.safeParse({ type: 'ping', ts: 0 })
    expect(r.success).toBe(true)
  })

  it('rejects an unknown frame type', () => {
    expect(ClientFrameSchema.safeParse({ type: 'pong', ts: 0, serverTs: 0 }).success).toBe(false)
  })

  it('rejects a malformed hello', () => {
    expect(ClientFrameSchema.safeParse({ type: 'hello', protocolVersion: 'one' }).success).toBe(
      false,
    )
  })
})

describe('ServerFrameSchema', () => {
  it('round-trips a welcome', () => {
    const ok = ServerFrameSchema.safeParse({
      type: 'welcome',
      protocolVersion: 1,
      serverVersion: '0.1.0',
    })
    expect(ok.success).toBe(true)
  })

  it('round-trips an ok response', () => {
    const ok = ServerFrameSchema.safeParse({
      type: 'res',
      id: 'x',
      ok: true,
      result: { foo: 1 },
    })
    expect(ok.success).toBe(true)
  })

  it('round-trips a push frame', () => {
    const ok = ServerFrameSchema.safeParse({
      type: 'push',
      event: 'record.created',
      channel: 'table.t.records',
      data: { record: {} },
      ts: 1,
    })
    expect(ok.success).toBe(true)
  })

  it('round-trips a pong frame', () => {
    expect(ServerFrameSchema.safeParse({ type: 'pong', ts: 1, serverTs: 2 }).success).toBe(true)
  })
})

describe('Subscribe schemas', () => {
  it('requires a non-empty channel', () => {
    expect(SubscribeParamsSchema.safeParse({ channel: 'x' }).success).toBe(true)
    expect(SubscribeParamsSchema.safeParse({ channel: '' }).success).toBe(false)
    expect(UnsubscribeParamsSchema.safeParse({ channel: 'x' }).success).toBe(true)
    expect(UnsubscribeParamsSchema.safeParse({}).success).toBe(false)
  })
})
