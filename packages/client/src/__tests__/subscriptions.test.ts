import { Subscriptions } from '../subscriptions.js'
import type { ServerFrame } from '@lattix/protocol'

function pushFrame(channel: string | undefined, data: unknown = {}): ServerFrame {
  if (channel === undefined) {
    return { type: 'push', event: 'x', data } as ServerFrame
  }
  return { type: 'push', event: 'x', channel, data } as ServerFrame
}

describe('Subscriptions', () => {
  it('add() dispatches frames on the matching channel only', () => {
    const subs = new Subscriptions()
    const seenA: unknown[] = []
    const seenB: unknown[] = []
    subs.add('a', (f) => seenA.push(f))
    subs.add('b', (f) => seenB.push(f))
    subs.deliver(pushFrame('a', 1))
    subs.deliver(pushFrame('b', 2))
    expect(seenA).toHaveLength(1)
    expect(seenB).toHaveLength(1)
  })

  it('add() supports multiple handlers per channel', () => {
    const subs = new Subscriptions()
    let count = 0
    subs.add('c', () => count++)
    subs.add('c', () => count++)
    subs.deliver(pushFrame('c'))
    expect(count).toBe(2)
  })

  it('unsubscribe handle removes only that handler; cleans empty channel sets', () => {
    const subs = new Subscriptions()
    let count = 0
    const unsub = subs.add('c', () => count++)
    unsub()
    unsub() // second unsubscribe is a no-op
    subs.deliver(pushFrame('c'))
    expect(count).toBe(0)
  })

  it('removeChannel() drops every handler at once', () => {
    const subs = new Subscriptions()
    let count = 0
    subs.add('c', () => count++)
    subs.add('c', () => count++)
    subs.removeChannel('c')
    subs.deliver(pushFrame('c'))
    expect(count).toBe(0)
  })

  it('ignores non-push frames', () => {
    const subs = new Subscriptions()
    let count = 0
    subs.add('c', () => count++)
    subs.deliver({ type: 'res', id: 'x', ok: true } as ServerFrame)
    expect(count).toBe(0)
  })

  it('ignores push frames without a channel', () => {
    const subs = new Subscriptions()
    let count = 0
    subs.add('c', () => count++)
    subs.deliver(pushFrame(undefined))
    expect(count).toBe(0)
  })

  it('does not crash if a handler throws', () => {
    const subs = new Subscriptions()
    let okCount = 0
    subs.add('c', () => {
      throw new Error('boom')
    })
    subs.add('c', () => okCount++)
    expect(() => subs.deliver(pushFrame('c'))).not.toThrow()
    expect(okCount).toBe(1)
  })
})
