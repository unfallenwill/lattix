import { WebSocket } from 'ws'
import { PROTOCOL_VERSION, toProtocolError, type ServerFrame } from '@lattix/protocol'
import { PendingRequests } from './pending-requests.js'
import { Subscriptions } from './subscriptions.js'
import type { ConnectionState, RequestOptions } from './types.js'

const DEFAULT_RECONNECT = {
  initialMs: 250,
  maxMs: 5_000,
  factor: 1.7,
  jitter: 0.3,
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000

/**
 * If a caller makes a request while the socket is between connections,
 * we hold it for up to this many ms waiting for `connected` before
 * rejecting. Keeps a fast user keystroke from blowing up just because
 * the socket flapped — matches the UX guarantees you'd want of any
 * local-first client SDK.
 */
const DEFAULT_REQUEST_QUEUE_WINDOW_MS = 500

export interface LattixConnectionOptions {
  url: string
  clientId?: string
  clientVersion?: string
  reconnect?: boolean
  reconnectOpts?: Partial<typeof DEFAULT_RECONNECT>
  /** Override the short-window queue for `request()` made while disconnected. */
  requestQueueWindowMs?: number
}

type StateListener = (state: ConnectionState) => void

interface QueuedRequest {
  method: string
  params: unknown
  options: RequestOptions | undefined
  resolve: (v: unknown) => void
  reject: (err: unknown) => void
  expiresAt: number
  timer: NodeJS.Timeout
}

export class LattixConnection {
  private ws: WebSocket | null = null
  private state: ConnectionState = 'idle'
  private attempts = 0
  private reconnectTimer: NodeJS.Timeout | null = null
  private currentUrl: string
  private readonly pending = new PendingRequests()
  private readonly subs = new Subscriptions()
  private readonly stateListeners = new Set<StateListener>()
  private readonly clientId: string
  private readonly clientVersion: string
  private readonly shouldReconnect: boolean
  private readonly reconnectOpts: typeof DEFAULT_RECONNECT
  private readonly requestQueueWindowMs: number
  /**
   * Requests made while the socket is between connections. Drained on the
   * next `connected` state. Each entry has its own timer that rejects if
   * we don't reach `connected` in time, so the queue can never grow without
   * bound and a slow reconnect doesn't keep callers hanging.
   */
  private readonly queue: QueuedRequest[] = []

  constructor(opts: LattixConnectionOptions) {
    this.currentUrl = opts.url
    this.clientId = opts.clientId ?? 'lattix-client'
    this.clientVersion = opts.clientVersion ?? '0.1.0'
    this.shouldReconnect = opts.reconnect ?? true
    this.reconnectOpts = { ...DEFAULT_RECONNECT, ...(opts.reconnectOpts ?? {}) }
    this.requestQueueWindowMs = opts.requestQueueWindowMs ?? DEFAULT_REQUEST_QUEUE_WINDOW_MS
  }

  // -- lifecycle --------------------------------------------------------------

  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') return
    await this.openSocket()
  }

  async close(): Promise<void> {
    this.setState('closed')
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    // Reject anything still waiting for a reconnect — close() means "stop".
    this.drainQueue(toProtocolError(new Error('connection closed')))
    const ws = this.ws
    this.ws = null
    if (ws?.readyState === WebSocket.OPEN) {
      await new Promise<void>((resolve) => {
        ws.once('close', () => resolve())
        ws.close()
      })
    }
    this.pending.rejectAll(toProtocolError(new Error('connection closed')))
  }

  getState(): ConnectionState {
    return this.state
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener)
    listener(this.state)
    return () => this.stateListeners.delete(listener)
  }

  // -- request / response -----------------------------------------------------

  request<T = unknown>(method: string, params?: unknown, options?: RequestOptions): Promise<T> {
    if (this.ws?.readyState === WebSocket.OPEN && this.state === 'connected') {
      return this.sendNow<T>(method, params, options)
    }
    // closed/idle: don't queue — the caller has no reason to expect this to
    // resolve, and queueing would only delay the error. Same for "reconnect
    // disabled, socket gone".
    if (this.state === 'closed' || (this.state === 'idle' && !this.shouldReconnect)) {
      return Promise.reject(toProtocolError(new Error('not connected')))
    }
    // connecting / reconnecting / idle (with reconnect on): queue briefly.
    return this.enqueue<T>(method, params, options)
  }

  private sendNow<T>(
    method: string,
    params: unknown,
    options: RequestOptions | undefined,
  ): Promise<T> {
    const id = newId()
    const timeout = options?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    const promise = this.pending.register<T>(id, timeout)
    this.ws!.send(
      JSON.stringify({
        type: 'req',
        id,
        method,
        ...(params !== undefined ? { params } : {}),
      }),
    )
    return promise
  }

  private enqueue<T>(
    method: string,
    params: unknown,
    options: RequestOptions | undefined,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const expiresAt = Date.now() + this.requestQueueWindowMs
      const timer = setTimeout(() => {
        const i = this.queue.findIndex((q) => q.timer === timer)
        if (i >= 0) this.queue.splice(i, 1)
        reject(toProtocolError(new Error('not connected')))
      }, this.requestQueueWindowMs)
      this.queue.push({
        method,
        params,
        options,
        resolve: resolve as (v: unknown) => void,
        reject,
        expiresAt,
        timer,
      })
    })
  }

  private flushQueue(): void {
    if (this.queue.length === 0) return
    const snapshot = this.queue.splice(0, this.queue.length)
    for (const q of snapshot) {
      clearTimeout(q.timer)
      this.sendNow(q.method, q.params, q.options).then(q.resolve, q.reject)
    }
  }

  private drainQueue(err: unknown): void {
    if (this.queue.length === 0) return
    const snapshot = this.queue.splice(0, this.queue.length)
    for (const q of snapshot) {
      clearTimeout(q.timer)
      q.reject(err)
    }
  }

  // -- subscriptions ----------------------------------------------------------

  async subscribe(channel: string, handler: (event: ServerFrame) => void): Promise<() => void> {
    await this.request('subscribe', { channel })
    return this.subs.add(channel, handler)
  }

  async unsubscribe(channel: string): Promise<void> {
    this.subs.removeChannel(channel)
    try {
      await this.request('unsubscribe', { channel })
    } catch {
      // Ignore on shutdown
    }
  }

  // -- internals --------------------------------------------------------------

  private openSocket(): Promise<void> {
    this.setState(this.attempts === 0 ? 'connecting' : 'reconnecting')
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.currentUrl)
      this.ws = ws
      const isReconnect = this.attempts > 0
      const onError = (err: Error) => {
        if (this.state !== 'connected' && this.state !== 'reconnecting') {
          this.setState('reconnecting')
        }
        if (this.attempts === 0) reject(err)
        this.scheduleReconnect()
      }
      ws.once('error', onError)
      ws.once('open', () => {
        this.sendHello(ws)
        this.setState('connected')
        this.attempts = 0
        // On a fresh `connected` state, replay any subscriptions the user
        // registered before the disconnect so server-side PeerState gets
        // its channel set restored. Then flush queued requests.
        if (isReconnect) this.resubscribeAll()
        this.flushQueue()
        resolve()
      })
      ws.on('message', (data) => this.onMessage(data as Buffer))
      ws.on('close', (code, reason) => this.onClose(code, reason.toString()))
      ws.on('error', () => {
        // Suppress unhandled; reconnect logic handles it
      })
    })
  }

  /**
   * Re-send `subscribe` for every channel the client still has handlers on.
   * Fire-and-forget: failures here would be observable to push consumers
   * (no events) but there's no useful way to surface them — the next
   * reconnect will try again.
   */
  private resubscribeAll(): void {
    const channels = this.subs.channelNames()
    for (const channel of channels) {
      // Use sendNow directly — we know the socket is OPEN at this point,
      // and we don't want these to land in the queue we're about to flush.
      this.sendNow('subscribe', { channel }, undefined).catch(() => undefined)
    }
  }

  private sendHello(ws: WebSocket): void {
    ws.send(
      JSON.stringify({
        type: 'hello',
        protocolVersion: PROTOCOL_VERSION,
        clientId: this.clientId,
        clientVersion: this.clientVersion,
      }),
    )
  }

  private onMessage(data: Buffer): void {
    let raw: unknown
    try {
      raw = JSON.parse(data.toString('utf8'))
    } catch {
      return
    }
    if (!raw || typeof raw !== 'object') return
    const frame = raw as ServerFrame
    if (frame.type === 'res') {
      this.pending.resolve(frame.id, frame)
    } else if (frame.type === 'push') {
      this.subs.deliver(frame)
    }
  }

  private onClose(code: number, reason: string): void {
    this.pending.rejectAll(toProtocolError(new Error(`connection closed: ${code} ${reason}`)))
    if (this.state === 'closed') return
    if (!this.shouldReconnect) {
      this.setState('closed')
      this.drainQueue(toProtocolError(new Error('connection closed')))
      return
    }
    this.scheduleReconnect()
  }

  private scheduleReconnect(_err?: Error): void {
    if (!this.shouldReconnect || this.state === 'closed') return
    this.attempts++
    const delay = computeBackoff(this.attempts, this.reconnectOpts)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.openSocket().catch(() => {
        // openSocket handles its own retry scheduling
      })
    }, delay)
  }

  private setState(next: ConnectionState): void {
    if (this.state === next) return
    this.state = next
    for (const l of this.stateListeners) l(next)
  }
}

function computeBackoff(attempt: number, opts: typeof DEFAULT_RECONNECT): number {
  const base = Math.min(opts.maxMs, opts.initialMs * Math.pow(opts.factor, attempt - 1))
  const jitter = base * opts.jitter * (Math.random() * 2 - 1)
  return Math.max(0, Math.floor(base + jitter))
}

let counter = 0
function newId(): string {
  counter = (counter + 1) & 0xffff
  return `c_${Date.now().toString(36)}_${counter.toString(36)}`
}
