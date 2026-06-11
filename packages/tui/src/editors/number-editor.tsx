/**
 * Number editor — accepts digits, sign, decimal point. Live-validates;
 * invalid keystrokes still update the buffer but surface a red feedback
 * line in the status bar (cf. shadcn's `aria-invalid` ring).
 */
import React from 'react'
import { Text } from 'ink'
import type { CellEditor, Feedback, RenderProps } from './types.js'

interface NumberState {
  buf: string
}

export const numberEditor: CellEditor<NumberState> = {
  capability: { overlay: 'none', instant: false },

  beginEdit(value) {
    if (value === null || value === undefined) return { buf: '' }
    if (typeof value === 'number') return { buf: String(value) }
    return { buf: String(value) }
  },

  reduce(state, input, key) {
    if (key.escape) return { next: state, intent: 'cancel' }
    if (key.return) return { next: state, intent: 'commit' }
    if (key.tab) return { next: state, intent: 'commit-next' }
    if (key.backspace || key.delete) return { next: { buf: state.buf.slice(0, -1) } }
    if (input && !input.startsWith('\x1b')) {
      // Don't filter at input — let the user type freely; validate() will
      // light up red if the result isn't parseable. Same UX as a web input.
      return { next: { buf: state.buf + input } }
    }
    return { next: state }
  },

  validate(state) {
    if (state.buf.trim() === '') return null
    const n = Number(state.buf)
    if (!Number.isFinite(n)) {
      return { kind: 'error', text: `'${state.buf}' is not a number` }
    }
    return null
  },

  commitValue(state) {
    if (state.buf.trim() === '') return null
    const n = Number(state.buf)
    return Number.isFinite(n) ? n : null
  },

  hint() {
    return 'Type a number, Enter to save, blank = clear'
  },

  render(props: RenderProps<NumberState>) {
    const { state, value, field, ctx } = props
    if (state) {
      const invalid = numberEditor.validate(state, field) !== null
      const text = state.buf.length === 0 ? ' ' : state.buf
      return React.createElement(
        Text,
        { color: invalid ? 'red' : 'yellow' },
        text,
        React.createElement(Text, { color: invalid ? 'red' : 'yellow' }, '▏'),
      )
    }
    if (value === null || value === undefined) {
      return React.createElement(Text, { dimColor: true }, ' ')
    }
    const display = String(value)
    if (ctx.focus === 'passive') {
      return React.createElement(Text, { color: ctx.readonly ? 'gray' : 'cyan' }, display)
    }
    return React.createElement(Text, { dimColor: ctx.readonly }, display)
  },
}

// Exported for tests that want to assert validation directly without going
// through GridView.
export function validateNumber(buf: string): Feedback | null {
  return numberEditor.validate({ buf }, {} as never)
}
