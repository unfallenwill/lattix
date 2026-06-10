import { toProtocolError, type ResponseFrame, type ServerFrame } from '@lattix/protocol'

// Correlates request ids to pending Promises. Each register() returns a
// promise that resolves on the matching res frame or rejects on timeout.
export class PendingRequests {
  private readonly map = new Map<string, PendingEntry<unknown>>()

  register<T>(id: string, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.map.delete(id)
        reject(toProtocolError(new Error(`request ${id} timed out after ${timeoutMs}ms`)))
      }, timeoutMs)
      this.map.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      })
    })
  }

  resolve(id: string, frame: ServerFrame): void {
    const entry = this.map.get(id) as PendingEntry<unknown> | undefined
    if (!entry) return
    this.map.delete(id)
    clearTimeout(entry.timer)
    const res = frame as ResponseFrame
    if (res.ok) {
      entry.resolve(res.result)
    } else {
      entry.reject(res.error ?? toProtocolError(new Error('unknown error')))
    }
  }

  rejectAll(err: ReturnType<typeof toProtocolError>): void {
    for (const [id, entry] of this.map) {
      clearTimeout(entry.timer)
      entry.reject(err)
      this.map.delete(id)
    }
  }
}

interface PendingEntry<T> {
  resolve: (value: T) => void
  reject: (err: unknown) => void
  timer: NodeJS.Timeout
}
