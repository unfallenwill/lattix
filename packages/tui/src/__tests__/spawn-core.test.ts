import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { isCoreRunning, resolveCoreLauncher } from '../connection/spawn-core.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lattix-pid-'))
}

describe('isCoreRunning', () => {
  it('returns null when pid file is absent', () => {
    expect(isCoreRunning(tmpDir())).toBeNull()
  })

  it('returns null when pid file is unparseable, and removes the bad file', () => {
    const dir = tmpDir()
    const pidFile = path.join(dir, 'core.pid')
    fs.writeFileSync(pidFile, 'not-a-number')
    expect(isCoreRunning(dir)).toBeNull()
    expect(fs.existsSync(pidFile)).toBe(false)
  })

  it('returns null when the pid is dead, and clears the stale file', () => {
    const dir = tmpDir()
    const pidFile = path.join(dir, 'core.pid')
    // 999999999 is a pid Linux is very unlikely to ever issue; on a fresh
    // machine it's also not held by anyone, so process.kill(pid, 0) throws
    // ESRCH and we treat the pid file as stale.
    fs.writeFileSync(pidFile, '999999999')
    expect(isCoreRunning(dir)).toBeNull()
    expect(fs.existsSync(pidFile)).toBe(false)
  })

  it('returns the pid when the process IS alive (our own pid)', () => {
    const dir = tmpDir()
    const pidFile = path.join(dir, 'core.pid')
    fs.writeFileSync(pidFile, String(process.pid))
    expect(isCoreRunning(dir)).toBe(process.pid)
    // file is preserved when the pid is live
    expect(fs.existsSync(pidFile)).toBe(true)
  })
})

describe('resolveCoreLauncher', () => {
  it('finds a launcher in this monorepo (workspace fallback path)', () => {
    // Even without `lattix-core` on PATH, the workspace fallback should
    // locate packages/core/dist/cli.js via @lattix/core's package.json.
    const launcher = resolveCoreLauncher()
    expect(launcher).not.toBeNull()
    if (launcher?.kind === 'exec') {
      expect(launcher.bin).toBe('lattix-core')
    } else if (launcher?.kind === 'node') {
      expect(launcher.script).toMatch(/cli\.js$/)
      expect(fs.existsSync(launcher.script)).toBe(true)
    }
  })
})
