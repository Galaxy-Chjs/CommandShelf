// Temporary: smoke-test the packaged build.
import { _electron as electron } from '@playwright/test'
import { existsSync, mkdtempSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

delete process.env.ELECTRON_RUN_AS_NODE

/** Finds the packaged executable, wherever electron-builder put it. */
function findExecutable() {
  const candidates = ['release/win-unpacked/CommandShelf.exe']
  for (const candidate of candidates) {
    const full = join(process.cwd(), candidate)
    if (existsSync(full)) return full
  }
  // `electron-builder --win` with an NSIS target leaves the unpacked build in a
  // subdirectory; look one level down rather than guessing the layout.
  const release = join(process.cwd(), 'release')
  if (existsSync(release)) {
    for (const entry of readdirSync(release)) {
      const nested = join(release, entry, 'CommandShelf.exe')
      if (existsSync(nested) && statSync(nested).isFile()) return nested
    }
  }
  return null
}

const exe = findExecutable()
if (!exe) {
  process.stderr.write('packaged executable not found under release/ — run a dist script first\n')
  process.exit(1)
}
process.stdout.write(`smoke: ${exe}\n`)

const app = await electron.launch({
  executablePath: exe,
  args: [],
  env: { ...process.env, COMMANDSHELF_USER_DATA: mkdtempSync(join(tmpdir(), 'cs-packaged-')) },
})

app.process().stderr?.on('data', (chunk) => process.stdout.write(`[stderr] ${chunk}`))
const errors = []

// `firstWindow()` is not the main window: the hidden quick panel is usually
// attached first, so pick by URL.
let page = null
for (let i = 0; i < 80 && !page; i += 1) {
  for (const candidate of app.windows()) {
    if (candidate.url().includes('index.html')) page = candidate
  }
  if (!page) await new Promise((r) => setTimeout(r, 250))
}
if (!page) throw new Error('main window never appeared')

page.on('pageerror', (error) => errors.push(error.message))
await page.waitForLoadState('domcontentloaded')
await new Promise((r) => setTimeout(r, 2500))

console.log('url:', page.url())
console.log('title:', await page.title())
const body = await page.locator('body').innerText()
console.log('rendered header:', body.includes('CommandShelf'))
console.log('rendered empty state:', body.includes('架子还是空的'))

// Exercise the packaged app a little: seed and search.
await page.getByRole('button', { name: '载入示例数据' }).first().click()
await page.waitForTimeout(1500)
const rows = await page.getByRole('listbox', { name: '结果列表' }).getByRole('option').count()
console.log('rows after seeding:', rows)
await page.getByLabel('搜索', { exact: true }).fill('ssh')
await page.waitForTimeout(800)
const filtered = await page.getByRole('listbox', { name: '结果列表' }).getByRole('option').count()
console.log('rows for ssh:', filtered)

const info = await page.evaluate(async () => {
  const result = await window.commandShelf.app.info()
  return result.ok ? { version: result.data.version, schema: result.data.schemaVersion } : null
})
console.log('app info:', JSON.stringify(info))
console.log('page errors:', errors.length ? errors : 'none')

// Closing the window only hides it — that is the whole point of a tray app — so
// Playwright's teardown alone can leave the process running and the CI step
// hanging. Ask it to quit first, then let Playwright clean up.
await app
  .evaluate(({ app: electronApp }) => {
    electronApp.quit()
  })
  .catch(() => {})
await app.close().catch(() => {})

process.exit(errors.length > 0 ? 1 : 0)
