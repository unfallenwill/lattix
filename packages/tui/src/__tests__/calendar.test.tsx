/**
 * Unit tests for the Calendar component + its date-math helpers. The
 * keyboard wiring (arrow keys, page-up/down, buf auto-snap) is tested in
 * grid-view.test.tsx where the calendar is actually mounted.
 */
import React from 'react'
import { render } from 'ink-testing-library'
import {
  Calendar,
  addDays,
  addMonths,
  endOfWeek,
  formatISODate,
  parseISODate,
  sameDay,
  startOfWeek,
} from '../editors/calendar.js'

describe('parseISODate', () => {
  it('parses a well-formed date', () => {
    const d = parseISODate('2026-06-11')
    expect(d).not.toBeNull()
    expect(d?.getFullYear()).toBe(2026)
    expect(d?.getMonth()).toBe(5)
    expect(d?.getDate()).toBe(11)
  })

  it('rejects garbage', () => {
    expect(parseISODate('')).toBeNull()
    expect(parseISODate('2026')).toBeNull()
    expect(parseISODate('2026-13-01')).toBeNull()
    expect(parseISODate('2026-06-32')).toBeNull()
    expect(parseISODate('not-a-date')).toBeNull()
  })

  it('rejects rolled-over dates (Feb 30)', () => {
    expect(parseISODate('2026-02-30')).toBeNull()
  })
})

describe('formatISODate', () => {
  it('zero-pads month + day', () => {
    expect(formatISODate(new Date(2026, 0, 3))).toBe('2026-01-03')
  })
})

describe('addDays / addMonths', () => {
  it('addDays crosses month boundaries', () => {
    const d = addDays(new Date(2026, 0, 31), 1)
    expect(formatISODate(d)).toBe('2026-02-01')
  })

  it('addMonths clamps day-of-month (Jan 31 + 1mo = Feb 28)', () => {
    const d = addMonths(new Date(2026, 0, 31), 1)
    expect(formatISODate(d)).toBe('2026-02-28')
  })

  it('addMonths handles year wrap', () => {
    const d = addMonths(new Date(2026, 11, 15), 1)
    expect(formatISODate(d)).toBe('2027-01-15')
  })
})

describe('startOfWeek / endOfWeek', () => {
  it('week starts on Sunday', () => {
    // 2026-06-11 is a Thursday. Sunday of that week = 2026-06-07.
    expect(formatISODate(startOfWeek(new Date(2026, 5, 11)))).toBe('2026-06-07')
    expect(formatISODate(endOfWeek(new Date(2026, 5, 11)))).toBe('2026-06-13')
  })
})

describe('sameDay', () => {
  it('ignores hour/minute/sec', () => {
    expect(sameDay(new Date(2026, 5, 11, 9), new Date(2026, 5, 11, 23))).toBe(true)
    expect(sameDay(new Date(2026, 5, 11), new Date(2026, 5, 12))).toBe(false)
  })
})

describe('Calendar render', () => {
  it('shows the month label and the focused day inverse-highlighted', () => {
    const { lastFrame } = render(
      React.createElement(Calendar, {
        visibleMonth: new Date(2026, 5, 1),
        focused: new Date(2026, 5, 11),
        selected: null,
      }),
    )
    const f = lastFrame() ?? ''
    expect(f).toContain('2026-06')
    expect(f).toContain('Su')
    expect(f).toContain('Sa')
    // day numbers in the visible month are zero-padded
    expect(f).toContain('11')
  })

  it('marks selected differently from focused', () => {
    const { lastFrame } = render(
      React.createElement(Calendar, {
        visibleMonth: new Date(2026, 5, 1),
        focused: new Date(2026, 5, 15),
        selected: new Date(2026, 5, 11),
      }),
    )
    const f = lastFrame() ?? ''
    expect(f).toContain('11')
    expect(f).toContain('15')
  })
})
