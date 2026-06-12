import React from 'react'
import { Box, Text } from 'ink'
import type { ConnectionState } from '@lattix/client'

export interface StatusFeedback {
  kind: 'hint' | 'error'
  text: string
}

/**
 * Status bar layout, left → right:
 *   [● state] [mode] [pos]   [feedback]   [keymap hints]
 *
 * `feedback` is the shadcn-style live validation slot: it surfaces
 *   - the field's input hint while a cell is focused (grey),
 *   - the validation error while typing an invalid value (red).
 * Without a focused cell the slot is empty.
 */
export function StatusBar(props: {
  state: ConnectionState
  mode: string
  hints: string
  position?: { row: number; total: number; col: number; cols: number } | null
  feedback?: StatusFeedback | null
}): JSX.Element {
  const stateColor =
    props.state === 'connected' ? 'green' : props.state === 'reconnecting' ? 'yellow' : 'red'
  const feedbackColor = props.feedback?.kind === 'error' ? 'red' : 'gray'
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
      props.feedback
        ? React.createElement(
            Text,
            { color: feedbackColor },
            props.feedback.kind === 'error' ? '✗ ' : '› ',
            props.feedback.text,
          )
        : null,
    ),
    React.createElement(Text, { dimColor: true }, props.hints),
  )
}
