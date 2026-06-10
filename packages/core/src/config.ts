import * as path from 'node:path'
import * as os from 'node:os'
import * as fs from 'node:fs'

export interface CoreConfig {
  /** Root directory for all Core state. Defaults to `~/.lattix/`. */
  dataDir: string
  /** SQLite database file. */
  dbPath: string
  /** Logs directory. */
  logsDir: string
  /** HTTP/WebSocket bind address (loopback only by default). */
  host: string
  /** WebSocket port. */
  port: number
  /** PID file location for the running Core instance, if any. */
  pidFile: string
}

export const DEFAULT_PORT = 8421
export const DEFAULT_HOST = '127.0.0.1'
export const APP_DIR_NAME = '.lattix'

export function defaultDataDir(): string {
  return path.join(os.homedir(), APP_DIR_NAME)
}

export function loadConfig(overrides: Partial<CoreConfig> = {}): CoreConfig {
  const dataDir = overrides.dataDir ?? process.env['LATTIX_DATA_DIR'] ?? defaultDataDir()
  return {
    dataDir,
    dbPath: path.join(dataDir, 'core.db'),
    logsDir: path.join(dataDir, 'logs'),
    pidFile: path.join(dataDir, 'core.pid'),
    host: overrides.host ?? process.env['LATTIX_HOST'] ?? DEFAULT_HOST,
    port: overrides.port ?? Number(process.env['LATTIX_PORT'] ?? DEFAULT_PORT),
  }
}

export function ensureDataDirs(cfg: CoreConfig): void {
  fs.mkdirSync(cfg.dataDir, { recursive: true })
  fs.mkdirSync(cfg.logsDir, { recursive: true })
}
