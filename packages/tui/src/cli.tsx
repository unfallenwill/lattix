#!/usr/bin/env node
import React from 'react'
import { render } from 'ink'
import { connectToCore } from './connection/connect.js'
import { App } from './app.jsx'
import { defaultCoreUrl } from './connection/paths.js'
import { type LattixConnection } from '@lattix/client'
import { runImport } from './commands/import-csv.js'

const HELP = `lattix — local-first multi-dimensional table TUI client

Usage:
  lattix [--url ws://host:port] [--no-autostart]
  lattix record import --table <name> --file <path> [--auto-create]
  lattix record import --file <path> --auto-create
  lattix help

If the Core is not running, lattix will spawn it automatically (unless
--no-autostart is passed).
`

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args[0] === 'help' || args[0] === '-h' || args[0] === '--help') {
    process.stdout.write(HELP)
    return
  }
  if (args[0] === 'record' && args[1] === 'import') {
    await runRecordImport(args.slice(2))
    return
  }
  await runTui(args)
}

async function runTui(args: string[]): Promise<void> {
  let url = defaultCoreUrl()
  let noAutoStart = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--url') url = String(args[++i])
    else if (a === '--no-autostart') noAutoStart = true
  }
  let conn: LattixConnection
  try {
    conn = await connectToCore({ url, autoStart: !noAutoStart })
  } catch (err) {
    process.stderr.write(`lattix: ${(err as Error).message}\n`)
    process.exit(1)
  }
  const { waitUntilExit } = render(React.createElement(App, { conn }))
  await waitUntilExit()
  await conn.close().catch(() => undefined)
}

async function runRecordImport(argv: string[]): Promise<void> {
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
  if (!file) {
    process.stderr.write('lattix record import: --file is required\n')
    process.exit(2)
  }
  if (!tableName && !autoCreate) {
    process.stderr.write('lattix record import: --table <name> or --auto-create is required\n')
    process.exit(2)
  }
  try {
    const res = await runImport({ file, tableName, autoCreate, url })
    process.stdout.write(
      `imported ${res.imported} row(s) into "${res.table.name}" (${res.errors} error(s))\n`,
    )
  } catch (err) {
    process.stderr.write(`lattix record import: ${(err as Error).message}\n`)
    process.exit(1)
  }
}

main().catch((err) => {
  process.stderr.write(`lattix: ${(err as Error).stack ?? String(err)}\n`)
  process.exit(1)
})
