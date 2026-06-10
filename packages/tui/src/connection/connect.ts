import { LattixConnection, type ConnectionState } from '@lattix/client'
import { WebSocket as WS } from 'ws'
import { defaultCoreUrl, defaultDataDir } from './paths.js'
import { isCoreRunning, spawnCore } from './spawn-core.js'

const BOOT_TIMEOUT_MS = 8_000
const POLL_INTERVAL_MS = 100

export interface ConnectOptions {
  url?: string
  dataDir?: string
  autoStart?: boolean
}

// Bring up the connection to the Core. If no Core is running, attempt
// to spawn one (unless autoStart is false) and wait for it to listen.
export async function connectToCore(opts: ConnectOptions = {}): Promise<LattixConnection> {
  const url = opts.url ?? defaultCoreUrl()
  const dataDir = opts.dataDir ?? defaultDataDir()
  const autoStart = opts.autoStart ?? true

  if (!(await canReach(url, 200))) {
    if (!autoStart) {
      throw new Error(`Core not reachable at ${url} (autoStart disabled)`)
    }
    if (!isCoreRunning(dataDir) && !spawnCore({ dataDir })) {
      throw new Error('Failed to spawn lattix-core. Is it installed on PATH?')
    }
    const started = await waitForPort(url, BOOT_TIMEOUT_MS)
    if (!started) {
      throw new Error(`Core did not start within ${BOOT_TIMEOUT_MS}ms`)
    }
  }

  const conn = new LattixConnection({ url })
  await conn.connect()
  return conn
}

async function canReach(url: string, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const ws = new WS(url)
    const t = setTimeout(() => {
      ws.terminate()
      resolve(false)
    }, timeoutMs)
    ws.once('open', () => {
      clearTimeout(t)
      ws.close()
      resolve(true)
    })
    ws.once('error', () => {
      clearTimeout(t)
      resolve(false)
    })
  })
}

async function waitForPort(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await canReach(url, 300)) return true
    await sleep(POLL_INTERVAL_MS)
  }
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export type { ConnectionState }
