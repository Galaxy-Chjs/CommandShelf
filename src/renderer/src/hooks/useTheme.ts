import { useEffect, useState } from 'react'

import type { ThemeMode } from '@shared/types'

/**
 * Applies the theme to `<html data-theme>`.
 *
 * The stylesheet keys every colour off that attribute, so switching themes is
 * one DOM write rather than a re-render of the tree. `system` follows the OS
 * and keeps following it while the app is open.
 */
export function useTheme(mode: ThemeMode): 'dark' | 'light' {
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true,
  )

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [])

  const resolved = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    document.documentElement.style.colorScheme = resolved
  }, [resolved])

  return resolved
}
