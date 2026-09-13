import { useState } from 'react'

import { Button, Field, Input, Modal } from './ui'

/**
 * A one-field dialog, used for creating and renaming collections and tags.
 *
 * The caller mounts this only while it is open and keys it by what is being
 * edited, so the initial value comes from props rather than being synced in.
 */
export function TextPromptDialog({
  title,
  label,
  placeholder,
  initialValue = '',
  confirmLabel = '确定',
  onConfirm,
  onCancel,
}: {
  title: string
  label: string
  placeholder?: string
  initialValue?: string
  confirmLabel?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initialValue)

  const submit = () => {
    const trimmed = value.trim()
    if (trimmed) onConfirm(trimmed)
  }

  return (
    <Modal
      open
      title={title}
      onClose={onCancel}
      width={400}
      footer={
        <>
          <Button onClick={onCancel}>取消</Button>
          <Button variant="primary" disabled={!value.trim()} onClick={submit}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Field label={label}>
        <Input
          value={value}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submit()
            }
          }}
        />
      </Field>
    </Modal>
  )
}
