import { join } from 'node:path'

import { BrowserWindow, screen, shell } from 'electron'

import { CHANNELS } from '@shared/ipc'

import { getContext } from './context'
import { rendererUrl } from './protocol'

/**
 * Window management: one management window and one Spotlight-style quick panel.
 *
 * The quick panel is a separate BrowserWindow with its own renderer entry, so
 * summoning it never has to wait for the main window's React tree.
 */

/** Transparent margin around the panel card, so its CSS shadow has room. */
const PANEL_PADDING = 16
const PANEL_CARD_HEIGHT = 452

const PANEL_BACKGROUND = '#00000000'
const APP_BACKGROUND = '#0d1117'

function devServerUrl(): string | null {
  return process.env.ELECTRON_RENDERER_URL ?? null
}

function preloadPath(): string {
  return join(__dirname, '../preload/index.js')
}

/** The renderer never loads remote content; every navigation leaves the app. */
function lockDownNavigation(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const current = window.webContents.getURL()
    if (url !== current) {
      event.preventDefault()
      if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url)
    }
  })
}

function loadRenderer(window: BrowserWindow, page: 'index' | 'panel'): void {
  const url = devServerUrl()
  if (url) {
    void window.loadURL(new URL(`${page}.html`, url.endsWith('/') ? url : `${url}/`).toString())
  } else {
    // See src/main/protocol.ts for why this is not `loadFile`.
    void window.loadURL(rendererUrl(page))
  }
}

/* -------------------------------------------------------------------------- */
/* Main window                                                                */
/* -------------------------------------------------------------------------- */

export function createMainWindow(): BrowserWindow {
  const ctx = getContext()

  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 940,
    minHeight: 600,
    show: false,
    title: 'CommandShelf',
    backgroundColor: APP_BACKGROUND,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })

  lockDownNavigation(window)

  window.once('ready-to-show', () => {
    window.show()
  })

  // Closing the management window keeps the app alive in the tray, which is
  // where the global hotkey lives. Quitting is explicit: tray menu or Ctrl+Q.
  window.on('close', (event) => {
    if (!ctx.quitting) {
      event.preventDefault()
      window.hide()
    }
  })

  window.on('closed', () => {
    ctx.mainWindow = null
  })

  loadRenderer(window, 'index')
  ctx.mainWindow = window
  return window
}

/** Shows and focuses the management window, creating it if needed. */
export function showMainWindow(): BrowserWindow {
  const ctx = getContext()
  const window =
    ctx.mainWindow && !ctx.mainWindow.isDestroyed() ? ctx.mainWindow : createMainWindow()
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
  return window
}

export function focusMainSearch(): void {
  const window = showMainWindow()
  window.webContents.send(CHANNELS.eventFocusSearch)
}

/* -------------------------------------------------------------------------- */
/* Quick panel                                                                */
/* -------------------------------------------------------------------------- */

export function panelWindowSize(): { width: number; height: number } {
  const { settings } = getContext()
  return {
    width: Math.round(settings.panelWidth) + PANEL_PADDING * 2,
    height: PANEL_CARD_HEIGHT + PANEL_PADDING * 2,
  }
}

/**
 * Centres the panel on whichever display the pointer is on, a little above the
 * middle — the position a Spotlight-style panel is expected to appear in.
 */
function positionPanel(window: BrowserWindow): void {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const area = display.workArea
  const { width, height } = window.getBounds()

  const x = Math.round(area.x + (area.width - width) / 2)
  const y = Math.round(area.y + Math.min(area.height * 0.16, 180))
  window.setBounds({ x, y, width, height })
}

export function createPanelWindow(): BrowserWindow {
  const ctx = getContext()
  const { width, height } = panelWindowSize()

  const window = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: PANEL_BACKGROUND,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })

  lockDownNavigation(window)
  window.setAlwaysOnTop(true, 'pop-up-menu')
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Clicking anywhere else dismisses the panel, like a command palette.
  window.on('blur', () => {
    if (window.webContents.isDevToolsOpened()) return
    hidePanel()
  })

  window.on('closed', () => {
    ctx.panelWindow = null
  })

  loadRenderer(window, 'panel')
  ctx.panelWindow = window
  return window
}

export function showPanel(): void {
  const ctx = getContext()
  const window =
    ctx.panelWindow && !ctx.panelWindow.isDestroyed() ? ctx.panelWindow : createPanelWindow()

  positionPanel(window)
  window.setAlwaysOnTop(true, 'pop-up-menu')
  window.show()
  window.focus()
  window.webContents.focus()
  window.webContents.send(CHANNELS.eventPanelOpened)
}

export function hidePanel(): void {
  const ctx = getContext()
  if (ctx.panelWindow && !ctx.panelWindow.isDestroyed() && ctx.panelWindow.isVisible()) {
    ctx.panelWindow.hide()
  }
}

export function togglePanel(): void {
  const ctx = getContext()
  if (ctx.panelWindow && !ctx.panelWindow.isDestroyed() && ctx.panelWindow.isVisible()) {
    hidePanel()
  } else {
    showPanel()
  }
}

/** Applies a panel width change to the live window. */
export function resizePanel(): void {
  const ctx = getContext()
  if (!ctx.panelWindow || ctx.panelWindow.isDestroyed()) return
  const { width, height } = panelWindowSize()
  const bounds = ctx.panelWindow.getBounds()
  ctx.panelWindow.setBounds({ ...bounds, width, height })
}

/* -------------------------------------------------------------------------- */
/* Messaging                                                                  */
/* -------------------------------------------------------------------------- */

/** Sends an event to both renderers, skipping any that is gone. */
export function broadcast(channel: string, ...args: unknown[]): void {
  const ctx = getContext()
  for (const window of [ctx.mainWindow, ctx.panelWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send(channel, ...args)
  }
}

export function sendToMain(channel: string, ...args: unknown[]): void {
  const ctx = getContext()
  if (ctx.mainWindow && !ctx.mainWindow.isDestroyed()) {
    ctx.mainWindow.webContents.send(channel, ...args)
  }
}
