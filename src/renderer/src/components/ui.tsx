import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

import { KIND_META } from '@shared/kinds'
import type { ItemKind } from '@shared/types'

import { Icon, type IconName } from './Icon'

/** Joins class names, dropping falsy entries. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'default' | 'ghost' | 'danger'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--cs-accent)] text-[#0d1117] border-transparent hover:brightness-110 active:brightness-95',
  default:
    'bg-[var(--cs-surface-2)] text-[var(--cs-text)] border-[var(--cs-border)] hover:bg-[var(--cs-surface-3)] hover:border-[var(--cs-border-strong)]',
  ghost:
    'bg-transparent text-[var(--cs-muted)] border-transparent hover:bg-[var(--cs-surface-2)] hover:text-[var(--cs-text)]',
  danger:
    'bg-transparent text-[var(--cs-bad)] border-[var(--cs-border)] hover:bg-[color-mix(in_srgb,var(--cs-bad)_14%,transparent)] hover:border-[var(--cs-bad)]',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  icon?: IconName
}

export function Button({
  variant = 'default',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md border font-medium whitespace-nowrap transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'h-6.5 px-2 text-[12px]' : 'h-8 px-3 text-[12.5px]',
        BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {icon ? <Icon name={icon} size={size === 'sm' ? 13 : 14} /> : null}
      {children}
    </button>
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  label: string
  variant?: ButtonVariant
  size?: number
  active?: boolean
}

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 15,
  active,
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      {...rest}
      className={cx(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-45',
        BUTTON_VARIANTS[variant],
        active && 'text-[var(--cs-accent)]',
        className,
      )}
    >
      <Icon name={icon} size={size} />
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Labels and badges                                                          */
/* -------------------------------------------------------------------------- */

export function Badge({
  children,
  tone = 'neutral',
  title,
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'good' | 'warn' | 'bad'
  title?: string
  className?: string
}) {
  const tones: Record<string, string> = {
    neutral: 'border-[var(--cs-border-strong)] text-[var(--cs-muted)]',
    accent: 'border-[var(--cs-accent)] text-[var(--cs-accent)]',
    good: 'border-[var(--cs-good)] text-[var(--cs-good)]',
    warn: 'border-[var(--cs-warn)] text-[var(--cs-warn)]',
    bad: 'border-[var(--cs-bad)] text-[var(--cs-bad)]',
  }
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center rounded-full border px-2 py-[1px] text-[11px] leading-[16px] font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

const KIND_ICONS: Record<ItemKind, IconName> = {
  command: 'terminal',
  prompt: 'sparkles',
  snippet: 'braces',
  link: 'link',
  path: 'folder',
}

export function KindBadge({ kind, className }: { kind: ItemKind; className?: string }) {
  const meta = KIND_META[kind]
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-[1px] text-[11px] leading-[16px] font-medium whitespace-nowrap',
        className,
      )}
      style={{
        color: meta.colorVar,
        borderColor: `color-mix(in srgb, ${meta.colorVar} 45%, transparent)`,
      }}
    >
      <Icon name={KIND_ICONS[kind]} size={11} />
      {meta.label}
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="mono inline-flex h-5 min-w-5 items-center justify-center rounded border border-[var(--cs-border)] bg-[var(--cs-surface-2)] px-1 text-[10.5px] text-[var(--cs-muted)]">
      {children}
    </kbd>
  )
}

export function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-[12.5px] text-[var(--cs-muted)]">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Form controls                                                              */
/* -------------------------------------------------------------------------- */

const CONTROL_CLASS = cx(
  'w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-surface-2)] px-2.5 py-1.5',
  'text-[12.5px] text-[var(--cs-text)] placeholder:text-[var(--cs-faint)]',
  'transition-colors hover:border-[var(--cs-border-strong)] focus:border-[var(--cs-accent)] focus:outline-none',
)

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(CONTROL_CLASS, 'h-8', className)} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...rest} className={cx(CONTROL_CLASS, 'mono resize-y leading-[1.6]', className)} />
  )
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(CONTROL_CLASS, 'h-8 cursor-pointer pr-6', className)}>
      {children}
    </select>
  )
}

/**
 * A labelled form row.
 *
 * By default the control is wrapped in a real `<label>`, which associates the
 * two without the caller having to invent ids — and makes the whole row a click
 * target for focusing the field.
 *
 * A set of buttons has no single control to label, and putting interactive
 * elements inside a `<label>` is invalid HTML that swallows clicks, so those
 * rows pass `as="group"` and get an ARIA group instead.
 */
export function Field({
  label,
  hint,
  children,
  as = 'label',
  className,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  as?: 'label' | 'group'
  className?: string
}) {
  const heading = (
    <span className="text-[11px] font-semibold tracking-[0.05em] text-[var(--cs-muted)] uppercase">
      {label}
    </span>
  )

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {as === 'label' ? (
        <label className="flex flex-col gap-1.5">
          {heading}
          {children}
        </label>
      ) : (
        <div role="group" aria-label={label} className="flex flex-col gap-1.5">
          {heading}
          {children}
        </div>
      )}
      {hint ? <p className="text-[11.5px] text-[var(--cs-faint)]">{hint}</p> : null}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint?: ReactNode
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-[13px] font-medium">
          {label}
        </label>
        {hint ? <p className="mt-0.5 text-[11.5px] text-[var(--cs-faint)]">{hint}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors',
          checked
            ? 'border-transparent bg-[var(--cs-accent)]'
            : 'border-[var(--cs-border-strong)] bg-[var(--cs-surface-2)]',
        )}
      >
        <span
          className={cx(
            'absolute top-[2px] h-3.5 w-3.5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[19px]' : 'left-[2px]',
          )}
        />
      </button>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* States                                                                     */
/* -------------------------------------------------------------------------- */

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="animate-spin"
      aria-hidden="true"
      fill="none"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.22" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function EmptyState({
  icon = 'inbox',
  title,
  description,
  action,
}: {
  icon?: IconName
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--cs-border)] bg-[var(--cs-surface)] text-[var(--cs-faint)]">
        <Icon name={icon} size={20} />
      </div>
      <p className="text-[13.5px] font-medium">{title}</p>
      {description ? (
        <p className="max-w-[380px] text-[12.5px] leading-relaxed text-[var(--cs-muted)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export function Banner({
  tone = 'info',
  children,
  action,
}: {
  tone?: 'info' | 'warn' | 'bad' | 'good'
  children: ReactNode
  action?: ReactNode
}) {
  const icon: Record<string, IconName> = {
    info: 'info',
    warn: 'alert',
    bad: 'alert',
    good: 'check',
  }
  const color: Record<string, string> = {
    info: 'var(--cs-accent)',
    warn: 'var(--cs-warn)',
    bad: 'var(--cs-bad)',
    good: 'var(--cs-good)',
  }
  return (
    <div
      className="flex items-start gap-2 rounded-md border px-3 py-2 text-[12.5px]"
      style={{
        borderColor: `color-mix(in srgb, ${color[tone]} 40%, var(--cs-border))`,
        background: `color-mix(in srgb, ${color[tone]} 9%, transparent)`,
      }}
    >
      <span className="mt-[1px] shrink-0" style={{ color: color[tone] }}>
        <Icon name={icon[tone]} size={14} />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                      */
/* -------------------------------------------------------------------------- */

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = 620,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    // Focus the first control so the dialog is immediately keyboard-usable.
    const first = ref.current?.querySelector<HTMLElement>(
      'input, textarea, select, button, [tabindex]:not([tabindex="-1"])',
    )
    first?.focus()
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 p-6 pt-[7vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="surface w-full shadow-2xl"
        style={{ maxWidth: width }}
      >
        <header className="flex items-center justify-between border-b border-[var(--cs-border)] px-4 py-2.5">
          <h2 className="text-[13.5px] font-semibold">{title}</h2>
          <IconButton icon="x" label="关闭" onClick={onClose} />
        </header>
        <div className="px-4 py-3.5">{children}</div>
        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-[var(--cs-border)] px-4 py-2.5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认',
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      width={440}
      footer={
        <>
          <Button onClick={onCancel}>取消</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[12.5px] leading-relaxed text-[var(--cs-muted)]">{message}</div>
    </Modal>
  )
}

/* -------------------------------------------------------------------------- */
/* Toasts                                                                     */
/* -------------------------------------------------------------------------- */

export interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastEntry {
  id: number
  message: string
  tone: 'info' | 'good' | 'bad'
  action?: ToastAction
}

interface ToastApi {
  show: (message: string, options?: { tone?: ToastEntry['tone']; action?: ToastAction }) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const nextId = useRef(1)

  const show = useCallback<ToastApi['show']>((message, options) => {
    const id = nextId.current++
    setToasts((current) => [
      ...current.slice(-3),
      { id, message, tone: options?.tone ?? 'info', action: options?.action },
    ])
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((entry) => entry.id !== id))
  }, [])

  const api = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            entry={toast}
            onDismiss={() => dismiss(toast.id)}
            onAction={() => {
              toast.action?.onClick()
              dismiss(toast.id)
            }}
          />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function Toast({
  entry,
  onDismiss,
  onAction,
}: {
  entry: ToastEntry
  onDismiss: () => void
  onAction: () => void
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, entry.action ? 6500 : 2600)
    return () => window.clearTimeout(timer)
  }, [entry.action, onDismiss])

  const color: Record<string, string> = {
    info: 'var(--cs-border-strong)',
    good: 'var(--cs-good)',
    bad: 'var(--cs-bad)',
  }

  return (
    <div
      role="status"
      className="surface pointer-events-auto flex items-center gap-3 px-3 py-2 shadow-xl"
      style={{ borderColor: color[entry.tone] }}
    >
      <span className="text-[12.5px]">{entry.message}</span>
      {entry.action ? (
        <button
          type="button"
          onClick={onAction}
          className="text-[12.5px] font-medium text-[var(--cs-accent)] hover:underline"
        >
          {entry.action.label}
        </button>
      ) : null}
    </div>
  )
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast 必须在 ToastProvider 内使用')
  return context
}
