import type { DatabaseSync } from 'node:sqlite'

import { DEFAULT_SETTINGS, type Settings, type ThemeMode } from '@shared/types'

import { transact } from '../db/connection'
import { DEFAULT_HOTKEY } from '@shared/types'

/**
 * Settings are stored as one JSON-encoded value per key.
 *
 * Reads are defensive: a hand-edited or downgraded database must not crash the
 * app, so anything unreadable falls back to the default for that key.
 */

const THEMES: readonly ThemeMode[] = ['dark', 'light', 'system']

function coerce(key: keyof Settings, value: unknown): unknown {
  switch (key) {
    case 'theme':
      return THEMES.includes(value as ThemeMode) ? value : DEFAULT_SETTINGS.theme
    case 'hotkey':
      return typeof value === 'string' && value.trim() ? value : DEFAULT_HOTKEY
    case 'launchAtLogin':
    case 'hideAfterCopy':
    case 'onboardingDone':
      return typeof value === 'boolean' ? value : DEFAULT_SETTINGS[key]
    case 'panelWidth': {
      const width = Number(value)
      return Number.isFinite(width)
        ? Math.min(1200, Math.max(520, Math.trunc(width)))
        : DEFAULT_SETTINGS.panelWidth
    }
    case 'panelMaxResults': {
      const count = Number(value)
      return Number.isFinite(count)
        ? Math.min(20, Math.max(3, Math.trunc(count)))
        : DEFAULT_SETTINGS.panelMaxResults
    }
    default:
      return value
  }
}

export function readSettings(db: DatabaseSync): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string
    value: string
  }[]

  const stored: Record<string, unknown> = {}
  for (const row of rows) {
    try {
      stored[row.key] = JSON.parse(row.value)
    } catch {
      // Ignore a corrupt row; the default below covers it.
    }
  }

  const settings = { ...DEFAULT_SETTINGS }
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (key in stored) {
      settings[key] = coerce(key, stored[key]) as never
    }
  }
  return settings
}

export function writeSettings(db: DatabaseSync, patch: Partial<Settings>): Settings {
  return transact(db, () => {
    const upsert = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in DEFAULT_SETTINGS)) continue
      upsert.run(key, JSON.stringify(coerce(key as keyof Settings, value)))
    }
    return readSettings(db)
  })
}
