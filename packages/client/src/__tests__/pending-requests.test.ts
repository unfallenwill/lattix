import { PendingRequests } from '../pending-requests.js'
import type { ResponseFrame } from '@lattix/protocol'

describe('PendingRequests', () => {
  it('register() resolves on a matching ok response', async () => {
    const pr = new PendingRequests()
    const promise = pr.register<string>('id-1', 5_000)
    pr.resolve('id-1', { type: 'res', id: 'id-1', ok: true, result: 'hello' } as ResponseFrame)
    await expect(promise).resolves.toBe('hello')
  })

  it('register() rejects with the protocol error on an error response', async () => {
    const pr = new PendingRequests()
    const promise = pr.register('id-2', 5_000)
    pr.resolve('id-2', {
      type: 'res',
      id: 'id-2',
      ok: false,
      error: { code: 'NOT_FOUND', message: 'gone' },
    } as ResponseFrame)
    await expect(promise).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'gone' })
  })

  it('resolve() with no error falls back to a synthetic INTERNAL error', async () => {
    const pr = new PendingRequests()
    const promise = pr.register('id-3', 5_000)
    pr.resolve('id-3', { type: 'res', id: 'id-3', ok: false } as ResponseFrame)
    await expect(promise).rejects.toMatchObject({ code: 'INTERNAL' })
  })

  it('resolve() is a no-op for unknown ids', () => {
    const pr = new PendingRequests()
    expect(() =>
      pr.resolve('nope', { type: 'res', id: 'nope', ok: true } as ResponseFrame),
    ).not.toThrow()
  })

  it('rejectAll() rejects every pending request with the same error', async () => {
    const pr = new PendingRequests()
    const a = pr.register('a', 5_000)
    const b = pr.register('b', 5_000)
    pr.rejectAll({ code: 'INTERNAL', message: 'closed' })
    await expect(a).rejects.toMatchObject({ code: 'INTERNAL', message: 'closed' })
    await expect(b).rejects.toMatchObject({ code: 'INTERNAL', message: 'closed' })
  })

  it('register() rejects with a timeout error if no response arrives', async () => {
    vi.useFakeTimers()
    try {
      const pr = new PendingRequests()
      const promise = pr.register('slow', 100)
      // attach a no-op catch so node doesn't emit unhandledRejection before we await
      promise.catch(() => {})
      await vi.advanceTimersByTimeAsync(150)
      await expect(promise).rejects.toMatchObject({ code: 'INTERNAL', message: /timed out/ })
    } finally {
      vi.useRealTimers()
    }
  })
})
