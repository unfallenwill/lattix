// Minimal RFC 4180 CSV parser. Handles quoted fields, escaped quotes
// (""), and embedded newlines inside quotes. Returns rows of strings
// (no type coercion happens here — that's infer-types' job).
export function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  while (i < input.length) {
    const ch = input[i] ?? ''
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\r') {
      if (input[i + 1] === '\n') i++
      row.push(field)
      if (!(row.length === 1 && row[0] === '')) rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    if (ch === '\n') {
      row.push(field)
      if (!(row.length === 1 && row[0] === '')) rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += ch
    i++
  }
  // Flush trailing field/row.
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    if (!(row.length === 1 && row[0] === '')) rows.push(row)
  }
  return rows
}
