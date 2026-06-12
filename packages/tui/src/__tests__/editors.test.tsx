/**
 * Editor unit tests — each editor is exercised as a CellEditor: we build
 * an initial state, drive `reduce()` directly (no GridView, no stdin), and
 * assert on validation, commitValue, and the in-cell paint output.
 *
 * The visual assertions are intentionally loose: we only check that the
 * editor renders something containing the expected text — we do NOT pin
 * ANSI codes or specific colors, because those will move as we iterate.
 */
import { render } from 'ink-testing-library'
import type { Field } from '@lattix/shared'
import { textEditor } from '../editors/text-editor.js'
import { numberEditor } from '../editors/number-editor.js'
import { checkboxEditor } from '../editors/checkbox-editor.js'
import { dateEditor } from '../editors/date-editor.js'
import { selectEditor } from '../editors/select-editor.js'
import type { DispatcherKey } from '../hooks/use-input-dispatcher.js'

function key(overrides: Partial<DispatcherKey> = {}): DispatcherKey {
  return {
    escape: false,
    return: false,
    tab: false,
    shift: false,
    ctrl: false,
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageUp: false,
    pageDown: false,
    backspace: false,
    delete: false,
    ...overrides,
  }
}

function field(type: Field['type'], options: Record<string, unknown> = {}): Field {
  return {
    id: 'f1',
    tableId: 't1',
    name: 'F',
    type,
    options,
    position: 1,
    required: false,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('textEditor', () => {
  const f = field('text')

  it('beginEdit seeds from value', () => {
    expect(textEditor.beginEdit('hi', f)).toEqual({ buf: 'hi' })
    expect(textEditor.beginEdit(null, f)).toEqual({ buf: '' })
  })

  it('typing appends to buf', () => {
    const r = textEditor.reduce({ buf: 'a' }, 'b', key(), f)
    expect(r.next).toEqual({ buf: 'ab' })
    expect(r.intent).toBeUndefined()
  })

  it('backspace trims', () => {
    const r = textEditor.reduce({ buf: 'abc' }, '', key({ backspace: true }), f)
    expect(r.next).toEqual({ buf: 'ab' })
  })

  it('Enter commits', () => {
    const r = textEditor.reduce({ buf: 'x' }, '', key({ return: true }), f)
    expect(r.intent).toBe('commit')
  })

  it('Esc cancels', () => {
    const r = textEditor.reduce({ buf: 'x' }, '', key({ escape: true }), f)
    expect(r.intent).toBe('cancel')
  })

  it('Tab commits-next', () => {
    const r = textEditor.reduce({ buf: 'x' }, '', key({ tab: true }), f)
    expect(r.intent).toBe('commit-next')
  })

  it('renders the value when not editing', () => {
    const el = textEditor.render({
      state: null,
      value: 'hello',
      field: f,
      ctx: { width: 20, focus: 'passive' },
    })
    const { lastFrame } = render(el)
    expect(lastFrame()).toContain('hello')
  })

  it('renders the buffer when editing', () => {
    const el = textEditor.render({
      state: { buf: 'typing' },
      value: 'old',
      field: f,
      ctx: { width: 20, focus: 'active' },
    })
    const { lastFrame } = render(el)
    expect(lastFrame()).toContain('typing')
  })

  it('empty + non-active paints blank (no ∅ noise)', () => {
    const el = textEditor.render({
      state: null,
      value: '',
      field: f,
      ctx: { width: 20, focus: 'none' },
    })
    const { lastFrame } = render(el)
    expect(lastFrame()).not.toContain('∅')
  })

  it('hint is non-empty', () => {
    expect(textEditor.hint(f).length).toBeGreaterThan(0)
  })
})

describe('numberEditor', () => {
  const f = field('number')

  it('validate accepts blank as null', () => {
    expect(numberEditor.validate({ buf: '' }, f)).toBeNull()
  })

  it('validate accepts well-formed numbers', () => {
    expect(numberEditor.validate({ buf: '42' }, f)).toBeNull()
    expect(numberEditor.validate({ buf: '-3.14' }, f)).toBeNull()
  })

  it('validate flags non-numbers with an error', () => {
    const fb = numberEditor.validate({ buf: 'abc' }, f)
    expect(fb?.kind).toBe('error')
    expect(fb?.text).toMatch(/not a number/i)
  })

  it('commitValue returns null for blank', () => {
    expect(numberEditor.commitValue({ buf: '' }, f)).toBeNull()
  })

  it('commitValue returns a finite number', () => {
    expect(numberEditor.commitValue({ buf: '19' }, f)).toBe(19)
  })

  it('rendering invalid buf surfaces red text path', () => {
    const el = numberEditor.render({
      state: { buf: 'abc' },
      value: null,
      field: f,
      ctx: { width: 10, focus: 'active' },
    })
    const { lastFrame } = render(el)
    expect(lastFrame()).toContain('abc')
  })
})

describe('checkboxEditor', () => {
  const f = field('checkbox')

  it('is an instant editor', () => {
    expect(checkboxEditor.capability.instant).toBe(true)
  })

  it('instantValue flips current value', () => {
    expect(checkboxEditor.instantValue?.(false, f)).toBe(true)
    expect(checkboxEditor.instantValue?.(true, f)).toBe(false)
    expect(checkboxEditor.instantValue?.(null, f)).toBe(true)
  })

  it('renders ☑ for true / ☐ for false', () => {
    const on = render(
      checkboxEditor.render({
        state: null,
        value: true,
        field: f,
        ctx: { width: 5, focus: 'passive' },
      }),
    )
    const off = render(
      checkboxEditor.render({
        state: null,
        value: false,
        field: f,
        ctx: { width: 5, focus: 'none' },
      }),
    )
    expect(on.lastFrame()).toContain('☑')
    expect(off.lastFrame()).toContain('☐')
  })
})

describe('dateEditor', () => {
  const f = field('date')

  it('beginEdit seeds calFocus from the buffer when parseable', () => {
    const s = dateEditor.beginEdit('2026-06-11', f) as { buf: string; calFocus: Date }
    expect(s.buf).toBe('2026-06-11')
    expect(s.calFocus.getFullYear()).toBe(2026)
    expect(s.calFocus.getMonth()).toBe(5)
  })

  it('right arrow advances buffer + focus by one day', () => {
    const s0 = dateEditor.beginEdit('2026-06-11', f)
    const r = dateEditor.reduce(s0, '', key({ rightArrow: true }), f) as {
      next: { buf: string }
    }
    expect(r.next.buf).toBe('2026-06-12')
  })

  it('typing a complete ISO date snaps calFocus', () => {
    let s = dateEditor.beginEdit('', f) as { buf: string; calFocus: Date }
    for (const ch of '2027-03-15') {
      s = dateEditor.reduce(s, ch, key(), f).next as typeof s
    }
    expect(s.buf).toBe('2027-03-15')
    expect(s.calFocus.getFullYear()).toBe(2027)
    expect(s.calFocus.getMonth()).toBe(2)
  })

  it('validate flags definitely-invalid garbage', () => {
    expect(dateEditor.validate({ buf: 'not-a-date', calFocus: new Date() }, f)?.kind).toBe('error')
  })

  it('validate tolerates in-progress prefixes', () => {
    expect(dateEditor.validate({ buf: '2026', calFocus: new Date() }, f)).toBeNull()
    expect(dateEditor.validate({ buf: '2026-0', calFocus: new Date() }, f)).toBeNull()
  })

  it('commitValue returns the validated ISO string', () => {
    expect(dateEditor.commitValue({ buf: '2026-06-11', calFocus: new Date(2020, 0, 1) }, f)).toBe(
      '2026-06-11',
    )
  })

  it('renders the stored date when not editing', () => {
    const { lastFrame } = render(
      dateEditor.render({
        state: null,
        value: '2026-06-11',
        field: f,
        ctx: { width: 12, focus: 'passive' },
      }),
    )
    expect(lastFrame()).toContain('2026-06-11')
  })

  it('renders the YYYY-MM-DD placeholder while editing an empty buf', () => {
    const s = dateEditor.beginEdit('', f)
    const { lastFrame } = render(
      dateEditor.render({
        state: s,
        value: null,
        field: f,
        ctx: { width: 12, focus: 'active' },
      }),
    )
    expect(lastFrame()).toContain('YYYY-MM-DD')
  })

  it('exposes a calendar overlay spec', () => {
    const s = dateEditor.beginEdit('2026-06-11', f)
    const spec = dateEditor.overlay!(s, '2026-06-11', f)
    expect(spec.width).toBeGreaterThan(0)
    expect(spec.height).toBeGreaterThan(0)
    const { lastFrame } = render(spec.render())
    expect(lastFrame()).toContain('2026-06')
  })
})

describe('selectEditor', () => {
  const opts = [
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Beta' },
  ]
  const f = field('select', { options: opts })

  it('beginEdit seeds cursor to current value', () => {
    const s = selectEditor.beginEdit('b', f) as { cursor: number }
    expect(s.cursor).toBe(1)
  })

  it('j/down moves cursor; k/up backs up; Enter commits', () => {
    let s = selectEditor.beginEdit('a', f) as { cursor: number; options: typeof opts }
    s = selectEditor.reduce(s, 'j', key(), f).next as typeof s
    expect(s.cursor).toBe(1)
    s = selectEditor.reduce(s, 'k', key(), f).next as typeof s
    expect(s.cursor).toBe(0)
    const r = selectEditor.reduce(s, '', key({ return: true }), f)
    expect(r.intent).toBe('commit')
  })

  it('commitValue returns the cursor option id', () => {
    const s = { options: opts, cursor: 1 }
    expect(selectEditor.commitValue(s, f)).toBe('b')
  })

  it('renders the chevron ▼ in the cell', () => {
    const { lastFrame } = render(
      selectEditor.render({
        state: null,
        value: 'a',
        field: f,
        ctx: { width: 12, focus: 'passive' },
      }),
    )
    expect(lastFrame()).toContain('▼')
    expect(lastFrame()).toContain('Alpha')
  })

  it('paints empty cell when no option matches', () => {
    const { lastFrame } = render(
      selectEditor.render({
        state: null,
        value: null,
        field: f,
        ctx: { width: 12, focus: 'none' },
      }),
    )
    // Chevron is still present (signals "this is a select column").
    expect(lastFrame()).toContain('▼')
    // But no option label.
    expect(lastFrame()).not.toContain('Alpha')
    expect(lastFrame()).not.toContain('Beta')
  })

  it('overlay spec lists all options', () => {
    const s = selectEditor.beginEdit('a', f)
    const spec = selectEditor.overlay!(s, 'a', f)
    const { lastFrame } = render(spec.render())
    expect(lastFrame()).toContain('Alpha')
    expect(lastFrame()).toContain('Beta')
  })
})
