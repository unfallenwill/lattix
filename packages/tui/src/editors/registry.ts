/**
 * Editor registry — maps `FieldType → CellEditor`. GridView pulls editors
 * from here and never imports them by name. Adding a new field type means:
 *   1. Add the type literal in @lattix/protocol's FIELD_TYPES.
 *   2. Implement a CellEditor.
 *   3. Register it here.
 * No GridView changes.
 */
import type { FieldType } from '@lattix/protocol'
import type { AnyCellEditor } from './types.js'
import { textEditor } from './text-editor.js'
import { numberEditor } from './number-editor.js'
import { selectEditor } from './select-editor.js'
import { checkboxEditor } from './checkbox-editor.js'
import { dateEditor } from './date-editor.js'

const REGISTRY: Record<FieldType, AnyCellEditor> = {
  text: textEditor as AnyCellEditor,
  number: numberEditor as AnyCellEditor,
  select: selectEditor as AnyCellEditor,
  checkbox: checkboxEditor as AnyCellEditor,
  date: dateEditor as AnyCellEditor,
}

export function getEditor(type: FieldType): AnyCellEditor {
  return REGISTRY[type]
}
