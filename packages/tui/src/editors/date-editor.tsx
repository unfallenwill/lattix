import React from 'react'
import { Text } from 'ink'

export function DateEditor(props: { value: string | null; active: boolean }): JSX.Element {
  const v = props.value
  if (!v) {
    return React.createElement(
      Text,
      { dimColor: true, inverse: props.active },
      props.active ? 'YYYY-MM-DD' : '∅',
    )
  }
  return React.createElement(Text, { inverse: props.active }, v)
}
