import { describe, expect, it } from 'vitest'

import {
  defaultValues,
  describeVariable,
  fillTemplate,
  hasVariables,
  isTemplateComplete,
  missingVariables,
  parseTemplate,
  splitTemplate,
  variableNames,
} from '@shared/template'

describe('parseTemplate', () => {
  it('reads a placeholder without a default', () => {
    expect(parseTemplate('ssh {{server}}')).toEqual([
      { name: 'server', defaultValue: '', hasDefault: false },
    ])
  })

  it('reads a placeholder with a default', () => {
    expect(parseTemplate('ssh -p {{port=2222}} host')).toEqual([
      { name: 'port', defaultValue: '2222', hasDefault: true },
    ])
  })

  it('keeps first-appearance order and reports repeats once', () => {
    const body = '{{b}} {{a}} {{b=2}} {{c}}'
    expect(variableNames(body)).toEqual(['b', 'a', 'c'])
  })

  it('lets the first default win for a repeated name', () => {
    expect(parseTemplate('{{a=1}} {{a=2}}')).toEqual([
      { name: 'a', defaultValue: '1', hasDefault: true },
    ])
  })

  it('tolerates whitespace inside the braces', () => {
    expect(variableNames('{{  spaced  }}')).toEqual(['spaced'])
  })

  it('allows dots, dashes, underscores and digits in names', () => {
    expect(variableNames('{{a.b-c_d1}}')).toEqual(['a.b-c_d1'])
  })

  it('leaves malformed placeholders alone', () => {
    expect(parseTemplate('echo {{}} {{=x}} {{unclosed')).toEqual([])
  })

  it('leaves an unclosed placeholder alone', () => {
    expect(hasVariables('echo {{oops')).toBe(false)
  })

  it('finds placeholders in Chinese content', () => {
    expect(variableNames('把 {{文件}} 复制到 {{目标目录}}')).toEqual(['文件', '目标目录'])
  })

  it('does not leak regex state between calls', () => {
    // A shared /g regex would make the second call start where the first ended.
    const body = '{{a}} {{b}}'
    expect(variableNames(body)).toEqual(['a', 'b'])
    expect(variableNames(body)).toEqual(['a', 'b'])
    expect(hasVariables(body)).toBe(true)
    expect(hasVariables('no variables')).toBe(false)
    expect(variableNames(body)).toEqual(['a', 'b'])
  })
})

describe('fillTemplate', () => {
  it('substitutes provided values', () => {
    expect(fillTemplate('ssh {{host}} -p {{port}}', { host: 'box', port: '22' })).toBe(
      'ssh box -p 22',
    )
  })

  it('keeps the placeholder when a value is missing', () => {
    expect(fillTemplate('ssh {{host}} -p {{port}}', { host: 'box' })).toBe('ssh box -p {{port}}')
  })

  it('substitutes an explicitly empty value', () => {
    expect(fillTemplate('x{{gap}}y', { gap: '' })).toBe('xy')
  })

  it('replaces every occurrence of a repeated variable', () => {
    expect(fillTemplate('{{a}}-{{a}}', { a: 'z' })).toBe('z-z')
  })

  it('handles values containing regex replacement syntax', () => {
    // `$&` and `$1` are special in String.replace; the callback form avoids that.
    expect(fillTemplate('{{a}}', { a: '$&$1$`' })).toBe('$&$1$`')
  })

  it('replaces a default-bearing placeholder', () => {
    expect(fillTemplate('port={{p=80}}', { p: '443' })).toBe('port=443')
  })

  it('leaves malformed placeholders untouched', () => {
    expect(fillTemplate('a {{}} b {{c', {})).toBe('a {{}} b {{c')
  })
})

describe('defaults and completeness', () => {
  it('seeds defaults from the template', () => {
    expect(defaultValues('{{a=1}} {{b}}')).toEqual({ a: '1', b: '' })
  })

  it('reports blank and missing variables as missing', () => {
    expect(missingVariables('{{a}} {{b=2}} {{c=  }}', { a: 'x' })).toEqual(['b', 'c'])
  })

  it('treats whitespace as blank', () => {
    expect(isTemplateComplete('{{a}}', { a: '   ' })).toBe(false)
    expect(isTemplateComplete('{{a}}', { a: 'x' })).toBe(true)
  })

  it('is complete when there are no variables', () => {
    expect(isTemplateComplete('plain text', {})).toBe(true)
  })

  it('describes a variable with its default', () => {
    const [withDefault] = parseTemplate('{{server=user@10.0.0.12}}')
    const [without] = parseTemplate('{{server}}')
    expect(describeVariable(withDefault!)).toBe('server（默认 user@10.0.0.12）')
    expect(describeVariable(without!)).toBe('server')
  })
})

describe('splitTemplate', () => {
  it('splits text around placeholders', () => {
    expect(splitTemplate('ssh {{host}} now')).toEqual([
      { type: 'text', value: 'ssh ' },
      { type: 'variable', name: 'host', defaultValue: '', hasDefault: false },
      { type: 'text', value: ' now' },
    ])
  })

  it('returns a single text segment when there are no variables', () => {
    expect(splitTemplate('nothing here')).toEqual([{ type: 'text', value: 'nothing here' }])
  })

  it('returns nothing for an empty body', () => {
    expect(splitTemplate('')).toEqual([])
  })

  it('handles adjacent placeholders', () => {
    expect(splitTemplate('{{a}}{{b}}')).toEqual([
      { type: 'variable', name: 'a', defaultValue: '', hasDefault: false },
      { type: 'variable', name: 'b', defaultValue: '', hasDefault: false },
    ])
  })

  it('reassembles to the original text when placeholders are restored', () => {
    const body = 'pre {{a=1}} mid {{b}} post'
    const rebuilt = splitTemplate(body)
      .map((segment) =>
        segment.type === 'text'
          ? segment.value
          : `{{${segment.name}${segment.hasDefault ? `=${segment.defaultValue}` : ''}}}`,
      )
      .join('')
    expect(rebuilt).toBe(body)
  })
})
