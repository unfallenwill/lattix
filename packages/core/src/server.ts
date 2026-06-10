import { WebSocketServer, WebSocket } from 'ws'
import {
  ClientFrameSchema,
  PROTOCOL_VERSION,
  SubscribeParamsSchema,
  UnsubscribeParamsSchema,
  type WelcomeFrame,
  toProtocolError,
  type ProtocolError,
  type ServerFrame,
} from '@lattix/protocol'
import { type EventBus, type CoreEvent } from './event-bus.js'
import { type Router } from './router.js'

const MAX_FRAME_BYTES = 16 * 1024 * 1024
const HEARTBEAT_INTERVAL_MS = 30_000
const HEARTBEAT_TIMEOUT_MS = 10_000
const MAX_MISSED_HEARTBEATS = 3

export interface ServerOptions {
  port: number
  host: string
  router: Router
  bus: EventBus
  serverVersion: string
}

export interface RunningServer {
  url: string
  close(): Promise<void>
}

interface PeerState {
  helloReceived: boolean
  channels: Set<string>
  lastPongTs: number
  missedPongs: number
}

export class CoreServer {
  private readonly wss: WebSocketServer
  private readonly peers = new WeakMap<WebSocket, PeerState>()
  private readonly busUnsub: () => void
  private heartbeatTimer: NodeJS.Timeout | null = null

  constructor(private readonly opts: ServerOptions) {
    this.wss = new WebSocketServer({
      host: opts.host,
      port: opts.port,
      maxPayload: MAX_FRAME_BYTES,
    })
    this.wss.on('connection', (ws) => this.onConnection(ws))
    this.busUnsub = opts.bus.on('*', (event) => this.fanOut(event))
  }

  start(): Promise<RunningServer> {
    return new Promise((resolve, reject) => {
      const onError = (err: Error) => reject(err)
      this.wss.once('error', onError)
      this.wss.once('listening', () => {
        this.wss.off('error', onError)
        this.startHeartbeat()
        const addr = this.wss.address()
        if (!addr || typeof addr === 'string') {
          reject(new Error('Server has no address'))
          return
        }
        const url = `ws://${this.opts.host}:${addr.port}`
        resolve({
          url,
          close: () => this.stop(),
        })
      })
    })
  }

  stop(): Promise<void> {
    this.busUnsub()
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
    return new Promise((resolve) => {
      this.wss.close(() => resolve())
    })
  }

  // -- connection lifecycle ---------------------------------------------------

  private onConnection(ws: WebSocket): void {
    const state: PeerState = {
      helloReceived: false,
      channels: new Set(),
      lastPongTs: Date.now(),
      missedPongs: 0,
    }
    this.peers.set(ws, state)
    ws.on('message', (data) => this.onMessage(ws, state, data as Buffer))
    ws.on('pong', () => {
      state.lastPongTs = Date.now()
      state.missedPongs = 0
    })
    ws.on('close', () => this.peers.delete(ws))
    ws.on('error', () => ws.terminate())
  }

  private async onMessage(ws: WebSocket, state: PeerState, data: Buffer): Promise<void> {
    if (data.byteLength > MAX_FRAME_BYTES) {
      this.send(ws, errorFrame('BAD_REQUEST', 'Frame too large'))
      ws.close()
      return
    }
    let raw: unknown
    try {
      raw = JSON.parse(data.toString('utf8'))
    } catch {
      this.send(ws, errorFrame('BAD_REQUEST', 'Invalid JSON'))
      return
    }
    const parsed = ClientFrameSchema.safeParse(raw)
    if (!parsed.success) {
      this.send(ws, errorFrame('BAD_REQUEST', 'Invalid frame', parsed.error.format()))
      return
    }
    const frame = parsed.data
    if (frame.type === 'ping') {
      this.send(ws, {
        type: 'pong',
        ts: frame.ts,
        serverTs: Date.now(),
      })
      return
    }
    if (frame.type === 'hello') {
      this.handleHello(ws, frame)
      return
    }
    if (!state.helloReceived) {
      this.send(ws, errorFrame('BAD_REQUEST', 'hello required first'))
      return
    }
    // After the ping/hello checks above, frame is narrowed to RequestFrame.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (frame.type === 'req') {
      await this.handleRequest(ws, state, frame)
    }
  }

  private handleHello(ws: WebSocket, frame: { protocolVersion: number }): void {
    if (frame.protocolVersion !== PROTOCOL_VERSION) {
      this.send(ws, errorFrame('BAD_REQUEST', 'Unsupported protocol version'))
      ws.close()
      return
    }
    const state = this.peers.get(ws)
    if (!state) return
    state.helloReceived = true
    const welcome: WelcomeFrame = {
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION,
      serverVersion: this.opts.serverVersion,
    }
    this.send(ws, welcome)
  }

  private async handleRequest(
    ws: WebSocket,
    state: PeerState,
    frame: { id: string; method: string; params?: unknown },
  ): Promise<void> {
    try {
      if (frame.method === 'subscribe') {
        const p = SubscribeParamsSchema.parse(frame.params ?? {})
        state.channels.add(p.channel)
        this.send(ws, { type: 'res', id: frame.id, ok: true, result: { subscribed: p.channel } })
        return
      }
      if (frame.method === 'unsubscribe') {
        const p = UnsubscribeParamsSchema.parse(frame.params ?? {})
        state.channels.delete(p.channel)
        this.send(ws, {
          type: 'res',
          id: frame.id,
          ok: true,
          result: { unsubscribed: p.channel },
        })
        return
      }
      const result = await this.opts.router.handle(frame.method, frame.params)
      this.send(ws, { type: 'res', id: frame.id, ok: true, result })
    } catch (err) {
      const pe: ProtocolError = toProtocolError(err)
      this.send(ws, { type: 'res', id: frame.id, ok: false, error: pe })
    }
  }

  // -- push fan-out -----------------------------------------------------------

  private fanOut(event: CoreEvent): void {
    const frame: ServerFrame = {
      type: 'push',
      event: event.type,
      ...(event.channel !== undefined ? { channel: event.channel } : {}),
      data: event.payload,
      ts: event.timestamp,
    }
    for (const ws of this.wss.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue
      const state = this.peers.get(ws)
      if (!state) continue
      if (event.channel && !state.channels.has(event.channel)) continue
      this.send(ws, frame)
    }
  }

  // -- heartbeat --------------------------------------------------------------

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now()
      for (const ws of this.wss.clients) {
        const state = this.peers.get(ws)
        if (!state) continue
        if (now - state.lastPongTs > HEARTBEAT_INTERVAL_MS + HEARTBEAT_TIMEOUT_MS) {
          state.missedPongs++
          if (state.missedPongs >= MAX_MISSED_HEARTBEATS) {
            ws.terminate()
            continue
          }
        }
        if (ws.readyState === WebSocket.OPEN) ws.ping()
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  private send(ws: WebSocket, frame: ServerFrame): void {
    if (ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify(frame))
  }
}

function errorFrame(code: ProtocolError['code'], message: string, details?: unknown): ServerFrame {
  return {
    type: 'res',
    id: 'server-error',
    ok: false,
    error: details === undefined ? { code, message } : { code, message, details },
  }
}
