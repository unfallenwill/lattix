import { useInput } from 'ink'

export type InputMode = 'navigation' | 'editing' | 'dialog'

export interface DispatcherOptions {
  mode: InputMode
  onNavigation: (input: string, key: DispatcherKey) => void
  onEditing?: (input: string, key: DispatcherKey) => void
  onDialog?: (input: string, key: DispatcherKey) => void
}

export interface DispatcherKey {
  escape: boolean
  return: boolean
  tab: boolean
  shift: boolean
  ctrl: boolean
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  backspace: boolean
  delete: boolean
}

// Routes raw stdin input to mode-specific handlers. The Ink `useInput`
// hook only fires in the active mode, so this returns nothing on its own.
export function useInputDispatcher(opts: DispatcherOptions): void {
  useInput((input, key) => {
    const k: DispatcherKey = {
      escape: key.escape,
      return: key.return,
      tab: key.tab,
      shift: key.shift,
      ctrl: key.ctrl,
      upArrow: key.upArrow,
      downArrow: key.downArrow,
      leftArrow: key.leftArrow,
      rightArrow: key.rightArrow,
      backspace: key.backspace,
      // Most terminals send DEL (0x7f) on the Backspace key; Ink classifies
      // that as `delete`. Surface it here so callers can treat both as the
      // same "erase one char to the left" intent.
      delete: (key as { delete?: boolean }).delete ?? false,
    }
    switch (opts.mode) {
      case 'navigation':
        opts.onNavigation(input, k)
        return
      case 'editing':
        opts.onEditing?.(input, k)
        return
      case 'dialog':
        opts.onDialog?.(input, k)
        return
    }
  })
}
