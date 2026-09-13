import { defineConfig } from '@playwright/test'

/**
 * End-to-end tests drive the real Electron application through Playwright's
 * Electron support. No browser download is required.
 *
 * Every test launches the app with its own temporary userData directory, so a
 * test run can never read or write the developer's real CommandShelf database.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    trace: 'retain-on-failure',
  },
})
