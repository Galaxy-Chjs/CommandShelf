import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { makeItem } from '../../test/mock-api'
import { ItemCard } from '../ItemCard'

function setup(item = makeItem(), overrides: Partial<Parameters<typeof ItemCard>[0]> = {}) {
  const onActivate = vi.fn()
  const onCopy = vi.fn()
  const onToggleFavorite = vi.fn()

  render(
    <ItemCard
      item={item}
      selected={false}
      onActivate={onActivate}
      onCopy={onCopy}
      onToggleFavorite={onToggleFavorite}
      {...overrides}
    />,
  )
  return { onActivate, onCopy, onToggleFavorite }
}

describe('ItemCard', () => {
  it('shows the title, kind and body preview', () => {
    setup(makeItem({ title: '端口转发', body: 'ssh -L 8080:localhost:80', kind: 'command' }))
    expect(screen.getByText('端口转发')).toBeInTheDocument()
    expect(screen.getByText('命令')).toBeInTheDocument()
    expect(screen.getByText(/ssh -L 8080/)).toBeInTheDocument()
  })

  it('shows every kind with its own label', () => {
    const labels = {
      command: '命令',
      prompt: '提示词',
      snippet: '代码片段',
      link: '链接',
      path: '路径',
    }
    for (const [kind, label] of Object.entries(labels)) {
      const { unmount } = render(
        <ItemCard item={makeItem({ kind: kind as never })} selected={false} onActivate={vi.fn()} />,
      )
      expect(screen.getByText(label)).toBeInTheDocument()
      unmount()
    }
  })

  it('lists tags', () => {
    setup(makeItem({ tags: ['ssh', '网络'] }))
    expect(screen.getByText('#ssh')).toBeInTheDocument()
    expect(screen.getByText('#网络')).toBeInTheDocument()
  })

  it('summarises the remaining tags', () => {
    setup(makeItem({ tags: ['a', 'b', 'c', 'd', 'e', 'f'] }))
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('shows usage and last-used time', () => {
    setup(makeItem({ useCount: 12, lastUsedAt: new Date().toISOString() }))
    expect(screen.getByText(/用过 12 次/)).toBeInTheDocument()
  })

  it('says 从未使用 for an unused item', () => {
    setup(makeItem({ useCount: 0, lastUsedAt: null }))
    expect(screen.getByText(/从未使用/)).toBeInTheDocument()
  })

  it('activates on click', async () => {
    const { onActivate } = setup(makeItem({ title: 'click me' }))
    await userEvent.click(screen.getByText('click me'))
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('copies without activating', async () => {
    const { onActivate, onCopy } = setup()
    await userEvent.click(screen.getByRole('button', { name: '复制' }))
    expect(onCopy).toHaveBeenCalledTimes(1)
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('toggles the favourite without activating', async () => {
    const { onActivate, onToggleFavorite } = setup()
    await userEvent.click(screen.getByRole('button', { name: '收藏' }))
    expect(onToggleFavorite).toHaveBeenCalledTimes(1)
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('offers 取消收藏 for a favourited item', () => {
    setup(makeItem({ favorite: true }))
    expect(screen.getByRole('button', { name: '取消收藏' })).toBeInTheDocument()
  })

  it('exposes selection state to assistive technology', () => {
    render(<ItemCard item={makeItem()} selected onActivate={vi.fn()} />)
    expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'true')
  })

  it('renders a favourite marker when there is no toggle handler', () => {
    render(<ItemCard item={makeItem({ favorite: true })} selected={false} onActivate={vi.fn()} />)
    expect(screen.getByTitle('已收藏')).toBeInTheDocument()
  })

  it('omits the copy button when there is no handler', () => {
    render(<ItemCard item={makeItem()} selected={false} onActivate={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '复制' })).not.toBeInTheDocument()
  })
})
