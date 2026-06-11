/**
 * Field-type icons — a TUI-local visual decision (not a Core concern).
 *
 * Every icon is guaranteed to render in a fixed-width "slot" so the table
 * layout can pre-budget `ICON_SLOT + 1 + name.length` characters per
 * column header without depending on the terminal's wcwidth behaviour.
 *
 * Two icon sets:
 *
 *   - `emoji`  📝 🔢 🏷 ✅ 📅 — DEFAULT. The WOW visual we want every
 *              new user to see; works on iTerm2, WezTerm, kitty,
 *              Ghostty, Apple Terminal, Windows Terminal, VS Code,
 *              and most modern terminals.
 *   - `ascii`  T  №  ◉  ☑  ▦ — used only when we positively know the
 *              environment will misrender emoji (WSL default console,
 *              tmux, Linux VT). Picked because a misaligned table is
 *              more jarring than a plain icon.
 *
 * Override with the `LATTIX_ICONS=emoji|ascii` env var.
 */
import stringWidth from 'string-width'
import type { FieldType } from '@lattix/protocol'

export type IconSet = 'emoji' | 'ascii'
export const ICON_SLOT = 2

const EMOJI: Record<FieldType, string> = {
  text: '📝',
  number: '🔢',
  // Bookmark, not tag — 🏷 (U+1F3F7) measures width 1 under string-width
  // but renders as 2 columns on most modern terminals, which would push
  // every column to its right one cell over. 🔖 is unambiguous: both
  // string-width and the terminal agree on width 2.
  select: '🔖',
  checkbox: '✅',
  date: '📅',
}

const ASCII: Record<FieldType, string> = {
  text: 'T',
  number: '№',
  select: '◉',
  checkbox: '☑',
  date: '▦',
}

/**
 * Pick a default icon set based on the runtime environment.
 *
 * Default is emoji — that's the WOW visual we want every new user to see.
 * The only thing we want to detect is "is this terminal known to butcher
 * emoji rendering or wcwidth", and even then a known-good outer terminal
 * (WezTerm, iTerm, Windows Terminal…) overrides the bail-out, because
 * what actually paints glyphs is the outer terminal — not the shell or
 * the WSL distro running inside it.
 */
export function detectIconSet(env: NodeJS.ProcessEnv = process.env): IconSet {
  const forced = env.LATTIX_ICONS?.toLowerCase()
  if (forced === 'emoji' || forced === 'ascii') return forced

  // Outer-terminal allow-list. If any of these signals match, the host
  // can render emoji at the correct width — beats every fallback below.
  const tp = env.TERM_PROGRAM ?? ''
  const knownGood =
    tp === 'iTerm.app' ||
    tp === 'WezTerm' ||
    tp === 'ghostty' ||
    tp === 'Apple_Terminal' ||
    tp === 'vscode' ||
    Boolean(env.WT_SESSION) /* Windows Terminal */ ||
    Boolean(env.KITTY_WINDOW_ID) /* kitty */ ||
    Boolean(env.ALACRITTY_WINDOW_ID) /* Alacritty 0.13+ */
  if (knownGood) return 'emoji'

  // Below here we have no positive signal — only then do the bail-outs
  // for environments known to misrender emoji or break alignment.
  if (env.TMUX) return 'ascii' // older tmux gets wcwidth wrong
  if (env.TERM === 'linux') return 'ascii' // Linux VT, no emoji font
  // WSL with no detected outer terminal: probably the bare cmd.exe
  // console or some other host that won't render emoji cleanly.
  if (env.WSL_DISTRO_NAME || env.WSL_INTEROP) return 'ascii'

  // Plain unknown modern terminal — lead with the WOW.
  return 'emoji'
}

/**
 * Returns the icon for `type`, padded with trailing spaces to occupy
 * exactly ICON_SLOT terminal columns according to `string-width` (the
 * same library ink uses internally). Callers can treat the result as a
 * fixed-width prefix; emit it alongside the field name with a single
 * space separator.
 */
export function fieldIcon(type: FieldType, set: IconSet = detectIconSet()): string {
  const raw = (set === 'emoji' ? EMOJI : ASCII)[type]
  const w = stringWidth(raw)
  if (w === ICON_SLOT) return raw
  if (w < ICON_SLOT) return raw + ' '.repeat(ICON_SLOT - w)
  // Wider than the slot: should not happen for the 5 built-ins on a
  // sane terminal. Replace with two dots rather than misaligning the
  // entire table.
  return '··'
}
