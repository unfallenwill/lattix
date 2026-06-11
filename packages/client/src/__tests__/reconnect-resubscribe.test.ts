/**
 * Reconnect & resubscribe — the bug this file is the regression for:
 *
 * Before this commit, LattixConnection would re-open the socket after a
 * server-side close, set state=connected, and call it a day. The server's
 * PeerState.channels set was empty after restart, so any push the user
 * had subscribed to went into the void until the user manually re-subscribed
 * (typically by switching tables in the TUI).
 *
 * The fix: on every reconnect (attempts > 0 when 'open' fires), the client
 * replays subscribe frames for every channel its Subscriptions map still
 * has handlers for. Test harness here boots a real WebSocketServer on an
 * ephemeral port, lets a client subscribe, closes the server, restarts on
 * the same port, and asserts a push lands on the original handler.
 *
 * Separately, request() now holds for up to `requestQueueWindowMs` while
 * the socket is between connections, so a user keystroke during a flap
 * doesn't fail immediately. That's covered in the second describe block.
 */
import { WebSocketServer, type WebSocket as ServerSocket } from 'ws'
import type { AddressInfo } from 'node:net'
import { LattixConnection } from '../connection.js'

const tick = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

interface FakeServer {
  port: number
  wss: WebSocketServer
  /** Every client socket that has completed `hello`. Drives push tests. */
  helloed: ServerSocket[]
  /** Channels that arrived via `req:subscribe` frames, in order. */
  subscribed: string[]
  close(): Promise<void>
}

/**
 * Minimal fake Core: speaks the framing protocol just enough to handshake,
 * acknowledge subscribe, and route a push back. Does NOT validate frames
 * with zod — that's exercised in integration.test.ts against the real Core.
 */
function bootFakeServer(port: number): Promise<FakeServer> {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ port, host: '127.0.0.1' })
    const helloed: ServerSocket[] = []
    const subscribed: string[] = []
    wss.on('connection', (ws) => {
      ws.on('message', (data) => {
        let frame: { type: string; id?: string; method?: string; params?: { channel?: string } }
        try {
          frame = JSON.parse(data.toString('utf8'))
        } catch {
          return
        }
        if (frame.type === 'hello') {
          ws.send(
            JSON.stringify({ type: 'welcome', protocolVersion: 1, serverVersion: '0.1.0-fake' }),
          )
          helloed.push(ws)
          return
        }
        if (frame.type === 'req' && frame.method === 'subscribe' && frame.params?.channel) {
          subscribed.push(frame.params.channel)
          ws.send(
            JSON.stringify({
              type: 'res',
              id: frame.id,
              ok: true,
              result: { subscribed: frame.params.channel },
            }),
          )
          return
        }
        if (frame.type === 'req') {
          // Echo a success for any other req so request() resolves.
          ws.send(JSON.stringify({ type: 'res', id: frame.id, ok: true, result: {} }))
        }
      })
    })
    wss.once('listening', () => {
      const addr = wss.address() as AddressInfo
      resolve({
        port: addr.port,
        wss,
        helloed,
        subscribed,
        close: () =>
          new Promise<void>((res) => {
            for (const c of wss.clients) c.terminate()
            wss.close(() => res())
          }),
      })
    })
    wss.once('error', reject)
  })
}

describe('LattixConnection resubscribe after reconnect', () => {
  let server: FakeServer | null = null
  let conn: LattixConnection | null = null

  afterEach(async () => {
    if (conn) {
      await conn.close().catch(() => undefined)
      conn = null
    }
    if (server) {
      await server.close().catch(() => undefined)
      server = null
    }
  })

  it('re-sends subscribe frames after the socket reopens', async () => {
    server = await bootFakeServer(0)
    const port = server.port
    conn = new LattixConnection({
      url: `ws://127.0.0.1:${port}`,
      reconnect: true,
      // Fast backoff so the test wall-clock stays under ~1s.
      reconnectOpts: { initialMs: 20, maxMs: 80, factor: 1.5, jitter: 0 },
    })
    await conn.connect()
    const received: unknown[] = []
    await conn.subscribe('table.t1.records', (frame) => received.push(frame))
    expect(server.subscribed).toEqual(['table.t1.records'])

    // Push pre-restart: arrives.
    server.helloed[0]!.send(
      JSON.stringify({
        type: 'push',
        event: 'record.created',
        channel: 'table.t1.records',
        data: { n: 1 },
      }),
    )
    await tick(20)
    expect(received).toHaveLength(1)

    // Kill the server, then restart on the same port.
    await server.close()
    server = await bootFakeServer(port)
    // Give the connection's backoff + new socket a moment.
    await tick(250)
    expect(conn.getState()).toBe('connected')

    // The reconnect path must have replayed our subscribe.
    expect(server.subscribed).toEqual(['table.t1.records'])

    // Push post-restart: also arrives — the actual bug fix.
    expect(server.helloed.length).toBeGreaterThan(0)
    server.helloed[server.helloed.length - 1]!.send(
      JSON.stringify({
        type: 'push',
        event: 'record.created',
        channel: 'table.t1.records',
        data: { n: 2 },
      }),
    )
    await tick(20)
    expect(received).toHaveLength(2)
  }, 5000)

  it('does not replay subscriptions on the FIRST connect', async () => {
    server = await bootFakeServer(0)
    conn = new LattixConnection({
      url: `ws://127.0.0.1:${server.port}`,
      reconnect: false,
    })
    await conn.connect()
    // No subscribes happened in the test, and resubscribeAll() must NOT
    // fire on the initial open — only on reconnect.
    expect(server.subscribed).toEqual([])
  })

  it('does not resubscribe if user called close()', async () => {
    server = await bootFakeServer(0)
    const port = server.port
    conn = new LattixConnection({
      url: `ws://127.0.0.1:${port}`,
      reconnect: true,
      reconnectOpts: { initialMs: 20, maxMs: 80, factor: 1.5, jitter: 0 },
    })
    await conn.connect()
    await conn.subscribe('table.t1.records', () => undefined)
    await conn.close()
    // Reset server-side state and restart — if the client were still
    // alive it would re-subscribe; it must not.
    await server.close()
    server = await bootFakeServer(port)
    await tick(200)
    expect(server.subscribed).toEqual([])
  })
})

describe('LattixConnection request() queues briefly while disconnected', () => {
  let server: FakeServer | null = null
  let conn: LattixConnection | null = null

  afterEach(async () => {
    if (conn) {
      await conn.close().catch(() => undefined)
      conn = null
    }
    if (server) {
      await server.close().catch(() => undefined)
      server = null
    }
  })

  it('resolves a request issued during a brief flap', async () => {
    server = await bootFakeServer(0)
    const port = server.port
    conn = new LattixConnection({
      url: `ws://127.0.0.1:${port}`,
      reconnect: true,
      reconnectOpts: { initialMs: 20, maxMs: 80, factor: 1.5, jitter: 0 },
      requestQueueWindowMs: 500,
    })
    await conn.connect()

    // Kill the server so the client enters reconnecting state.
    await server.close()
    await tick(40)

    // Start a request — state is reconnecting; it should be queued.
    const pending = conn.request('core.health')

    // Restart the server within the window; the queued request must drain.
    server = await bootFakeServer(port)
    const result = await pending
    expect(result).toEqual({})
  }, 5000)

  it('rejects a queued request if the window expires', async () => {
    server = await bootFakeServer(0)
    const port = server.port
    conn = new LattixConnection({
      url: `ws://127.0.0.1:${port}`,
      reconnect: true,
      // Keep backoff well past the queue window to guarantee timeout.
      reconnectOpts: { initialMs: 2000, maxMs: 4000, factor: 1, jitter: 0 },
      requestQueueWindowMs: 150,
    })
    await conn.connect()
    await server.close()
    await tick(40)
    await expect(conn.request('core.health')).rejects.toMatchObject({
      code: 'INTERNAL',
      message: /not connected/,
    })
  }, 5000)

  it('rejects immediately when reconnect is disabled', async () => {
    server = await bootFakeServer(0)
    conn = new LattixConnection({ url: `ws://127.0.0.1:${server.port}`, reconnect: false })
    // Don't connect; the state is `idle` with reconnect off — fast reject.
    await expect(conn.request('core.health')).rejects.toMatchObject({
      code: 'INTERNAL',
      message: /not connected/,
    })
  })
})
