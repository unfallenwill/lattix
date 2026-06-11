import { EventBus, newEventId } from '../event-bus.js'

describe('EventBus', () => {
  it('delivers events to subscribers of the matching type', () => {
    const bus = new EventBus()
    const seen: unknown[] = []
    bus.on('foo', (e) => seen.push(e.payload))
    bus.emit('foo', { x: 1 })
    bus.emit('bar', { x: 2 })
    expect(seen).toEqual([{ x: 1 }])
  })

  it('delivers to wildcard subscribers for every type', () => {
    const bus = new EventBus()
    const all: string[] = []
    bus.on('*', (e) => all.push(e.type))
    bus.emit('a', null)
    bus.emit('b', null)
    expect(all).toEqual(['a', 'b'])
  })

  it('off() stops delivery; the unsubscribe handle does the same', () => {
    const bus = new EventBus()
    const seen: number[] = []
    const h = (e: { payload: unknown }) => seen.push(e.payload as number)
    bus.on('x', h)
    bus.emit('x', 1)
    bus.off('x', h)
    bus.emit('x', 2)
    const unsub = bus.on('x', h)
    bus.emit('x', 3)
    unsub()
    bus.emit('x', 4)
    expect(seen).toEqual([1, 3])
  })

  it('captures channel on the event when provided', () => {
    const bus = new EventBus()
    let captured: { channel?: string } | null = null
    bus.on('e', (ev) => {
      captured = ev
    })
    bus.emit('e', {}, 'chan-A')
    expect(captured!.channel).toBe('chan-A')
  })

  it('records a bounded history (drops oldest past maxHistory)', () => {
    const bus = new EventBus()
    for (let i = 0; i < 300; i++) bus.emit('t', i)
    const hist = bus.recent()
    expect(hist).toHaveLength(256)
    // oldest dropped, newest kept
    expect((hist[0] as { payload: unknown }).payload).toBe(300 - 256)
    expect((hist[hist.length - 1] as { payload: unknown }).payload).toBe(299)
  })

  it('emit() returns the event with a numeric timestamp', () => {
    const bus = new EventBus()
    const ev = bus.emit('x', null)
    expect(typeof ev.timestamp).toBe('number')
    expect(ev.type).toBe('x')
  })
})

describe('newEventId', () => {
  it('returns a ulid-like string', () => {
    const id = newEventId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(20)
    // crockford base32, monotonic across two calls
    expect(newEventId() >= id).toBe(true)
  })
})
