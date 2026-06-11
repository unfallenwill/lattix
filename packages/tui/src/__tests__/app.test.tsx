/**
 * App is the root component: orchestrates GridView + dialogs (help,
 * table-switcher, confirm-delete) + status bar. Covers the dialog
 * toggle/escape branches and the initial load.
 */
import React from 'react'
import { render } from 'ink-testing-library'
import type { LattixConnection, ConnectionState } from '@lattix/client'
import type { Table } from '@lattix/shared'
import type { ServerFrame } from '@lattix/protocol'
import { App } from '../app.js'

const tick = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms))

beforeAll(() => {
  const probe = render(React.createElement(React.Fragment))
  const StdoutCtor = Object.getPrototypeOf(probe.stdout).constructor as {
    prototype: object
  }
  if (!('rows' in StdoutCtor.prototype)) {
    Object.defineProperty(StdoutCtor.prototype, 'rows', {
      configurable: true,
      get(): number {
        return 24
      },
    })
  }
  probe.unmount()
})

class FakeConn {
  tables: Table[] = [{ id: 't1', name: 'Alpha', description: null, createdAt: 0, updatedAt: 0 }]
  stateListeners: Array<(s: ConnectionState) => void> = []
  request<T = unknown>(method: string): Promise<T> {
    if (method === 'table.list') return Promise.resolve({ tables: [...this.tables] } as T)
    if (method === 'field.list') return Promise.resolve({ fields: [] } as T)
    if (method === 'record.list') return Promise.resolve({ records: [], total: 0 } as T)
    return Promise.resolve({} as T)
  }
  subscribe(_channel: string, _h: (f: ServerFrame) => void): Promise<() => void> {
    return Promise.resolve(() => undefined)
  }
  onState(l: (s: ConnectionState) => void): () => void {
    this.stateListeners.push(l)
    l('connected')
    return () => {
      this.stateListeners = this.stateListeners.filter((x) => x !== l)
    }
  }
}

describe('App', () => {
  it('renders the status bar with the connection state', async () => {
    const conn = new FakeConn() as unknown as LattixConnection
    const api = render(React.createElement(App, { conn }))
    await tick()
    const frame = api.lastFrame() ?? ''
    expect(frame).toContain('connected')
    // status bar dims mode text; assert on hints text instead which is plainer
    expect(frame).toMatch(/Esc: close|j\/k move|navigation/)
    api.unmount()
  })

  it('? toggles the help overlay', async () => {
    const conn = new FakeConn() as unknown as LattixConnection
    const api = render(React.createElement(App, { conn }))
    await tick()
    api.stdin.write('?')
    await tick()
    expect(api.lastFrame()).toContain('Move down')
    api.stdin.write('?') // close
    await tick()
    expect(api.lastFrame()).not.toContain('Move down')
    api.unmount()
  })

  it('t toggles the table switcher', async () => {
    const conn = new FakeConn() as unknown as LattixConnection
    const api = render(React.createElement(App, { conn }))
    await tick()
    api.stdin.write('t')
    await tick()
    expect(api.lastFrame()).toContain('Tables')
    expect(api.lastFrame()).toContain('Alpha')
    api.unmount()
  })

  it('Esc closes whichever dialog is open', async () => {
    const conn = new FakeConn() as unknown as LattixConnection
    const api = render(React.createElement(App, { conn }))
    await tick()
    api.stdin.write('?') // open help
    await tick()
    api.stdin.write('') // ESC
    await tick()
    expect(api.lastFrame()).not.toContain('Move down')
    api.unmount()
  })
})
