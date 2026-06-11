import * as fs from 'node:fs'
import type { LattixConnection, ConnectionState } from '@lattix/client'
import type { Table, Field } from '@lattix/shared'
import { connectToCore } from '../connection/connect.js'
import { defaultCoreUrl } from '../connection/paths.js'
import { parseCsv } from './parse-csv.js'
import {
  findTableByName,
  createTableFromHeader,
  mapColumnsToFields,
  coerceForType,
} from './import-csv-helpers.js'

export interface ImportOptions {
  url?: string
  tableName?: string
  file: string
  autoCreate?: boolean
  batchSize?: number
  /** Test seam: inject a connection factory instead of calling connectToCore. */
  connect?: (url: string) => Promise<LattixConnection>
}

export interface ImportResult {
  table: Table
  imported: number
  errors: number
}

const DEFAULT_BATCH = 200

// Placeholder; see subsequent patches.
export async function runImport(opts: ImportOptions): Promise<ImportResult> {
  const url = opts.url ?? defaultCoreUrl()
  const conn = opts.connect ? await opts.connect(url) : await connectToCore({ url })
  try {
    const text = fs.readFileSync(opts.file, 'utf8')
    const rows = parseCsv(text)
    if (rows.length === 0) throw new Error('CSV is empty')
    const header = rows[0] as string[]
    const data = rows.slice(1)
    if (data.length === 0) throw new Error('CSV has no data rows')

    const table: Table = opts.autoCreate
      ? await createTableFromHeader(conn, header, data)
      : await findTableByName(conn, opts.tableName)

    const fieldsRes = (await conn.request('field.list', { tableId: table.id })) as {
      fields: Field[]
    }
    const colToField = mapColumnsToFields(header, fieldsRes.fields)
    if (colToField.size === 0) {
      throw new Error('No CSV columns match any field in the target table')
    }

    const batchSize = opts.batchSize ?? DEFAULT_BATCH
    let imported = 0
    let errors = 0
    for (let i = 0; i < data.length; i += batchSize) {
      const slice = data.slice(i, i + batchSize)
      const records = slice.map((row) => {
        const obj: Record<string, unknown> = {}
        for (let c = 0; c < header.length; c++) {
          const field = colToField.get(c)
          if (!field) continue
          const raw = row[c] ?? ''
          obj[field.id] = coerceForType(field, raw)
        }
        return obj
      })
      try {
        const res = (await conn.request('record.batch', {
          tableId: table.id,
          operations: records.map((row) => ({ op: 'create' as const, data: row })),
        })) as { results: unknown[] }
        imported += res.results.length
      } catch (err) {
        errors += slice.length
        process.stderr.write(`batch ${i}-${i + slice.length} failed: ${(err as Error).message}\n`)
      }
    }
    return { table, imported, errors }
  } finally {
    await conn.close().catch(() => undefined)
  }
}

export type { ConnectionState }
