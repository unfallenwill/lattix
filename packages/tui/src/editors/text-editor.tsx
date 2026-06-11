/**
 * Text editor — the baseline. Keystroke buffer goes straight into the cell.
 * Empty + not-editing renders the placeholder (`hint`) in dim text; we no
 * longer paint the ∅ sentinel inside cells — that was DBA-visual noise
 * (cf. shadcn's `placeholder:text-muted-foreground` philosophy).
 */
import React from 'react'
import { Text } from 'ink'
import type { CellEditor, RenderProps } from './types.js'

interface TextState {
  buf: string
}

export const textEditor: CellEditor<TextState> = {
  capability: { overlay: 'none', instant: false },

  beginEdit(value) {
    return { buf: value == null ? '' : typeof value === 'string' ? value : String(value) }
  },

  reduce(state, input, key) {
    if (key.escape) return { next: state, intent: 'cancel' }
    if (key.return) return { next: state, intent: 'commit' }
    if (key.tab) return { next: state, intent: 'commit-next' }
    if (key.backspace || key.delete) return { next: { buf: state.buf.slice(0, -1) } }
    if (input && !input.startsWith('')) return { next: { buf: state.buf + input } }
    return { next: state }
  },

  validate() {
    return null
  },

  commitValue(state) {
    return state.buf
  },

  hint() {
    return 'Type text, Enter to save, Esc to cancel'
  },

  render(props: RenderProps<TextState>) {
    const { state, value, ctx } = props
    const display = state ? state.buf : typeof value === 'string' ? value : (value ?? '')
    const str = String(display)
    return paintText(str, ctx.focus, ctx.readonly === true)
  },
}

function paintText(str: string, focus: 'none' | 'passive' | 'active', readonly: boolean) {
  if (str.length === 0) {
    // Empty + non-active = blank cell. shadcn-style: placeholder shows only
    // while editing (the hint then lives in StatusBar).
    return React.createElement(Text, { dimColor: true }, ' ')
  }
  if (focus === 'active') {
    // Show a soft caret at the end of the buffer; yellow signals "writing".
    return React.createElement(
      Text,
      { color: 'yellow' },
      str,
      React.createElement(Text, { color: 'yellow' }, '▏'),
    )
  }
  if (focus === 'passive') {
    return React.createElement(Text, { color: readonly ? 'gray' : 'cyan' }, str)
  }
  return React.createElement(Text, { dimColor: readonly }, str)
}
