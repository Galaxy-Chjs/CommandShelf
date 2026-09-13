import { describe, expect, it } from 'vitest'

import { describeAccelerator, formatAccelerator, parseAcceleratorEvent } from './accelerator'

/** Only the properties the parser reads are needed. */
function keyEvent(init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return {
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...init,
  } as KeyboardEvent
}

describe('parseAcceleratorEvent', () => {
  it('ignores a bare modifier press', () => {
    expect(parseAcceleratorEvent(keyEvent({ key: 'Control', ctrlKey: true }))).toBeNull()
    expect(parseAcceleratorEvent(keyEvent({ key: 'Shift', shiftKey: true }))).toBeNull()
  })

  it('rejects a key pressed without any modifier', () => {
    // Registering `A` alone would swallow that key system-wide.
    expect(parseAcceleratorEvent(keyEvent({ key: 'a' }))).toBeNull()
    expect(parseAcceleratorEvent(keyEvent({ key: 'F5' }))).toBeNull()
  })

  it('accepts a modifier combination', () => {
    expect(parseAcceleratorEvent(keyEvent({ key: ' ', ctrlKey: true, shiftKey: true }))).toEqual({
      control: true,
      shift: true,
      alt: false,
      meta: false,
      key: 'Space',
    })
  })

  it('names the special keys Electron expects', () => {
    const cases: [string, string][] = [
      [' ', 'Space'],
      ['ArrowUp', 'Up'],
      ['ArrowDown', 'Down'],
      ['ArrowLeft', 'Left'],
      ['ArrowRight', 'Right'],
      ['Escape', 'Esc'],
      ['Enter', 'Enter'],
      ['Tab', 'Tab'],
    ]
    for (const [input, expected] of cases) {
      expect(parseAcceleratorEvent(keyEvent({ key: input, ctrlKey: true }))?.key).toBe(expected)
    }
  })

  it('upper-cases a single character', () => {
    expect(parseAcceleratorEvent(keyEvent({ key: 'k', ctrlKey: true }))?.key).toBe('K')
  })

  it('records the meta key separately from control', () => {
    const parts = parseAcceleratorEvent(keyEvent({ key: 'p', metaKey: true }))
    expect(parts?.meta).toBe(true)
    expect(parts?.control).toBe(false)
  })
})

describe('formatAccelerator', () => {
  it('uses CommandOrControl so the same binding works on every platform', () => {
    expect(
      formatAccelerator({ control: true, shift: true, alt: false, meta: false, key: 'Space' }),
    ).toBe('CommandOrControl+Shift+Space')
  })

  it('maps meta to CommandOrControl as well', () => {
    expect(
      formatAccelerator({ control: false, shift: false, alt: false, meta: true, key: 'K' }),
    ).toBe('CommandOrControl+K')
  })

  it('orders modifiers as CommandOrControl, Shift, Alt', () => {
    expect(
      formatAccelerator({ control: true, shift: true, alt: true, meta: false, key: 'J' }),
    ).toBe('CommandOrControl+Shift+Alt+J')
  })
})

describe('describeAccelerator', () => {
  it('renders a friendly label for display', () => {
    expect(describeAccelerator('CommandOrControl+Shift+Space')).toBe('Ctrl+Shift+Space')
    expect(describeAccelerator('CommandOrControl+K')).toBe('Ctrl+K')
    expect(describeAccelerator('Alt+F4')).toBe('Alt+F4')
  })
})

describe('round trip', () => {
  it('parses a real key event into the default accelerator', () => {
    const parts = parseAcceleratorEvent(keyEvent({ key: ' ', ctrlKey: true, shiftKey: true }))
    expect(parts && formatAccelerator(parts)).toBe('CommandOrControl+Shift+Space')
  })
})
