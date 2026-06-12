/**
 * CellEditor contract — borrowed from shadcn/ui's "components are styled
 * primitives + a protocol" mindset, but expressed in React-native terms
 * because ink has no DOM attributes to lean on.
 *
 * Rules:
 *   1. GridView never inspects `field.type`. It looks the editor up in the
 *      registry, then talks to it through this interface.
 *   2. State shape is opaque — each editor owns its own. GridView holds it
 *      as `unknown` and hands it back verbatim.
 *   3. Validation runs on every keystroke; failure surfaces in the status
 *      bar (cf. shadcn's `aria-invalid` ring), not as a sentinel value.
 *   4. Focus is a 3-level scalar, not a boolean — `passive` (cursor sits
 *      on the cell) and `active` (cell is being edited) paint differently.
 *   5. "Instant" editors (checkbox) commit on the trigger key without ever
 *      entering edit mode.
 *   6. Overlays (dropdown, calendar) are rendered through an `overlay()`
 *      hook that returns dimensions + a content function; GridView places
 *      them absolutely — same idea as shadcn's <Popover> but without portals.
 */
import type { Field } from '@lattix/shared'
import type { DispatcherKey } from '../hooks/use-input-dispatcher.js'

/**
 * Focus level for a single cell.
 *   - `none`    — not the row/column cursor.
 *   - `passive` — cursor stops on the cell but is not editing.
 *   - `active`  — the cell is being edited (state !== null).
 */
export type FocusLevel = 'none' | 'passive' | 'active'

/** Message shown in StatusBar's feedback slot while a cell is focused/edited. */
export interface Feedback {
  kind: 'hint' | 'error'
  text: string
}

/** What `reduce()` wants GridView to do after applying `next`. */
export type ReduceIntent = 'commit' | 'cancel' | 'commit-next'

export interface ReduceResult<S> {
  next: S
  intent?: ReduceIntent
}

export interface RenderCtx {
  /** Painted text budget (cell width minus padding + border). */
  width: number
  /** Focus level of this cell. */
  focus: FocusLevel
  /** Field will not accept input changes (e.g. computed field, no perm). */
  readonly?: boolean
}

export interface OverlaySpec {
  /** Outer width of the overlay (in terminal columns). */
  width: number
  /** Outer height — used by GridView to decide drop-down vs flip-up. */
  height: number
  /** Pure content; GridView wraps it in `<Box position="absolute">`. */
  render(): JSX.Element
}

export interface RenderProps<S> {
  /** Edit-session state, or null when the cell is being displayed. */
  state: S | null
  /** Stored value (from `record.data[field.id]`). */
  value: unknown
  field: Field
  ctx: RenderCtx
}

export interface CellEditor<S = unknown> {
  readonly capability: {
    /** Floating UI rendered by GridView when editing. */
    overlay: 'none' | 'dropdown' | 'calendar'
    /** If true, the trigger key (Enter) commits immediately — no edit mode. */
    instant: boolean
  }

  // -- session -------------------------------------------------------------

  /** Build the initial edit-state from the stored value. */
  beginEdit(value: unknown, field: Field): S

  /** For instant editors only — produce the value to write on trigger. */
  instantValue?(currentValue: unknown, field: Field): unknown

  /**
   * Process one keystroke. Pure: returns the next state and an optional
   * intent. `feedback` is computed separately via `validate()`.
   */
  reduce(state: S, input: string, key: DispatcherKey, field: Field): ReduceResult<S>

  /** Validate intermediate state. Returns null when the value is committable. */
  validate(state: S, field: Field): Feedback | null

  /** Final value written to the record on commit. May coerce types. */
  commitValue(state: S, field: Field): unknown

  /** What to show in StatusBar when the cell is focused but not yet edited. */
  hint(field: Field): string

  // -- rendering -----------------------------------------------------------

  /** In-cell painter — same component handles display and edit states. */
  render(props: RenderProps<S>): JSX.Element

  /** Floating overlay, when `capability.overlay !== 'none'` and editing. */
  overlay?(state: S, value: unknown, field: Field): OverlaySpec
}

/** Convenience type for the registry (state erased). */
export type AnyCellEditor = CellEditor<unknown>
