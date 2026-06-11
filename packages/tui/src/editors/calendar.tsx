/**
 * Keyboard model + grid layout borrowed from react-day-picker
 * (which is what shadcn/ui's <Calendar /> wraps). Reimplemented for ink:
 * a pure 7×6 grid painted with <Box>/<Text> — no CSS, no DOM.
 *
 * The component is presentational. Focus + selection are owned by the
 * parent (GridView) so the same date can be driven from arrow keys or
 * from typing into a YYYY-MM-DD buffer.
 */
import React from 'react'
import { Box, Text } from 'ink'

export interface CalendarProps {
  // The month being shown (any day inside it works).
  visibleMonth: Date
  // The day the cursor is on. May fall outside visibleMonth — those days
  // are rendered dimmed in the leading/trailing slots, like a real month grid.
  focused: Date
  // The day that's actually committed/selected. Null = nothing yet.
  selected: Date | null
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const
// 6 weeks × 7 days × (1-char gap + 2-char cell) + border. Locked so the
// floating popup doesn't reflow when months change shape.
const CELL_W = 2
const GAP_W = 1
const CAL_INNER_W = 7 * CELL_W + 6 * GAP_W // 20
export const CALENDAR_WIDTH = CAL_INNER_W + 4 // + paddingX:1 + border:1 each side
export const CALENDAR_HEIGHT = 1 /*header*/ + 1 /*weekday*/ + 6 /*weeks*/ + 2 /*border*/

export function Calendar(props: CalendarProps): JSX.Element {
  const { visibleMonth, focused, selected } = props
  const grid = monthGrid(visibleMonth)
  const monthLabel = `${visibleMonth.getFullYear()}-${pad2(visibleMonth.getMonth() + 1)}`
  return React.createElement(
    Box,
    {
      flexDirection: 'column',
      borderStyle: 'round',
      paddingX: 1,
      width: CALENDAR_WIDTH,
    },
    React.createElement(
      Box,
      { justifyContent: 'center' },
      React.createElement(Text, { bold: true }, monthLabel),
    ),
    React.createElement(
      Box,
      {},
      ...WEEKDAYS.map((w, i) =>
        React.createElement(Text, { key: w, dimColor: true }, (i === 0 ? '' : ' ') + w),
      ),
    ),
    ...grid.map((week, wi) =>
      React.createElement(
        Box,
        { key: wi },
        ...week.map((day, di) => {
          const inMonth = day.getMonth() === visibleMonth.getMonth()
          const isFocused = sameDay(day, focused)
          const isSelected = selected ? sameDay(day, selected) : false
          const label = pad2(day.getDate())
          return React.createElement(
            Text,
            {
              key: di,
              inverse: isFocused,
              bold: isSelected,
              color: isSelected ? 'cyan' : undefined,
              dimColor: !inMonth && !isFocused && !isSelected,
            },
            (di === 0 ? '' : ' ') + label,
          )
        }),
      ),
    ),
  )
}

// --- date math (intentionally dep-free; we only do day-grain) -------------

export function parseISODate(s: string): Date | null {
  // Accepts YYYY-MM-DD, all numeric. Rejects everything else so partial
  // typing doesn't snap the calendar mid-keystroke.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const date = new Date(y, mo - 1, d)
  // Reject overflow (e.g. Feb 30 → Mar 2).
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return null
  }
  return date
}

export function formatISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
  return x
}

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth() + n, 1)
  // Preserve day-of-month when possible; clamp to month end otherwise.
  const desired = d.getDate()
  const lastOfTarget = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()
  x.setDate(Math.min(desired, lastOfTarget))
  return x
}

export function startOfWeek(d: Date): Date {
  return addDays(d, -d.getDay())
}

export function endOfWeek(d: Date): Date {
  return addDays(d, 6 - d.getDay())
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function monthGrid(anchor: Date): Date[][] {
  // 6 weeks × 7 days, starting on the Sunday on/before the 1st.
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const start = startOfWeek(first)
  const out: Date[][] = []
  let cursor = start
  for (let w = 0; w < 6; w++) {
    const week: Date[] = []
    for (let d = 0; d < 7; d++) {
      week.push(cursor)
      cursor = addDays(cursor, 1)
    }
    out.push(week)
  }
  return out
}

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n)
}
