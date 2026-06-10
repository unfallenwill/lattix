import { parseCsv } from '../commands/parse-csv.js'
import { inferColumnType } from '../commands/infer-types.js'

describe('parseCsv', () => {
  it('parses simple rows', () => {
    const csv = 'a,b,c\n1,2,3\n4,5,6'
    expect(parseCsv(csv)).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
      ['4', '5', '6'],
    ])
  })

  it('handles quoted fields with embedded commas', () => {
    const csv = 'name,note\n"a, b","x"\n"c","y, z"'
    expect(parseCsv(csv)).toEqual([
      ['name', 'note'],
      ['a, b', 'x'],
      ['c', 'y, z'],
    ])
  })

  it('handles escaped quotes ("" inside quoted field)', () => {
    const csv = 'a\n"he said ""hi"""\n'
    expect(parseCsv(csv)).toEqual([['a'], ['he said "hi"']])
  })

  it('handles embedded newlines inside quotes', () => {
    const csv = 'a,b\n"line1\nline2","ok"'
    expect(parseCsv(csv)).toEqual([
      ['a', 'b'],
      ['line1\nline2', 'ok'],
    ])
  })

  it('handles CRLF line endings', () => {
    const csv = 'a,b\r\n1,2\r\n3,4\r\n'
    expect(parseCsv(csv)).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('returns an empty list for empty input', () => {
    expect(parseCsv('')).toEqual([])
  })
})

describe('inferColumnType', () => {
  it('infers checkbox for true/false tokens', () => {
    expect(inferColumnType(['true', 'false', 'true'])).toBe('checkbox')
  })

  it('infers date for ISO YYYY-MM-DD strings', () => {
    expect(inferColumnType(['2026-01-01', '2026-12-31'])).toBe('date')
  })

  it('infers number for numeric strings', () => {
    expect(inferColumnType(['1', '2.5', '0', '-10'])).toBe('number')
  })

  it('falls back to text when samples are mixed', () => {
    expect(inferColumnType(['1', 'two', '3'])).toBe('text')
  })

  it('returns text for empty samples', () => {
    expect(inferColumnType([])).toBe('text')
  })
})
