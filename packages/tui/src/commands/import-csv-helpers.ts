import type { LattixConnection, LattixClient } from '@lattix/client'
import { createClient } from '@lattix/client'
import type { Table, Field } from '@lattix/shared'
import { inferColumnType } from './infer-types.js'

export async function findTableByName(
  conn: LattixConnection,
  name: string | undefined,
): Promise<Table> {
  if (!name) throw new Error('Missing --table <name> (or pass --auto-create)')
  const client: LattixClient = createClient(conn)
  const { tables } = await client.table.list({})
  const t = (tables as Table[]).find((x) => x.name === name)
  if (!t) throw new Error(`Table not found: ${name}`)
  return t
}

export async function createTableFromHeader(
  conn: LattixConnection,
  header: string[],
  data: string[][],
): Promise<Table> {
  const client: LattixClient = createClient(conn)
  const { table } = await client.table.create({
    name: `Imported ${new Date().toISOString().slice(0, 10)}`,
    description: 'Created by CSV import',
  })
  for (let c = 0; c < header.length; c++) {
    const colName = (header[c] ?? '').trim() || `col_${c + 1}`
    const samples = data.map((r) => r[c] ?? '').slice(0, 50)
    const type = inferColumnType(samples)
    await client.field.create({
      tableId: (table as Table).id,
      name: colName,
      type,
      options: {},
    })
  }
  return table as Table
}

export function mapColumnsToFields(header: string[], fields: Field[]): Map<number, Field> {
  const byName = new Map(fields.map((f) => [normaliseName(f.name), f]))
  const out = new Map<number, Field>()
  header.forEach((rawName, i) => {
    const f = byName.get(normaliseName(rawName))
    if (f) out.set(i, f)
  })
  return out
}

function normaliseName(s: string): string {
  return s.trim().toLowerCase()
}

export function coerceForType(field: Field, raw: string): unknown {
  const v = raw.trim()
  if (v === '') {
    return field.type === 'checkbox' ? false : null
  }
  switch (field.type) {
    case 'checkbox':
      return /^(true|yes|1)$/i.test(v)
    case 'number': {
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    case 'date':
      return v
    case 'select':
      return v
    case 'text':
    default:
      return v
  }
}
