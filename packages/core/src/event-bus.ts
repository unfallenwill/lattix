import { ulid } from 'ulidx'
import type { PushEvent } from '@lattix/protocol'

export interface CoreEvent {
  type: PushEvent | string
  timestamp: number
  payload: unknown
  /** Optional channel hint for routing push frames. */
  channel?: string
}

export type EventHandler = (event: CoreEvent) => void

// Simple synchronous in-process pub/sub. Push frames over the WebSocket
// are derived from this bus. Future plugins will subscribe to it.
export class EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>()
  private readonly history: CoreEvent[] = []
  private readonly maxHistory = 256

  on(type: string, handler: EventHandler): () => void {
    let set = this.handlers.get(type)
    if (!set) {
      set = new Set()
      this.handlers.set(type, set)
    }
    set.add(handler)
    return () => this.off(type, handler)
  }

  off(type: string, handler: EventHandler): void {
    this.handlers.get(type)?.delete(handler)
  }

  emit(type: string, payload: unknown, channel?: string): CoreEvent {
    const event: CoreEvent = {
      type,
      timestamp: Date.now(),
      payload,
      ...(channel !== undefined ? { channel } : {}),
    }
    this.history.push(event)
    if (this.history.length > this.maxHistory) this.history.shift()
    const set = this.handlers.get(type)
    if (set) for (const h of set) h(event)
    const wild = this.handlers.get('*')
    if (wild) for (const h of wild) h(event)
    return event
  }

  recent(): readonly CoreEvent[] {
    return this.history
  }
}

export function newEventId(): string {
  return ulid()
}
