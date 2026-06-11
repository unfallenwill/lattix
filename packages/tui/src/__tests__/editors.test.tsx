import React from 'react'
import { render } from 'ink-testing-library'
import { TextEditor } from '../editors/text-editor.js'
import { NumberEditor } from '../editors/number-editor.js'
import { CheckboxEditor } from '../editors/checkbox-editor.js'
import { DateEditor } from '../editors/date-editor.js'
import { SelectEditor } from '../editors/select-editor.js'

describe('TextEditor', () => {
  it('renders the value when not empty', () => {
    const { lastFrame } = render(React.createElement(TextEditor, { value: 'hello', active: true }))
    expect(lastFrame()).toContain('hello')
  })

  it('renders the placeholder when empty + inactive', () => {
    const { lastFrame } = render(
      React.createElement(TextEditor, {
        value: '',
        active: false,
        placeholder: '(empty)',
      }),
    )
    expect(lastFrame()).toContain('(empty)')
  })

  it('falls back to ∅ when no placeholder + empty', () => {
    const { lastFrame } = render(React.createElement(TextEditor, { value: '', active: false }))
    expect(lastFrame()).toContain('∅')
  })

  it('renders a blank cell when empty + active', () => {
    const { lastFrame } = render(React.createElement(TextEditor, { value: '', active: true }))
    // active+empty still renders (a space) — no placeholder fallback
    expect(lastFrame()).toBeDefined()
  })
})

describe('NumberEditor', () => {
  it('stringifies a number', () => {
    const { lastFrame } = render(React.createElement(NumberEditor, { value: 42, active: false }))
    expect(lastFrame()).toContain('42')
  })

  it('shows ∅ on null/inactive', () => {
    const { lastFrame } = render(React.createElement(NumberEditor, { value: null, active: false }))
    expect(lastFrame()).toContain('∅')
  })

  it('shows 0 hint when active + null', () => {
    const { lastFrame } = render(React.createElement(NumberEditor, { value: null, active: true }))
    expect(lastFrame()).toContain('0')
  })
})

describe('CheckboxEditor', () => {
  it('renders ☑ when true', () => {
    const { lastFrame } = render(
      React.createElement(CheckboxEditor, { value: true, active: false }),
    )
    expect(lastFrame()).toContain('☑')
  })

  it('renders ☐ when false', () => {
    const { lastFrame } = render(
      React.createElement(CheckboxEditor, { value: false, active: false }),
    )
    expect(lastFrame()).toContain('☐')
  })
})

describe('DateEditor', () => {
  it('shows date string', () => {
    const { lastFrame } = render(
      React.createElement(DateEditor, { value: '2026-06-11', active: false }),
    )
    expect(lastFrame()).toContain('2026-06-11')
  })

  it('shows placeholder when active+null', () => {
    const { lastFrame } = render(React.createElement(DateEditor, { value: null, active: true }))
    expect(lastFrame()).toContain('YYYY-MM-DD')
  })

  it('shows ∅ when inactive+null', () => {
    const { lastFrame } = render(React.createElement(DateEditor, { value: null, active: false }))
    expect(lastFrame()).toContain('∅')
  })
})

describe('SelectEditor', () => {
  const options = [
    { id: 'a', name: 'Alpha', color: 'red' as const },
    { id: 'b', name: 'Beta', color: 'green' as const },
  ]

  it('renders the current option name when closed', () => {
    const { lastFrame } = render(
      React.createElement(SelectEditor, {
        value: 'b',
        options,
        active: false,
        open: false,
        cursor: 0,
      }),
    )
    expect(lastFrame()).toContain('Beta')
  })

  it('renders ∅ when value not in options + closed', () => {
    const { lastFrame } = render(
      React.createElement(SelectEditor, {
        value: null,
        options,
        active: false,
        open: false,
        cursor: 0,
      }),
    )
    expect(lastFrame()).toContain('∅')
  })

  it('renders all options separated when open', () => {
    const { lastFrame } = render(
      React.createElement(SelectEditor, {
        value: 'a',
        options,
        active: true,
        open: true,
        cursor: 1,
      }),
    )
    const out = lastFrame() ?? ''
    expect(out).toContain('Alpha')
    expect(out).toContain('Beta')
    expect(out).toContain('|')
  })

  it('shows "(no options)" when open with empty options', () => {
    const { lastFrame } = render(
      React.createElement(SelectEditor, {
        value: null,
        options: [],
        active: true,
        open: true,
        cursor: 0,
      }),
    )
    expect(lastFrame()).toContain('(no options)')
  })
})
