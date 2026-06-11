/**
 * Checkbox editor — the canonical "instant" editor: Enter/Space toggles
 * the value with no edit-mode session, no overlay, no buffer. Mirrors how
 * shadcn lets <Checkbox> own its state via aria-checked without needing a
 * surrounding form context.
 */
import React from 'react'
import { Text } from 'ink'
import type { CellEditor, RenderProps } from './types.js'

// Edit state is unused because checkbox is instant — we still need a shape
// so the editor satisfies CellEditor<S>; the empty record is the cheapest.
interface CheckboxState {
  readonly _: never
}

export const checkboxEditor: CellEditor<CheckboxState> = {
  capability: { overlay: 'none', instant: true },

  beginEdit() {
    // Instant editors never actually enter edit mode — GridView calls
    // `instantValue()` instead. Returning a stub keeps the type honest.
    return {} as CheckboxState
  },

  instantValue(currentValue) {
    return !(currentValue === true)
  },

  reduce(state) {
    return { next: state }
  },

  validate() {
    return null
  },

  commitValue() {
    // Unused (instant path goes through instantValue).
    return false
  },

  hint() {
    return 'Enter or Space toggles'
  },

  render(props: RenderProps<CheckboxState>) {
    const { value, ctx } = props
    const checked = value === true
    const mark = checked ? '☑' : '☐'
    if (ctx.focus === 'passive') {
      return React.createElement(Text, { color: ctx.readonly ? 'gray' : 'cyan', bold: true }, mark)
    }
    return React.createElement(Text, { dimColor: ctx.readonly && !checked }, mark)
  },
}
