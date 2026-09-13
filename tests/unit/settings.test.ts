import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'

import { DEFAULT_HOTKEY, DEFAULT_SETTINGS } from '@shared/types'

import { readSettings, writeSettings } from '../../src/main/repo/settings'
import { createTestDatabase } from './helpers'

let db: DatabaseSync

beforeEach(() => {
  db = createTestDatabase()
})

afterEach(() => {
  db.close()
})

describe('readSettings', () => {
  it('returns the defaults on a fresh database', () => {
    expect(readSettings(db)).toEqual(DEFAULT_SETTINGS)
  })
})

describe('writeSettings', () => {
  it('persists a patch and returns the merged result', () => {
    const settings = writeSettings(db, { theme: 'light' })
    expect(settings.theme).toBe('light')
    expect(settings.hotkey).toBe(DEFAULT_HOTKEY)
    expect(readSettings(db).theme).toBe('light')
  })

  it('ignores unknown keys', () => {
    writeSettings(db, { bogus: 'x' } as never)
    expect(Object.keys(readSettings(db)).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort())
  })

  it('falls back to the default for an invalid theme', () => {
    expect(writeSettings(db, { theme: 'neon' as never }).theme).toBe(DEFAULT_SETTINGS.theme)
  })

  it('falls back to the default for a blank hotkey', () => {
    expect(writeSettings(db, { hotkey: '   ' }).hotkey).toBe(DEFAULT_HOTKEY)
  })

  it('clamps the panel width', () => {
    expect(writeSettings(db, { panelWidth: 100 }).panelWidth).toBe(520)
    expect(writeSettings(db, { panelWidth: 99_999 }).panelWidth).toBe(1200)
  })

  it('clamps the panel result count', () => {
    expect(writeSettings(db, { panelMaxResults: 1 }).panelMaxResults).toBe(3)
    expect(writeSettings(db, { panelMaxResults: 500 }).panelMaxResults).toBe(20)
  })

  it('coerces a non-boolean flag to its default', () => {
    expect(writeSettings(db, { hideAfterCopy: 'yes' as never }).hideAfterCopy).toBe(
      DEFAULT_SETTINGS.hideAfterCopy,
    )
  })

  it('survives a corrupt stored value', () => {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('theme', 'not json')
    expect(readSettings(db).theme).toBe(DEFAULT_SETTINGS.theme)
  })
})
