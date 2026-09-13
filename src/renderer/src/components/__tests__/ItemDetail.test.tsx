import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMockApi, makeItem, type MockApi } from '../../test/mock-api'
import { ItemDetail } from '../ItemDetail'

let mock: MockApi

function install(options: Parameters<typeof createMockApi>[0] = {}): MockApi {
  mock = createMockApi(options)
  window.commandShelf = mock.api
  return mock
}

function renderDetail(item = makeItem(), overrides: Record<string, unknown> = {}) {
  const props = {
    item,
    collection: null,
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onToggleFavorite: vi.fn(),
    onTagClick: vi.fn(),
    onNotice: vi.fn(),
    ...overrides,
  }
  render(<ItemDetail {...props} />)
  return props
}

beforeEach(() => {
  install()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ItemDetail', () => {
  it('shows the title, body and metadata', () => {
    renderDetail(makeItem({ title: '端口转发', body: 'ssh -L 1:2 host', useCount: 3 }))
    expect(screen.getByRole('heading', { name: '端口转发' })).toBeInTheDocument()
    expect(screen.getByText(/ssh -L 1:2 host/)).toBeInTheDocument()
    expect(screen.getByText(/用过 3 次/)).toBeInTheDocument()
    expect(screen.getByText('未分类')).toBeInTheDocument()
  })

  it('copies the body directly when there are no variables', async () => {
    renderDetail(makeItem({ body: 'git status' }))
    await userEvent.click(screen.getByRole('button', { name: /复制/ }))

    expect(mock.copied).toEqual(['git status'])
    await waitFor(() => expect(screen.getByText('已复制')).toBeInTheDocument())
  })

  it('records the use after copying', async () => {
    renderDetail(makeItem({ id: 'abc', body: 'x' }))
    await userEvent.click(screen.getByRole('button', { name: /复制/ }))
    expect(mock.callsFor('items:mark-used')).toHaveLength(1)
  })

  it('shows a parameter form for a template', () => {
    renderDetail(makeItem({ body: 'ssh -L {{local=8888}}:{{remote=80}} host' }))
    expect(screen.getByText('参数')).toBeInTheDocument()
    expect(screen.getByLabelText('local（默认 8888）')).toBeInTheDocument()
    expect(screen.getByLabelText('remote（默认 80）')).toBeInTheDocument()
    expect(screen.getByText('2 个参数')).toBeInTheDocument()
  })

  it('copies the substituted template, not the raw placeholders', async () => {
    renderDetail(makeItem({ body: 'ssh -L {{local=8888}}:{{remote=80}} host' }))
    await userEvent.click(screen.getByRole('button', { name: '复制最终内容' }))
    expect(mock.copied).toEqual(['ssh -L 8888:80 host'])
  })

  it('applies an edited parameter to the copied text', async () => {
    renderDetail(makeItem({ body: 'ssh -p {{port=22}} host' }))
    const input = screen.getByLabelText('port（默认 22）')
    await userEvent.clear(input)
    await userEvent.type(input, '2222')
    await userEvent.click(screen.getByRole('button', { name: '复制最终内容' }))
    expect(mock.copied).toEqual(['ssh -p 2222 host'])
  })

  it('copies on Enter from a parameter field', async () => {
    renderDetail(makeItem({ body: 'ssh {{host=box}}' }))
    await userEvent.type(screen.getByLabelText('host（默认 box）'), '{Enter}')
    expect(mock.copied).toEqual(['ssh box'])
  })

  it('reports a copy failure instead of claiming success', async () => {
    const failing = install()
    failing.api.app.copy = () => Promise.resolve({ ok: false, error: '剪贴板不可用' })
    window.commandShelf = failing.api
    const props = renderDetail(makeItem({ body: 'x' }))

    await userEvent.click(screen.getByRole('button', { name: /复制/ }))
    expect(props.onNotice).toHaveBeenCalledWith('剪贴板不可用', 'bad')
    expect(screen.queryByText('已复制')).not.toBeInTheDocument()
  })

  it('offers to open a link', async () => {
    renderDetail(makeItem({ kind: 'link', body: 'https://example.com' }))
    await userEvent.click(screen.getByRole('button', { name: '打开链接' }))
    expect(mock.callsFor('app:open-external')[0]?.args).toEqual(['https://example.com'])
  })

  it('offers to open a path', async () => {
    renderDetail(makeItem({ kind: 'path', body: 'D:\\Models' }))
    await userEvent.click(screen.getByRole('button', { name: '打开路径' }))
    expect(mock.callsFor('app:open-path')[0]?.args).toEqual(['D:\\Models'])
  })

  it('does not offer link actions for a command', () => {
    renderDetail(makeItem({ kind: 'command' }))
    expect(screen.queryByRole('button', { name: '打开链接' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '打开路径' })).not.toBeInTheDocument()
  })

  it('filters by a tag when one is clicked', async () => {
    const props = renderDetail(makeItem({ tags: ['ssh', '网络'] }))
    await userEvent.click(screen.getByRole('button', { name: '#ssh' }))
    expect(props.onTagClick).toHaveBeenCalledWith('ssh')
  })

  it('exposes edit and delete controls', async () => {
    const props = renderDetail()
    await userEvent.click(screen.getByRole('button', { name: /编辑/ }))
    await userEvent.click(screen.getByRole('button', { name: /删除/ }))
    expect(props.onEdit).toHaveBeenCalledTimes(1)
    expect(props.onDelete).toHaveBeenCalledTimes(1)
  })

  it('shows the collection name when the item has one', () => {
    renderDetail(makeItem({ collectionId: 'c1' }), {
      collection: { id: 'c1', name: '服务器', sortOrder: 0, createdAt: '', itemCount: 1 },
    })
    expect(screen.getByText('服务器')).toBeInTheDocument()
  })
})
