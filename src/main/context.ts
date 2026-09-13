import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

import { app, nativeTheme, type BrowserWindow } from 'electron'

import { DEFAULT_SETTINGS, type Settings } from '@shared/types'

import { openDatabase } from './db/connection'
import { ensureFtsConsistent } from './repo/fts'
import { readSettings, writeSettings } from './repo/settings'

/**
 * The mutable process-wide state, plus the few operations that only need the
 * database. Nothing here imports the window/tray/shortcut modules, which keeps
 * the dependency graph acyclic: those modules import this one, and
 * `controller.ts` imports all of them.
 */
export interface Context {
  db: DatabaseSync
  dataDir: string
  databasePath: string
  settings: Settings
  mainWindow: BrowserWindow | null
  panelWindow: BrowserWindow | null
  /** False when another application already owns the configured hotkey. */
  hotkeyRegistered: boolean
  quitting: boolean
}

let context: Context | null = null

export function initContext(): Context {
  const dataDir = app.getPath('userData')
  const databasePath = join(dataDir, 'commandshelf.db')
  const db = openDatabase(databasePath)

  // A database copied from another machine, or a write killed mid-flight, can
  // leave the search index behind the table. Rebuilding is cheap and beats
  // silently returning incomplete results.
  ensureFtsConsistent(db)

  context = {
    db,
    dataDir,
    databasePath,
    settings: readSettings(db),
    mainWindow: null,
    panelWindow: null,
    hotkeyRegistered: false,
    quitting: false,
  }

  applyTheme(context.settings)
  return context
}

export function getContext(): Context {
  if (!context) throw new Error('应用尚未初始化')
  return context
}

/** Safe to call from quit handlers, where initialisation may never have run. */
export function markQuitting(): void {
  if (context) context.quitting = true
}

export function closeContext(): void {
  if (!context) return
  try {
    context.db.close()
  } catch {
    // Closing a database twice, or after a failed open, is not worth crashing over.
  }
  context = null
}

/** Reflects the theme setting in the native window chrome. */
export function applyTheme(settings: Settings): void {
  nativeTheme.themeSource = settings.theme
}

/** Writes a settings patch and updates the in-memory copy. */
export function persistSettings(patch: Partial<Settings>): Settings {
  const ctx = getContext()
  const written = writeSettings(ctx.db, patch)
  ctx.settings = written
  applyTheme(written)
  return written
}

export function currentSettings(): Settings {
  return getContext().settings
}

export { DEFAULT_SETTINGS }
