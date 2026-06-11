import React from 'react'
import { render } from 'ink-testing-library'
import { Text } from 'ink'
import type { LattixConnection } from '@lattix/client'
import { DataStore } from '../store/data-store.js'
import { useDataStore } from '../hooks/use-data-store.js'

const tick = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms))

class FakeConn {
  request<T = unknown>(method: string): Promise<T> {
    if (method === 'table.list') return Promise.resolve({ tables: [] } as T)
    if (method === 'table.create')
      return Promise.resolve({
        table: { id: 't_new', name: 'X', description: null, createdAt: 0, updatedAt: 0 },
      } as T)
    if (method === 'field.list') return Promise.resolve({ fields: [] } as T)
    if (method === 'record.list') return Promise.resolve({ records: [], total: 0 } as T)
    return Promise.resolve({} as T)
  }
  subscribe(): Promise<() => void> {
    return Promise.resolve(() => undefined)
  }
}

function Probe(props: { store: DataStore }): JSX.Element {
  const count = useDataStore(props.store, (s) => s.getTables().length)
  return React.createElement(Text, null, 'count=' + String(count))
}

describe('useDataStore', () => {
  it('re-renders when the store emits', async () => {
    const fake = new FakeConn() as unknown as LattixConnection
    const store = new DataStore(fake)
    const api = render(React.createElement(Probe, { store }))
    expect(api.lastFrame()).toContain('count=0')
    await store.createTable('X')
    await tick()
    expect(api.lastFrame()).toContain('count=1')
    api.unmount()
  })
})
