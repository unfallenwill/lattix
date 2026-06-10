import React from 'react'
import { Text } from 'ink'

export function CheckboxEditor(props: { value: boolean; active: boolean }): JSX.Element {
  const mark = props.value ? '☑' : '☐'
  return React.createElement(Text, { inverse: props.active }, mark)
}
