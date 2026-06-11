import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { isCoreRunning } from '../connection/spawn-core.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lattix-pid-'))
}

describe('isCoreRunning', () => {
  it('returns null when pid file is absent', () => {
    expect(isCoreRunning(tmpDir())).toBeNull()
  })

  it('returns null when pid file is unparseable', () => {
    const dir = tmpDir()
    fs.writeFileSync(path.join(dir, 'core.pid'), 'not-a-number')
    expect(isCoreRunning(dir)).toBeNull()
  })

  it('returns null when the pid is dead', () => {
    const dir = tmpDir()
    // 1 is init; on Linux we can't signal it from a non-root user, which
    // process.kill treats as ESRCH-or-EPERM both → catches and returns null.
    // Pick a pid that's almost certainly not ours but parses fine.
    fs.writeFileSync(path.join(dir, 'core.pid'), '999999999')
    expect(isCoreRunning(dir)).toBeNull()
  })

  it('returns the pid when the process IS alive (our own pid)', () => {
    const dir = tmpDir()
    fs.writeFileSync(path.join(dir, 'core.pid'), String(process.pid))
    expect(isCoreRunning(dir)).toBe(process.pid)
  })
})
