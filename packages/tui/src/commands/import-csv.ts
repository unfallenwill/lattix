import * as fs from 'node:fs'
import type { LattixConnection, ConnectionState } from '@lattix/client'
import { createClient } from '@lattix/client'
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

export async function runImport(opts: ImportOptions): Promise<ImportResult> {
  // Validate the local input BEFORE doing any network / process work.
  // Connecting to Core can spawn it (8s boot timeout) and the user
  // shouldn't pay that cost just to learn their --file path is wrong.
  const text = readCsvFileOrThrow(opts.file)
  const rows = parseCsv(text)
  if (rows.length === 0) throw new Error('CSV is empty')
  const header = rows[0] as string[]
  const data = rows.slice(1)
  if (data.length === 0) throw new Error('CSV has no data rows')

  const url = opts.url ?? defaultCoreUrl()
  const conn = opts.connect ? await opts.connect(url) : await connectToCore({ url })
  const client = createClient(conn)
  try {
    const table: Table = opts.autoCreate
      ? await createTableFromHeader(conn, header, data)
      : await findTableByName(conn, opts.tableName)

    const { fields } = await client.field.list({ tableId: table.id })
    const colToField = mapColumnsToFields(header, fields as Field[])
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
        const res = await client.record.batch({
          tableId: table.id,
          operations: records.map((row) => ({ op: 'create' as const, data: row })),
        })
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

/**
 * Read the CSV file synchronously, with a friendly error for the
 * common cases (missing file, directory, permission denied) so the
 * caller doesn't have to interpret raw errno strings.
 */
function readCsvFileOrThrow(file: string): string {
  try {
    const stat = fs.statSync(file)
    if (!stat.isFile()) throw new Error(`Not a file: ${file}`)
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code === 'ENOENT') throw new Error(`File not found: ${file}`)
    if (e.code === 'EACCES') throw new Error(`Permission denied: ${file}`)
    throw err
  }
  return fs.readFileSync(file, 'utf8')
}

export type { ConnectionState }
