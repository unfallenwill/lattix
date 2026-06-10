import React from 'react'
import { Box, Text } from 'ink'
import type { ConnectionState } from '@lattix/client'

export function StatusBar(props: {
  state: ConnectionState
  mode: string
  hints: string
  position?: { row: number; total: number; col: number; cols: number } | null
}): JSX.Element {
  const stateColor =
    props.state === 'connected' ? 'green' : props.state === 'reconnecting' ? 'yellow' : 'red'
  return React.createElement(
    Box,
    { borderStyle: 'single', borderTop: true, paddingX: 1, justifyContent: 'space-between' },
    React.createElement(
      Box,
      { gap: 2 },
      React.createElement(
        Text,
        null,
        React.createElement(Text, { color: stateColor }, '●'),
        ' ',
        props.state,
      ),
      React.createElement(Text, { dimColor: true }, props.mode),
      props.position
        ? React.createElement(
            Text,
            { dimColor: true },
            '[',
            String(props.position.row + 1),
            '/',
            String(props.position.total),
            ' row, ',
            String(props.position.col + 1),
            '/',
            String(props.position.cols),
            ' col]',
          )
        : null,
    ),
    React.createElement(Text, { dimColor: true }, props.hints),
  )
}
