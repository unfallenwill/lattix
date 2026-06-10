import React from 'react'
import { Box, Text } from 'ink'
import type { LattixConnection, ConnectionState } from '@lattix/client'
import type { Table } from '@lattix/shared'
import { DataStore } from './store/data-store.js'
import { GridView } from './views/grid/grid-view.jsx'
import { StatusBar } from './widgets/status-bar.jsx'
import { TableSwitcher } from './widgets/table-switcher.jsx'
import type { InputMode } from './hooks/use-input-dispatcher.js'
import { useDataStore } from './hooks/use-data-store.js'
import { useInputDispatcher } from './hooks/use-input-dispatcher.js'

type Dialog = 'help' | 'table-switcher' | 'confirm-delete' | null

export function App(props: { conn: LattixConnection }): JSX.Element {
  const { conn } = props
  const [store] = React.useState(() => new DataStore(conn))
  const [mode, setMode] = React.useState<InputMode>('navigation')
  const [dialog, setDialog] = React.useState<Dialog>(null)
  const [connState, setConnState] = React.useState<ConnectionState>('idle')
  const [position, setPosition] = React.useState<{
    row: number
    total: number
    col: number
    cols: number
  } | null>(null)
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<number | null>(null)

  React.useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        await store.loadTables()
      } catch (err) {
        process.stderr.write(`lattix: ${(err as Error).message}\n`)
      }
    })()
    const unsub = conn.onState((s) => {
      if (mounted) setConnState(s)
    })
    return () => {
      mounted = false
      unsub()
      void store.dispose()
    }
  }, [conn, store])

  useInputDispatcher({
    mode: 'navigation',
    onNavigation: (input, key) => {
      if (input === '?' || input === 'F1' || (key.shift && input === '/')) {
        setDialog((d) => (d === 'help' ? null : 'help'))
        return
      }
      if (input === 't') {
        setDialog((d) => (d === 'table-switcher' ? null : 'table-switcher'))
        return
      }
      if (key.escape) {
        setDialog(null)
        return
      }
    },
  })

  const currentTableId = useDataStore(store, (s: DataStore) => s.getCurrentTableId())
  const tables = useDataStore(store, (s: DataStore) => s.getTables())

  const hints =
    mode === 'editing'
      ? 'Enter: confirm  Esc: cancel  Tab: confirm + next'
      : dialog
        ? 'Esc: close'
        : 'j/k move  h/l next  Enter edit  n new  d del  s sort  t tables  ? help  q quit'

  return React.createElement(
    Box,
    { flexDirection: 'column', height: '100%' },
    React.createElement(GridView, {
      store,
      mode,
      onModeChange: setMode,
      onChangeMode: setMode,
      onNewRecord: () => {
        if (!currentTableId) return
        void store.createRecord(currentTableId).catch(() => undefined)
      },
      onDeleteRecord: (row: number) => {
        setPendingDeleteRow(row)
        setDialog('confirm-delete')
      },
      onStatus: setPosition,
    }),
    React.createElement(HelpView, { active: dialog === 'help' }),
    React.createElement(TableSwitcherView, {
      tables,
      currentId: currentTableId,
      active: dialog === 'table-switcher',
      onSelect: (id: string) => {
        void store.selectTable(id).then(() => setDialog(null))
      },
      onCancel: () => setDialog(null),
    }),
    React.createElement(ConfirmDeleteView, {
      active: dialog === 'confirm-delete',
      onYes: () => {
        const r = pendingDeleteRow
        const t = currentTableId
        if (r !== null && t) {
          const state = store.getTableState(t)
          const rec = state?.records[r]
          if (rec) void store.deleteRecord(t, rec.id).catch(() => undefined)
        }
        setPendingDeleteRow(null)
        setDialog(null)
      },
      onNo: () => {
        setPendingDeleteRow(null)
        setDialog(null)
      },
    }),
    React.createElement(StatusBar, {
      state: connState,
      mode,
      hints,
      position,
    }),
  )
}

function HelpView(props: { active: boolean }): JSX.Element | null {
  if (!props.active) return null
  return React.createElement(
    Box,
    { flexDirection: 'column', paddingX: 1, borderStyle: 'round', borderColor: 'gray' },
    React.createElement(HelpLine, { k: 'j / down', v: 'Move down' }),
    React.createElement(HelpLine, { k: 'k / up', v: 'Move up' }),
    React.createElement(HelpLine, { k: 'h / left / Tab', v: 'Move left' }),
    React.createElement(HelpLine, { k: 'l / right / S-Tab', v: 'Move right' }),
    React.createElement(HelpLine, { k: 'Enter / i', v: 'Edit cell' }),
    React.createElement(HelpLine, { k: 'n', v: 'New record' }),
    React.createElement(HelpLine, { k: 'd', v: 'Delete current record' }),
    React.createElement(HelpLine, { k: 's', v: 'Sort by current column' }),
    React.createElement(HelpLine, { k: 't', v: 'Table switcher' }),
    React.createElement(HelpLine, { k: '?', v: 'Toggle this help' }),
    React.createElement(HelpLine, { k: 'q / Ctrl+C', v: 'Quit' }),
  )
}

function HelpLine(props: { k: string; v: string }): JSX.Element {
  return React.createElement(
    Box,
    { gap: 2 },
    React.createElement(Text, { color: 'cyan' }, props.k.padEnd(18)),
    React.createElement(Text, null, props.v),
  )
}

function TableSwitcherView(props: {
  tables: readonly Table[]
  currentId: string | null
  active: boolean
  onSelect: (id: string) => void
  onCancel: () => void
}): JSX.Element | null {
  const { tables, currentId, active, onSelect, onCancel } = props
  const [idx, setIdx] = React.useState(() =>
    Math.max(
      0,
      tables.findIndex((t) => t.id === currentId),
    ),
  )
  useInputDispatcher({
    mode: 'navigation',
    onNavigation: (input, key) => {
      if (!active) return
      if (key.escape) {
        onCancel()
        return
      }
      if (input === 'j' || key.downArrow) {
        setIdx((i) => Math.min(tables.length - 1, i + 1))
        return
      }
      if (input === 'k' || key.upArrow) {
        setIdx((i) => Math.max(0, i - 1))
        return
      }
      if (key.return) {
        const t = tables[idx]
        if (t) onSelect(t.id)
        return
      }
    },
  })
  if (!active) return null
  return React.createElement(TableSwitcher, { tables, currentId, selectedIndex: idx })
}

function ConfirmDeleteView(props: {
  active: boolean
  onYes: () => void
  onNo: () => void
}): JSX.Element | null {
  const { active, onYes, onNo } = props
  useInputDispatcher({
    mode: 'navigation',
    onNavigation: (input) => {
      if (!active) return
      if (input === 'y' || input === 'Y') onYes()
      else if (input === 'n' || input === 'N') onNo()
    },
  })
  if (!active) return null
  return React.createElement(
    Box,
    { paddingX: 1, borderStyle: 'round', borderColor: 'red' },
    React.createElement(Text, { color: 'red' }, 'Delete this record? (y/n) '),
    React.createElement(Text, { color: 'green' }, '[y]es'),
    React.createElement(Text, null, '  '),
    React.createElement(Text, { color: 'gray' }, '[n]o'),
  )
}
