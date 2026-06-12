import {
  type DateOptions,
  type FieldType,
  type NumberOptions,
  type SelectOptions,
  type TextOptions,
  CheckboxOptionsSchema,
  DateOptionsSchema,
  NumberOptionsSchema,
  SelectOptionsSchema,
  TextOptionsSchema,
  ProtocolException,
} from '@lattix/protocol'
import { z } from 'zod'
import type {
  FieldTypeManifest,
  StorageDescriptor,
  OperatorSupport,
  ValidationResult,
} from './field-type-manifest.js'

/**
 * Backwards-compatible alias — pre-manifest code (services, tests)
 * called the type `FieldTypeDefinition` and reached for the same
 * 3 methods. A manifest IS a definition + more, so we expose the
 * narrower view as a TS structural subset.
 */
export type FieldTypeDefinition<TOptions = unknown> = Pick<
  FieldTypeManifest<TOptions>,
  'validate' | 'serialize' | 'defaultValue'
> & { type: FieldType }

export type { ValidationResult }

/**
 * The registry now holds full manifests. `.get()` returns a manifest
 * (still usable as a FieldTypeDefinition thanks to structural typing);
 * `.list()` returns every manifest. A future plugin loader will call
 * `.register()` at startup to add types beyond the 5 builtins.
 */
export class FieldRegistry {
  private readonly manifests = new Map<FieldType, FieldTypeManifest<unknown>>()

  register<T>(manifest: FieldTypeManifest<T>): void {
    this.manifests.set(manifest.id, manifest as FieldTypeManifest<unknown>)
  }

  get(type: FieldType): FieldTypeManifest {
    const m = this.manifests.get(type)
    if (!m) {
      throw new ProtocolException('NOT_IMPLEMENTED', `Unknown field type: ${type}`)
    }
    return m
  }

  has(type: FieldType): boolean {
    return this.manifests.has(type)
  }

  /** Every manifest currently registered, in insertion order. */
  list(): FieldTypeManifest[] {
    return [...this.manifests.values()]
  }
}

// --- guards ------------------------------------------------------------

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

function isBool(v: unknown): v is boolean {
  return typeof v === 'boolean'
}

// --- shared storage / operator presets --------------------------------

const TEXT_OPS: OperatorSupport = {
  filter: ['eq', 'neq', 'contains', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty'],
  sort: 'natural',
  aggregate: ['count', 'count_unique', 'count_empty'],
}

const NUMBER_OPS: OperatorSupport = {
  filter: ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'is_empty', 'is_not_empty'],
  sort: 'numeric',
  aggregate: ['count', 'count_unique', 'count_empty', 'sum', 'avg', 'min', 'max'],
}

const SELECT_OPS: OperatorSupport = {
  filter: ['eq', 'neq', 'is_empty', 'is_not_empty'],
  sort: 'natural',
  aggregate: ['count', 'count_unique', 'count_empty'],
}

const CHECKBOX_OPS: OperatorSupport = {
  filter: ['eq', 'neq'],
  sort: 'boolean',
  // Checkbox aggregation is "how many checked / unchecked" — express
  // with count + count_unique rather than introducing a special op.
  aggregate: ['count', 'count_unique'],
}

const DATE_OPS: OperatorSupport = {
  filter: ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'is_empty', 'is_not_empty'],
  sort: 'date',
  aggregate: ['count', 'count_unique', 'count_empty', 'min', 'max'],
}

const TEXT_STORAGE: StorageDescriptor = { sqlType: 'TEXT', indexable: true }
const NUMBER_STORAGE: StorageDescriptor = { sqlType: 'REAL', indexable: true }
const SELECT_STORAGE: StorageDescriptor = { sqlType: 'TEXT', indexable: true }
const CHECKBOX_STORAGE: StorageDescriptor = { sqlType: 'INTEGER', indexable: true }
const DATE_STORAGE: StorageDescriptor = { sqlType: 'TEXT', indexable: true }

// --- manifests ---------------------------------------------------------

const textManifest: FieldTypeManifest<TextOptions> = {
  id: 'text',
  version: 1,
  category: 'primitive',
  display: {
    displayName: 'Text',
    description: 'Free-form text. Use options.subtype for phone/url/email/barcode later.',
    icon: { emoji: '📝', ascii: 'T' },
  },
  optionsSchema: TextOptionsSchema,
  valueSchema: z.string(),
  storage: TEXT_STORAGE,
  operators: TEXT_OPS,
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

const numberManifest: FieldTypeManifest<NumberOptions> = {
  id: 'number',
  version: 1,
  category: 'primitive',
  display: {
    displayName: 'Number',
    description:
      'Finite numeric values. Use options.format for currency / percent / integer later.',
    icon: { emoji: '🔢', ascii: '№' },
  },
  optionsSchema: NumberOptionsSchema,
  valueSchema: z.number().nullable(),
  storage: NUMBER_STORAGE,
  operators: NUMBER_OPS,
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

const selectManifest: FieldTypeManifest<SelectOptions> = {
  id: 'select',
  version: 1,
  category: 'primitive',
  display: {
    displayName: 'Select',
    description:
      'Single choice from a fixed option list (multi-select arrives via options.multiple).',
    icon: { emoji: '🔖', ascii: '◉' },
  },
  optionsSchema: SelectOptionsSchema,
  valueSchema: z.string().nullable(),
  storage: SELECT_STORAGE,
  operators: SELECT_OPS,
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

const checkboxManifest: FieldTypeManifest = {
  id: 'checkbox',
  version: 1,
  category: 'primitive',
  display: {
    displayName: 'Checkbox',
    description: 'A boolean cell. Empty values are treated as false.',
    icon: { emoji: '✅', ascii: '☑' },
  },
  optionsSchema: CheckboxOptionsSchema,
  valueSchema: z.boolean(),
  storage: CHECKBOX_STORAGE,
  operators: CHECKBOX_OPS,
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

const dateManifest: FieldTypeManifest<DateOptions> = {
  id: 'date',
  version: 1,
  category: 'primitive',
  display: {
    displayName: 'Date',
    description: 'ISO date (or datetime when options.includeTime is set).',
    icon: { emoji: '📅', ascii: '▦' },
  },
  optionsSchema: DateOptionsSchema,
  valueSchema: z.string().nullable(),
  storage: DATE_STORAGE,
  operators: DATE_OPS,
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

/** Manifest list — ordered the way clients should present the picker. */
export const BUILTIN_FIELD_MANIFESTS: ReadonlyArray<FieldTypeManifest> = [
  textManifest,
  numberManifest,
  selectManifest,
  checkboxManifest,
  dateManifest,
]

/**
 * Create a fresh registry populated with the 5 built-in field types.
 */
export function createBuiltinFieldRegistry(): FieldRegistry {
  const reg = new FieldRegistry()
  for (const m of BUILTIN_FIELD_MANIFESTS) reg.register(m)
  return reg
}
