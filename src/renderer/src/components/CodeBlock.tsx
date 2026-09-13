import { useMemo } from 'react'

import { splitTemplate } from '@shared/template'

import { highlightToHtml } from '../lib/highlight'
import { cx } from './ui'

/**
 * Renders a body with syntax highlighting and template variables drawn as
 * chips.
 *
 * Variables are React elements rather than highlighted text, so a placeholder
 * is never handed to the tokenizer and a half-written `{{` cannot corrupt the
 * highlighted output.
 */
export function CodeBlock({
  body,
  language,
  values,
  className,
  interactive = true,
}: {
  body: string
  language?: string | null
  /** When provided, variables render as their filled-in value. */
  values?: Readonly<Record<string, string>>
  className?: string
  /** Draw placeholders as chips (false for a plain preview). */
  interactive?: boolean
}) {
  const nodes = useMemo(() => {
    return splitTemplate(body).map((segment, index) => {
      if (segment.type === 'variable') {
        const filled =
          values !== undefined && Object.prototype.hasOwnProperty.call(values, segment.name)
        if (filled) {
          return (
            <span key={index} className="text-[var(--cs-text)]">
              {values?.[segment.name] ?? ''}
            </span>
          )
        }
        // Fall back to the default so a template reads as a real command, but
        // keep the chip styling so it is obvious the value is only a default.
        const shown = segment.defaultValue || segment.name
        return (
          <span
            key={index}
            className={interactive ? 'cs-variable' : undefined}
            title={`{{${segment.name}}}`}
            data-variable={segment.name}
          >
            {shown}
          </span>
        )
      }
      return (
        <span
          key={index}
          // Safe: `Prism.highlight` escapes the source it is handed. See lib/highlight.ts.
          dangerouslySetInnerHTML={{ __html: highlightToHtml(segment.value, language) }}
        />
      )
    })
  }, [body, language, values, interactive])

  return <pre className={cx('code', className)}>{nodes}</pre>
}
