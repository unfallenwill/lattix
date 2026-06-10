import React from 'react'
import { Text } from 'ink'

// Pure presentational: the parent owns the keystroke buffer.
export function TextEditor(props: {
  value: string
  active: boolean
  placeholder?: string
}): JSX.Element {
  const v = props.value
  if (v.length === 0 && !props.active) {
    return React.createElement(Text, { dimColor: true }, props.placeholder ?? '∅')
  }
  return React.createElement(Text, { inverse: props.active }, v.length === 0 ? ' ' : v)
}
