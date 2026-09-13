import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type ElectronApplication, type Page } from '@playwright/test'

import { launchApp, resultRows, seedViaIpc, sidebar, type LaunchedApp } from './launch'

/**
 * Generates the screenshots used by the README.
 *
 * These are real captures of the running application with the example data
 * loaded — nothing is mocked up. They are produced at 2x so the text is crisp.
 *
 * Regenerate with:
 *   npm run build && npm run screenshots
 *
 * Excluded from the default test run: the example data is seeded relative to
 * "now", so the "N 天前" labels shift and a plain `npm run e2e` would leave
 * modified images in the working tree.
 */

const OUTPUT = join(process.cwd(), 'docs', 'images')
const CONTENT_WIDTH = 1200
const CONTENT_HEIGHT = 780

test.describe.configure({ mode: 'serial' })

let app: LaunchedApp

/** The management window, sized the same in every shot. */
async function resizeMain(target: ElectronApplication): Promise<void> {
  await target.evaluate(
    ({ BrowserWindow }, size: { width: number; height: number }) => {
      const window = BrowserWindow.getAllWindows().find((entry) =>
        entry.webContents.getURL().includes('index.html'),
      )
      window?.setContentSize(size.width, size.height)
    },
    { width: CONTENT_WIDTH, height: CONTENT_HEIGHT },
  )
}

async function shoot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(OUTPUT, `${name}.png`) })
}

/**
 * Captures the quick panel.
 *
 * The live panel window is transparent and created hidden at startup; on
 * Windows it never produces a frame for either CDP screenshots or
 * `webContents.capturePage`, and both simply hang. So the shot is taken from a
 * fresh, opaque window that loads the very same `panel.html` and preload — the
 * real component tree, not a mock-up.
 */
async function shootPanel(name: string, prepare: (page: Page) => Promise<void>): Promise<void> {
  const nextWindow = app.app.waitForEvent('window', {
    predicate: (page) => page.url().includes('capture=1'),
    timeout: 20_000,
  })

  await app.app.evaluate(
    ({ BrowserWindow }, preload) => {
      const panel = BrowserWindow.getAllWindows().find((entry) =>
        entry.webContents.getURL().includes('panel.html'),
      )
      if (!panel) throw new Error('没有找到快捷面板窗口')

      const shot = new BrowserWindow({
        width: 712,
        height: 484,
        show: true,
        frame: false,
        // The panel is 680x452 plus a 16px margin for its shadow.
        backgroundColor: '#0d1117',
        webPreferences: {
          preload,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      })
      void shot.loadURL(`${panel.webContents.getURL()}?capture=1`)
    },
    join(process.cwd(), 'out', 'preload', 'index.js'),
  )

  const page = await nextWindow
  await page.waitForLoadState('domcontentloaded')
  await prepare(page)

  // Capturing an occluded window can hand back the frame from before the last
  // interaction, so bring it to the front and force a repaint first.
  await app.app.evaluate(async ({ BrowserWindow }) => {
    const shot = BrowserWindow.getAllWindows().find((entry) =>
      entry.webContents.getURL().includes('capture=1'),
    )
    shot?.moveTop()
    shot?.focus()
    shot?.webContents.invalidate()
  })
  await new Promise((resolve) => setTimeout(resolve, 500))

  const base64 = await app.app.evaluate(async ({ BrowserWindow }) => {
    const shot = BrowserWindow.getAllWindows().find((entry) =>
      entry.webContents.getURL().includes('capture=1'),
    )
    if (!shot) return null
    shot.webContents.invalidate()
    const image = await shot.webContents.capturePage()
    return image.toPNG().toString('base64')
  })
  if (!base64) throw new Error('没有找到截图窗口')
  writeFileSync(join(OUTPUT, `${name}.png`), Buffer.from(base64, 'base64'))
}

test.beforeAll(() => {
  mkdirSync(OUTPUT, { recursive: true })
})

test.beforeEach(async () => {
  app = await launchApp({ extraArgs: ['--force-device-scale-factor=2'] })
  await resizeMain(app.app)
  await seedViaIpc(app.main)
})

test.afterEach(async () => {
  await app.close()
})

/**
 * Types a query and waits for the filtered list to arrive.
 *
 * Waiting for "a row is visible" is not enough: the previous, unfiltered rows
 * are still on screen, and selecting one of them before the refetch lands means
 * the selection is (correctly) dropped when the new rows arrive.
 */
async function searchAndSettle(text: string, expectFewerThan = 10): Promise<void> {
  await app.main.getByLabel('搜索', { exact: true }).fill(text)
  await expect
    .poll(async () => resultRows(app.main).count(), { timeout: 10_000 })
    .toBeLessThan(expectFewerThan)
  await expect(resultRows(app.main).first()).toBeVisible()
}

test('主界面（深色）', async () => {
  await searchAndSettle('ssh')
  await resultRows(app.main).first().click()
  await expect(app.main.getByRole('complementary')).toBeVisible()
  await shoot(app.main, 'hero')
})

test('主界面（浅色）', async () => {
  await app.main.evaluate(() => window.commandShelf.settings.update({ theme: 'light' }))
  await searchAndSettle('ssh')
  await resultRows(app.main).first().click()
  await expect(app.main.getByRole('complementary')).toBeVisible()
  await shoot(app.main, 'hero-light')
})

test('全部内容（深色，无搜索）', async () => {
  await shoot(app.main, 'library')
})

test('按分类浏览', async () => {
  await sidebar(app.main).getByRole('button', { name: '训练与实验', exact: true }).click()
  await expect(resultRows(app.main).first()).toBeVisible()
  await shoot(app.main, 'collections')
})

test('新建条目对话框', async () => {
  await app.main.getByRole('button', { name: '新建', exact: true }).click()
  await app.main.getByLabel('标题').fill('批量重命名实验目录')
  await app.main
    .getByLabel('正文')
    .fill('for d in {{root=./runs}}/*; do mv "$d" "{{prefix=exp-}}$(basename $d)"; done')
  await app.main.getByLabel('标签').fill('bash, 实验')
  await shoot(app.main, 'editor')
})

test('参数填写（详情面板）', async () => {
  await app.main.getByLabel('搜索', { exact: true }).fill('端口转发到本地')
  await expect(resultRows(app.main)).toHaveCount(1)
  await resultRows(app.main).first().click()
  await expect(app.main.getByText('参数', { exact: true })).toBeVisible()
  await shoot(app.main, 'variables')
})
test('设置', async () => {
  await app.main.getByRole('button', { name: '设置' }).click()
  await expect(app.main.getByRole('dialog', { name: '设置' })).toBeVisible()
  await shoot(app.main, 'settings')
})

test('快捷面板', async () => {
  await shootPanel('panel', async (page) => {
    const input = page.locator('input[aria-label="搜索"]')
    await input.fill('ssh')
    // Wait for the filtered set, not just any row: the unfiltered list is on
    // screen immediately and would be captured by mistake. The panel selects
    // its first row by default, so no extra keystroke is needed.
    await expect
      .poll(async () => page.getByRole('option').count(), { timeout: 10_000 })
      .toBeLessThan(8)
    await expect(page.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
    await expect(input).toHaveValue('ssh')
  })
})

test('快捷面板 · 填写参数', async () => {
  await shootPanel('panel-variables', async (page) => {
    const input = page.locator('input[aria-label="搜索"]')
    await input.fill('进入运行中的容器')
    await expect(page.getByRole('option')).toHaveCount(1)
    await input.press('Enter')
    await expect(page.getByText('最终内容')).toBeVisible()
  })
})
