/**
 * Turns a keyboard event into an Electron accelerator string.
 *
 * Used by the hotkey recorder in Settings. Returns null while the user is only
 * holding modifiers, so the field shows progress instead of saving something
 * like "Control+Shift" that can never fire.
 */

const NAMED_KEYS: Record<string, string> = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Esc',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  '+': 'Plus',
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock'])

export interface AcceleratorParts {
  control: boolean
  shift: boolean
  alt: boolean
  meta: boolean
  key: string
}

export function parseAcceleratorEvent(event: KeyboardEvent): AcceleratorParts | null {
  if (MODIFIER_KEYS.has(event.key)) return null

  const key =
    NAMED_KEYS[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key)
  const parts: AcceleratorParts = {
    control: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
    meta: event.metaKey,
    key,
  }

  // A bare letter or digit would swallow that key system-wide, so a real
  // combination is required.
  if (!parts.control && !parts.shift && !parts.alt && !parts.meta) return null
  return parts
}

export function formatAccelerator(parts: AcceleratorParts): string {
  const tokens: string[] = []
  if (parts.control || parts.meta) tokens.push('CommandOrControl')
  if (parts.shift) tokens.push('Shift')
  if (parts.alt) tokens.push('Alt')
  tokens.push(parts.key)
  return tokens.join('+')
}

/** Renders an accelerator for display: `CommandOrControl+Shift+Space` → `Ctrl+Shift+Space`. */
export function describeAccelerator(accelerator: string): string {
  return accelerator
    .split('+')
    .map((token) => {
      switch (token) {
        case 'CommandOrControl':
        case 'CmdOrCtrl':
          return 'Ctrl'
        case 'Command':
        case 'Cmd':
          return '⌘'
        default:
          return token
      }
    })
    .join('+')
}
