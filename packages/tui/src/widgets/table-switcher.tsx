import React from 'react'
import { Box, Text } from 'ink'
import type { Table } from '@lattix/shared'

export function TableSwitcher(props: {
  tables: readonly Table[]
  currentId: string | null
  selectedIndex: number
}): JSX.Element {
  const { tables, currentId, selectedIndex } = props
  if (tables.length === 0) {
    return React.createElement(
      Box,
      { paddingX: 1 },
      React.createElement(Text, { dimColor: true }, 'No tables yet. Press `n` to create one.'),
    )
  }
  return React.createElement(
    Box,
    { flexDirection: 'column', paddingX: 1 },
    React.createElement(Text, { bold: true }, 'Tables'),
    ...tables.map((t, i) => {
      const active = t.id === currentId
      const pointer = i === selectedIndex ? '▶' : ' '
      return React.createElement(
        Text,
        { key: t.id },
        React.createElement(Text, { color: active ? 'cyan' : undefined }, pointer + ' ' + t.name),
        active ? React.createElement(Text, { dimColor: true }, ' (current)') : null,
      )
    }),
  )
}
