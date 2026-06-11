import { ProtocolException, toProtocolError, ERROR_CODES } from '../errors.js'

describe('toProtocolError', () => {
  it('preserves ProtocolException code, message, and details', () => {
    const ex = new ProtocolException('NOT_FOUND', 'gone', { id: 'x' })
    expect(toProtocolError(ex)).toEqual({
      code: 'NOT_FOUND',
      message: 'gone',
      details: { id: 'x' },
    })
  })

  it('omits details when ProtocolException has none', () => {
    const ex = new ProtocolException('CONFLICT', 'dup')
    const out = toProtocolError(ex)
    expect(out).toEqual({ code: 'CONFLICT', message: 'dup' })
    expect('details' in out).toBe(false)
  })

  it('wraps a plain Error as INTERNAL', () => {
    expect(toProtocolError(new Error('boom'))).toEqual({
      code: 'INTERNAL',
      message: 'boom',
    })
  })

  it('stringifies a non-Error value as INTERNAL', () => {
    expect(toProtocolError('weird')).toEqual({ code: 'INTERNAL', message: 'weird' })
    expect(toProtocolError(42)).toEqual({ code: 'INTERNAL', message: '42' })
    expect(toProtocolError(null)).toEqual({ code: 'INTERNAL', message: 'null' })
  })
})

describe('ProtocolException', () => {
  it('is an Error subclass with name set', () => {
    const e = new ProtocolException('BAD_REQUEST', 'nope')
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('ProtocolException')
    expect(e.code).toBe('BAD_REQUEST')
    expect(e.details).toBeUndefined()
  })
})

describe('ERROR_CODES', () => {
  it('contains the documented codes', () => {
    expect(ERROR_CODES).toEqual([
      'BAD_REQUEST',
      'NOT_FOUND',
      'CONFLICT',
      'INTERNAL',
      'NOT_IMPLEMENTED',
      'UNAUTHORIZED',
    ])
  })
})
