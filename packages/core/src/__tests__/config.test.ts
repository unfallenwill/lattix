import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  defaultDataDir,
  ensureDataDirs,
  loadConfig,
} from '../config.js'

const ENV_KEYS = ['LATTIX_DATA_DIR', 'LATTIX_HOST', 'LATTIX_PORT'] as const

function clearEnv(): void {
  for (const k of ENV_KEYS) delete process.env[k]
}

describe('loadConfig', () => {
  beforeEach(clearEnv)
  afterEach(clearEnv)

  it('falls back to defaults when nothing is set', () => {
    const cfg = loadConfig()
    expect(cfg.dataDir).toBe(defaultDataDir())
    expect(cfg.host).toBe(DEFAULT_HOST)
    expect(cfg.port).toBe(DEFAULT_PORT)
    expect(cfg.dbPath.endsWith('core.db')).toBe(true)
    expect(cfg.logsDir.endsWith('logs')).toBe(true)
    expect(cfg.pidFile.endsWith('core.pid')).toBe(true)
  })

  it('honours overrides over env over defaults', () => {
    process.env['LATTIX_DATA_DIR'] = '/env/dir'
    process.env['LATTIX_HOST'] = '0.0.0.0'
    process.env['LATTIX_PORT'] = '9999'
    const cfg = loadConfig()
    expect(cfg.dataDir).toBe('/env/dir')
    expect(cfg.host).toBe('0.0.0.0')
    expect(cfg.port).toBe(9999)
    expect(cfg.dbPath).toBe('/env/dir/core.db')

    const overridden = loadConfig({ dataDir: '/from/opts', host: 'h', port: 1 })
    expect(overridden.dataDir).toBe('/from/opts')
    expect(overridden.host).toBe('h')
    expect(overridden.port).toBe(1)
  })
})

describe('ensureDataDirs', () => {
  it('creates dataDir and logsDir if missing (idempotent)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lattix-cfg-'))
    try {
      const cfg = loadConfig({ dataDir: path.join(root, 'nested', 'dir') })
      ensureDataDirs(cfg)
      expect(fs.existsSync(cfg.dataDir)).toBe(true)
      expect(fs.existsSync(cfg.logsDir)).toBe(true)
      // second call is a no-op
      ensureDataDirs(cfg)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('defaultDataDir', () => {
  it('returns a path under the home directory', () => {
    expect(defaultDataDir().startsWith(os.homedir())).toBe(true)
  })
})
