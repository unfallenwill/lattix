import React from 'react'
import { Text } from 'ink'
import type { SelectOptions } from '@lattix/protocol'

// SelectEditor only paints inside the cell. The open-state dropdown is drawn
// by GridView as an absolutely-positioned overlay, so this component must
// never widen the cell — even when `open` is true it just highlights the
// current value to signal "this cell owns the popup".
export function SelectEditor(props: {
  value: string | null
  options: SelectOptions['options']
  active: boolean
  open: boolean
  cursor: number
}): JSX.Element {
  const { value, options, active, open } = props
  const current = options.find((o) => o.id === value)
  return React.createElement(
    Text,
    { inverse: active || open, color: current?.color as never },
    current ? current.name : '∅',
  )
}
