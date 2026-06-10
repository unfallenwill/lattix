import React from 'react'
import { Box, Text } from 'ink'
import type { SelectOptions } from '@lattix/protocol'

export function SelectEditor(props: {
  value: string | null
  options: SelectOptions['options']
  active: boolean
  open: boolean
  cursor: number
}): JSX.Element {
  const { value, options, active, open, cursor } = props
  const current = options.find((o) => o.id === value)
  if (!open) {
    return React.createElement(
      Text,
      { inverse: active, color: current?.color as never },
      current ? current.name : '∅',
    )
  }
  if (options.length === 0) {
    return React.createElement(Text, { dimColor: true }, '(no options)')
  }
  return React.createElement(
    Box,
    { flexDirection: 'row', flexWrap: 'nowrap' },
    ...options.flatMap((o, i) => {
      const sel = i === cursor
      const node = React.createElement(Text, { key: o.id, inverse: sel, color: o.color }, o.name)
      if (i === 0) return [node]
      return [React.createElement(Text, { key: `sep-${i}`, dimColor: true }, ' | '), node]
    }),
  )
}
