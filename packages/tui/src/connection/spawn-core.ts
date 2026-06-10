import { spawn, type ChildProcess } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { defaultDataDir } from './paths.js'

// Locate the lattix-core binary. When running from a workspace install,
// npm places the bin shim on PATH. In dev (ts-node), fall back to the
// compiled CLI if it exists, otherwise to `tsx`/source fallback.
function resolveCoreBin(): string | null {
  // The npm bin shim from @lattix/core installs as `lattix-core`.
  return 'lattix-core'
}

export interface SpawnResult {
  child: ChildProcess
  pid: number
}

// Try to spawn the Core. Resolves once the process is launched; the caller
// is responsible for waiting until the port is actually listening.
export function spawnCore(opts: { dataDir?: string } = {}): SpawnResult | null {
  const bin = resolveCoreBin()
  if (!bin) return null
  const dataDir = opts.dataDir ?? defaultDataDir()
  fs.mkdirSync(dataDir, { recursive: true })
  const child = spawn(bin, ['start', '--data-dir', dataDir], {
    stdio: 'ignore',
    detached: false,
  })
  if (!child.pid) return null
  return { child, pid: child.pid }
}

// Is the Core already running? Check the pid file.
export function isCoreRunning(dataDir?: string): number | null {
  const dir = dataDir ?? defaultDataDir()
  const pidFile = path.join(dir, 'core.pid')
  if (!fs.existsSync(pidFile)) return null
  const pid = Number(fs.readFileSync(pidFile, 'utf8').trim())
  if (!Number.isFinite(pid)) return null
  try {
    process.kill(pid, 0)
    return pid
  } catch {
    return null
  }
}
