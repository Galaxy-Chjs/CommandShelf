import { globalShortcut } from 'electron'

import { getContext } from './context'

/**
 * The global hotkey.
 *
 * Exactly one application can own an accelerator, and on Windows plenty of
 * them already claim the obvious ones — so a failure here is an expected,
 * reportable state rather than an exception. The Settings screen surfaces it
 * and lets the user pick another.
 */

export type HotkeyResult =
  { ok: true } | { ok: false; reason: 'taken' | 'invalid'; message: string }

export function registerHotkey(accelerator: string, handler: () => void): HotkeyResult {
  const ctx = getContext()
  globalShortcut.unregisterAll()

  const trimmed = accelerator.trim()
  if (!trimmed) {
    ctx.hotkeyRegistered = false
    return { ok: false, reason: 'invalid', message: '快捷键不能为空' }
  }

  try {
    const registered = globalShortcut.register(trimmed, handler)
    ctx.hotkeyRegistered = registered
    if (registered) return { ok: true }
    return {
      ok: false,
      reason: 'taken',
      message: `快捷键 ${trimmed} 已被其他程序占用，请换一个组合`,
    }
  } catch (error) {
    ctx.hotkeyRegistered = false
    return {
      ok: false,
      reason: 'invalid',
      message: `快捷键 ${trimmed} 无法注册：${
        error instanceof Error ? error.message : String(error)
      }`,
    }
  }
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
  getContext().hotkeyRegistered = false
}
