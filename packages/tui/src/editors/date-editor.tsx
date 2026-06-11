/**
 * Date editor — typing a YYYY-MM-DD updates `buf`; arrow keys move the
 * calendar focus by ±1 day; PageUp/Down (with optional Shift) step by
 * month / year. Calendar is an overlay, not a replacement cell.
 *
 * Validation: only complete + parseable ISO dates commit successfully.
 * Partial buffers light the cell yellow; clearly invalid buffers
 * (`2026-13-99`, `not-a-date`) light up red via StatusBar feedback.
 */
import React from 'react'
import { Box, Text } from 'ink'
import type { CellEditor, OverlaySpec, RenderProps } from './types.js'
import {
  Calendar,
  CALENDAR_HEIGHT,
  CALENDAR_WIDTH,
  addDays,
  addMonths,
  formatISODate,
  parseISODate,
} from './calendar.js'

export interface DateState {
  buf: string
  calFocus: Date
}

function todayStripped(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export const dateEditor: CellEditor<DateState> = {
  capability: { overlay: 'calendar', instant: false },

  beginEdit(value) {
    const buf = typeof value === 'string' ? value : ''
    const parsed = parseISODate(buf)
    return { buf, calFocus: parsed ?? todayStripped() }
  },

  reduce(state, input, key) {
    if (key.escape) return { next: state, intent: 'cancel' }
    if (key.return) return { next: state, intent: 'commit' }
    if (key.tab) return { next: state, intent: 'commit-next' }
    if (key.leftArrow) {
      const next = addDays(state.calFocus, -1)
      return { next: { buf: formatISODate(next), calFocus: next } }
    }
    if (key.rightArrow) {
      const next = addDays(state.calFocus, 1)
      return { next: { buf: formatISODate(next), calFocus: next } }
    }
    if (key.upArrow) {
      const next = addDays(state.calFocus, -7)
      return { next: { buf: formatISODate(next), calFocus: next } }
    }
    if (key.downArrow) {
      const next = addDays(state.calFocus, 7)
      return { next: { buf: formatISODate(next), calFocus: next } }
    }
    if (key.pageUp) {
      const next = addMonths(state.calFocus, key.shift ? -12 : -1)
      return { next: { buf: formatISODate(next), calFocus: next } }
    }
    if (key.pageDown) {
      const next = addMonths(state.calFocus, key.shift ? 12 : 1)
      return { next: { buf: formatISODate(next), calFocus: next } }
    }
    if (key.backspace || key.delete) {
      const nextBuf = state.buf.slice(0, -1)
      const parsed = parseISODate(nextBuf)
      return { next: { buf: nextBuf, calFocus: parsed ?? state.calFocus } }
    }
    if (input && !input.startsWith('\x1b')) {
      const nextBuf = state.buf + input
      const parsed = parseISODate(nextBuf)
      return { next: { buf: nextBuf, calFocus: parsed ?? state.calFocus } }
    }
    return { next: state }
  },

  validate(state) {
    if (state.buf.trim() === '') return null
    if (!parseISODate(state.buf)) {
      // Buffer being typed is OK if it's a prefix of YYYY-MM-DD; report
      // error only when the shape is definitively wrong.
      if (!/^\d{0,4}(-\d{0,2}(-\d{0,2})?)?$/.test(state.buf)) {
        return { kind: 'error', text: `'${state.buf}' is not a valid date` }
      }
    }
    return null
  },

  commitValue(state) {
    const trimmed = state.buf.trim()
    if (trimmed === '') return null
    return parseISODate(trimmed) ? trimmed : formatISODate(state.calFocus)
  },

  hint() {
    return '←/→ day, ↑/↓ week, PgUp/PgDn month, Shift+PgUp/Dn year, Enter to save'
  },

  render(props: RenderProps<DateState>) {
    const { state, value, ctx } = props
    if (state) {
      const invalid = dateEditor.validate(state, props.field) !== null
      const text = state.buf.length === 0 ? 'YYYY-MM-DD' : state.buf
      return React.createElement(
        Text,
        { color: invalid ? 'red' : 'yellow', dimColor: state.buf.length === 0 },
        text,
      )
    }
    if (value === null || value === undefined || value === '') {
      return React.createElement(Text, { dimColor: true }, ' ')
    }
    const str = String(value)
    if (ctx.focus === 'passive') {
      return React.createElement(Text, { color: ctx.readonly ? 'gray' : 'cyan' }, str)
    }
    return React.createElement(Text, { dimColor: ctx.readonly }, str)
  },

  overlay(state): OverlaySpec {
    return {
      width: CALENDAR_WIDTH,
      height: CALENDAR_HEIGHT,
      render: () =>
        React.createElement(
          Box,
          { width: CALENDAR_WIDTH },
          React.createElement(Calendar, {
            visibleMonth: state.calFocus,
            focused: state.calFocus,
            selected: parseISODate(state.buf),
          }),
        ),
    }
  },
}
