/**
 * FieldTypeManifest contract checks — each builtin manifest must satisfy
 * a base shape, and the registry's get/list must agree on what's in it.
 * These tests are intentionally generic so adding a new field type just
 * needs a new manifest entry — no test changes required.
 */
import { BUILTIN_FIELD_MANIFESTS, createBuiltinFieldRegistry } from '../field-registry.js'
import { toWireManifest, type FieldTypeManifest } from '../field-type-manifest.js'

const REQUIRED_FIELDS: Array<keyof FieldTypeManifest> = [
  'id',
  'version',
  'category',
  'display',
  'optionsSchema',
  'valueSchema',
  'storage',
  'operators',
  'validate',
  'serialize',
  'defaultValue',
]

describe('BUILTIN_FIELD_MANIFESTS', () => {
  it('exposes exactly the 5 MVP types', () => {
    const ids = BUILTIN_FIELD_MANIFESTS.map((m) => m.id).sort()
    expect(ids).toEqual(['checkbox', 'date', 'number', 'select', 'text'])
  })

  for (const manifest of BUILTIN_FIELD_MANIFESTS) {
    describe(`manifest "${manifest.id}"`, () => {
      it('has every required key', () => {
        for (const k of REQUIRED_FIELDS) {
          expect(manifest[k]).toBeDefined()
        }
      })

      it('version is a positive int', () => {
        expect(Number.isInteger(manifest.version)).toBe(true)
        expect(manifest.version).toBeGreaterThan(0)
      })

      it('storage.sqlType is one of the allowed values', () => {
        expect(['TEXT', 'INTEGER', 'REAL', 'BLOB']).toContain(manifest.storage.sqlType)
      })

      it('operators.filter is a non-empty array', () => {
        expect(Array.isArray(manifest.operators.filter)).toBe(true)
        expect(manifest.operators.filter.length).toBeGreaterThan(0)
      })

      it('display has displayName + description', () => {
        expect(manifest.display.displayName.length).toBeGreaterThan(0)
        expect(manifest.display.description.length).toBeGreaterThan(0)
      })
    })
  }
})

describe('FieldRegistry', () => {
  it('createBuiltinFieldRegistry registers all 5 types', () => {
    const reg = createBuiltinFieldRegistry()
    expect(reg.list()).toHaveLength(5)
    expect(reg.has('text')).toBe(true)
    expect(reg.has('number')).toBe(true)
    expect(reg.has('select')).toBe(true)
    expect(reg.has('checkbox')).toBe(true)
    expect(reg.has('date')).toBe(true)
  })

  it('get() returns a manifest with the right id', () => {
    const reg = createBuiltinFieldRegistry()
    expect(reg.get('text').id).toBe('text')
    expect(reg.get('number').id).toBe('number')
  })

  it('manifest is still usable as the old FieldTypeDefinition (structural)', () => {
    const reg = createBuiltinFieldRegistry()
    const def = reg.get('text')
    // validate / serialize / defaultValue still work as before
    expect(def.validate('hi', {})).toEqual({ ok: true, value: 'hi' })
    expect(def.serialize('hi', {})).toBe('hi')
    expect(def.defaultValue({})).toBe('')
  })

  it('checkbox sort mode is boolean (not none)', () => {
    const reg = createBuiltinFieldRegistry()
    expect(reg.get('checkbox').operators.sort).toBe('boolean')
  })

  it('number sort mode is numeric, aggregates include sum/avg/min/max', () => {
    const reg = createBuiltinFieldRegistry()
    const n = reg.get('number')
    expect(n.operators.sort).toBe('numeric')
    expect(n.operators.aggregate).toContain('sum')
    expect(n.operators.aggregate).toContain('avg')
    expect(n.operators.aggregate).toContain('min')
    expect(n.operators.aggregate).toContain('max')
  })
})

describe('toWireManifest', () => {
  it('strips functional methods but keeps every other field', () => {
    const m = BUILTIN_FIELD_MANIFESTS[0]!
    const wire = toWireManifest(m)
    expect(wire.id).toBe(m.id)
    expect(wire.version).toBe(m.version)
    expect(wire.category).toBe(m.category)
    expect(wire.display).toEqual(m.display)
    expect(wire.operators).toEqual(m.operators)
    expect(wire.storage).toEqual(m.storage)
    // Functional members must NOT be on the wire shape.
    expect((wire as unknown as { validate?: unknown }).validate).toBeUndefined()
    expect((wire as unknown as { serialize?: unknown }).serialize).toBeUndefined()
    expect((wire as unknown as { defaultValue?: unknown }).defaultValue).toBeUndefined()
  })
})
