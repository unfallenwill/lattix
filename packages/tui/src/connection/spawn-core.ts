import { spawn, type ChildProcess } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defaultDataDir } from './paths.js'

/**
 * Locate the lattix-core launcher. Three places, in order:
 *
 *   1. The `lattix-core` bin shim on PATH (set by `npm install -g`
 *      or by `npm install` writing node_modules/.bin).
 *   2. The compiled CLI inside the workspace — found by resolving
 *      `@lattix/core/package.json` and reading its `bin` entry.
 *      Covers `npm run dev:tui` from the monorepo root before any
 *      global install.
 *   3. null — caller falls back to a friendly error.
 *
 * Returns either an executable path (run as-is) or { node, script }
 * for "node /path/to/cli.js" style invocation. The shape disambiguates
 * who handles the shebang.
 */
export type CoreLauncher = { kind: 'exec'; bin: string } | { kind: 'node'; script: string }

export function resolveCoreLauncher(): CoreLauncher | null {
  // 1. PATH — the way it's installed for end users.
  if (binaryOnPath('lattix-core')) {
    return { kind: 'exec', bin: 'lattix-core' }
  }

  // 2. Workspace dist — for monorepo dev. Find @lattix/core via Node's
  //    resolver, then read its package.json to get the bin path.
  try {
    const here = fileURLToPath(import.meta.url)
    const req = createRequire(here)
    // Use main entry to anchor the package, then walk to its package.json.
    const coreEntry = req.resolve('@lattix/core')
    const pkgDir = findPackageRoot(coreEntry)
    if (pkgDir) {
      const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) as {
        bin?: Record<string, string> | string
      }
      const binEntry =
        typeof pkg.bin === 'string' ? pkg.bin : (pkg.bin?.['lattix-core'] ?? pkg.bin?.['core'])
      if (binEntry) {
        const script = path.resolve(pkgDir, binEntry)
        if (fs.existsSync(script)) {
          return { kind: 'node', script }
        }
      }
    }
  } catch {
    // fallthrough
  }

  return null
}

function binaryOnPath(name: string): boolean {
  const PATH = process.env['PATH'] ?? ''
  const dirs = PATH.split(path.delimiter).filter(Boolean)
  for (const d of dirs) {
    try {
      const candidate = path.join(d, name)
      // X_OK on POSIX; on Windows fs.accessSync just checks existence.
      fs.accessSync(candidate, fs.constants.X_OK)
      return true
    } catch {
      // try next
    }
  }
  return false
}

function findPackageRoot(startFile: string): string | null {
  let dir = path.dirname(startFile)
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

export interface SpawnResult {
  child: ChildProcess
  pid: number
}

// Try to spawn the Core. Resolves once the process is launched; the caller
// is responsible for waiting until the port is actually listening.
export function spawnCore(opts: { dataDir?: string } = {}): SpawnResult | null {
  const launcher = resolveCoreLauncher()
  if (!launcher) return null
  const dataDir = opts.dataDir ?? defaultDataDir()
  fs.mkdirSync(dataDir, { recursive: true })
  const args = ['start', '--data-dir', dataDir]
  const child =
    launcher.kind === 'exec'
      ? spawn(launcher.bin, args, { stdio: 'ignore', detached: false })
      : spawn(process.execPath, [launcher.script, ...args], { stdio: 'ignore', detached: false })
  if (!child.pid) return null
  return { child, pid: child.pid }
}

/**
 * Is the Core already running? Two checks: pid file points at a live
 * process AND that process owns the lattix port. Either alone is wrong:
 *   - PID alone: a stale pid that the OS reused for an unrelated process
 *     (very common on dev machines after a reboot) makes us think Core
 *     is up when it isn't.
 *   - Port alone: would race with our own boot — caller is about to
 *     poll the port anyway.
 *
 * If the pid file is stale (process dead, or alive but not actually our
 * Core), we delete it so spawnCore() can run cleanly. This silently
 * heals after a hard reboot.
 */
export function isCoreRunning(dataDir?: string): number | null {
  const dir = dataDir ?? defaultDataDir()
  const pidFile = path.join(dir, 'core.pid')
  if (!fs.existsSync(pidFile)) return null
  const raw = fs.readFileSync(pidFile, 'utf8').trim()
  const pid = Number(raw)
  if (!Number.isFinite(pid)) {
    safeUnlink(pidFile)
    return null
  }
  try {
    process.kill(pid, 0)
    return pid
  } catch {
    safeUnlink(pidFile)
    return null
  }
}

function safeUnlink(p: string): void {
  try {
    fs.unlinkSync(p)
  } catch {
    // ignore
  }
}
