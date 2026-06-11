/**
 * GridView — paints the table, owns row/column cursor, owns the edit
 * session. Cell behaviour lives in editors (see ../../editors). GridView
 * never inspects `field.type` and never special-cases a field; it talks
 * to editors through CellEditor only — the same way shadcn's <Field>
 * orchestrates without knowing which control it wraps.
 */
import React from 'react'
import { Box, Text, useStdout } from 'ink'
import type { DataStore } from '../../store/data-store.js'
import type { Field, RecordRow } from '@lattix/shared'
import { useDataStore } from '../../hooks/use-data-store.js'
import { useInputDispatcher, type InputMode } from '../../hooks/use-input-dispatcher.js'
import { fieldIcon, ICON_SLOT } from '../../visual/field-icons.js'
import type {
  AnyCellEditor,
  Feedback,
  FocusLevel,
  OverlaySpec,
  RenderCtx,
} from '../../editors/types.js'
import { getEditor } from '../../editors/registry.js'

const ROW_PADDING = 1
const MIN_COL_WIDTH = 8
const MAX_COL_WIDTH = 32
const ID_COL_WIDTH = 12

export interface GridViewProps {
  store: DataStore
  mode: InputMode
  onChangeMode: (m: InputMode) => void
  onNewRecord: () => void
  onDeleteRecord: (row: number) => void
  onStatus: (s: { row: number; total: number; col: number; cols: number } | null) => void
  onFeedback?: (f: Feedback | null) => void
}

interface Cursor {
  row: number
  col: number
}

interface EditSession {
  field: Field
  recordId: string
  state: unknown
  editor: AnyCellEditor
}

export function GridView(props: GridViewProps): JSX.Element {
  const { store, mode, onChangeMode, onNewRecord, onDeleteRecord, onStatus, onFeedback } = props
  const state = useDataStore(store, (s) => {
    const id = s.getCurrentTableId()
    if (!id) return null
    return s.getTableState(id)
  })

  const { stdout } = useStdout()
  const cols = stdout.columns
  const rows = stdout.rows

  const [cursor, setCursor] = React.useState<Cursor>({ row: 0, col: 0 })
  const [scroll] = React.useState(0)
  const [edit, setEdit] = React.useState<EditSession | null>(null)
  const [sortKey, setSortKey] = React.useState<string | null>(null)
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc')

  const fields = state?.fields ?? []
  const records = state?.records ?? []
  const tableId = state?.table.id ?? null

  // Compute column widths so the table fits the terminal.
  const colWidths = React.useMemo(() => {
    if (fields.length === 0) return [] as number[]
    const usable = Math.max(40, cols - ID_COL_WIDTH - 2)
    const perCol = Math.max(
      MIN_COL_WIDTH,
      Math.min(MAX_COL_WIDTH, Math.floor(usable / fields.length) - 1),
    )
    return fields.map(() => perCol)
  }, [fields, cols])

  // Virtual scroll window.
  const headerHeight = 2
  const footerHeight = 1
  const viewportRows = Math.max(3, rows - headerHeight - footerHeight)
  const start = Math.max(0, Math.min(scroll, Math.max(0, records.length - viewportRows)))
  const end = Math.min(records.length, start + viewportRows)
  const visible = records.slice(start, end)

  // Clamp cursor to data.
  React.useEffect(() => {
    const clampedRow = Math.min(cursor.row, Math.max(0, records.length - 1))
    const clampedCol = Math.min(cursor.col, Math.max(0, fields.length - 1))
    if (clampedRow !== cursor.row || clampedCol !== cursor.col) {
      setCursor({ row: clampedRow, col: clampedCol })
    }
  }, [records.length, fields.length, cursor])

  React.useEffect(() => {
    onStatus({ row: cursor.row, total: records.length, col: cursor.col, cols: fields.length })
  }, [cursor, records.length, fields.length, onStatus])

  // Feedback flow — drives the StatusBar's shadcn-style aria-invalid slot.
  //   editing → editor.validate() (errors light up red)
  //   navigation + focused-cell → editor.hint() (grey help text)
  React.useEffect(() => {
    if (!onFeedback) return
    if (edit) {
      const fb = edit.editor.validate(edit.state, edit.field)
      if (fb) {
        onFeedback(fb)
        return
      }
      // No error → show field hint while editing.
      onFeedback({ kind: 'hint', text: edit.editor.hint(edit.field) })
      return
    }
    const f = fields[cursor.col]
    if (f) {
      const ed = getEditor(f.type)
      onFeedback({ kind: 'hint', text: ed.hint(f) })
      return
    }
    onFeedback(null)
  }, [edit, cursor.col, fields, onFeedback])

  useInputDispatcher({
    mode,
    onNavigation: (input, key) => {
      if (key.escape) {
        onChangeMode('dialog')
        return
      }
      if (input === 'q' || (key.ctrl && input === 'c')) {
        process.exit(0)
        return
      }
      if (input === 'j' || key.downArrow) {
        setCursor((c) => ({ ...c, row: Math.min(records.length - 1, c.row + 1) }))
        return
      }
      if (input === 'k' || key.upArrow) {
        setCursor((c) => ({ ...c, row: Math.max(0, c.row - 1) }))
        return
      }
      if (input === 'h' || key.leftArrow) {
        setCursor((c) => ({ ...c, col: Math.max(0, c.col - 1) }))
        return
      }
      if (input === 'l' || key.rightArrow || key.tab) {
        setCursor((c) => ({ ...c, col: Math.min(fields.length - 1, c.col + 1) }))
        return
      }
      if (key.return || input === 'i' || input === ' ') {
        startEditing(input === ' ')
        return
      }
      if (input === 'n') {
        onNewRecord()
        return
      }
      if (input === 'd') {
        const r = records[cursor.row]
        if (r) onDeleteRecord(cursor.row)
        return
      }
      if (input === 's') {
        const f = fields[cursor.col]
        if (f) {
          const next = sortKey === f.id && sortDir === 'asc' ? 'desc' : 'asc'
          setSortKey(f.id)
          setSortDir(next)
        }
        return
      }
    },
    onEditing: (input, key) => {
      if (!edit) return
      const { next, intent } = edit.editor.reduce(edit.state, input, key, edit.field)
      // Apply state regardless so partial buffers paint live.
      const nextSession: EditSession = { ...edit, state: next }
      if (intent === 'cancel') {
        finishEditing()
        return
      }
      if (intent === 'commit' || intent === 'commit-next') {
        // Block commit when validation fails — keeps the user inside the
        // edit session with the red ring lit, instead of silently dropping
        // the value (matches shadcn's "stay until valid" behaviour).
        if (edit.editor.validate(next, edit.field) !== null) {
          setEdit(nextSession)
          return
        }
        commitEdit(nextSession)
        if (intent === 'commit-next') moveRight()
        return
      }
      setEdit(nextSession)
    },
    onDialog: () => {
      onChangeMode('navigation')
    },
  })

  function moveRight(): void {
    setCursor((c) => ({ ...c, col: Math.min(fields.length - 1, c.col + 1) }))
  }

  function startEditing(spacePressed: boolean): void {
    const field = fields[cursor.col]
    const record = records[cursor.row]
    if (!field || !record) return
    const editor = getEditor(field.type)
    if (editor.capability.instant) {
      // Checkbox-style: no edit mode, just toggle and write back.
      if (!tableId || !editor.instantValue) return
      const value = editor.instantValue(record.data[field.id], field)
      void store
        .updateRecord({ tableId, recordId: record.id, fieldId: field.id, value })
        .catch(() => undefined)
      return
    }
    // Space in navigation is reserved for instant editors; ignore on others
    // (so the user doesn't accidentally insert a space into a text buffer).
    if (spacePressed) return
    const initial = editor.beginEdit(record.data[field.id], field)
    setEdit({ field, recordId: record.id, state: initial, editor })
    onChangeMode('editing')
  }

  function commitEdit(session: EditSession): void {
    if (!tableId) {
      finishEditing()
      return
    }
    const value = session.editor.commitValue(session.state, session.field)
    void store
      .updateRecord({
        tableId,
        recordId: session.recordId,
        fieldId: session.field.id,
        value,
      })
      .catch(() => undefined)
    finishEditing()
  }

  function finishEditing(): void {
    setEdit(null)
    onChangeMode('navigation')
  }

  if (!state || state.loading) {
    return React.createElement(
      Box,
      { paddingX: 1 },
      React.createElement(Text, { dimColor: true }, 'Loading…'),
    )
  }
  if (state.error) {
    return React.createElement(
      Box,
      { paddingX: 1 },
      React.createElement(Text, { color: 'red' }, state.error),
    )
  }
  if (fields.length === 0) {
    return React.createElement(
      Box,
      { paddingX: 1, flexDirection: 'column' },
      React.createElement(Text, { dimColor: true }, 'This table has no fields yet.'),
      React.createElement(Text, { dimColor: true }, 'Press `a` to add a field (coming soon).'),
    )
  }

  return React.createElement(
    Box,
    { flexDirection: 'column', flexGrow: 1, minHeight: headerHeight + 3 + footerHeight },
    renderHeader(fields, colWidths, cursor.col, sortKey, sortDir),
    ...visible.map((rec, i) =>
      renderRow(rec, fields, colWidths, cursor.row === start + i, cursor.col, edit),
    ),
    React.createElement(
      Box,
      { paddingX: 1 },
      React.createElement(
        Text,
        { dimColor: true },
        `Showing ${start + 1}-${end} of ${records.length}`,
      ),
    ),
    edit ? renderEditorOverlay(edit, cursor, start, colWidths, viewportRows) : null,
    !edit ? renderOverflowPopup(cursor, start, fields, records, colWidths, viewportRows) : null,
  )
}

// --- editor overlay -------------------------------------------------------

function renderEditorOverlay(
  edit: EditSession,
  cursor: Cursor,
  start: number,
  colWidths: number[],
  viewportRows: number,
): JSX.Element | null {
  if (edit.editor.capability.overlay === 'none' || !edit.editor.overlay) return null
  const spec: OverlaySpec = edit.editor.overlay(edit.state, /* value unused */ null, edit.field)
  const headerHeight = 1
  let left = ID_COL_WIDTH
  for (let i = 0; i < cursor.col; i++) left += colWidths[i] ?? MIN_COL_WIDTH
  const rowYInGrid = cursor.row - start
  const cellTop = headerHeight + rowYInGrid
  const spaceBelow = viewportRows - rowYInGrid - 1
  const dropsDown = spec.height <= spaceBelow
  const top = dropsDown ? cellTop + 1 : Math.max(0, cellTop - spec.height)
  return React.createElement(
    Box,
    {
      position: 'absolute',
      marginLeft: left,
      marginTop: top,
      width: spec.width,
    },
    spec.render(),
  )
}

// --- overflow continuation ------------------------------------------------
//
// Floating overflow continuation — the focused cell appears to "grow
// taller", spilling extra lines into the rows underneath without pushing
// anything around. The popup intentionally mimics the cell's own box
// (same width, same right border, same padding, same cyan focus tint) so
// the seam between row 1 of the cell and the continuation is invisible.
function renderOverflowPopup(
  cursor: Cursor,
  start: number,
  fields: Field[],
  records: RecordRow[],
  colWidths: number[],
  viewportRows: number,
): JSX.Element | null {
  const field = fields[cursor.col]
  const record = records[cursor.row]
  if (!field || !record) return null
  if (field.type === 'checkbox' || field.type === 'select') return null
  const value = record.data[field.id]
  if (value === null || value === undefined) return null
  const raw = String(value)
  const cellWidth = colWidths[cursor.col] ?? MIN_COL_WIDTH
  const innerWidth = Math.max(1, cellWidth - 2 * ROW_PADDING - 1)
  if (raw.length <= innerWidth) return null
  const continuation = wrapText(raw.slice(innerWidth), innerWidth)
  if (continuation.length === 0) return null
  const headerHeight = 1
  const rowYInGrid = cursor.row - start
  const cellTop = headerHeight + rowYInGrid
  const spaceBelow = viewportRows - rowYInGrid - 1
  const visibleLines = continuation.slice(0, Math.max(0, spaceBelow))
  if (visibleLines.length === 0) return null
  let leftOffset = ID_COL_WIDTH
  for (let i = 0; i < cursor.col; i++) leftOffset += colWidths[i] ?? MIN_COL_WIDTH
  return React.createElement(
    Box,
    {
      position: 'absolute',
      marginLeft: leftOffset,
      marginTop: cellTop + 1,
      flexDirection: 'column',
    },
    ...visibleLines.map((ln, i) =>
      React.createElement(
        Box,
        {
          key: i,
          width: cellWidth,
          paddingX: ROW_PADDING,
          borderStyle: 'single',
          borderRight: true,
          borderTop: false,
          borderBottom: false,
          borderLeft: false,
        },
        React.createElement(Text, { color: 'cyan' }, ln === '' ? ' ' : ln),
      ),
    ),
  )
}

function wrapText(s: string, width: number): string[] {
  const out: string[] = []
  const segments = s.split(/\r?\n/)
  for (const seg of segments) {
    if (seg.length === 0) {
      out.push('')
      continue
    }
    for (let i = 0; i < seg.length; i += width) {
      out.push(seg.slice(i, i + width))
    }
  }
  return out
}

// --- row + header rendering ----------------------------------------------

function renderHeader(
  fields: Field[],
  widths: number[],
  activeCol: number,
  sortKey: string | null,
  sortDir: 'asc' | 'desc',
): JSX.Element {
  return React.createElement(
    Box,
    {},
    React.createElement(
      Box,
      {
        width: ID_COL_WIDTH,
        paddingX: ROW_PADDING,
        borderStyle: 'single',
        borderRight: true,
        borderTop: false,
        borderBottom: false,
        borderLeft: false,
      },
      React.createElement(Text, { bold: true, dimColor: true }, 'id'),
    ),
    ...fields.map((f, i) => {
      const isActive = i === activeCol
      const isSorted = sortKey === f.id
      const arrow = isSorted ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
      const cellInner = Math.max(1, (widths[i] ?? MIN_COL_WIDTH) - 2 * ROW_PADDING - 1)
      const nameBudget = Math.max(1, cellInner - ICON_SLOT - 1)
      return React.createElement(
        Box,
        {
          key: f.id,
          width: widths[i] ?? MIN_COL_WIDTH,
          paddingX: ROW_PADDING,
          borderStyle: 'single',
          borderRight: true,
          borderTop: false,
          borderBottom: false,
          borderLeft: false,
        },
        React.createElement(Text, { dimColor: true }, fieldIcon(f.type) + ' '),
        React.createElement(
          Text,
          { bold: isActive, color: isActive ? 'cyan' : undefined },
          truncate(f.name + arrow, nameBudget),
        ),
      )
    }),
  )
}

function renderRow(
  rec: RecordRow,
  fields: Field[],
  widths: number[],
  activeRow: boolean,
  activeCol: number,
  edit: EditSession | null,
): JSX.Element {
  const id = rec.id.slice(-6)
  return React.createElement(
    Box,
    {},
    React.createElement(
      Box,
      {
        width: ID_COL_WIDTH,
        paddingX: ROW_PADDING,
        borderStyle: 'single',
        borderRight: true,
        borderTop: false,
        borderBottom: false,
        borderLeft: false,
      },
      // Row cursor lives in the id gutter as `▸` (shadcn's `:focus-visible`
      // ring philosophy: a precise marker beats inverting the whole row).
      React.createElement(
        Text,
        { dimColor: !activeRow, color: activeRow ? 'cyan' : undefined, bold: activeRow },
        (activeRow ? '▸ ' : '  ') + id,
      ),
    ),
    ...fields.map((f, i) => {
      const isCellEditing = edit && activeRow && edit.field.id === f.id && edit.recordId === rec.id
      const isCellFocused = activeRow && i === activeCol
      const focus: FocusLevel = isCellEditing ? 'active' : isCellFocused ? 'passive' : 'none'
      const width = Math.max(1, (widths[i] ?? MIN_COL_WIDTH) - 2 * ROW_PADDING - 1)
      const editor = getEditor(f.type)
      const ctx: RenderCtx = { width, focus, readonly: false }
      const inner = editor.render({
        state: isCellEditing ? edit.state : null,
        value: rec.data[f.id],
        field: f,
        ctx,
      })
      return React.createElement(
        Box,
        {
          key: f.id,
          width: widths[i] ?? MIN_COL_WIDTH,
          paddingX: ROW_PADDING,
          borderStyle: 'single',
          borderRight: true,
          borderTop: false,
          borderBottom: false,
          borderLeft: false,
        },
        inner,
      )
    }),
  )
}

function truncate(s: string, w: number): string {
  if (s.length <= w) return s
  return s.slice(0, Math.max(0, w - 1)) + '…'
}
