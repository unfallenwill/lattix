import type { ServerFrame } from '@lattix/protocol'

export type PushHandler = (event: ServerFrame) => void

// Channel-scoped pub/sub. The Connection calls deliver() for every
// push frame; we dispatch to handlers based on the frame's channel.
export class Subscriptions {
  private readonly channels = new Map<string, Set<PushHandler>>()

  add(channel: string, handler: PushHandler): () => void {
    let set = this.channels.get(channel)
    if (!set) {
      set = new Set()
      this.channels.set(channel, set)
    }
    set.add(handler)
    return () => {
      const s = this.channels.get(channel)
      if (!s) return
      s.delete(handler)
      if (s.size === 0) this.channels.delete(channel)
    }
  }

  removeChannel(channel: string): void {
    this.channels.delete(channel)
  }

  deliver(frame: ServerFrame): void {
    if (frame.type !== 'push' || !frame.channel) return
    const set = this.channels.get(frame.channel)
    if (!set) return
    for (const h of set) {
      try {
        h(frame)
      } catch {
        // never let one handler kill the dispatcher
      }
    }
  }
}
