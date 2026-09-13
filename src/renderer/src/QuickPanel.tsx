import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
  type RefObject,
} from 'react'

import { titleFromBody } from '@shared/format'
import { KIND_META } from '@shared/kinds'
import { defaultValues, fillTemplate, parseTemplate } from '@shared/template'
import type { Item, Settings } from '@shared/types'

import { CodeBlock } from './components/CodeBlock'
import { Icon } from './components/Icon'
import { VariableForm } from './components/VariableForm'
import { Badge, Kbd, Spinner, cx } from './components/ui'
import { useLibrary } from './hooks/useLibrary'
import { useTheme } from './hooks/useTheme'
import { api } from './lib/api'

/**
 * The global-hotkey quick panel.
 *
 * The whole point of the app: type two or three letters, press Enter, and the
 * text is on the clipboard with the panel gone. Everything here is arranged
 * around keeping that path short — no confirmations, no navigation, and the
 * previous application gets focus back because the window is merely hidden.
 */

type Mode = 'search' | 'variables'

export function QuickPanel() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [mode, setMode] = useState<Mode>('search')
  const [index, setIndex] = useState(0)
  const [active, setActive] = useState<Item | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const selectedRef = useRef<HTMLDivElement>(null)

  const library = useLibrary({
    initialQuery: { sort: 'recent', limit: 8 },
    debounceMs: 0,
  })

  // Stable pieces, so the effects below do not re-subscribe on every render.
  const setQuery = library.setQuery
  const items = library.items

  // Clamped rather than reset by an effect: the list can shrink under the
  // cursor when data changes, and this keeps the highlight in range.
  const activeIndex = items.length === 0 ? 0 : Math.min(index, items.length - 1)

  useTheme(settings?.theme ?? 'dark')

  /* ------------------------------------------------------------- settings */

  useEffect(() => {
    void (async () => {
      const result = await api.settings.get()
      if (result.ok) {
        setSettings(result.data)
        setQuery({ limit: result.data.panelMaxResults })
      }
    })()
    // Runs once: the panel is a long-lived hidden window, and a settings change
    // from the main window arrives through the data-changed event below.
  }, [setQuery])

  useEffect(() => {
    return api.app.onDataChanged(() => {
      void api.settings.get().then((result) => {
        if (result.ok) {
          setSettings(result.data)
          setQuery({ limit: result.data.panelMaxResults })
        }
      })
    })
  }, [setQuery])

  /* ---------------------------------------------------------------- reset */

  const reset = useCallback(() => {
    setMode('search')
    setIndex(0)
    setActive(null)
    setValues({})
    setNotice(null)
    setCopied(null)
    setQuery({ text: '', sort: 'recent' })
    inputRef.current?.focus()
  }, [setQuery])

  useEffect(() => api.app.onPanelOpened(reset), [reset])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, mode])

  /* ---------------------------------------------------------------- copy */

  const finish = useCallback(
    (item: Item) => {
      setCopied(item.id)
      // A short beat so the tick is actually visible before the panel vanishes.
      window.setTimeout(() => {
        setCopied(null)
        if (settings?.hideAfterCopy !== false) void api.app.hidePanel()
      }, 170)
    },
    [settings],
  )

  const copy = useCallback(
    async (item: Item, text: string) => {
      const result = await api.app.copy(text)
      if (!result.ok) {
        setNotice(result.error)
        return
      }
      await api.items.markUsed(item.id)
      finish(item)
    },
    [finish],
  )

  const openVariables = useCallback((item: Item) => {
    setActive(item)
    setValues(defaultValues(item.body))
    setMode('variables')
    setNotice(null)
  }, [])

  const activate = useCallback(
    (item: Item) => {
      if (parseTemplate(item.body).length > 0) {
        openVariables(item)
        return
      }
      void copy(item, item.body)
    },
    [copy, openVariables],
  )

  const submitVariables = useCallback(() => {
    if (!active) return
    void copy(active, fillTemplate(active.body, values))
  }, [active, copy, values])

  /* ------------------------------------------------------------ shortcuts */

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (mode === 'variables') {
          setMode('search')
          setActive(null)
          window.setTimeout(() => inputRef.current?.focus(), 0)
        } else {
          void api.app.hidePanel()
        }
        return
      }

      if (mode === 'variables') {
        if (event.key === 'Enter' && !event.shiftKey) {
          // The form's own handler covers Enter inside an input; this catches
          // Enter pressed while focus is elsewhere in the panel.
          const target = event.target as HTMLElement
          if (target.tagName !== 'INPUT') {
            event.preventDefault()
            submitVariables()
          }
        }
        return
      }

      if (items.length === 0) return

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setIndex((value) => (value + 1) % items.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setIndex((value) => (value - 1 + items.length) % items.length)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        const item = items[activeIndex]
        if (item) activate(item)
      } else if (event.key === 'Tab') {
        const item = items[activeIndex]
        if (item && parseTemplate(item.body).length > 0) {
          event.preventDefault()
          openVariables(item)
        }
      }
    },
    [activate, activeIndex, items, mode, openVariables, submitVariables],
  )

  /* ---------------------------------------------------------------- render */

  const variables = useMemo(
    () => (active && mode === 'variables' ? parseTemplate(active.body) : []),
    [active, mode],
  )

  const preview = useMemo(
    () => (active && mode === 'variables' ? fillTemplate(active.body, values) : ''),
    [active, mode, values],
  )

  const cardWidth = settings?.panelWidth ?? 680

  return (
    <div className="h-full w-full p-4" onKeyDown={onKeyDown}>
      <div
        className="cs-panel-card surface flex h-full flex-col overflow-hidden"
        style={{ width: cardWidth, borderRadius: 14, margin: '0 auto' }}
      >
        {mode === 'search' ? (
          <SearchView
            inputRef={inputRef}
            library={library}
            index={activeIndex}
            copied={copied}
            notice={notice}
            selectedRef={selectedRef}
            onHover={setIndex}
            onActivate={activate}
            onQueryChange={(next) => {
              // Typing always moves the highlight back to the best match.
              setIndex(0)
              setQuery({ text: next, sort: next.trim() ? 'relevance' : 'recent' })
            }}
          />
        ) : (
          <VariablesView
            item={active}
            variables={variables}
            values={values}
            preview={preview}
            notice={notice}
            onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))}
            onSubmit={submitVariables}
          />
        )}

        <footer className="flex shrink-0 items-center gap-3 border-t border-[var(--cs-border)] bg-[var(--cs-surface-2)] px-3 py-1.5 text-[11px] text-[var(--cs-faint)]">
          {mode === 'search' ? (
            <>
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> 选择
              </span>
              <span className="flex items-center gap-1">
                <Kbd>↵</Kbd> 复制
              </span>
              <span className="flex items-center gap-1">
                <Kbd>Tab</Kbd> 填充变量
              </span>
              <span className="flex items-center gap-1">
                <Kbd>Esc</Kbd> 关闭
              </span>
              <span className="ml-auto flex items-center gap-2">
                {library.loading ? <Spinner size={11} /> : null}
                <span className="tabular-nums">
                  {library.counts ? `${library.items.length}/${library.counts.all}` : ''}
                </span>
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1">
                <Kbd>↵</Kbd> 复制
              </span>
              <span className="flex items-center gap-1">
                <Kbd>Esc</Kbd> 返回
              </span>
              <span className="ml-auto">参数只影响这一次复制，不会修改原条目</span>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Search mode                                                                */
/* -------------------------------------------------------------------------- */

function SearchView({
  inputRef,
  library,
  index,
  copied,
  notice,
  selectedRef,
  onHover,
  onActivate,
  onQueryChange,
}: {
  inputRef: RefObject<HTMLInputElement | null>
  library: ReturnType<typeof useLibrary>
  index: number
  copied: string | null
  notice: string | null
  selectedRef: RefObject<HTMLDivElement | null>
  onHover: (index: number) => void
  onActivate: (item: Item) => void
  onQueryChange: (text: string) => void
}) {
  return (
    <>
      <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--cs-border)] px-3.5 py-2.5">
        <span className="text-[var(--cs-faint)]">
          <Icon name="search" size={17} />
        </span>
        <input
          ref={inputRef}
          value={library.query.text}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="输入命令、提示词、标签…"
          aria-label="搜索"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-[14.5px] text-[var(--cs-text)] placeholder:text-[var(--cs-faint)] focus:outline-none"
        />
        {library.loading ? <Spinner size={13} /> : null}
      </div>

      {notice ? (
        <div className="shrink-0 border-b border-[var(--cs-border)] px-3.5 py-1.5 text-[11.5px] text-[var(--cs-bad)]">
          {notice}
        </div>
      ) : null}

      <div className="scroll-area min-h-0 flex-1 p-1.5" role="listbox" aria-label="搜索结果">
        {library.items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
            <p className="text-[13px] text-[var(--cs-muted)]">
              {library.query.text ? '没有匹配的内容' : '架子还是空的'}
            </p>
            <p className="text-[11.5px] text-[var(--cs-faint)]">
              {library.query.text
                ? '换个关键词，或到主窗口新建一条'
                : '打开主窗口，添加第一条命令或提示词'}
            </p>
          </div>
        ) : (
          library.items.map((item, position) => (
            <PanelRow
              key={item.id}
              ref={position === index ? selectedRef : undefined}
              item={item}
              selected={position === index}
              copied={copied === item.id}
              onMouseEnter={() => onHover(position)}
              onActivate={() => onActivate(item)}
            />
          ))
        )}
      </div>
    </>
  )
}

function PanelRow({
  item,
  selected,
  copied,
  onMouseEnter,
  onActivate,
  ref,
}: {
  item: Item
  selected: boolean
  copied: boolean
  onMouseEnter: () => void
  onActivate: () => void
  ref?: Ref<HTMLDivElement>
}) {
  const meta = KIND_META[item.kind]
  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selected}
      onMouseEnter={onMouseEnter}
      onClick={onActivate}
      className={cx(
        'relative cursor-pointer overflow-hidden rounded-lg border px-2.5 py-1.5 transition-colors',
        selected
          ? 'border-[color-mix(in_srgb,var(--cs-accent)_50%,var(--cs-border))] bg-[color-mix(in_srgb,var(--cs-accent)_11%,var(--cs-surface))]'
          : 'border-transparent',
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-0 w-[3px] rounded-full"
        style={{ background: meta.colorVar, opacity: selected ? 1 : 0.45 }}
      />
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.title}</span>
        {item.favorite ? (
          <span className="shrink-0 text-[var(--cs-warn)]">
            <Icon name="starFilled" size={11} />
          </span>
        ) : null}
        <span className="shrink-0 text-[10.5px]" style={{ color: meta.colorVar }}>
          {meta.label}
        </span>
        {copied ? (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-[var(--cs-good)]">
            <Icon name="check" size={12} /> 已复制
          </span>
        ) : null}
      </div>
      {item.body ? (
        <CodeBlock
          body={item.body}
          language={item.language}
          interactive={false}
          className="clamp-2 mt-0.5 text-[11.5px] text-[var(--cs-muted)]"
        />
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Variable mode                                                              */
/* -------------------------------------------------------------------------- */

function VariablesView({
  item,
  variables,
  values,
  preview,
  notice,
  onChange,
  onSubmit,
}: {
  item: Item | null
  variables: ReturnType<typeof parseTemplate>
  values: Record<string, string>
  preview: string
  notice: string | null
  onChange: (name: string, value: string) => void
  onSubmit: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Switching to this view unmounts the search box, which would otherwise leave
  // focus on the document body — outside the panel's key handler, so Enter and
  // Escape would stop working. Focus the first field so typing can continue.
  useEffect(() => {
    if (!item) return
    containerRef.current?.querySelector('input')?.focus()
  }, [item])

  if (!item) return null

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--cs-border)] px-3.5 py-2.5">
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
          {item.title || titleFromBody(item.body, KIND_META[item.kind].label)}
        </span>
        <Badge tone="accent">{variables.length} 个参数</Badge>
      </div>

      <div ref={containerRef} className="scroll-area min-h-0 flex-1 px-3.5 py-3">
        <VariableForm
          variables={variables}
          values={values}
          onChange={onChange}
          onSubmit={onSubmit}
        />

        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-semibold tracking-[0.05em] text-[var(--cs-muted)] uppercase">
            最终内容
          </p>
          <div className="rounded-md border border-[var(--cs-border)] bg-[var(--cs-surface-2)] px-2.5 py-2">
            <CodeBlock body={preview} language={item.language} values={{}} />
          </div>
        </div>

        {notice ? <p className="mt-2 text-[11.5px] text-[var(--cs-bad)]">{notice}</p> : null}
      </div>
    </>
  )
}
