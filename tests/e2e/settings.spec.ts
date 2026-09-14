import { expect, test } from '@playwright/test'

import { launchApp, resultRows, seedViaIpc, type LaunchedApp } from './launch'

/** The settings dialog, including the hotkey recorder. */

let app: LaunchedApp
let main: LaunchedApp['main']

test.beforeEach(async () => {
  app = await launchApp()
  main = app.main
})

test.afterEach(async () => {
  await app.close()
})

async function openSettings(): Promise<void> {
  await main.getByRole('button', { name: '设置' }).click()
  await expect(main.getByRole('dialog', { name: '设置' })).toBeVisible()
}

function dialog() {
  return main.getByRole('dialog', { name: '设置' })
}

function theme(): Promise<string | undefined> {
  return main.evaluate(() => document.documentElement.dataset.theme)
}

async function savedSettings() {
  return main.evaluate(async () => {
    const result = await window.commandShelf.settings.get()
    return result.ok ? result.data : null
  })
}

test('显示版本与运行环境', async () => {
  await openSettings()
  // `exact` because the auto-start hint also mentions Electron.
  await expect(dialog().getByText('Electron', { exact: true })).toBeVisible()
  await expect(dialog().getByText('本地优先')).toBeVisible()
  await expect(dialog().getByText('无遥测')).toBeVisible()
})

test('开发模式下明确说明开机启动不会生效', async () => {
  await openSettings()
  // The e2e run is not a packaged build, so the switch has to say so rather
  // than silently doing nothing.
  await expect(dialog().getByText(/源码开发模式/)).toBeVisible()

  const toggle = dialog().getByRole('switch', { name: '开机自动启动' })
  await toggle.click()
  expect((await savedSettings())?.launchAtLogin).toBe(true)
})

test('切换主题立即生效', async () => {
  await openSettings()

  await dialog().getByRole('button', { name: '浅色' }).click()
  await expect.poll(theme).toBe('light')

  await dialog().getByRole('button', { name: '深色' }).click()
  await expect.poll(theme).toBe('dark')
})

test('浅色主题会被保存', async () => {
  await openSettings()
  await dialog().getByRole('button', { name: '浅色' }).click()
  await expect.poll(theme).toBe('light')

  expect((await savedSettings())?.theme).toBe('light')
})

test('显示当前的全局快捷键', async () => {
  await openSettings()
  await expect(dialog().getByText('Ctrl+Shift+Space')).toBeVisible()

  // Whether the combination could actually be claimed is a property of the
  // machine, not of the app: another instance, or any other program, may
  // already own it. Assert that the app reports one of the two states rather
  // than that this particular machine happened to be free.
  await expect(dialog().getByText(/全局快捷键(已生效|未生效)/)).toBeVisible()
})

test('可以录制新的全局快捷键', async () => {
  await openSettings()
  const recorder = dialog().getByLabel('录制全局快捷键')

  await recorder.click()
  await expect(dialog().getByText('请按下新的组合键…')).toBeVisible()

  await recorder.press('Control+Alt+Shift+F9')
  await expect(dialog().getByText('Ctrl+Shift+Alt+F9')).toBeVisible()

  expect((await savedSettings())?.hotkey).toBe('CommandOrControl+Shift+Alt+F9')
})

test('拒绝只有修饰键的组合', async () => {
  await openSettings()
  const recorder = dialog().getByLabel('录制全局快捷键')

  await recorder.click()
  await recorder.press('Control')
  await expect(dialog().getByText(/需要同时包含 Ctrl/)).toBeVisible()

  // Nothing was saved.
  expect((await savedSettings())?.hotkey).toBe('CommandOrControl+Shift+Space')
})

test('开关会写入设置', async () => {
  await openSettings()
  const toggle = dialog().getByRole('switch', { name: '复制后自动隐藏面板' })

  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')

  expect((await savedSettings())?.hideAfterCopy).toBe(false)
})

test('修改面板宽度会写入设置', async () => {
  await openSettings()
  await dialog().getByLabel('面板宽度').selectOption('900')
  expect((await savedSettings())?.panelWidth).toBe(900)
})

test('显示数据目录并可以打开', async () => {
  await openSettings()
  await expect(dialog().getByText(/commandshelf\.db/)).toBeVisible()
  await expect(dialog().getByRole('button', { name: '打开目录' })).toBeEnabled()
})

test('从设置里载入示例数据后主窗口能看到内容', async () => {
  await openSettings()
  await dialog().getByRole('button', { name: '载入示例数据' }).click()
  await expect(main.getByText(/已载入 \d+ 条示例数据/)).toBeVisible()

  await main.getByRole('button', { name: '完成' }).click()
  await expect(resultRows(main).first()).toBeVisible()
})

test('清空全部数据需要二次确认', async () => {
  await seedViaIpc(main)
  await openSettings()
  await dialog().getByRole('button', { name: '清空全部数据' }).click()

  await expect(main.getByRole('dialog', { name: '清空全部数据' })).toBeVisible()
  await main.getByRole('button', { name: '确认清空' }).click()

  await expect(main.getByText(/已删除 \d+ 条数据/)).toBeVisible()
  await main.getByRole('button', { name: '完成' }).click()
  await expect(main.getByText('架子还是空的')).toBeVisible()
})

test('取消清空后数据仍在', async () => {
  await seedViaIpc(main)
  await openSettings()
  await dialog().getByRole('button', { name: '清空全部数据' }).click()
  await main.getByRole('button', { name: '取消', exact: true }).click()

  await main.getByRole('button', { name: '完成' }).click()
  expect(await resultRows(main).count()).toBeGreaterThan(20)
})
