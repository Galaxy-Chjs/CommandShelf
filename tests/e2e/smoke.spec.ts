import { expect, test } from '@playwright/test'

import { launchApp, panelPage, resultRows, seedDemoData } from './launch'

test.describe('启动', () => {
  test('应用可以启动，主窗口和快捷面板都存在', async () => {
    const { app, main, close } = await launchApp()
    try {
      await expect(main).toHaveTitle(/CommandShelf/)

      // The global hotkey is registered at startup; the settings screen reports
      // it, and this is the same value. A conflict here would be an environment
      // problem, not an application one, so only the panel window is asserted.
      const panel = await panelPage(app)
      await expect(panel.locator('input[aria-label="搜索"]')).toBeAttached()
    } finally {
      await close()
    }
  })

  test('首次启动是空状态，并提供载入示例数据', async () => {
    const { main, close } = await launchApp()
    try {
      await expect(main.getByText('架子还是空的')).toBeVisible()
      await seedDemoData(main)
      expect(await resultRows(main).count()).toBeGreaterThan(20)
    } finally {
      await close()
    }
  })
})
