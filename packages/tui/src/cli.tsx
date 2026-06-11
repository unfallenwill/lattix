#!/usr/bin/env node
import React from 'react'
import { render } from 'ink'
import { connectToCore } from './connection/connect.js'
import { App } from './app.jsx'
import { defaultCoreUrl } from './connection/paths.js'
import { type LattixConnection } from '@lattix/client'
import { runImport } from './commands/import-csv.js'

export const HELP = `lattix — local-first multi-dimensional table TUI client

Usage:
  lattix [--url ws://host:port] [--no-autostart]
  lattix record import --table <name> --file <path> [--auto-create]
  lattix record import --file <path> --auto-create
  lattix help

If the Core is not running, lattix will spawn it automatically (unless
--no-autostart is passed).
`

interface IO {
  stdout: NodeJS.WritableStream
  stderr: NodeJS.WritableStream
}

const defaultIO: IO = { stdout: process.stdout, stderr: process.stderr }

export interface TuiArgs {
  url: string
  noAutoStart: boolean
}

export function parseTuiArgs(argv: string[]): TuiArgs {
  let url = defaultCoreUrl()
  let noAutoStart = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--url') url = String(argv[++i])
    else if (a === '--no-autostart') noAutoStart = true
  }
  return { url, noAutoStart }
}

export interface RecordImportArgs {
  tableName?: string
  file: string
  autoCreate: boolean
  url?: string
}

export function parseRecordImportArgs(argv: string[]): RecordImportArgs {
  let tableName: string | undefined
  let file = ''
  let autoCreate = false
  let url: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--table' || a === '-t') tableName = String(argv[++i])
    else if (a === '--file' || a === '-f') file = String(argv[++i])
    else if (a === '--auto-create') autoCreate = true
    else if (a === '--url') url = String(argv[++i])
  }
  return { tableName, file, autoCreate, url }
}

/** Returns a process exit code instead of calling process.exit (test seam). */
export async function main(argv: string[], io: IO = defaultIO): Promise<number> {
  if (argv[0] === 'help' || argv[0] === '-h' || argv[0] === '--help') {
    io.stdout.write(HELP)
    return 0
  }
  if (argv[0] === 'record' && argv[1] === 'import') {
    return await runRecordImport(argv.slice(2), io)
  }
  return await runTui(argv, io)
}

export async function runTui(argv: string[], io: IO = defaultIO): Promise<number> {
  const { url, noAutoStart } = parseTuiArgs(argv)
  let conn: LattixConnection
  try {
    conn = await connectToCore({ url, autoStart: !noAutoStart })
  } catch (err) {
    io.stderr.write(`lattix: ${(err as Error).message}\n`)
    return 1
  }
  const { waitUntilExit } = render(React.createElement(App, { conn }))
  await waitUntilExit()
  await conn.close().catch(() => undefined)
  return 0
}

export async function runRecordImport(argv: string[], io: IO = defaultIO): Promise<number> {
  const { tableName, file, autoCreate, url } = parseRecordImportArgs(argv)
  if (!file) {
    io.stderr.write('lattix record import: --file is required\n')
    return 2
  }
  if (!tableName && !autoCreate) {
    io.stderr.write('lattix record import: --table <name> or --auto-create is required\n')
    return 2
  }
  try {
    const res = await runImport({ file, tableName, autoCreate, url })
    io.stdout.write(
      `imported ${res.imported} row(s) into "${res.table.name}" (${res.errors} error(s))\n`,
    )
    return 0
  } catch (err) {
    io.stderr.write(`lattix record import: ${(err as Error).message}\n`)
    return 1
  }
}

// Only run when invoked as a script (not imported).
const isMain = import.meta.url === `file://${process.argv[1] ?? ''}`
if (isMain) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      process.stderr.write(`lattix: ${(err as Error).stack ?? String(err)}\n`)
      process.exit(1)
    },
  )
}
