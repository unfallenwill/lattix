import React from 'react'
import { Box, Text, useStdout } from 'ink'
import type { DataStore } from '../../store/data-store.js'
import type { Field, RecordRow } from '@lattix/shared'
import { useDataStore } from '../../hooks/use-data-store.js'
import { useInputDispatcher, type InputMode } from '../../hooks/use-input-dispatcher.js'
import { TextEditor } from '../../editors/text-editor.jsx'
import { CheckboxEditor } from '../../editors/checkbox-editor.jsx'
import { SelectEditor } from '../../editors/select-editor.jsx'
import { DateEditor } from '../../editors/date-editor.jsx'
import {
  Calendar,
  CALENDAR_HEIGHT,
  CALENDAR_WIDTH,
  addDays,
  addMonths,
  formatISODate,
  parseISODate,
} from '../../editors/calendar.jsx'
import type { SelectOptions } from '@lattix/protocol'

const ROW_PADDING = 1
const MIN_COL_WIDTH = 8
const MAX_COL_WIDTH = 32
const ID_COL_WIDTH = 12

export interface GridViewProps {
  store: DataStore
  mode: InputMode
  onModeChange: (m: InputMode) => void
  onChangeMode: (m: InputMode) => void
  onNewRecord: () => void
  onDeleteRecord: (row: number) => void
  onStatus: (s: { row: number; total: number; col: number; cols: number } | null) => void
}

interface Cursor {
  row: number
  col: number
}

interface EditState {
  field: Field
  recordId: string
  buf: string
  // Only used when field.type === 'date': the day the calendar cursor is
  // sitting on (controlled by arrow keys; also auto-snaps when buf is a
  // complete YYYY-MM-DD).
  calFocus?: Date
}

interface SelectState {
  field: Field
  recordId: string
  options: { id: string; name: string; color?: string }[]
  cursor: number
}

export function GridView(props: GridViewProps): JSX.Element {
  const { store, mode, onChangeMode, onNewRecord, onDeleteRecord, onStatus } = props
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
  const [edit, setEdit] = React.useState<EditState | null>(null)
  const [select, setSelect] = React.useState<SelectState | null>(null)
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
      if (key.return || input === 'i') {
        startEditing()
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
      if (select) {
        if (key.escape) {
          setSelect(null)
          onChangeMode('navigation')
          return
        }
        if (input === 'j' || key.downArrow) {
          setSelect({
            ...select,
            cursor: Math.min(select.options.length - 1, select.cursor + 1),
          })
          return
        }
        if (input === 'k' || key.upArrow) {
          setSelect({ ...select, cursor: Math.max(0, select.cursor - 1) })
          return
        }
        if (key.return || input === ' ') {
          commitSelect()
          return
        }
        if (key.tab) {
          commitSelect()
          moveRight()
          return
        }
        return
      }
      if (!edit) return
      if (key.escape) {
        setEdit(null)
        onChangeMode('navigation')
        return
      }
      // Date cells get the calendar treatment: arrow keys move the focused
      // day, PageUp/Down flip month (Shift = year), Enter commits the
      // focused day. Typing into buf still works; when buf parses as a
      // valid YYYY-MM-DD the calendar auto-snaps to it.
      if (edit.field.type === 'date') {
        const focus = edit.calFocus ?? stripTime(new Date())
        if (key.return) {
          const commitDate = parseISODate(edit.buf) ?? focus
          setEdit({ ...edit, buf: formatISODate(commitDate), calFocus: commitDate })
          queueMicrotask(commitEdit)
          return
        }
        if (key.leftArrow) {
          const next = addDays(focus, -1)
          setEdit({ ...edit, buf: formatISODate(next), calFocus: next })
          return
        }
        if (key.rightArrow) {
          const next = addDays(focus, 1)
          setEdit({ ...edit, buf: formatISODate(next), calFocus: next })
          return
        }
        if (key.upArrow) {
          const next = addDays(focus, -7)
          setEdit({ ...edit, buf: formatISODate(next), calFocus: next })
          return
        }
        if (key.downArrow) {
          const next = addDays(focus, 7)
          setEdit({ ...edit, buf: formatISODate(next), calFocus: next })
          return
        }
        if (key.pageUp) {
          const next = addMonths(focus, key.shift ? -12 : -1)
          setEdit({ ...edit, buf: formatISODate(next), calFocus: next })
          return
        }
        if (key.pageDown) {
          const next = addMonths(focus, key.shift ? 12 : 1)
          setEdit({ ...edit, buf: formatISODate(next), calFocus: next })
          return
        }
        if (key.backspace || key.delete) {
          const nextBuf = edit.buf.slice(0, -1)
          setEdit({ ...edit, buf: nextBuf, calFocus: parseISODate(nextBuf) ?? edit.calFocus })
          return
        }
        if (key.tab) {
          commitEdit()
          moveRight()
          return
        }
        if (input && !input.startsWith('\u001b')) {
          const nextBuf = edit.buf + input
          setEdit({ ...edit, buf: nextBuf, calFocus: parseISODate(nextBuf) ?? edit.calFocus })
        }
        return
      }
      if (key.return) {
        commitEdit()
        return
      }
      if (key.backspace || key.delete) {
        setEdit({ ...edit, buf: edit.buf.slice(0, -1) })
        return
      }
      if (key.tab) {
        commitEdit()
        moveRight()
        return
      }
      if (input && !input.startsWith('\u001b')) {
        setEdit({ ...edit, buf: edit.buf + input })
      }
    },
    onDialog: () => {
      onChangeMode('navigation')
    },
  })

  function moveRight(): void {
    setCursor((c) => ({ ...c, col: Math.min(fields.length - 1, c.col + 1) }))
  }

  function startEditing(): void {
    const field = fields[cursor.col]
    const record = records[cursor.row]
    if (!field || !record) return
    if (field.type === 'select') {
      const opts = (field.options as SelectOptions).options as {
        id: string
        name: string
        color?: string
      }[]
      const currentIdx = Math.max(
        0,
        opts.findIndex((o) => o.id === record.data[field.id]),
      )
      setSelect({ field, recordId: record.id, options: opts, cursor: currentIdx })
      onChangeMode('editing')
      return
    }
    if (field.type === 'checkbox') {
      const v = record.data[field.id]
      const next = !(v === true)
      if (tableId) {
        void store
          .updateRecord({ tableId, recordId: record.id, fieldId: field.id, value: next })
          .catch(() => undefined)
      }
      return
    }
    const current = record.data[field.id]
    const buf = current == null ? '' : typeof current === 'string' ? current : String(current)
    const calFocus =
      field.type === 'date' ? (parseISODate(buf) ?? stripTime(new Date())) : undefined
    setEdit({ field, recordId: record.id, buf, calFocus })
    onChangeMode('editing')
  }

  function commitSelect(): void {
    if (!select || !tableId) return
    const chosen = select.options[select.cursor]
    if (!chosen) {
      setSelect(null)
      onChangeMode('navigation')
      return
    }
    void store
      .updateRecord({
        tableId,
        recordId: select.recordId,
        fieldId: select.field.id,
        value: chosen.id,
      })
      .catch(() => undefined)
    setSelect(null)
    onChangeMode('navigation')
  }

  function commitEdit(): void {
    if (!edit || !tableId) return
    let value: unknown = edit.buf
    if (edit.field.type === 'number') {
      const n = Number(edit.buf)
      value = edit.buf.trim() === '' ? null : Number.isFinite(n) ? n : null
    } else if (edit.field.type === 'date') {
      value = edit.buf.trim() === '' ? null : edit.buf
    } else if (edit.field.type === 'text') {
      value = edit.buf
    }
    void store
      .updateRecord({ tableId, recordId: edit.recordId, fieldId: edit.field.id, value })
      .catch(() => undefined)
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
      renderRow(rec, fields, colWidths, cursor.row === start + i, cursor.col, edit, select),
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
    select ? renderSelectPopup(select, cursor, start, colWidths, viewportRows) : null,
    edit?.field.type === 'date'
      ? renderCalendarPopup(edit, cursor, start, colWidths, viewportRows)
      : null,
    !edit && !select
      ? renderOverflowPopup(cursor, start, fields, records, colWidths, viewportRows)
      : null,
  )
}

// --- helpers -------------------------------------------------------------

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

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
  // The cell box has paddingX:1 on both sides AND a 1-char right border —
  // visible text width is cellWidth - 3. (formatCell uses the same budget
  // via the `width` arg we now pass it from renderRow.)
  const innerWidth = Math.max(1, cellWidth - 2 * ROW_PADDING - 1)
  if (raw.length <= innerWidth) return null
  // Skip the first line — that one is already painted inside the cell.
  // Continuation = everything from char `innerWidth` onward, hard-wrapped
  // to the same inner width.
  const continuation = wrapText(raw.slice(innerWidth), innerWidth)
  if (continuation.length === 0) return null
  // Don't spill past the viewport's bottom; if there's not enough room
  // below the cell, drop the trailing lines (the cell still shows the
  // first slice + "…" is unnecessary because the continuation makes the
  // overflow visible).
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
  // Hard wrap by character — terminals don't care about word boundaries
  // and our content can be CJK / URLs / paths where word wrap is wrong.
  // Respect explicit newlines first.
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

// Floating calendar — same positioning model as the select popup, sized
// from the Calendar component's exported constants. Flips upward when the
// row is too close to the status bar.
function renderCalendarPopup(
  edit: EditState,
  cursor: Cursor,
  start: number,
  colWidths: number[],
  viewportRows: number,
): JSX.Element {
  const headerHeight = 1
  let left = ID_COL_WIDTH
  for (let i = 0; i < cursor.col; i++) left += colWidths[i] ?? MIN_COL_WIDTH
  const rowYInGrid = cursor.row - start
  const cellTop = headerHeight + rowYInGrid
  const spaceBelow = viewportRows - rowYInGrid - 1
  const dropsDown = CALENDAR_HEIGHT <= spaceBelow
  const top = dropsDown ? cellTop + 1 : Math.max(0, cellTop - CALENDAR_HEIGHT)
  const focus = edit.calFocus ?? stripTime(new Date())
  const selected = parseISODate(edit.buf)
  return React.createElement(
    Box,
    {
      position: 'absolute',
      marginLeft: left,
      marginTop: top,
      width: CALENDAR_WIDTH,
    },
    React.createElement(Calendar, {
      visibleMonth: focus,
      focused: focus,
      selected,
    }),
  )
}

// Floating dropdown — rendered with absolute positioning so it sits on top
// of subsequent rows instead of pushing them down. Drops below the cell when
// there's room; flips up when below would overflow into the status bar.
function renderSelectPopup(
  select: SelectState,
  cursor: Cursor,
  start: number,
  colWidths: number[],
  viewportRows: number,
): JSX.Element {
  const headerHeight = 1
  // Left offset = id column + widths of preceding data columns.
  let left = ID_COL_WIDTH
  for (let i = 0; i < cursor.col; i++) left += colWidths[i] ?? MIN_COL_WIDTH
  const cellWidth = colWidths[cursor.col] ?? MIN_COL_WIDTH
  const longest = select.options.reduce((m, o) => Math.max(m, o.name.length), 0)
  const popupWidth = Math.max(cellWidth, longest + 4)
  // Popup is options.length tall + 2 lines of border.
  const popupHeight = select.options.length + 2
  // y of the cursor row inside the grid (0-based, after header).
  const rowYInGrid = cursor.row - start
  const cellTop = headerHeight + rowYInGrid
  // Room below the cell: viewport minus cells consumed up to & including cursor.
  const spaceBelow = viewportRows - rowYInGrid - 1
  const dropsDown = popupHeight <= spaceBelow
  const top = dropsDown
    ? cellTop + 1 // just under the cell
    : Math.max(0, cellTop - popupHeight) // flip up, anchor above the cell
  return React.createElement(
    Box,
    {
      position: 'absolute',
      marginLeft: left,
      marginTop: top,
      width: popupWidth,
      borderStyle: 'round',
      flexDirection: 'column',
    },
    ...select.options.map((o, i) =>
      React.createElement(
        Text,
        { key: o.id, inverse: i === select.cursor, color: o.color },
        '  ' + o.name,
      ),
    ),
  )
}

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
        React.createElement(
          Text,
          { bold: isActive, color: isActive ? 'cyan' : undefined },
          truncate(f.name + arrow, widths[i] ?? MIN_COL_WIDTH),
        ),
      )
    }),
  )
}

function renderRow(
  rec: RecordRow,
  fields: Field[],
  widths: number[],
  active: boolean,
  activeCol: number,
  edit: EditState | null,
  select: SelectState | null,
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
      React.createElement(Text, { dimColor: true }, id),
    ),
    ...fields.map((f, i) => {
      const isActive = active
      const isEditingThis = edit && isActive && edit.field.id === f.id && edit.recordId === rec.id
      const selectHere =
        select && isActive && select.field.id === f.id && select.recordId === rec.id
      const value = rec.data[f.id]
      const inner = renderCell(
        f,
        value,
        isActive,
        Boolean(isEditingThis),
        edit,
        Boolean(selectHere),
        select,
        // Inner width = column width minus the box's horizontal padding
        // AND its right border — that's the budget formatCell can paint.
        Math.max(1, (widths[i] ?? MIN_COL_WIDTH) - 2 * ROW_PADDING - 1),
        isActive && i === activeCol,
      )
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

function renderCell(
  field: Field,
  value: unknown,
  rowActive: boolean,
  isEditing: boolean,
  edit: EditState | null,
  selectOpen: boolean,
  select: SelectState | null,
  width: number,
  isFocused: boolean,
): JSX.Element {
  const colActive = isEditing || selectOpen
  const inverse = rowActive && !colActive
  if (isEditing && edit) {
    if (field.type === 'number') {
      // Drive the in-cell editor from the keystroke buffer (same model as
      // text/date) so the user sees their typing and backspacing live.
      return React.createElement(TextEditor, { value: edit.buf, active: true, placeholder: '0' })
    }
    if (field.type === 'date') {
      return React.createElement(DateEditor, {
        value: (edit.buf || null) as string | null,
        active: true,
      })
    }
    return React.createElement(TextEditor, { value: edit.buf, active: true, placeholder: ' ' })
  }
  if (selectOpen && select) {
    return React.createElement(SelectEditor, {
      value: value as string | null,
      options: select.options,
      active: true,
      open: true,
      cursor: select.cursor,
    })
  }
  const text = formatCell(field, value, width, isFocused)
  if (field.type === 'checkbox') {
    const checked = value === true
    return React.createElement(CheckboxEditor, { value: checked, active: inverse })
  }
  return React.createElement(Text, { inverse, color: rowActive ? 'cyan' : undefined }, text)
}

function formatCell(field: Field, value: unknown, width: number, isFocused = false): string {
  if (value === null || value === undefined) return '∅'
  if (field.type === 'select') {
    const opts = (field.options as SelectOptions).options as { id: string; name: string }[]
    const o = opts.find((x) => x.id === value)
    if (o) return truncate(o.name, width, isFocused)
  }
  return truncate(String(value), width, isFocused)
}

function truncate(s: string, width: number, isFocused = false): string {
  if (s.length <= width) return s
  // On the focused cell we drop the "…" so the continuation overlay can
  // pick up exactly at character `width` — the cell + continuation read
  // as a single tall paragraph.
  if (isFocused) return s.slice(0, width)
  return s.slice(0, Math.max(0, width - 1)) + '…'
}
