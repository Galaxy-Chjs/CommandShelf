import { expect, test, type Locator, type Page } from '@playwright/test'

import { filter, launchApp, resultRows, searchBox, seedDemoData, type LaunchedApp } from './launch'

/**
 * The management window: creating, finding, copying and deleting content.
 *
 * A note on waiting: the list is refetched asynchronously after every query
 * change, so `click()` returning does not mean the rows have been replaced.
 * Every helper below waits for an observable result rather than assuming the
 * DOM has caught up, which is also what a human user experiences.
 */

let app: LaunchedApp
let main: Page

test.beforeEach(async () => {
  app = await launchApp()
  main = app.main
  await seedDemoData(main)
})

test.afterEach(async () => {
  await app.close()
})

function readClipboard(): Promise<string> {
  return app.app.evaluate(({ clipboard }) => clipboard.readText())
}

/** Fills the search box and waits for the expected number of rows. */
async function search(text: string, expected: number): Promise<void> {
  await searchBox(main).fill(text)
  await expect(resultRows(main)).toHaveCount(expected)
}

/** Waits until at least `minCount` rows are present and all satisfy `matches`. */
async function expectRowsWhere(matches: (text: string) => boolean, minCount = 1): Promise<void> {
  await expect
    .poll(
      async () => {
        const rows = resultRows(main)
        const count = await rows.count()
        if (count < minCount) return false
        const texts = await rows.allInnerTexts()
        return texts.every(matches)
      },
      { timeout: 10_000 },
    )
    .toBe(true)
}

async function rowCount(): Promise<number> {
  return resultRows(main).count()
}

function rowOf(text: string): Locator {
  return resultRows(main).filter({ hasText: text }).first()
}

/** Selects a row with the keyboard, as a user would. */
async function selectFirstRow(): Promise<void> {
  await expect(resultRows(main).first()).toBeVisible()
  await main.keyboard.press('ArrowDown')
  await expect(resultRows(main).first()).toHaveAttribute('aria-selected', 'true')
}

/**
 * Moves focus out of the search box.
 *
 * Single-letter shortcuts are deliberately ignored while a text field has
 * focus — otherwise typing a query would fire them — so a test that wants to
 * use one has to leave the field first, exactly like a person would.
 */
async function leaveSearchBox(): Promise<void> {
  await main.locator('body').click({ position: { x: 4, y: 4 } })
}

/** The right-hand detail pane, which shows the selected item in full. */
function detail(): Locator {
  return main.getByRole('complementary')
}

test.describe('查找', () => {
  test('搜索框能按标题过滤', async () => {
    expect(await rowCount()).toBeGreaterThan(20)
    await search('端口转发', 1)
    await expect(resultRows(main).first()).toContainText('端口转发到本地')
  })

  test('搜索中文与英文混排', async () => {
    await searchBox(main).fill('ssh')
    await expect.poll(rowCount, { timeout: 10_000 }).toBeGreaterThan(2)

    await search('ssh 端口', 1)
  })

  test('可以搜索正文内容', async () => {
    await search('tensorboard', 1)
  })

  test('没有匹配内容时给出提示', async () => {
    await search('zzz-不存在的内容-zzz', 0)
    await expect(main.getByText('没有匹配的内容')).toBeVisible()
  })

  test('可以清除搜索', async () => {
    await search('pytest', 1)
    await main.getByRole('button', { name: '清除搜索' }).click()
    await expect.poll(rowCount, { timeout: 10_000 }).toBeGreaterThan(20)
  })

  test('按类型筛选', async () => {
    await filter(main, '提示词').click()
    await expectRowsWhere((text) => text.includes('提示词'))
  })

  test('按收藏筛选只留下收藏过的条目', async () => {
    await filter(main, '收藏').click()
    await expect.poll(rowCount, { timeout: 10_000 }).toBeLessThan(20)
    expect(await rowCount()).toBeGreaterThan(0)
  })

  test('按分类筛选', async () => {
    await filter(main, '服务器').click()
    await expect.poll(rowCount, { timeout: 10_000 }).toBeLessThan(20)
    expect(await rowCount()).toBeGreaterThan(0)
  })

  test('按标签筛选', async () => {
    await filter(main, '#git').click()
    await expectRowsWhere((text) => text.includes('git'))
  })

  test('筛选项可以一次清除', async () => {
    await filter(main, '#git').click()
    await expectRowsWhere((text) => text.includes('git'))
    await filter(main, '提示词').click()
    await expect(resultRows(main)).toHaveCount(0)

    await main.getByRole('button', { name: '清除全部', exact: true }).click()
    await expect.poll(rowCount, { timeout: 10_000 }).toBeGreaterThan(20)
  })

  test('重复点击同一个筛选会取消它', async () => {
    await filter(main, '收藏').click()
    await expect.poll(rowCount, { timeout: 10_000 }).toBeLessThan(20)
    const onlyFavourites = await rowCount()

    await filter(main, '收藏').click()
    await expect.poll(rowCount, { timeout: 10_000 }).toBeGreaterThan(onlyFavourites)
  })
})

test.describe('键盘操作', () => {
  test('方向键移动选择，回车复制', async () => {
    await search('本地项目目录', 1)
    await selectFirstRow()

    await main.keyboard.press('Enter')
    expect(await readClipboard()).toBe('D:\\IDE\\vscode\\MyDemo')
  })

  test('按 / 聚焦搜索框', async () => {
    await leaveSearchBox()
    await main.keyboard.press('/')
    await expect(searchBox(main)).toBeFocused()
  })

  test('按 N 打开新建对话框, Esc 关闭', async () => {
    await leaveSearchBox()
    await main.keyboard.press('n')
    await expect(main.getByRole('dialog', { name: '新建条目' })).toBeVisible()
    await main.keyboard.press('Escape')
    await expect(main.getByRole('dialog', { name: '新建条目' })).toBeHidden()
  })

  test('按 B 切换收藏', async () => {
    await search('本地项目目录', 1)
    await selectFirstRow()
    await leaveSearchBox()

    await main.keyboard.press('b')
    await filter(main, '收藏').click()
    await expectRowsWhere((text) => text.includes('本地项目目录'))
  })
})

test.describe('增删改', () => {
  test('新建一条内容', async () => {
    await main.getByRole('button', { name: '新建', exact: true }).click()
    await expect(main.getByRole('dialog', { name: '新建条目' })).toBeVisible()

    await main.getByLabel('标题').fill('临时测试命令')
    await main.getByLabel('正文').fill('echo hello-e2e')
    await main.getByLabel('标签').fill('e2e, 测试')
    await main.getByRole('button', { name: '保存' }).click()

    await expect(main.getByRole('dialog')).toBeHidden()
    await search('临时测试命令', 1)
    await expect(resultRows(main).first()).toContainText('#e2e')
  })

  test('正文为空时不能保存', async () => {
    await main.getByRole('button', { name: '新建', exact: true }).click()
    await main.getByLabel('标题').fill('只有标题')
    await expect(main.getByRole('button', { name: '保存' })).toBeDisabled()
    await main.getByRole('button', { name: '取消', exact: true }).click()
    await expect(main.getByRole('dialog')).toBeHidden()
  })

  test('标题留空时用正文首行', async () => {
    await main.getByRole('button', { name: '新建', exact: true }).click()
    await main.getByLabel('正文').fill('docker compose up -d')
    await main.getByRole('button', { name: '保存' }).click()

    await search('docker compose', 1)
    await expect(resultRows(main).first()).toContainText('docker compose up -d')
  })

  test('编辑已有条目', async () => {
    await search('本地项目目录', 1)
    await selectFirstRow()
    await leaveSearchBox()
    await main.keyboard.press('e')
    await expect(main.getByRole('dialog', { name: '编辑条目' })).toBeVisible()

    await main.getByLabel('标题').fill('改过的标题')
    await main.getByRole('button', { name: '保存' }).click()

    // The previous query no longer matches anything, so search for the new name.
    await search('改过的标题', 1)
    await expect(resultRows(main).first()).toContainText('改过的标题')
  })

  test('删除后可以撤销', async () => {
    await search('本地项目目录', 1)
    await selectFirstRow()
    await leaveSearchBox()
    await main.keyboard.press('Delete')

    await main.getByRole('button', { name: '删除', exact: true }).click()
    await expect(resultRows(main)).toHaveCount(0)

    await main.getByRole('button', { name: '撤销' }).click()
    await expect(resultRows(main)).toHaveCount(1)
  })

  test('多行内容可以完整保存并显示', async () => {
    const body = ['import json', '', 'def read(path):', '    return json.load(open(path))'].join(
      '\n',
    )
    await main.getByRole('button', { name: '新建', exact: true }).click()
    await main.getByLabel('标题').fill('多行片段')
    await main.getByLabel('正文').fill(body)
    await main.getByRole('button', { name: '保存' }).click()

    await search('多行片段', 1)
    await selectFirstRow()
    await expect(detail().getByText('def read(path):')).toBeVisible()
    await expect(detail().getByText('return json.load(open(path))')).toBeVisible()
  })
})

test.describe('复制', () => {
  test('列表上的复制按钮写入剪贴板', async () => {
    await search('只重跑上次失败的测试', 1)
    const row = resultRows(main).first()
    await row.hover()
    await row.getByRole('button', { name: '复制' }).click()

    await expect.poll(readClipboard).toBe('pytest --lf -x -q')
  })

  test('没有参数的条目回车即可复制', async () => {
    await search('本地项目目录', 1)
    await selectFirstRow()
    await main.keyboard.press('Enter')

    await expect.poll(readClipboard).toBe('D:\\IDE\\vscode\\MyDemo')
  })

  test('含参数的条目会提示到详情面板填写', async () => {
    await search('端口转发到本地', 1)
    const row = resultRows(main).first()
    await row.hover()
    await row.getByRole('button', { name: '复制' }).click()

    await expect(main.getByText('这条内容含有参数，请在右侧填写后复制')).toBeVisible()
    await expect(detail().getByText('参数', { exact: true })).toBeVisible()
  })

  test('详情面板里填写参数后复制最终内容', async () => {
    await search('端口转发到本地', 1)
    await selectFirstRow()
    await main.getByLabel('local_port（默认 8888）').fill('9000')
    await main.getByRole('button', { name: '复制最终内容' }).click()

    await expect.poll(readClipboard).toContain('9000')
    expect(await readClipboard()).not.toContain('{{')
  })

  test('在详情里复制会累加使用次数', async () => {
    await search('端口转发到本地', 1)
    await selectFirstRow()

    // Both the list card and the detail pane show the counter.
    await expect(detail().getByText(/用过 37 次/)).toBeVisible()
    await main.getByRole('button', { name: '复制最终内容' }).click()
    await expect(detail().getByText(/用过 38 次/)).toBeVisible()
  })

  test('回车复制无参数条目也会累加使用次数', async () => {
    // Every seeded item has a non-zero counter, so make a fresh one.
    await main.getByRole('button', { name: '新建', exact: true }).click()
    await main.getByLabel('标题').fill('计数测试')
    await main.getByLabel('正文').fill('echo count')
    await main.getByRole('button', { name: '保存' }).click()

    await search('计数测试', 1)
    await selectFirstRow()
    await expect(detail().getByText(/从未使用/)).toBeVisible()

    await main.keyboard.press('Enter')
    await expect(detail().getByText(/用过 1 次/)).toBeVisible()
  })
})

test.describe('分类与标签', () => {
  test('可以新建分类并筛选', async () => {
    await main.getByRole('button', { name: '新建分类' }).click()
    await main.getByLabel('名称').fill('e2e 分类')
    await main.getByRole('button', { name: '确定' }).click()

    await expect(filter(main, 'e2e 分类')).toHaveAttribute('aria-current', 'true')
    await expect(resultRows(main)).toHaveCount(0)
  })

  test('重命名分类', async () => {
    await filter(main, '服务器').locator('..').hover()
    await main.getByRole('button', { name: '重命名 服务器' }).click()
    await main.getByLabel('名称').fill('生产服务器')
    await main.getByRole('button', { name: '确定' }).click()

    await expect(filter(main, '生产服务器')).toBeVisible()
  })

  test('删除标签会解除关联但不删除内容', async () => {
    const before = await rowCount()
    await filter(main, '#git').locator('..').hover()
    await main.getByRole('button', { name: '删除 #git' }).click()
    await main.getByRole('button', { name: '删除标签' }).click()

    await expect(filter(main, '#git')).toHaveCount(0)
    expect(await rowCount()).toBe(before)
  })

  test('删除分类后条目仍在，只是变成未分类', async () => {
    await filter(main, '服务器').click()
    await expect.poll(rowCount, { timeout: 10_000 }).toBeLessThan(20)

    await filter(main, '服务器').locator('..').hover()
    await main.getByRole('button', { name: '删除 服务器' }).click()
    await main.getByRole('button', { name: '删除分类' }).click()

    await expect(filter(main, '服务器')).toHaveCount(0)
    // The deleted collection was the active filter, so the app clears it rather
    // than leaving the list permanently empty.
    await expect.poll(rowCount, { timeout: 10_000 }).toBeGreaterThan(20)

    // The items are now uncategorised rather than gone.
    await filter(main, '未分类').click()
    await expect(rowOf('端口转发到本地')).toBeVisible()
  })
})
