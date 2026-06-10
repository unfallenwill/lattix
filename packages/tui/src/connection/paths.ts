import * as os from 'node:os'
import * as path from 'node:path'

export const APP_DIR_NAME = '.lattix'
export const DEFAULT_PORT = 8421
export const DEFAULT_HOST = '127.0.0.1'

export function defaultDataDir(): string {
  return path.join(os.homedir(), APP_DIR_NAME)
}

export function defaultCoreUrl(): string {
  return `ws://${DEFAULT_HOST}:${DEFAULT_PORT}`
}
