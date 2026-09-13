import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { parseTemplate } from '@shared/template'

import { VariableForm } from '../VariableForm'

function setup(body: string, values?: Record<string, string>) {
  const variables = parseTemplate(body)
  const initial = values ?? Object.fromEntries(variables.map((v) => [v.name, v.defaultValue]))
  const onChange = vi.fn()
  const onSubmit = vi.fn()

  const view = render(
    <VariableForm variables={variables} values={initial} onChange={onChange} onSubmit={onSubmit} />,
  )
  return { ...view, onChange, onSubmit, variables }
}

describe('VariableForm', () => {
  it('labels each variable, showing its default', () => {
    setup('ssh -L {{local_port=8888}}:{{server}}')
    expect(screen.getByLabelText('local_port（默认 8888）')).toHaveValue('8888')
    expect(screen.getByLabelText('server')).toHaveValue('')
  })

  it('reports how many parameters are still blank', () => {
    setup('{{a}} {{b}} {{c=3}}')
    expect(screen.getByText(/还有 2 个参数没有填写/)).toBeInTheDocument()
    expect(screen.getByText(/a、b/)).toBeInTheDocument()
  })

  it('shows no warning when every parameter has a value', () => {
    setup('{{a=1}} {{b=2}}')
    expect(screen.queryByText(/没有填写/)).not.toBeInTheDocument()
  })

  it('marks a blank input as invalid', () => {
    setup('{{a}} {{b=2}}')
    expect(screen.getByLabelText('a')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('b（默认 2）')).toHaveAttribute('aria-invalid', 'false')
  })

  it('reports edits to the parent', async () => {
    const { onChange } = setup('{{a}}')
    await userEvent.type(screen.getByLabelText('a'), 'x')
    expect(onChange).toHaveBeenCalledWith('a', 'x')
  })

  it('submits on Enter when complete', async () => {
    const { onSubmit } = setup('{{a=1}}')
    await userEvent.type(screen.getByLabelText('a（默认 1）'), '{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('does not submit on Enter while something is blank', async () => {
    const { onSubmit } = setup('{{a}}')
    await userEvent.type(screen.getByLabelText('a'), '{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('treats whitespace as blank', () => {
    setup('{{a}}', { a: '   ' })
    expect(screen.getByText(/还有 1 个参数没有填写/)).toBeInTheDocument()
  })

  it('renders a Chinese variable name', () => {
    setup('复制到 {{目标目录=./out}}')
    expect(screen.getByLabelText('目标目录（默认 ./out）')).toHaveValue('./out')
  })
})
