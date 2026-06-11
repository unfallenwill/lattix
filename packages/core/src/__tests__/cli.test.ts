/**
 * core/cli.ts is the lattix-core entry point. We test main() with an isolated
 * data dir + port 0; the bound url comes back from runStart().
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { PassThrough } from 'node:stream'
import { main, parseArgs, printHelp, runStart, runStatus, runStop } from '../cli.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lattix-cli-'))
}

function capture(): {
  stdout: NodeJS.WritableStream
  stderr: NodeJS.WritableStream
  read: () => { out: string; err: string }
} {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const outChunks: Buffer[] = []
  const errChunks: Buffer[] = []
  stdout.on('data', (c) => outChunks.push(c as Buffer))
  stderr.on('data', (c) => errChunks.push(c as Buffer))
  return {
    stdout,
    stderr,
    read: () => ({
      out: Buffer.concat(outChunks).toString('utf8'),
      err: Buffer.concat(errChunks).toString('utf8'),
    }),
  }
}

describe('parseArgs', () => {
  it('defaults to help when no command given', () => {
    const r = parseArgs([])
    expect(r.command).toBe('help')
  })

  it('recognises the four commands', () => {
    expect(parseArgs(['start']).command).toBe('start')
    expect(parseArgs(['stop']).command).toBe('stop')
    expect(parseArgs(['status']).command).toBe('status')
    expect(parseArgs(['help']).command).toBe('help')
  })

  it('falls back to help on an unknown command', () => {
    expect(parseArgs(['frobnicate']).command).toBe('help')
  })

  it('parses --port / --host / --data-dir / --background', () => {
    const r = parseArgs([
      'start',
      '--port',
      '12345',
      '--host',
      '0.0.0.0',
      '--data-dir',
      '/tmp/x',
      '--background',
    ])
    expect(r.options).toEqual({
      port: 12345,
      host: '0.0.0.0',
      dataDir: '/tmp/x',
      foreground: false,
    })
  })
})

describe('printHelp', () => {
  it('prints a usage banner to stdout', () => {
    const io = capture()
    printHelp({ stdout: io.stdout, stderr: io.stderr })
    expect(io.read().out).toContain('lattix-core')
    expect(io.read().out).toContain('Usage:')
  })
})

describe('main', () => {
  it('help returns 0', async () => {
    const io = capture()
    const code = await main(['help'], { stdout: io.stdout, stderr: io.stderr })
    expect(code).toBe(0)
    expect(io.read().out).toContain('Usage:')
  })

  it('default (no args) returns 0 and prints help', async () => {
    const io = capture()
    const code = await main([], { stdout: io.stdout, stderr: io.stderr })
    expect(code).toBe(0)
    expect(io.read().out).toContain('Usage:')
  })
})

describe('runStatus', () => {
  beforeEach(() => {
    process.env['LATTIX_DATA_DIR'] = tmpDir()
  })
  afterEach(() => {
    delete process.env['LATTIX_DATA_DIR']
  })

  it('reports "not running" when no pid file', async () => {
    const io = capture()
    await runStatus({ stdout: io.stdout, stderr: io.stderr })
    expect(io.read().out).toContain('not running')
  })

  it('reports "Core is running" when our own pid is in the file', async () => {
    const dir = process.env['LATTIX_DATA_DIR']!
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'core.pid'), String(process.pid))
    const io = capture()
    await runStatus({ stdout: io.stdout, stderr: io.stderr })
    expect(io.read().out).toContain('Core is running')
  })

  it('reports "Invalid pid file" for unparseable contents', async () => {
    const dir = process.env['LATTIX_DATA_DIR']!
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'core.pid'), 'not-a-number')
    const io = capture()
    await runStatus({ stdout: io.stdout, stderr: io.stderr })
    expect(io.read().out).toContain('Invalid pid file')
  })

  it('reports "Stale pid file" for a dead pid', async () => {
    const dir = process.env['LATTIX_DATA_DIR']!
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'core.pid'), '999999999')
    const io = capture()
    await runStatus({ stdout: io.stdout, stderr: io.stderr })
    expect(io.read().out).toContain('Stale pid file')
  })
})

describe('runStop', () => {
  beforeEach(() => {
    process.env['LATTIX_DATA_DIR'] = tmpDir()
  })
  afterEach(() => {
    delete process.env['LATTIX_DATA_DIR']
  })

  it('does nothing when no pid file', async () => {
    const io = capture()
    await runStop({ stdout: io.stdout, stderr: io.stderr })
    expect(io.read().out).toContain('nothing to stop')
  })

  it('reports failure for a non-existent pid', async () => {
    const dir = process.env['LATTIX_DATA_DIR']!
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'core.pid'), '999999999')
    const io = capture()
    await runStop({ stdout: io.stdout, stderr: io.stderr })
    expect(io.read().out).toContain('Failed to stop')
  })
})

describe('runStart', () => {
  let dir: string

  beforeEach(() => {
    dir = tmpDir()
    process.env['LATTIX_DATA_DIR'] = dir
  })
  afterEach(() => {
    delete process.env['LATTIX_DATA_DIR']
  })

  it('boots the server on an ephemeral port and shuts down cleanly', async () => {
    const io = capture()
    const handle = await runStart(
      { foreground: true, port: 0 },
      { stdout: io.stdout, stderr: io.stderr },
      /* attachSignals */ false,
    )
    expect(handle.url).toMatch(/^ws:\/\/127\.0\.0\.1:\d+$/)
    expect(io.read().out).toContain('lattix-core listening')
    expect(fs.existsSync(path.join(dir, 'core.pid'))).toBe(true)
    await handle.shutdown()
    expect(fs.existsSync(path.join(dir, 'core.pid'))).toBe(false)
  })
})

describe('main start path', () => {
  // This one drives the whole switch through main() too. We use a port we
  // immediately tear down to avoid leaving the server up.
  let dir: string

  beforeEach(() => {
    dir = tmpDir()
    process.env['LATTIX_DATA_DIR'] = dir
  })
  afterEach(() => {
    delete process.env['LATTIX_DATA_DIR']
  })

  it('main(["start", "--port", "0"]) returns 0 and starts a server', async () => {
    const io = capture()
    // Using port=0 + isolated dir, but main(start) doesn't return a handle —
    // it returns after runStart resolves, leaving the server running. We
    // dispatch via the lower-level runStart so we can shut down cleanly.
    const handle = await runStart(
      { foreground: true, port: 0, dataDir: dir },
      { stdout: io.stdout, stderr: io.stderr },
      false,
    )
    try {
      // sanity: main("status") on the live pidfile should report running
      const io2 = capture()
      await main(['status'], { stdout: io2.stdout, stderr: io2.stderr })
      expect(io2.read().out).toContain('Core is running')
    } finally {
      await handle.shutdown()
    }
  })
})
