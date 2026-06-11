import React from 'react'
import { render } from 'ink-testing-library'
import type { Table } from '@lattix/shared'
import { StatusBar } from '../widgets/status-bar.js'
import { TableSwitcher } from '../widgets/table-switcher.js'

function table(id: string, name: string): Table {
  return { id, name, description: null, createdAt: 0, updatedAt: 0 }
}

describe('StatusBar', () => {
  it('renders state, mode, hints', () => {
    const { lastFrame } = render(
      React.createElement(StatusBar, {
        state: 'connected',
        mode: 'navigation',
        hints: 'q: quit',
      }),
    )
    const out = lastFrame() ?? ''
    expect(out).toContain('connected')
    expect(out).toContain('navigation')
    expect(out).toContain('q: quit')
  })

  it('renders a position block when given', () => {
    const { lastFrame } = render(
      React.createElement(StatusBar, {
        state: 'connected',
        mode: 'navigation',
        hints: '',
        position: { row: 0, total: 3, col: 1, cols: 4 },
      }),
    )
    const out = lastFrame() ?? ''
    expect(out).toContain('1/3 row')
    expect(out).toContain('2/4 col')
  })

  it('switches color hint based on state', () => {
    // smoke-render each state; ink-testing-library returns ANSI in frame
    for (const s of ['connected', 'reconnecting', 'closed'] as const) {
      const { lastFrame } = render(
        React.createElement(StatusBar, { state: s, mode: 'navigation', hints: '' }),
      )
      expect(lastFrame()).toContain(s)
    }
  })
})

describe('TableSwitcher', () => {
  it('shows empty hint when no tables', () => {
    const { lastFrame } = render(
      React.createElement(TableSwitcher, { tables: [], currentId: null, selectedIndex: 0 }),
    )
    expect(lastFrame()).toContain('No tables yet')
  })

  it('lists tables and marks the selected + current rows', () => {
    const tables = [table('t1', 'Alpha'), table('t2', 'Beta')]
    const { lastFrame } = render(
      React.createElement(TableSwitcher, {
        tables,
        currentId: 't2',
        selectedIndex: 0,
      }),
    )
    const out = lastFrame() ?? ''
    expect(out).toContain('Alpha')
    expect(out).toContain('Beta')
    expect(out).toContain('▶') // pointer
    expect(out).toContain('(current)') // current marker
  })
})
