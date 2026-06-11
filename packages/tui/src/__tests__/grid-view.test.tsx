/**
 * GridView is the 487-line component. We mount it against a real DataStore
 * fed by a fake LattixConnection and drive it via stdin to cover the
 * navigation / editing / select / sort / delete / new branches.
 *
 * Note: ink's useInput attaches its 'input' listener inside a useEffect, so
 * tests must wait a tick after render() before writing to stdin, and another
 * tick after write before asserting on the resulting frame.
 */
import React from 'react'
import { render } from 'ink-testing-library'
import type { LattixConnection } from '@lattix/client'
import type { Field, RecordRow, Table } from '@lattix/shared'
import type { ServerFrame } from '@lattix/protocol'
import { DataStore } from '../store/data-store.js'
import { GridView } from '../views/grid/grid-view.js'

const tick = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms))

// ink-testing-library's Stdout exposes `columns=100` but no `rows`, which
// causes GridView's viewport math to be NaN. Patch it once for the suite.
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

const t1: Table = { id: 't1', name: 'Tasks', description: null, createdAt: 0, updatedAt: 0 }

const fields: Field[] = [
  {
    id: 'fTitle',
    tableId: 't1',
    name: 'Title',
    type: 'text',
    options: {},
    position: 1,
    required: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'fNum',
    tableId: 't1',
    name: 'Priority',
    type: 'number',
    options: {},
    position: 2,
    required: false,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'fDone',
    tableId: 't1',
    name: 'Done',
    type: 'checkbox',
    options: {},
    position: 3,
    required: false,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'fStatus',
    tableId: 't1',
    name: 'Status',
    type: 'select',
    options: {
      options: [
        { id: 'todo', name: 'Todo' },
        { id: 'done', name: 'Done' },
      ],
    },
    position: 4,
    required: false,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'fDate',
    tableId: 't1',
    name: 'Due',
    type: 'date',
    options: {},
    position: 5,
    required: false,
    createdAt: 0,
    updatedAt: 0,
  },
]

const records: RecordRow[] = [
  {
    id: 'r1',
    tableId: 't1',
    data: { fTitle: 'First', fNum: 1, fDone: false, fStatus: 'todo', fDate: '2026-01-01' },
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'r2',
    tableId: 't1',
    data: { fTitle: 'Second', fNum: 2, fDone: true, fStatus: 'done', fDate: null },
    createdAt: 0,
    updatedAt: 0,
  },
]

class FakeConn {
  updates: Array<{ recordId: string; data: Record<string, unknown> }> = []
  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (method === 'table.list') return Promise.resolve({ tables: [t1] } as T)
    if (method === 'field.list') return Promise.resolve({ fields } as T)
    if (method === 'record.list') return Promise.resolve({ records, total: records.length } as T)
    if (method === 'record.update') {
      const p = params as { recordId: string; data: Record<string, unknown> }
      this.updates.push({ recordId: p.recordId, data: p.data })
      return Promise.resolve({ ok: true } as T)
    }
    return Promise.resolve({} as T)
  }
  subscribe(_channel: string, _h: (f: ServerFrame) => void): Promise<() => void> {
    return Promise.resolve(() => undefined)
  }
}

interface MountOpts {
  mode?: 'navigation' | 'editing' | 'dialog'
  onChangeMode?: (m: 'navigation' | 'editing' | 'dialog') => void
  onNewRecord?: () => void
  onDeleteRecord?: (row: number) => void
  onStatus?: () => void
}

async function mountGrid(
  opts: MountOpts = {},
): Promise<{ api: ReturnType<typeof render>; store: DataStore; fake: FakeConn }> {
  const fake = new FakeConn()
  const store = new DataStore(fake as unknown as LattixConnection)
  await store.loadTables()
  const props = {
    store,
    mode: opts.mode ?? 'navigation',
    onChangeMode: opts.onChangeMode ?? (() => undefined),
    onNewRecord: opts.onNewRecord ?? (() => undefined),
    onDeleteRecord: opts.onDeleteRecord ?? (() => undefined),
    onStatus: opts.onStatus ?? (() => undefined),
  }
  const api = render(React.createElement(GridView, props))
  await tick() // let useEffects run, store subscription resolve, hook re-render
  return { api, store, fake }
}

describe('GridView', () => {
  it('renders a populated grid with field names and record cells', async () => {
    const { api } = await mountGrid()
    const frame = api.lastFrame() ?? ''
    expect(frame).toContain('Title')
    expect(frame).toContain('Priority')
    expect(frame).toContain('First')
    expect(frame).toContain('Second')
    api.unmount()
  })

  it('handles arrow / hjkl navigation without crashing', async () => {
    const { api } = await mountGrid()
    for (const k of ['j', 'k', 'h', 'l']) {
      api.stdin.write(k)
      await tick(5)
    }
    api.stdin.write('\t') // tab → right
    await tick(5)
    expect(api.lastFrame()).toBeTruthy()
    api.unmount()
  })

  it('"s" toggles sort key/dir without crashing', async () => {
    const { api } = await mountGrid()
    api.stdin.write('s')
    await tick(10)
    api.stdin.write('s') // toggle to desc
    await tick(10)
    expect(api.lastFrame()).toBeTruthy()
    api.unmount()
  })

  it('"n" triggers onNewRecord', async () => {
    let nNew = 0
    const { api } = await mountGrid({ onNewRecord: () => nNew++ })
    api.stdin.write('n')
    await tick()
    expect(nNew).toBe(1)
    api.unmount()
  })

  it('"d" triggers onDeleteRecord with current row', async () => {
    let deletedRow = -1
    const { api } = await mountGrid({ onDeleteRecord: (r) => (deletedRow = r) })
    api.stdin.write('d')
    await tick()
    expect(deletedRow).toBe(0)
    api.unmount()
  })

  it('toggles checkbox in place when Enter is pressed on a checkbox column', async () => {
    const { api, fake } = await mountGrid()
    // navigate to checkbox column (col 2) on row 0
    api.stdin.write('l')
    await tick(10)
    api.stdin.write('l')
    await tick(10)
    api.stdin.write('\r') // enter — toggles
    await tick()
    expect(fake.updates.some((u) => u.recordId === 'r1' && u.data['fDone'] === true)).toBe(true)
    api.unmount()
  })

  it('escape from navigation flips mode to dialog', async () => {
    let mode = 'navigation'
    const { api } = await mountGrid({ onChangeMode: (m) => (mode = m) })
    api.stdin.write('') // ESC
    await tick()
    expect(mode).toBe('dialog')
    api.unmount()
  })

  it('renders loading state when no data loaded yet', async () => {
    const fake = new FakeConn()
    const store = new DataStore(fake as unknown as LattixConnection)
    // intentionally do NOT loadTables — current table is null, GridView falls through to "Loading…"
    const api = render(
      React.createElement(GridView, {
        store,
        mode: 'navigation',
        onChangeMode: () => undefined,
        onNewRecord: () => undefined,
        onDeleteRecord: () => undefined,
        onStatus: () => undefined,
      }),
    )
    await tick()
    expect(api.lastFrame()).toContain('Loading')
    api.unmount()
  })

  it('text-editing: i → letters → Enter commits the new value', async () => {
    // Mode is controlled by parent. Wrap with a host component that flips
    // mode in response to onChangeMode so the inner useInputDispatcher
    // switches branches and the editing handler picks up the keystrokes.
    const fake = new FakeConn()
    const store = new DataStore(fake as unknown as LattixConnection)
    await store.loadTables()

    function Host(): JSX.Element {
      const [mode, setMode] = React.useState<'navigation' | 'editing' | 'dialog'>('navigation')
      return React.createElement(GridView, {
        store,
        mode,
        onChangeMode: setMode,
        onNewRecord: () => undefined,
        onDeleteRecord: () => undefined,
        onStatus: () => undefined,
      })
    }

    const api = render(React.createElement(Host))
    await tick()
    api.stdin.write('i') // enter editing on (row 0, col 0 = Title text field)
    await tick()
    api.stdin.write('X')
    await tick(5)
    api.stdin.write('Y')
    await tick(5)
    api.stdin.write('\r') // commit
    await tick()
    expect(fake.updates.some((u) => u.recordId === 'r1' && 'fTitle' in u.data)).toBe(true)
    api.unmount()
  })

  it('number-editing: typing + backspace updates buf live, Enter commits', async () => {
    // Regression: number cells used to render the original value during
    // edit instead of the keystroke buffer, so backspace appeared dead.
    const fake = new FakeConn()
    const store = new DataStore(fake as unknown as LattixConnection)
    await store.loadTables()

    function Host(): JSX.Element {
      const [mode, setMode] = React.useState<'navigation' | 'editing' | 'dialog'>('navigation')
      return React.createElement(GridView, {
        store,
        mode,
        onChangeMode: setMode,
        onNewRecord: () => undefined,
        onDeleteRecord: () => undefined,
        onStatus: () => undefined,
      })
    }

    const api = render(React.createElement(Host))
    await tick()
    api.stdin.write('l') // move to col 1 (number 'Priority', current = 1)
    await tick(10)
    api.stdin.write('i') // enter editing — buf seeds with "1"
    await tick()
    api.stdin.write('5')
    await tick(5)
    // Frame should now show "15" (buf) instead of just "1" (orig value).
    expect(api.lastFrame() ?? '').toMatch(/15/)
    api.stdin.write('') // DEL — physical Backspace key
    await tick(5)
    expect(api.lastFrame() ?? '').toMatch(/(^|[^0-9])1([^0-9]|$)/) // back to "1"
    api.stdin.write('9')
    await tick(5)
    api.stdin.write('\r') // commit — value is now 19
    await tick()
    const upd = fake.updates.find((u) => u.recordId === 'r1' && 'fNum' in u.data)
    expect(upd?.data['fNum']).toBe(19)
    api.unmount()
  })

  it('date-editing: arrow keys move the calendar focus + Enter commits', async () => {
    const fake = new FakeConn()
    const store = new DataStore(fake as unknown as LattixConnection)
    await store.loadTables()

    function Host(): JSX.Element {
      const [mode, setMode] = React.useState<'navigation' | 'editing' | 'dialog'>('navigation')
      return React.createElement(GridView, {
        store,
        mode,
        onChangeMode: setMode,
        onNewRecord: () => undefined,
        onDeleteRecord: () => undefined,
        onStatus: () => undefined,
      })
    }

    const api = render(React.createElement(Host))
    await tick()
    // navigate to date column (col 4 = Due, current = 2026-01-01)
    for (let i = 0; i < 4; i++) {
      api.stdin.write('l')
      await tick(5)
    }
    api.stdin.write('i') // start editing — calendar opens on 2026-01-01
    await tick(10)
    // Right arrow → 2026-01-02
    api.stdin.write('[C')
    await tick(10)
    // Frame should show the new buf
    expect(api.lastFrame() ?? '').toContain('2026-01-02')
    api.stdin.write('\r') // commit
    await tick(20)
    const upd = fake.updates.find((u) => u.recordId === 'r1' && 'fDate' in u.data)
    expect(upd?.data['fDate']).toBe('2026-01-02')
    api.unmount()
  })

  it('date-editing: typing a complete ISO date snaps the calendar focus', async () => {
    const fake = new FakeConn()
    const store = new DataStore(fake as unknown as LattixConnection)
    await store.loadTables()

    function Host(): JSX.Element {
      const [mode, setMode] = React.useState<'navigation' | 'editing' | 'dialog'>('navigation')
      return React.createElement(GridView, {
        store,
        mode,
        onChangeMode: setMode,
        onNewRecord: () => undefined,
        onDeleteRecord: () => undefined,
        onStatus: () => undefined,
      })
    }

    const api = render(React.createElement(Host))
    await tick()
    for (let i = 0; i < 4; i++) {
      api.stdin.write('l')
      await tick(5)
    }
    api.stdin.write('i')
    await tick(10)
    // wipe existing buf (2026-01-01 = 10 chars) then type a new date
    for (let i = 0; i < 12; i++) {
      api.stdin.write('') // backspace (DEL)
      await tick(2)
    }
    for (const ch of '2027-03-15') {
      api.stdin.write(ch)
      await tick(2)
    }
    // Frame must contain the typed buf and the calendar header for that month
    const frame = api.lastFrame() ?? ''
    expect(frame).toContain('2027-03-15')
    expect(frame).toContain('2027-03')
    api.stdin.write('\r')
    await tick(20)
    const upd = fake.updates.find((u) => u.recordId === 'r1' && 'fDate' in u.data)
    expect(upd?.data['fDate']).toBe('2027-03-15')
    api.unmount()
  })

  it('overflow popup: long cell content shows full text in a floating preview', async () => {
    const longText = 'this-is-a-fairly-long-text-value-that-overflows-the-column'
    class WideConn extends FakeConn {
      override request<T = unknown>(method: string, params?: unknown): Promise<T> {
        if (method === 'record.list') {
          return Promise.resolve({
            records: [
              {
                id: 'r1',
                tableId: 't1',
                data: { fTitle: longText, fNum: 1, fDone: false, fStatus: 'todo', fDate: null },
                createdAt: 0,
                updatedAt: 0,
              },
            ],
            total: 1,
          } as T)
        }
        return super.request(method, params)
      }
    }
    const fake = new WideConn()
    const store = new DataStore(fake as unknown as LattixConnection)
    await store.loadTables()
    const api = render(
      React.createElement(GridView, {
        store,
        mode: 'navigation',
        onChangeMode: () => undefined,
        onNewRecord: () => undefined,
        onDeleteRecord: () => undefined,
        onStatus: () => undefined,
      }),
    )
    await tick()
    // The cell's first line is painted in-place; the rest of the string
    // spills into a continuation overlay below in the same column. We
    // don't try to assert visual reflow order (the popup is absolutely
    // positioned and overlays an unrelated row), just that every wrapped
    // 11-char chunk of the long text is somewhere in the frame.
    const frame = api.lastFrame() ?? ''
    const plain = stripAnsi(frame)
    // The grid lays cells at 16 cols outer width here (5 fields, 100 col
    // stdout, see colWidths()), minus 1 right border + 2 paddingX = 13
    // chars of paintable text per cell. The popup wraps to the same budget.
    const innerWidth = 13
    for (let i = 0; i < longText.length; i += innerWidth) {
      expect(plain).toContain(longText.slice(i, i + innerWidth))
    }
    expect(frame).not.toMatch(/[╭╮╯╰]/)
    api.unmount()
  })

  it('overflow popup: short content does not draw any continuation', async () => {
    const { api } = await mountGrid()
    const frame = api.lastFrame() ?? ''
    // No popup of any kind for short content. Calendar / select aren't
    // open either, so the screen has no rounded-border characters.
    expect(frame).not.toMatch(/[╭╮╯╰]/)
    api.unmount()
  })

  it('column headers paint a field-type icon next to each name', async () => {
    // Pin the icon set so the assertion doesn't depend on whichever
    // terminal the test happens to run under.
    const prev = process.env.LATTIX_ICONS
    process.env.LATTIX_ICONS = 'ascii'
    try {
      const { api } = await mountGrid()
      const frame = api.lastFrame() ?? ''
      expect(frame).toMatch(/T\s+Title/)
      expect(frame).toMatch(/№\s+Priority/)
      expect(frame).toMatch(/◉\s+Status/)
      expect(frame).toMatch(/☑\s+Done/)
      expect(frame).toMatch(/▦\s+Due/)
      api.unmount()
    } finally {
      if (prev === undefined) delete process.env.LATTIX_ICONS
      else process.env.LATTIX_ICONS = prev
    }
  })
})

// Tiny ANSI stripper for assertions that don't care about color codes.
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}
