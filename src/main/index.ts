import { join } from 'node:path'

import { BrowserWindow, app } from 'electron'

import { closeContext, getContext, initContext, markQuitting } from './context'
import { HIDDEN_FLAG, setQuitHandler, startHotkey, syncLaunchAtLogin } from './controller'
import { registerIpc } from './ipc'
import { serveRenderer } from './protocol'
import { unregisterHotkeys } from './shortcuts'
import { createTray, destroyTray } from './tray'
import { createMainWindow, createPanelWindow, showMainWindow } from './windows'

/**
 * Application entry point: lifecycle, single-instance handling, and the order
 * in which the process-wide pieces are created.
 *
 * Dependency order (no cycles):
 *   context  ←  windows, shortcuts, tray  ←  controller  ←  ipc, index
 */

// Must happen before `app.whenReady()`: pointing userData somewhere else is how
// the end-to-end tests get a throwaway database instead of the real one.
const userDataOverride = process.env.COMMANDSHELF_USER_DATA
if (userDataOverride) app.setPath('userData', userDataOverride)

// Groups the taskbar entry and lets Windows attribute notifications correctly.
app.setAppUserModelId('com.galaxychjs.commandshelf')

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // A second launch just brings the existing window forward.
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })

  void app.whenReady().then(() => {
    initContext()
    registerIpc()

    // Only needed for the built output; in development the Vite dev server
    // serves the renderer over http.
    if (!process.env.ELECTRON_RENDERER_URL) {
      serveRenderer(join(__dirname, '../renderer'))
    }

    // An instance started by the login item goes straight to the tray.
    createMainWindow({ show: !process.argv.includes(HIDDEN_FLAG) })

    // The panel is created up front and kept hidden: building a BrowserWindow
    // on the first hotkey press would add a visible delay to the one
    // interaction this app exists for.
    createPanelWindow()

    createTray()
    setQuitHandler(() => app.quit())
    startHotkey()
    // Rewrite the login item on every start: the registration lives in the
    // operating system and points at an executable path, which goes stale as
    // soon as a new version is installed somewhere else.
    syncLaunchAtLogin()

    if (process.env.COMMANDSHELF_DEVTOOLS === '1') {
      getContext().mainWindow?.webContents.openDevTools({ mode: 'detach' })
    }

    app.on('activate', () => {
      // macOS: clicking the dock icon with no windows open reopens the window.
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
      else showMainWindow()
    })
  })

  // A tray application: closing the last window hides it, it does not quit.
  // Quitting is explicit, from the tray menu or Ctrl+Q.
  app.on('window-all-closed', () => {
    // Intentionally empty.
  })

  app.on('before-quit', () => {
    markQuitting()
  })

  app.on('will-quit', () => {
    unregisterHotkeys()
    destroyTray()
    closeContext()
  })
}
