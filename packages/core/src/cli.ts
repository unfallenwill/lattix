#!/usr/bin/env node
import * as fs from 'node:fs'
import { loadConfig, ensureDataDirs, type CoreConfig } from './config.js'
import { EventBus } from './event-bus.js'
import { CoreServer } from './server.js'
import { Router } from './router.js'
import { SqliteStorage } from './storage/index.js'
import { TableService } from './services/table-service.js'
import { FieldService } from './services/field-service.js'
import { RecordService } from './services/record-service.js'
import { createBuiltinFieldRegistry } from '@lattix/shared'
import { seedIfEmpty } from './seed.js'

const SERVER_VERSION = '0.1.0'

interface ParsedArgs {
  command: 'start' | 'stop' | 'status' | 'help'
  options: {
    port?: number
    host?: string
    dataDir?: string
    foreground: boolean
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    command: 'help',
    options: { foreground: true },
  }
  const positional = argv.filter((a) => !a.startsWith('--'))
  const cmd = positional[0]
  if (cmd === 'start' || cmd === 'stop' || cmd === 'status' || cmd === 'help') {
    out.command = cmd
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--port') out.options.port = Number(argv[++i])
    else if (a === '--host') out.options.host = argv[++i]
    else if (a === '--data-dir') out.options.dataDir = argv[++i]
    else if (a === '--background') out.options.foreground = false
  }
  return out
}

function printHelp(): void {
  process.stdout.write(`lattix-core — local Core process for the lattix engine

Usage:
  lattix-core start [--port N] [--host ADDR] [--data-dir DIR]
  lattix-core stop
  lattix-core status
  lattix-core help

Environment:
  LATTIX_PORT        default port (default 8421)
  LATTIX_HOST        bind address (default 127.0.0.1)
  LATTIX_DATA_DIR    state directory (default ~/.lattix)
`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  switch (args.command) {
    case 'help':
      printHelp()
      return
    case 'status':
      await runStatus()
      return
    case 'stop':
      await runStop()
      return
    case 'start':
      await runStart(args.options)
      return
  }
}

async function runStart(opts: ParsedArgs['options']): Promise<void> {
  const cfg = loadConfig({
    ...(opts.port !== undefined ? { port: opts.port } : {}),
    ...(opts.host !== undefined ? { host: opts.host } : {}),
    ...(opts.dataDir !== undefined ? { dataDir: opts.dataDir } : {}),
  })
  ensureDataDirs(cfg)
  writePid(cfg, process.pid)
  const storage = new SqliteStorage({ dbPath: cfg.dbPath })
  const fields = createBuiltinFieldRegistry()
  const bus = new EventBus()
  seedIfEmpty(storage, fields)
  const tableService = new TableService({ storage, bus })
  const fieldService = new FieldService({ storage, bus, fields })
  const recordService = new RecordService({ storage, bus, fields })
  const router = new Router({
    storage,
    fields,
    tableService,
    fieldService,
    recordService,
    serverVersion: SERVER_VERSION,
  })
  const server = new CoreServer({
    port: cfg.port,
    host: cfg.host,
    router,
    bus,
    serverVersion: SERVER_VERSION,
  })
  const running = await server.start()
  process.stdout.write(`lattix-core listening on ${running.url}\n`)
  process.stdout.write(`data dir: ${cfg.dataDir}\n`)

  const shutdown = async (sig: NodeJS.Signals): Promise<void> => {
    process.stdout.write(`\nReceived ${sig}, shutting down...\n`)
    await running.close()
    storage.close()
    clearPid(cfg)
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

async function runStatus(): Promise<void> {
  const cfg = loadConfig()
  if (!fs.existsSync(cfg.pidFile)) {
    process.stdout.write('Core is not running (no pid file).\n')
    return
  }
  const pid = Number(fs.readFileSync(cfg.pidFile, 'utf8').trim())
  if (!Number.isFinite(pid)) {
    process.stdout.write(`Invalid pid file at ${cfg.pidFile}\n`)
    return
  }
  try {
    process.kill(pid, 0)
    process.stdout.write(`Core is running (pid=${pid}, port=${cfg.port}).\n`)
  } catch {
    process.stdout.write(`Stale pid file (pid=${pid} not alive).\n`)
  }
}

async function runStop(): Promise<void> {
  const cfg = loadConfig()
  if (!fs.existsSync(cfg.pidFile)) {
    process.stdout.write('No pid file; nothing to stop.\n')
    return
  }
  const pid = Number(fs.readFileSync(cfg.pidFile, 'utf8').trim())
  try {
    process.kill(pid, 'SIGTERM')
    process.stdout.write(`Sent SIGTERM to pid=${pid}.\n`)
  } catch (err) {
    process.stdout.write(`Failed to stop pid=${pid}: ${(err as Error).message}\n`)
  }
}

function writePid(cfg: CoreConfig, pid: number): void {
  fs.writeFileSync(cfg.pidFile, String(pid), 'utf8')
}

function clearPid(cfg: CoreConfig): void {
  try {
    fs.unlinkSync(cfg.pidFile)
  } catch {
    // ignore
  }
}

main().catch((err) => {
  process.stderr.write(`lattix-core: ${(err as Error).stack ?? String(err)}\n`)
  process.exit(1)
})
