import type { ServerFrame, ProtocolError } from '@lattix/protocol'

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed'

export interface RequestOptions {
  timeoutMs?: number
}

export type Resolved<T> = { ok: true; value: T } | { ok: false; error: ProtocolError }

export type { ServerFrame, ProtocolError }
