import React from 'react'
import { Text } from 'ink'

export function NumberEditor(props: { value: number | null; active: boolean }): JSX.Element {
  const v = props.value
  if (v === null) {
    return React.createElement(
      Text,
      { dimColor: true, inverse: props.active },
      props.active ? '0' : '∅',
    )
  }
  return React.createElement(Text, { inverse: props.active }, String(v))
}
