import {
  type DateOptions,
  type FieldType,
  type NumberOptions,
  type SelectOptions,
  type TextOptions,
  ProtocolException,
} from '@lattix/protocol'

/**
 * Result of validating a cell value against a field definition.
 * `ok=false` carries a human-readable reason that the TUI/CLI can surface.
 */
export type ValidationResult = { ok: true; value: unknown } | { ok: false; reason: string }

/**
 * One pluggable field type. The Core registers 5 built-ins at startup;
 * future plugins can register more at runtime.
 */
export interface FieldTypeDefinition<TOptions = unknown> {
  type: FieldType
  validate(value: unknown, options: TOptions): ValidationResult
  serialize(value: unknown, options: TOptions): unknown
  defaultValue(options: TOptions): unknown
}

export class FieldRegistry {
  private readonly defs = new Map<FieldType, FieldTypeDefinition<unknown>>()

  register<T>(def: FieldTypeDefinition<T>): void {
    this.defs.set(def.type, def as FieldTypeDefinition<unknown>)
  }

  get(type: FieldType): FieldTypeDefinition {
    const def = this.defs.get(type)
    if (!def) {
      throw new ProtocolException('NOT_IMPLEMENTED', `Unknown field type: ${type}`)
    }
    return def
  }

  has(type: FieldType): boolean {
    return this.defs.has(type)
  }

  list(): FieldTypeDefinition[] {
    return [...this.defs.values()]
  }
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

function isBool(v: unknown): v is boolean {
  return typeof v === 'boolean'
}

const textDef: FieldTypeDefinition<TextOptions> = {
  type: 'text',
  validate(value) {
    if (value === null || value === undefined || value === '') return { ok: true, value: '' }
    if (typeof value !== 'string') return { ok: false, reason: 'expected string' }
    return { ok: true, value }
  },
  serialize(value) {
    return typeof value === 'string' ? value : value == null ? '' : String(value)
  },
  defaultValue() {
    return ''
  },
}

const numberDef: FieldTypeDefinition<NumberOptions> = {
  type: 'number',
  validate(value) {
    if (value === null || value === undefined || value === '') return { ok: true, value: null }
    if (typeof value === 'string' && value.trim() === '') return { ok: true, value: null }
    if (!isFiniteNumber(value)) return { ok: false, reason: 'expected number' }
    return { ok: true, value }
  },
  serialize(value) {
    return isFiniteNumber(value) ? value : null
  },
  defaultValue() {
    return null
  },
}

const selectDef: FieldTypeDefinition<SelectOptions> = {
  type: 'select',
  validate(value, options) {
    if (value === null || value === undefined || value === '') return { ok: true, value: null }
    const ids = new Set(options.options.map((o) => o.id))
    if (typeof value !== 'string' || !ids.has(value)) {
      return { ok: false, reason: 'unknown option' }
    }
    return { ok: true, value }
  },
  serialize(value) {
    return typeof value === 'string' ? value : null
  },
  defaultValue() {
    return null
  },
}

const checkboxDef: FieldTypeDefinition = {
  type: 'checkbox',
  validate(value) {
    if (value === null || value === undefined) return { ok: true, value: false }
    if (!isBool(value)) return { ok: false, reason: 'expected boolean' }
    return { ok: true, value }
  },
  serialize(value) {
    return isBool(value) ? value : false
  },
  defaultValue() {
    return false
  },
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

const dateDef: FieldTypeDefinition<DateOptions> = {
  type: 'date',
  validate(value, options) {
    if (value === null || value === undefined || value === '') return { ok: true, value: null }
    if (typeof value !== 'string') return { ok: false, reason: 'expected ISO date string' }
    const re = options.includeTime ? ISO_DATETIME_RE : ISO_DATE_RE
    if (!re.test(value)) {
      return {
        ok: false,
        reason: options.includeTime ? 'expected YYYY-MM-DDTHH:mm:ssZ' : 'expected YYYY-MM-DD',
      }
    }
    if (Number.isNaN(Date.parse(value))) return { ok: false, reason: 'invalid date' }
    return { ok: true, value }
  },
  serialize(value) {
    return typeof value === 'string' ? value : null
  },
  defaultValue() {
    return null
  },
}

/**
 * Create a fresh registry populated with the 5 built-in field types.
 */
export function createBuiltinFieldRegistry(): FieldRegistry {
  const reg = new FieldRegistry()
  reg.register(textDef)
  reg.register(numberDef)
  reg.register(selectDef)
  reg.register(checkboxDef)
  reg.register(dateDef)
  return reg
}
