import { createBuiltinFieldRegistry } from '../field-registry.js'

describe('FieldRegistry (builtin)', () => {
  const reg = createBuiltinFieldRegistry()

  it('registers all 5 built-in types', () => {
    expect(reg.list()).toHaveLength(5)
    for (const t of ['text', 'number', 'select', 'checkbox', 'date'] as const) {
      expect(reg.has(t)).toBe(true)
    }
  })

  it('throws NOT_IMPLEMENTED for unknown types', () => {
    // @ts-expect-error testing runtime behaviour for an unknown type
    expect(() => reg.get('formula')).toThrow(/Unknown field type/)
  })

  describe('text', () => {
    const def = reg.get('text')
    it('accepts strings, null, undefined, empty', () => {
      expect(def.validate(null, {})).toEqual({ ok: true, value: '' })
      expect(def.validate(undefined, {})).toEqual({ ok: true, value: '' })
      expect(def.validate('', {})).toEqual({ ok: true, value: '' })
      expect(def.validate('hi', {})).toEqual({ ok: true, value: 'hi' })
    })
    it('rejects non-strings', () => {
      expect(def.validate(42, {}).ok).toBe(false)
      expect(def.validate(true, {}).ok).toBe(false)
    })
  })

  describe('number', () => {
    const def = reg.get('number')
    it('accepts finite numbers and nullish', () => {
      expect(def.validate(0, {}).ok).toBe(true)
      expect(def.validate(-3.14, {}).ok).toBe(true)
      expect(def.validate('', {}).ok).toBe(true)
      expect(def.validate(null, {}).ok).toBe(true)
    })
    it('rejects NaN / non-numeric strings', () => {
      expect(def.validate(NaN, {}).ok).toBe(false)
      expect(def.validate('abc', {}).ok).toBe(false)
    })
  })

  describe('select', () => {
    const opts = {
      options: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    }
    const def = reg.get('select')
    it('accepts known option ids', () => {
      expect(def.validate('a', opts)).toEqual({ ok: true, value: 'a' })
    })
    it('rejects unknown ids', () => {
      expect(def.validate('zzz', opts).ok).toBe(false)
    })
  })

  describe('checkbox', () => {
    const def = reg.get('checkbox')
    it('accepts booleans and nullish', () => {
      expect(def.validate(true, {})).toEqual({ ok: true, value: true })
      expect(def.validate(false, {})).toEqual({ ok: true, value: false })
      expect(def.validate(null, {})).toEqual({ ok: true, value: false })
    })
    it('rejects non-booleans', () => {
      expect(def.validate('true', {}).ok).toBe(false)
    })
  })

  describe('date', () => {
    const def = reg.get('date')
    it('accepts ISO date strings', () => {
      expect(def.validate('2026-06-10', { includeTime: false }).ok).toBe(true)
      expect(def.validate('2026-06-10T00:00:00Z', { includeTime: true }).ok).toBe(true)
    })
    it('rejects non-ISO strings', () => {
      expect(def.validate('10/06/2026', { includeTime: false }).ok).toBe(false)
      expect(def.validate('2026-06-10', { includeTime: true }).ok).toBe(false)
    })
  })
})
