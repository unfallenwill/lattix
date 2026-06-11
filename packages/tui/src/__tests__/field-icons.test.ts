/**
 * Field-icon registry tests. Three contracts to lock down:
 *
 *  1. Every returned icon measures exactly ICON_SLOT (=2) terminal columns
 *     under `string-width`. This is what keeps the column header layout
 *     stable across terminals — emoji or ASCII fallback, doesn't matter.
 *  2. The RAW emoji glyph (without our padding) is itself already 2 cols
 *     wide. If the raw is 1 and we pad with a space, string-width is
 *     happy but some terminals render the raw as 2 anyway → table gets
 *     shifted right by 1 cell per icon. Glyph picks that fail this test
 *     must be replaced, not padded around. (Regression: 🏷 U+1F3F7.)
 *  3. The environment detector picks the right set for the terminals
 *     we've decided to opt into / out of.
 */
import stringWidth from 'string-width'
import { ICON_SLOT, detectIconSet, fieldIcon } from '../visual/field-icons.js'
import type { FieldType } from '@lattix/protocol'

const TYPES: FieldType[] = ['text', 'number', 'select', 'checkbox', 'date']

describe('fieldIcon', () => {
  it('emoji set: every icon is exactly ICON_SLOT columns wide', () => {
    for (const t of TYPES) {
      const icon = fieldIcon(t, 'emoji')
      expect(stringWidth(icon)).toBe(ICON_SLOT)
    }
  })

  it('emoji set: every RAW glyph is already 2 cols (no width-1 emoji)', () => {
    // The padding fallback in fieldIcon() is a defence-in-depth measure,
    // not a license to pick width-1 emoji. Width-1 emoji that render as
    // 2 on real terminals are the worst case: string-width thinks 1+pad,
    // terminal paints 2+pad → 3 columns → table shifts.
    for (const t of TYPES) {
      const raw = fieldIcon(t, 'emoji').replace(/ +$/, '')
      expect(stringWidth(raw)).toBe(2)
    }
  })

  it('ascii set: every icon is exactly ICON_SLOT columns wide', () => {
    for (const t of TYPES) {
      const icon = fieldIcon(t, 'ascii')
      expect(stringWidth(icon)).toBe(ICON_SLOT)
    }
  })

  it('icons differ between sets so users can recognise their environment', () => {
    for (const t of TYPES) {
      expect(fieldIcon(t, 'emoji')).not.toBe(fieldIcon(t, 'ascii'))
    }
  })
})

describe('detectIconSet', () => {
  it('respects LATTIX_ICONS=emoji', () => {
    expect(detectIconSet({ LATTIX_ICONS: 'emoji' })).toBe('emoji')
  })

  it('respects LATTIX_ICONS=ascii', () => {
    expect(detectIconSet({ LATTIX_ICONS: 'ascii' })).toBe('ascii')
  })

  it('falls back to ASCII inside bare WSL with no known terminal host', () => {
    expect(detectIconSet({ WSL_DISTRO_NAME: 'Ubuntu' })).toBe('ascii')
    expect(detectIconSet({ WSL_INTEROP: '/run/x' })).toBe('ascii')
  })

  it('uses emoji when WSL runs inside a known-good terminal', () => {
    // Regression: real-world setup is WSL + WezTerm / WSL + Windows
    // Terminal. The outer terminal renders glyphs — the WSL distro is
    // irrelevant. Older code blanket-bailed on any WSL signal.
    expect(detectIconSet({ WSL_DISTRO_NAME: 'Ubuntu', TERM_PROGRAM: 'WezTerm' })).toBe('emoji')
    expect(detectIconSet({ WSL_DISTRO_NAME: 'Ubuntu', WT_SESSION: 'a-b' })).toBe('emoji')
    expect(detectIconSet({ WSL_DISTRO_NAME: 'Ubuntu', TERM_PROGRAM: 'vscode' })).toBe('emoji')
  })

  it('falls back to ASCII inside tmux (wcwidth on old builds drifts)', () => {
    expect(detectIconSet({ TMUX: '/tmp/tmux-1000/default' })).toBe('ascii')
  })

  it('falls back to ASCII on Linux virtual consoles (TERM=linux, no emoji font)', () => {
    expect(detectIconSet({ TERM: 'linux' })).toBe('ascii')
  })

  it('defaults to emoji on a plain modern terminal', () => {
    expect(detectIconSet({})).toBe('emoji')
    expect(detectIconSet({ TERM: 'xterm-256color' })).toBe('emoji')
    expect(detectIconSet({ TERM_PROGRAM: 'iTerm.app' })).toBe('emoji')
    expect(detectIconSet({ TERM_PROGRAM: 'WezTerm' })).toBe('emoji')
    expect(detectIconSet({ TERM_PROGRAM: 'ghostty' })).toBe('emoji')
  })

  it('forced override beats environment-based fallback', () => {
    expect(detectIconSet({ WSL_DISTRO_NAME: 'Ubuntu', LATTIX_ICONS: 'emoji' })).toBe('emoji')
    expect(detectIconSet({ TERM_PROGRAM: 'iTerm.app', LATTIX_ICONS: 'ascii' })).toBe('ascii')
  })
})
