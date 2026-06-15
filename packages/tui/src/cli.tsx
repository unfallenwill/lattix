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
  // Enter the terminal's alternate screen buffer so the TUI takes the whole
  // viewport and the user's scrollback is preserved on exit. The matching
  // leave-sequence is wired to several termination paths below — if any one
  // of them fires we still need to restore the main buffer.
  const isTty = (io.stdout as NodeJS.WriteStream).isTTY === true
  let restored = false
  const restore = (): void => {
    if (restored || !isTty) return
    restored = true
    io.stdout.write('\x1b[?1049l\x1b[?25h')
  }
  if (isTty) io.stdout.write('\x1b[?1049h\x1b[2J\x1b[H')
  process.on('exit', restore)
  process.on('SIGINT', restore)
  process.on('SIGTERM', restore)
  process.on('uncaughtException', restore)
  try {
    const { waitUntilExit } = render(React.createElement(App, { conn }))
    await waitUntilExit()
  } finally {
    restore()
    await conn.close().catch(() => undefined)
  }
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
// Comparing import.meta.url to argv[1] directly breaks under symlinks: the
// npm bin shim node_modules/.bin/lattix is a symlink to dist/cli.js, so
// argv[1] is the shim path while import.meta.url resolves to the real
// file — they never match and main() doesn't run. Resolve both to their
// real paths before comparing.
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function isMainModule(): boolean {
  try {
    const here = realpathSync(fileURLToPath(import.meta.url))
    const invoked = realpathSync(process.argv[1] ?? '')
    return here === invoked
  } catch {
    return false
  }
}

if (isMainModule()) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      process.stderr.write(`lattix: ${(err as Error).stack ?? String(err)}\n`)
      process.exit(1)
    },
  )
}
