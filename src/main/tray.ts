import { Menu, Tray, app, nativeImage } from 'electron'

import { TRAY_ICON_32, TRAY_ICON_64 } from './assets/tray'
import { getContext } from './context'
import { hidePanel, showMainWindow, showPanel } from './windows'

/**
 * The tray icon is what keeps CommandShelf reachable once its window is
 * closed: the global hotkey and "quit" both live here.
 *
 * The Tray instance is held in a module-level variable on purpose — Electron
 * garbage-collects a tray that nothing references, and the icon silently
 * disappears.
 */

let tray: Tray | null = null

function trayImage() {
  // A 1x image plus a 2x representation, so Windows picks a crisp one on
  // high-DPI displays instead of scaling a 16px bitmap.
  const image = nativeImage.createFromDataURL(TRAY_ICON_32)
  image.addRepresentation({ scaleFactor: 2, dataURL: TRAY_ICON_64 })
  return image
}

function hotkeyLabel(): string {
  const ctx = getContext()
  return ctx.hotkeyRegistered ? ctx.settings.hotkey : `${ctx.settings.hotkey}（未生效）`
}

function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: '打开 CommandShelf',
      click: () => showMainWindow(),
    },
    {
      label: '快捷面板',
      click: () => showPanel(),
    },
    { type: 'separator' },
    { label: `呼出快捷键：${hotkeyLabel()}`, enabled: false },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        getContext().quitting = true
        app.quit()
      },
    },
  ])
}

export function refreshTrayMenu(): void {
  if (tray && !tray.isDestroyed()) tray.setContextMenu(buildMenu())
}

export function createTray(): Tray {
  tray = new Tray(trayImage())
  tray.setToolTip('CommandShelf — 开发者命令与片段工作台')
  tray.setContextMenu(buildMenu())

  // Single click opens the management window; the quick panel has its own
  // hotkey, so the tray click should go to the place where you edit things.
  tray.on('click', () => {
    hidePanel()
    showMainWindow()
  })

  return tray
}

export function destroyTray(): void {
  if (tray && !tray.isDestroyed()) tray.destroy()
  tray = null
}
