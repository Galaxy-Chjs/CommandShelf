import { expect, test } from '@playwright/test'

import { launchApp, panelPage, resultRows, type LaunchedApp } from './launch'

/**
 * The quick panel — the interaction the whole project exists for.
 *
 * The panel is a separate window that the hotkey toggles. Tests open it through
 * the same IPC call the hotkey handler uses, because a global shortcut cannot be
 * triggered from outside the application.
 */

let app: LaunchedApp

test.beforeEach(async () => {
  app = await launchApp()
  // Seed through the main window so the panel has something to find.
  await app.main.getByRole('button', { name: '载入示例数据' }).first().click()
  await resultRows(app.main).first().waitFor({ timeout: 20_000 })

  await app.main.evaluate(() => window.commandShelf.app.openPanel())
})

test.afterEach(async () => {
  await app.close()
})

function readClipboard(): Promise<string> {
  return app.app.evaluate(({ clipboard }) => clipboard.readText())
}

/** Whether the panel window is currently on screen. */
function panelVisible(): Promise<boolean> {
  return app.app.evaluate(({ BrowserWindow }) => {
    const panel = BrowserWindow.getAllWindows().find((window) =>
      window.webContents.getURL().includes('panel.html'),
    )
    return panel?.isVisible() ?? false
  })
}

async function openPanel(): Promise<LaunchedApp['main']> {
  await app.main.evaluate(() => window.commandShelf.app.openPanel())
  return panelPage(app.app)
}

test('呼出面板后光标已经在搜索框里', async () => {
  const panel = await panelPage(app.app)
  await expect(panel.locator('input[aria-label="搜索"]')).toBeFocused()
  expect(await panelVisible()).toBe(true)
})

test('输入即搜，回车复制并关闭面板', async () => {
  const panel = await panelPage(app.app)
  const input = panel.locator('input[aria-label="搜索"]')

  await input.fill('本地项目目录')
  await expect(panel.getByRole('option')).toHaveCount(1)

  await input.press('Enter')
  await expect.poll(readClipboard).toBe('D:\\IDE\\vscode\\MyDemo')
  await expect.poll(panelVisible).toBe(false)
})

test('中文关键词也能找到', async () => {
  const panel = await panelPage(app.app)
  const input = panel.locator('input[aria-label="搜索"]')

  await input.fill('端口转发')
  await expect(panel.getByRole('option').first()).toContainText('端口转发到本地')
})

test('方向键可以移动选择', async () => {
  const panel = await panelPage(app.app)
  const input = panel.locator('input[aria-label="搜索"]')

  await input.fill('ssh')
  await expect(panel.getByRole('option').first()).toBeVisible()
  await expect(panel.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')

  await input.press('ArrowDown')
  await expect(panel.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true')
})

test('含参数的条目先填参数再复制', async () => {
  const panel = await panelPage(app.app)
  const input = panel.locator('input[aria-label="搜索"]')

  await input.fill('进入运行中的容器')
  await expect(panel.getByRole('option')).toHaveCount(1)

  // Enter on a template opens the fill-in form rather than copying.
  await input.press('Enter')
  await expect(panel.getByText('最终内容')).toBeVisible()

  const field = panel.getByLabel('container（默认 my-container）')
  await expect(field).toBeFocused()
  await field.fill('lab-api')
  await expect(panel.getByText(/docker exec -it lab-api/)).toBeVisible()

  await field.press('Enter')
  await expect.poll(readClipboard).toBe('docker exec -it lab-api /bin/bash')
})

test('参数为空时不复制', async () => {
  const panel = await panelPage(app.app)
  const input = panel.locator('input[aria-label="搜索"]')

  await input.fill('上传文件到服务器')
  await input.press('Enter')
  await expect(panel.getByText('最终内容')).toBeVisible()

  const field = panel.getByLabel('local_path（默认 ./data）')
  await field.fill('')
  await expect(panel.getByText(/还有 1 个参数没有填写/)).toBeVisible()

  // With a blank parameter, Enter must not put a half-filled command on the
  // clipboard.
  await field.press('Enter')
  await expect.poll(readClipboard).not.toContain('scp')
})

test('Esc 从参数填写返回搜索', async () => {
  const panel = await panelPage(app.app)
  const input = panel.locator('input[aria-label="搜索"]')

  await input.fill('进入运行中的容器')
  await input.press('Enter')
  await expect(panel.getByText('最终内容')).toBeVisible()

  await panel.keyboard.press('Escape')
  await expect(panel.getByText('最终内容')).toBeHidden()
  await expect(panel.locator('input[aria-label="搜索"]')).toBeFocused()
})

test('Esc 关闭面板', async () => {
  const panel = await panelPage(app.app)
  await panel.keyboard.press('Escape')
  await expect.poll(panelVisible).toBe(false)
})

test('重新呼出时面板是干净的', async () => {
  const panel = await panelPage(app.app)
  const input = panel.locator('input[aria-label="搜索"]')

  await input.fill('本地项目目录')
  await expect(panel.getByRole('option')).toHaveCount(1)
  await panel.keyboard.press('Escape')

  const reopened = await openPanel()
  await expect(reopened.locator('input[aria-label="搜索"]')).toHaveValue('')
  expect(await reopened.getByRole('option').count()).toBeGreaterThan(1)
})

test('没有匹配内容时给出提示', async () => {
  const panel = await panelPage(app.app)
  await panel.locator('input[aria-label="搜索"]').fill('zzz-找不到-zzz')
  await expect(panel.getByText('没有匹配的内容')).toBeVisible()
})

test('面板支持浅色主题', async () => {
  await app.main.evaluate(() => window.commandShelf.settings.update({ theme: 'light' }))
  const panel = await openPanel()
  await expect(panel.locator('html')).toHaveAttribute('data-theme', 'light')
})
