import {
  defaultCoreUrl,
  defaultDataDir,
  APP_DIR_NAME,
  DEFAULT_HOST,
  DEFAULT_PORT,
} from '../connection/paths.js'
import * as os from 'node:os'

describe('paths', () => {
  it('defaultCoreUrl uses loopback + default port', () => {
    expect(defaultCoreUrl()).toBe(`ws://${DEFAULT_HOST}:${DEFAULT_PORT}`)
  })

  it('defaultDataDir lives under the home directory', () => {
    const d = defaultDataDir()
    expect(d.startsWith(os.homedir())).toBe(true)
    expect(d.endsWith(APP_DIR_NAME)).toBe(true)
  })

  it('constants are loopback / 8421 / .lattix', () => {
    expect(DEFAULT_HOST).toBe('127.0.0.1')
    expect(DEFAULT_PORT).toBe(8421)
    expect(APP_DIR_NAME).toBe('.lattix')
  })
})
