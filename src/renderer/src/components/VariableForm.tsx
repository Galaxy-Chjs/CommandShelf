import { describeVariable, type TemplateVariable } from '@shared/template'

import { Field, Input, cx } from './ui'

/**
 * The fill-in form shown before copying a template.
 *
 * Values start from each placeholder's default, so the common case is pressing
 * Enter; the copy button is disabled only when something is genuinely blank.
 */
export function VariableForm({
  variables,
  values,
  onChange,
  onSubmit,
  className,
}: {
  variables: TemplateVariable[]
  values: Readonly<Record<string, string>>
  onChange: (name: string, value: string) => void
  onSubmit: () => void
  className?: string
}) {
  const missing = variables
    .filter((variable) => !(values[variable.name] ?? '').trim())
    .map((variable) => variable.name)
  const complete = missing.length === 0

  return (
    <div className={cx('flex flex-col gap-3', className)}>
      <div className="grid grid-cols-2 gap-3">
        {variables.map((variable) => (
          <Field key={variable.name} label={describeVariable(variable)}>
            <Input
              value={values[variable.name] ?? ''}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={!complete && missing.includes(variable.name)}
              onChange={(event) => onChange(variable.name, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && complete) {
                  event.preventDefault()
                  onSubmit()
                }
              }}
            />
          </Field>
        ))}
      </div>
      {!complete ? (
        <p className="text-[11.5px] text-[var(--cs-warn)]">
          还有 {missing.length} 个参数没有填写：{missing.join('、')}
        </p>
      ) : null}
    </div>
  )
}
