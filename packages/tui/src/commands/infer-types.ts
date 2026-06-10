import type { FieldType } from '@lattix/protocol'

// Heuristic type inference for a single column. Looks at up to N
// non-empty samples and picks the most specific type that fits all of
// them. Order: checkbox > date > number > text.
export function inferColumnType(samples: string[]): FieldType {
  const nonEmpty = samples.filter((s) => s.trim() !== '')
  if (nonEmpty.length === 0) return 'text'
  if (nonEmpty.every(isBoolLike)) return 'checkbox'
  if (nonEmpty.every(isIsoDate)) return 'date'
  if (nonEmpty.every(isNumberLike)) return 'number'
  return 'text'
}

function isBoolLike(s: string): boolean {
  const v = s.trim().toLowerCase()
  return v === 'true' || v === 'false' || v === 'yes' || v === 'no' || v === '0' || v === '1'
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim())
}

function isNumberLike(s: string): boolean {
  const v = s.trim()
  if (v === '') return false
  const n = Number(v)
  return Number.isFinite(n)
}
