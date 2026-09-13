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
  projects: [
    {
      // The test suite. `npm run e2e` runs this one.
      name: 'app',
      testIgnore: /screenshots\.spec\.ts/,
    },
    {
      // Regenerates docs/images. Kept out of the default run because it writes
      // to the repository: the example data is seeded relative to "now", so the
      // "N 天前" labels shift and every capture would show up as a change.
      // `npm run screenshots` runs it deliberately.
      name: 'screenshots',
      testMatch: /screenshots\.spec\.ts/,
    },
  ],
})
