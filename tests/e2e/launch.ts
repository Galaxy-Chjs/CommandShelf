import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

/**
 * Launches the built application for end-to-end tests.
 *
 * Three things matter here:
 *
 * 1. Every launch gets its own temporary `userData` directory, so a test run can
 *    never read or write the developer's real CommandShelf database.
 * 2. `ELECTRON_RUN_AS_NODE` is deleted from the environment. When that variable
 *    is set (some CI shells and agent harnesses set it), Electron starts as
 *    plain Node and the app never boots, which produces a confusing failure.
 * 3. On CI the GPU is switched off. A hosted runner has no real graphics
 *    adapter, and Electron can fail to bring up a window when it tries to use
 *    one. Software rendering still produces a working page, so nothing the
 *    tests assert on changes.
 */

const PROJECT_ROOT = process.cwd()

/** Chromium flags used only on CI. */
const CI_ARGS = ['--disable-gpu']

/**
 * Resolves the Electron binary.
 *
 * `node_modules/electron/path.txt` is the canonical pointer, written by the
 * `install-electron` script that this project runs as its own `postinstall`.
 * It is read defensively and the failure message lists what is actually on
 * disk, because "the binary was never downloaded" is otherwise
 * indistinguishable from "the app crashed on startup" in CI output.
 */
function electronExecutable(): string {
  const packageDir = join(PROJECT_ROOT, 'node_modules', 'electron')
  const pathFile = join(packageDir, 'path.txt')
  const distDir = join(packageDir, 'dist')

  if (existsSync(pathFile)) {
    const binary = readFileSync(pathFile, 'utf8').trim()
    const resolved = join(distDir, binary)
    if (binary && existsSync(resolved)) return resolved
  }

  // Fall back to whatever layout is present, so a stale path.txt is survivable.
  for (const candidate of ['electron.exe', 'electron', 'Electron.app/Contents/MacOS/Electron']) {
    const resolved = join(distDir, candidate)
    if (existsSync(resolved)) return resolved
  }

  const listing = existsSync(distDir) ? readdirSync(distDir).slice(0, 20).join(', ') : '(missing)'
  throw new Error(
    `找不到 Electron 可执行文件：path.txt 存在=${existsSync(pathFile)}，dist/ 内容=[${listing}]。` +
      '通常是 npm ci 的 postinstall 没有下载二进制文件。',
  )
}

export interface LaunchedApp {
  app: ElectronApplication
  /** The management window. */
  main: Page
  dataDir: string
  close: () => Promise<void>
}

export async function launchApp(options: { extraArgs?: string[] } = {}): Promise<LaunchedApp> {
  delete process.env.ELECTRON_RUN_AS_NODE

  const dataDir = mkdtempSync(join(tmpdir(), 'commandshelf-e2e-'))

  const app = await electron.launch({
    executablePath: electronExecutable(),
    args: ['.', ...(process.env.CI ? CI_ARGS : []), ...(options.extraArgs ?? [])],
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      COMMANDSHELF_USER_DATA: dataDir,
      // Keep the dev-server branch out of the way: the tests exercise the built
      // output in out/, exactly like the packaged app.
      ELECTRON_RENDERER_URL: '',
    },
  })

  const main = await mainPage(app)
  await main.waitForLoadState('domcontentloaded')
  // The header only renders once settings have loaded from the main process, so
  // it is a reliable "the app is actually up" signal.
  await main.getByText('CommandShelf', { exact: true }).first().waitFor({ timeout: 30_000 })

  return {
    app,
    main,
    dataDir,
    close: async () => {
      await app.close()
      rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

/**
 * Finds a window by the page it loaded.
 *
 * `firstWindow()` is not usable here: both windows are created up front, and the
 * order Playwright attaches to them is not the order they were created in — in
 * practice the hidden quick panel often comes first.
 */
async function pageFor(app: ElectronApplication, file: 'index.html' | 'panel.html'): Promise<Page> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      if (page.url().includes(file)) {
        await page.waitForLoadState('domcontentloaded')
        return page
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`没有找到窗口：${file}`)
}

export async function mainPage(app: ElectronApplication): Promise<Page> {
  return pageFor(app, 'index.html')
}

/** Finds the quick panel's window, which is created hidden at startup. */
export async function panelPage(app: ElectronApplication): Promise<Page> {
  return pageFor(app, 'panel.html')
}

/**
 * Rows of the result list.
 *
 * Scoped to the listbox on purpose: a bare `getByRole('option')` also matches
 * the `<option>` elements inside the sort `<select>`, which are never visible.
 */
export function resultRows(main: Page) {
  return main.getByRole('listbox', { name: '结果列表' }).getByRole('option')
}

/**
 * The header search box.
 *
 * `exact` matters: the result listbox is labelled 搜索结果, which a substring
 * match on 搜索 would also hit.
 */
export function searchBox(main: Page) {
  return main.getByLabel('搜索', { exact: true })
}

/** The filter navigation. */
export function sidebar(main: Page) {
  return main.getByRole('navigation', { name: '筛选' })
}

/** One filter row, by its exact label. */
export function filter(main: Page, name: string) {
  return sidebar(main).getByRole('button', { name, exact: true })
}

/** Loads the example content so a test has something to work with. */
export async function seedDemoData(main: Page): Promise<void> {
  await main.getByRole('button', { name: '载入示例数据' }).first().click()
  await resultRows(main).first().waitFor({ timeout: 20_000 })
}

/**
 * Seeds through IPC instead of the empty-state button.
 *
 * Used when the UI under test is a modal that covers the empty state, so the
 * setup does not depend on a button the test is not about.
 */
export async function seedViaIpc(main: Page): Promise<void> {
  await main.evaluate(() => window.commandShelf.data.seedDemo())
  await resultRows(main).first().waitFor({ timeout: 20_000 })
}
