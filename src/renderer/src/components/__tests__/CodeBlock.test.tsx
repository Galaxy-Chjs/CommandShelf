import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CodeBlock } from '../CodeBlock'

describe('CodeBlock', () => {
  it('renders the body text', () => {
    render(<CodeBlock body="ssh host" />)
    expect(screen.getByText('ssh host')).toBeInTheDocument()
  })

  it('marks a variable so it is visible as a placeholder', () => {
    const { container } = render(<CodeBlock body="ssh {{server}}" />)
    const chip = container.querySelector('[data-variable="server"]')
    expect(chip).not.toBeNull()
    // Without a default, the name itself stands in.
    expect(chip?.textContent).toBe('server')
  })

  it('shows the default value in place of the name', () => {
    const { container } = render(<CodeBlock body="port {{port=8080}}" />)
    expect(container.querySelector('[data-variable="port"]')?.textContent).toBe('8080')
  })

  it('describes the placeholder in a tooltip', () => {
    const { container } = render(<CodeBlock body="{{server=user@host}}" />)
    expect(container.querySelector('[data-variable="server"]')).toHaveAttribute(
      'title',
      '{{server}}',
    )
  })

  it('renders filled values as plain text instead of chips', () => {
    const { container } = render(
      <CodeBlock body="ssh {{server}}" values={{ server: 'user@10.0.0.12' }} />,
    )
    expect(container.querySelector('[data-variable="server"]')).toBeNull()
    expect(screen.getByText(/user@10\.0\.0\.12/)).toBeInTheDocument()
  })

  it('escapes HTML in the body instead of rendering it', () => {
    const { container } = render(<CodeBlock body={'<img src=x onerror="alert(1)">'} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('<img src=x')
  })

  it('escapes HTML inside a highlighted snippet too', () => {
    const { container } = render(
      <CodeBlock body={'x = "<script>alert(1)</script>"'} language="python" />,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<script>')
  })

  it('escapes HTML that looks like a template variable', () => {
    const { container } = render(<CodeBlock body="{{a}}<b>" />)
    expect(container.querySelector('b')).toBeNull()
  })

  it('highlights a known language', () => {
    const { container } = render(<CodeBlock body="def f(): return 1" language="python" />)
    expect(container.querySelector('.hljs-keyword')).not.toBeNull()
  })

  it('does not throw for an unknown language', () => {
    const { container } = render(<CodeBlock body="whatever" language="brainfuck" />)
    expect(container.textContent).toContain('whatever')
  })

  it('maps the CUDA alias onto a real grammar', () => {
    const { container } = render(<CodeBlock body="__global__ void k() {}" language="cuda" />)
    expect(container.textContent).toContain('__global__')
  })

  it('preserves newlines in a multi-line body', () => {
    const { container } = render(<CodeBlock body={'line one\nline two'} />)
    expect(container.textContent).toBe('line one\nline two')
  })

  it('renders an empty body without complaining', () => {
    const { container } = render(<CodeBlock body="" />)
    expect(container.textContent).toBe('')
  })
})
