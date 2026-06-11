/**
 * Select editor — the cell paints the current option name plus a right-
 * aligned ▼ chevron (cf. shadcn's InputGroupAddon `align="inline-end"`),
 * so users can spot select columns at a glance. The dropdown itself is
 * an overlay produced by `overlay()`; GridView places it absolutely.
 */
import React from 'react'
import { Box, Text } from 'ink'
import type { SelectOptions } from '@lattix/protocol'
import type { CellEditor, OverlaySpec, RenderProps } from './types.js'

interface Opt {
  id: string
  name: string
  color?: string
}

interface SelectState {
  options: Opt[]
  cursor: number
}

export const selectEditor: CellEditor<SelectState> = {
  capability: { overlay: 'dropdown', instant: false },

  beginEdit(value, field) {
    const options = (field.options as SelectOptions).options as Opt[]
    const idx = Math.max(
      0,
      options.findIndex((o) => o.id === value),
    )
    return { options, cursor: idx }
  },

  reduce(state, input, key) {
    if (key.escape) return { next: state, intent: 'cancel' }
    if (key.return || input === ' ') return { next: state, intent: 'commit' }
    if (key.tab) return { next: state, intent: 'commit-next' }
    if (input === 'j' || key.downArrow) {
      return { next: { ...state, cursor: Math.min(state.options.length - 1, state.cursor + 1) } }
    }
    if (input === 'k' || key.upArrow) {
      return { next: { ...state, cursor: Math.max(0, state.cursor - 1) } }
    }
    return { next: state }
  },

  validate() {
    return null
  },

  commitValue(state) {
    return state.options[state.cursor]?.id ?? null
  },

  hint() {
    return 'j/k to move, Enter to pick, Esc to cancel'
  },

  render(props: RenderProps<SelectState>) {
    const { state, value, field, ctx } = props
    const options = (field.options as SelectOptions).options as Opt[]
    const currentId = state ? state.options[state.cursor]?.id : (value as string | null)
    const current = options.find((o) => o.id === currentId)
    // Right-aligned chevron in 1 char of the cell budget.
    const labelBudget = Math.max(1, ctx.width - 1)
    const label = current ? truncate(current.name, labelBudget) : ''
    const fillCount = Math.max(0, labelBudget - label.length)
    const chevronColor =
      ctx.focus === 'active' ? 'yellow' : ctx.focus === 'passive' ? 'cyan' : undefined
    const textColor =
      ctx.focus === 'active'
        ? 'yellow'
        : ctx.focus === 'passive'
          ? ctx.readonly
            ? 'gray'
            : 'cyan'
          : current?.color
    return React.createElement(
      Box,
      { width: ctx.width },
      React.createElement(Text, { color: textColor as never }, label),
      fillCount > 0 ? React.createElement(Text, null, ' '.repeat(fillCount)) : null,
      React.createElement(
        Text,
        { color: chevronColor as never, dimColor: ctx.focus === 'none' },
        '▼',
      ),
    )
  },

  overlay(state): OverlaySpec {
    const longest = state.options.reduce((m, o) => Math.max(m, o.name.length), 0)
    const width = Math.max(12, longest + 4)
    const height = state.options.length + 2
    return {
      width,
      height,
      render: () =>
        React.createElement(
          Box,
          { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan' },
          ...state.options.map((o, i) =>
            React.createElement(
              Text,
              { key: o.id, inverse: i === state.cursor, color: o.color as never },
              ' ' + o.name + ' ',
            ),
          ),
        ),
    }
  },
}

function truncate(s: string, w: number): string {
  if (s.length <= w) return s
  return s.slice(0, Math.max(0, w - 1)) + '…'
}
