import { readFileSync, writeFileSync } from 'node:fs'

import { app, clipboard, dialog, shell } from 'electron'

import { CHANNELS } from '@shared/ipc'
import type { AppInfo, Settings, TransferSummary } from '@shared/types'

import { getContext, persistSettings } from './context'
import { transact } from './db/connection'
import { SCHEMA_VERSION } from './db/migrations'
import { rebuildFts } from './repo/fts'
import { isEmpty, seedDemoData } from './repo/seed'
import { applyImport, buildExport } from './repo/transfer'
import { registerHotkey } from './shortcuts'
import { refreshTrayMenu } from './tray'
import {
  broadcast,
  focusMainSearch,
  hidePanel,
  resizePanel,
  showMainWindow,
  showPanel,
  togglePanel,
} from './windows'

/**
 * The operations that need more than one module: settings changes with side
 * effects, file dialogs, clipboard, and lifecycle wiring.
 *
 * `index.ts` and `ipc.ts` talk to this layer only, which is what keeps the
 * window/tray/shortcut modules free of circular imports.
 */

let onQuitRequested: (() => void) | null = null

export function setQuitHandler(handler: () => void): void {
  onQuitRequested = handler
}

export function requestQuit(): void {
  getContext().quitting = true
  if (onQuitRequested) onQuitRequested()
  else app.quit()
}

/** Tells both renderers that stored data changed, so open views refresh. */
export function notifyDataChanged(): void {
  broadcast(CHANNELS.eventDataChanged)
}

/* -------------------------------------------------------------------------- */
/* Hotkey                                                                     */
/* -------------------------------------------------------------------------- */

function installHotkey(accelerator: string): void {
  const result = registerHotkey(accelerator, () => togglePanel())
  refreshTrayMenu()
  if (!result.ok) {
    // Surfaced rather than thrown: the app must still start, and Settings shows
    // exactly which combination could not be claimed and why.
    process.stderr.write(`[commandshelf] ${result.message}\n`)
  }
}

/**
 * Applies a settings patch, including its side effects.
 *
 * The hotkey is the one field that can be rejected by the operating system, so
 * it is applied first and a failure rolls the stored value back — a saved
 * hotkey that does not work would be worse than no hotkey at all.
 */
export function applySettings(patch: Partial<Settings>): Settings {
  const ctx = getContext()
  const previousHotkey = ctx.settings.hotkey
  const wantsHotkey = typeof patch.hotkey === 'string' && patch.hotkey !== previousHotkey

  if (wantsHotkey) {
    // `registerHotkey` clears the old binding before trying the new one, so a
    // rejected accelerator would otherwise leave the app with no hotkey at all.
    const result = registerHotkey(patch.hotkey as string, () => togglePanel())
    if (!result.ok) {
      registerHotkey(previousHotkey, () => togglePanel())
      refreshTrayMenu()
      throw new Error(result.message)
    }
    refreshTrayMenu()
  }

  const next = persistSettings(patch)

  if (patch.panelWidth !== undefined) resizePanel()
  if (patch.launchAtLogin !== undefined) applyLaunchAtLogin(next.launchAtLogin)
  if (wantsHotkey) refreshTrayMenu()

  // The quick panel is a separate renderer with its own copy of the settings;
  // without this a theme or width change would not reach it until restart.
  notifyDataChanged()

  return next
}

function applyLaunchAtLogin(enabled: boolean): void {
  // Never register the development binary as a login item.
  if (!app.isPackaged) return
  if (process.platform !== 'win32' && process.platform !== 'darwin') return
  app.setLoginItemSettings({ openAtLogin: enabled })
}

/* -------------------------------------------------------------------------- */
/* Data transfer                                                              */
/* -------------------------------------------------------------------------- */

function stamp(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}`
}

export async function exportToFile(): Promise<{ path: string | null; items: number }> {
  const ctx = getContext()
  const payload = buildExport(ctx.db)

  const result = await dialog.showSaveDialog({
    title: '导出 CommandShelf 数据',
    defaultPath: `commandshelf-${stamp()}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (result.canceled || !result.filePath) return { path: null, items: 0 }

  writeFileSync(result.filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return { path: result.filePath, items: payload.items.length }
}

export async function importFromFile(): Promise<TransferSummary | null> {
  const ctx = getContext()
  const result = await dialog.showOpenDialog({
    title: '导入 CommandShelf 数据',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const raw: unknown = JSON.parse(readFileSync(result.filePaths[0] as string, 'utf8'))
  const summary = applyImport(ctx.db, raw, { skipDuplicates: true })
  notifyDataChanged()
  return summary
}

export function loadDemoData(): TransferSummary {
  const summary = seedDemoData(getContext().db)
  notifyDataChanged()
  return summary
}

export function hasNoData(): boolean {
  return isEmpty(getContext().db)
}

export function clearAllData(): { items: number } {
  const ctx = getContext()
  const before = ctx.db.prepare('SELECT COUNT(*) AS c FROM items').get() as { c: number }

  transact(ctx.db, () => {
    ctx.db.exec('DELETE FROM item_tags')
    ctx.db.exec('DELETE FROM items')
    ctx.db.exec('DELETE FROM tags')
    ctx.db.exec('DELETE FROM collections')
    ctx.db.exec('DELETE FROM items_fts')
  })
  rebuildFts(ctx.db)

  notifyDataChanged()
  return { items: Number(before.c) }
}

/* -------------------------------------------------------------------------- */
/* Shell, clipboard, info                                                     */
/* -------------------------------------------------------------------------- */

export function copyToClipboard(text: string): void {
  clipboard.writeText(text)
}

export function openExternal(url: string): void {
  if (!/^https?:\/\//i.test(url)) throw new Error('只能打开 http 或 https 链接')
  void shell.openExternal(url)
}

export function openPath(target: string): void {
  if (!target.trim()) throw new Error('路径不能为空')
  void shell.openPath(target)
}

export function revealDataDir(): void {
  void shell.openPath(getContext().dataDir)
}

export function appInfo(): AppInfo {
  const ctx = getContext()
  return {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    dataDir: ctx.dataDir,
    databasePath: ctx.databasePath,
    schemaVersion: SCHEMA_VERSION,
    hotkeyRegistered: ctx.hotkeyRegistered,
  }
}

/* -------------------------------------------------------------------------- */
/* Lifecycle wiring                                                           */
/* -------------------------------------------------------------------------- */

/** Registers the hotkey from settings and keeps the tray menu in step. */
export function startHotkey(): void {
  installHotkey(getContext().settings.hotkey)
}

export { focusMainSearch, hidePanel, showPanel, showMainWindow, togglePanel }
