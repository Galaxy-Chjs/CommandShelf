import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { parseTemplate } from '@shared/template'
import {
  COLLECTION_ALL,
  COLLECTION_NONE,
  SORT_KEYS,
  type AppInfo,
  type Collection,
  type Item,
  type Settings,
  type SortKey,
  type Tag,
} from '@shared/types'
import { KIND_META, SORT_LABELS } from '@shared/kinds'

import { Icon } from './components/Icon'
import { ItemCard } from './components/ItemCard'
import { ItemDetail } from './components/ItemDetail'
import { ItemEditor } from './components/ItemEditor'
import { TextPromptDialog } from './components/TextPromptDialog'
import {
  Banner,
  Button,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Kbd,
  Select,
  Spinner,
  ToastProvider,
  useToast,
  type ToastAction,
} from './components/ui'
import { Sidebar } from './features/Sidebar'
import { SettingsDialog } from './features/SettingsDialog'
import { useLibrary } from './hooks/useLibrary'
import { useTheme } from './hooks/useTheme'
import { api } from './lib/api'
import { describeAccelerator } from './lib/accelerator'

/**
 * The management window.
 *
 * Holds the query, the selection, and the dialogs; everything else is a
 * presentational component. Keyboard handling lives here in one place so the
 * shortcuts stay consistent no matter which pane has focus.
 */

interface ConfirmState {
  title: string
  message: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
}

type PromptState =
  | { kind: 'create-collection' }
  | { kind: 'rename-collection'; collection: Collection }
  | { kind: 'rename-tag'; tag: Tag }

export function App() {
  return (
    <ToastProvider>
      <Workspace />
    </ToastProvider>
  )
}

function Workspace() {
  const toast = useToast()
  const library = useLibrary({ debounceMs: 120 })

  const [settings, setSettings] = useState<Settings | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editorItem, setEditorItem] = useState<Item | null | undefined>(undefined)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [prompt, setPrompt] = useState<PromptState | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const searchRef = useRef<HTMLInputElement>(null)

  // Pulled out of `library` so the key handler can depend on stable values
  // instead of the whole object, which is rebuilt on every render.
  const setQuery = library.setQuery
  const queryText = library.query.text

  useTheme(settings?.theme ?? 'dark')

  const notice = useCallback(
    (message: string, tone: 'info' | 'good' | 'bad' = 'info', action?: ToastAction) => {
      toast.show(message, { tone, action })
    },
    [toast],
  )

  /* --------------------------------------------------------- bootstrapping */

  useEffect(() => {
    void (async () => {
      const [settingsResult, infoResult] = await Promise.all([api.settings.get(), api.app.info()])
      if (settingsResult.ok) setSettings(settingsResult.data)
      if (infoResult.ok) setInfo(infoResult.data)
    })()
  }, [])

  // The hotkey can fail to register, and that only becomes known at startup.
  useEffect(() => {
    return api.app.onDataChanged(() => {
      void api.app.info().then((result) => {
        if (result.ok) setInfo(result.data)
      })
    })
  }, [])

  useEffect(
    () =>
      api.app.onFocusSearch(() => {
        searchRef.current?.focus()
        searchRef.current?.select()
      }),
    [],
  )

  /* ------------------------------------------------------------- selection */

  const items = library.items
  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  )

  const moveSelection = useCallback(
    (delta: number) => {
      if (items.length === 0) return
      const current = items.findIndex((item) => item.id === selectedId)
      const next = current === -1 ? (delta > 0 ? 0 : items.length - 1) : current + delta
      const wrapped = (next + items.length) % items.length
      setSelectedId(items[wrapped]?.id ?? null)
    },
    [items, selectedId],
  )

  /* ------------------------------------------------------------ operations */

  const copyItem = useCallback(
    async (item: Item) => {
      if (parseTemplate(item.body).length > 0) {
        setSelectedId(item.id)
        notice('这条内容含有参数，请在右侧填写后复制')
        return
      }
      const result = await api.app.copy(item.body)
      if (!result.ok) return notice(result.error, 'bad')

      // Keep the visible "用过 N 次" honest without refetching the list.
      const used = await api.items.markUsed(item.id)
      if (used.ok && used.data) library.patchItem(used.data)

      notice('已复制到剪贴板', 'good')
    },
    [library, notice],
  )

  const toggleFavorite = useCallback(
    async (item: Item) => {
      const result = await api.items.setFavorite(item.id, !item.favorite)
      if (!result.ok) notice(result.error, 'bad')
    },
    [notice],
  )

  const deleteItem = useCallback(
    (item: Item) => {
      setConfirm({
        title: '删除条目',
        message: (
          <>
            确定要删除「<span className="font-medium">{item.title}</span>」吗？
            <br />
            删除后可以在提示中撤销。
          </>
        ),
        confirmLabel: '删除',
        danger: true,
        onConfirm: () => {
          setConfirm(null)
          void (async () => {
            const result = await api.items.remove(item.id)
            if (!result.ok) return notice(result.error, 'bad')
            if (selectedId === item.id) setSelectedId(null)
            notice(`已删除「${item.title}」`, 'info', {
              label: '撤销',
              onClick: () => void api.items.restore(item.id),
            })
          })()
        },
      })
    },
    [notice, selectedId],
  )

  /* ------------------------------------------------------------- shortcuts */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      const inMultilineField =
        tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable === true
      const inSearchBox = !!target && target === searchRef.current
      // A single-line input, which may be the search box or a field in a dialog.
      const inInput = tag === 'INPUT'
      const modifier = event.ctrlKey || event.metaKey

      const dialogOpen =
        prompt !== null || confirm !== null || settingsOpen || editorItem !== undefined

      if (modifier && (event.key === 'k' || event.key === 'f')) {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }

      if (event.key === 'Escape') {
        if (dialogOpen) return
        if (inSearchBox && queryText) {
          // Clearing the query is the more useful first step; a second Escape
          // then leaves the field, and a third clears the selection.
          event.preventDefault()
          setQuery({ text: '' })
          return
        }
        if (inInput) {
          target?.blur()
          return
        }
        setSelectedId(null)
        return
      }

      // Moving through the list works straight from the search box, so finding
      // something and copying it never requires leaving the keyboard. Dialog
      // fields are excluded: there, the arrow and Enter keys belong to the form.
      const listNavigation = !dialogOpen && !inMultilineField && (!inInput || inSearchBox)
      if (listNavigation) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          moveSelection(event.key === 'ArrowDown' ? 1 : -1)
          return
        }
        if (event.key === 'Enter' && selected) {
          event.preventDefault()
          void copyItem(selected)
          return
        }
      }

      if (inInput || inMultilineField || modifier) return

      switch (event.key) {
        case '/':
          event.preventDefault()
          searchRef.current?.focus()
          break
        case 'n':
        case 'N':
          event.preventDefault()
          setEditorItem(null)
          break
        case 'e':
        case 'E':
          if (selected) {
            event.preventDefault()
            setEditorItem(selected)
          }
          break
        case 'b':
        case 'B':
          if (selected) {
            event.preventDefault()
            void toggleFavorite(selected)
          }
          break
        case 'Delete':
          if (selected) {
            event.preventDefault()
            deleteItem(selected)
          }
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    confirm,
    copyItem,
    deleteItem,
    editorItem,
    moveSelection,
    prompt,
    queryText,
    selected,
    setQuery,
    settingsOpen,
    toggleFavorite,
  ])
  /* ----------------------------------------------------------- collections */

  const submitPrompt = async (value: string) => {
    if (!prompt) return
    const current = prompt
    setPrompt(null)

    if (current.kind === 'create-collection') {
      const result = await api.collections.create(value)
      if (!result.ok) return notice(result.error, 'bad')
      library.setQuery({ collection: result.data.id })
      return
    }

    if (current.kind === 'rename-collection') {
      const result = await api.collections.rename(current.collection.id, value)
      if (!result.ok) return notice(result.error, 'bad')
      return
    }

    const result = await api.tags.rename(current.tag.name, value)
    if (!result.ok) return notice(result.error, 'bad')
    if (library.query.tag === current.tag.name) library.setQuery({ tag: value })
  }

  /* ---------------------------------------------------------------- render */

  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = []
    if (library.query.favoriteOnly) {
      chips.push({
        key: 'favorite',
        label: '仅收藏',
        clear: () => library.setQuery({ favoriteOnly: false }),
      })
    }
    for (const kind of library.query.kinds) {
      chips.push({
        key: `kind-${kind}`,
        label: KIND_META[kind].label,
        clear: () => library.setQuery({ kinds: library.query.kinds.filter((k) => k !== kind) }),
      })
    }
    if (library.query.collection === COLLECTION_NONE) {
      chips.push({
        key: 'none',
        label: '未分类',
        clear: () => library.setQuery({ collection: COLLECTION_ALL }),
      })
    } else if (library.query.collection !== COLLECTION_ALL) {
      const collection = library.collections.find((entry) => entry.id === library.query.collection)
      chips.push({
        key: 'collection',
        label: collection?.name ?? '分类',
        clear: () => library.setQuery({ collection: COLLECTION_ALL }),
      })
    }
    if (library.query.tag) {
      chips.push({
        key: 'tag',
        label: `#${library.query.tag}`,
        clear: () => library.setQuery({ tag: null }),
      })
    }
    return chips
  }, [library])

  const isPristine =
    library.query.text === '' &&
    !library.query.favoriteOnly &&
    library.query.kinds.length === 0 &&
    library.query.collection === COLLECTION_ALL &&
    library.query.tag === null

  return (
    <div className="flex h-full flex-col bg-[var(--cs-bg)]">
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--cs-border)] px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--cs-accent)] text-[#0d1117]">
            <Icon name="terminal" size={14} />
          </span>
          <span className="text-[13.5px] font-semibold tracking-tight">CommandShelf</span>
        </div>

        <div className="relative mx-auto flex w-full max-w-[520px] items-center">
          <span className="pointer-events-none absolute left-2.5 text-[var(--cs-faint)]">
            <Icon name="search" size={14} />
          </span>
          <input
            ref={searchRef}
            value={library.query.text}
            onChange={(event) => library.setQuery({ text: event.target.value })}
            placeholder="搜索命令、提示词、标签…"
            aria-label="搜索"
            spellCheck={false}
            className="h-8 w-full rounded-md border border-[var(--cs-border)] bg-[var(--cs-surface-2)] pr-8 pl-7.5 text-[12.5px] text-[var(--cs-text)] placeholder:text-[var(--cs-faint)] transition-colors hover:border-[var(--cs-border-strong)] focus:border-[var(--cs-accent)] focus:outline-none"
          />
          {library.query.text ? (
            <button
              type="button"
              aria-label="清除搜索"
              onClick={() => {
                library.setQuery({ text: '' })
                searchRef.current?.focus()
              }}
              className="absolute right-2 text-[var(--cs-faint)] hover:text-[var(--cs-text)]"
            >
              <Icon name="x" size={13} />
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          {library.loading ? <Spinner size={13} /> : null}
          <Select
            aria-label="排序"
            value={library.query.sort === 'relevance' ? 'recent' : library.query.sort}
            onChange={(event) => library.setQuery({ sort: event.target.value as SortKey })}
            className="w-[104px]"
          >
            {SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </Select>
          <Button variant="primary" icon="plus" onClick={() => setEditorItem(null)}>
            新建
          </Button>
          <IconButton icon="panel" label="打开快捷面板" onClick={() => void api.app.openPanel()} />
          <IconButton
            icon={settings?.theme === 'light' ? 'sun' : 'moon'}
            label="切换主题"
            onClick={() =>
              void (async () => {
                const next = settings?.theme === 'light' ? 'dark' : 'light'
                const result = await api.settings.update({ theme: next })
                if (result.ok) setSettings(result.data)
              })()
            }
          />
          <IconButton icon="settings" label="设置" onClick={() => setSettingsOpen(true)} />
        </div>
      </header>

      {info && !info.hotkeyRegistered && settings ? (
        <div className="shrink-0 px-3.5 pt-2.5">
          <Banner tone="warn">
            全局快捷键 <span className="mono">{describeAccelerator(settings.hotkey)}</span>{' '}
            没有注册成功，可能被其他程序占用。
            <button
              type="button"
              className="ml-1 font-medium text-[var(--cs-accent)] hover:underline"
              onClick={() => setSettingsOpen(true)}
            >
              去设置
            </button>
          </Banner>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <Sidebar
          query={library.query}
          counts={library.counts}
          collections={library.collections}
          tags={library.tags}
          setQuery={library.setQuery}
          actions={{
            createCollection: () => setPrompt({ kind: 'create-collection' }),
            renameCollection: (collection) => setPrompt({ kind: 'rename-collection', collection }),
            deleteCollection: (collection) =>
              setConfirm({
                title: '删除分类',
                message: (
                  <>
                    删除分类「<span className="font-medium">{collection.name}</span>」？
                    <br />
                    其中的 {collection.itemCount} 条内容不会被删除，只会变成未分类。
                  </>
                ),
                confirmLabel: '删除分类',
                danger: true,
                onConfirm: () => {
                  setConfirm(null)
                  void (async () => {
                    const result = await api.collections.remove(collection.id)
                    if (!result.ok) return notice(result.error, 'bad')
                    if (library.query.collection === collection.id) {
                      library.setQuery({ collection: COLLECTION_ALL })
                    }
                  })()
                },
              }),
            renameTag: (tag) => setPrompt({ kind: 'rename-tag', tag }),
            deleteTag: (tag) =>
              setConfirm({
                title: '删除标签',
                message: (
                  <>
                    删除标签「<span className="font-medium">#{tag.name}</span>」？
                    <br />
                    只会解除它与 {tag.itemCount} 条内容的关联，内容本身不受影响。
                  </>
                ),
                confirmLabel: '删除标签',
                danger: true,
                onConfirm: () => {
                  setConfirm(null)
                  void (async () => {
                    const result = await api.tags.remove(tag.name)
                    if (!result.ok) return notice(result.error, 'bad')
                    if (library.query.tag === tag.name) library.setQuery({ tag: null })
                  })()
                },
              }),
          }}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          {activeFilters.length > 0 ? (
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--cs-border)] px-3.5 py-2">
              <span className="text-[11.5px] text-[var(--cs-faint)]">筛选</span>
              {activeFilters.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.clear}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--cs-border-strong)] px-2 py-[1px] text-[11.5px] text-[var(--cs-muted)] hover:border-[var(--cs-bad)] hover:text-[var(--cs-bad)]"
                >
                  {chip.label}
                  <Icon name="x" size={10} />
                </button>
              ))}
              <button
                type="button"
                onClick={() => library.resetQuery()}
                className="ml-1 text-[11.5px] text-[var(--cs-faint)] hover:text-[var(--cs-text)]"
              >
                清除全部
              </button>
            </div>
          ) : null}

          {library.error ? (
            <div className="p-3.5">
              <Banner tone="bad">{library.error}</Banner>
            </div>
          ) : null}

          <div className="scroll-area min-h-0 flex-1 p-2.5" role="listbox" aria-label="结果列表">
            {items.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {items.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    selected={item.id === selectedId}
                    onActivate={() => setSelectedId(item.id)}
                    onCopy={() => void copyItem(item)}
                    onToggleFavorite={() => void toggleFavorite(item)}
                  />
                ))}
              </div>
            ) : library.loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-[12.5px] text-[var(--cs-muted)]">
                <Spinner size={14} /> 正在读取…
              </div>
            ) : library.counts?.all === 0 ? (
              <EmptyState
                icon="terminal"
                title="架子还是空的"
                description="把常用的命令、提示词、代码片段和路径放进来，之后按一下快捷键就能取走。"
                action={
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      icon="plus"
                      onClick={() =>
                        void (async () => {
                          const result = await api.data.seedDemo()
                          if (!result.ok) return notice(result.error, 'bad')
                          notice(`已载入 ${result.data.items} 条示例数据`, 'good')
                        })()
                      }
                    >
                      载入示例数据
                    </Button>
                    <Button onClick={() => setEditorItem(null)}>自己新建一条</Button>
                  </div>
                }
              />
            ) : isPristine ? (
              <EmptyState title="还没有内容" description="点「新建」添加第一条。" />
            ) : (
              <EmptyState
                icon="filter"
                title="没有匹配的内容"
                description="试试换个关键词，或者放宽筛选条件。"
                action={<Button onClick={() => library.resetQuery()}>清除全部筛选</Button>}
              />
            )}
          </div>

          <footer className="flex shrink-0 items-center gap-3 border-t border-[var(--cs-border)] px-3.5 py-1.5 text-[11px] text-[var(--cs-faint)]">
            <span className="flex items-center gap-1">
              <Kbd>/</Kbd> 搜索
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> 选择
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> 复制
            </span>
            <span className="flex items-center gap-1">
              <Kbd>N</Kbd> 新建
            </span>
            <span className="flex items-center gap-1">
              <Kbd>E</Kbd> 编辑
            </span>
            <span className="flex items-center gap-1">
              <Kbd>B</Kbd> 收藏
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Del</Kbd> 删除
            </span>
            <span className="ml-auto tabular-nums">
              {library.counts ? `共 ${library.counts.all} 条` : ''}
              {items.length !== library.counts?.all && library.counts
                ? ` · 当前 ${items.length} 条`
                : ''}
            </span>
          </footer>
        </main>

        {selected ? (
          <ItemDetail
            // Remounting per item is what resets the parameter form; it is the
            // React-recommended alternative to syncing state in an effect.
            key={selected.id}
            item={selected}
            collection={
              library.collections.find((entry) => entry.id === selected.collectionId) ?? null
            }
            onEdit={() => setEditorItem(selected)}
            onDelete={() => deleteItem(selected)}
            onToggleFavorite={() => void toggleFavorite(selected)}
            onTagClick={(tag) => library.setQuery({ tag })}
            onNotice={notice}
            onUsed={library.patchItem}
          />
        ) : (
          <aside className="flex h-full w-[400px] shrink-0 flex-col items-center justify-center gap-3 border-l border-[var(--cs-border)] bg-[var(--cs-surface)] px-8 text-center">
            <span className="text-[var(--cs-faint)]">
              <Icon name="panel" size={22} />
            </span>
            <p className="text-[12.5px] text-[var(--cs-muted)]">
              选中左侧任意一条，这里会显示完整内容、参数和操作。
            </p>
            <div className="mono flex items-center gap-1.5 rounded-md border border-[var(--cs-border)] bg-[var(--cs-surface-2)] px-2.5 py-1.5 text-[11.5px] text-[var(--cs-muted)]">
              <Icon name="keyboard" size={12} />按{' '}
              <Kbd>{describeAccelerator(settings?.hotkey ?? 'CommandOrControl+Shift+Space')}</Kbd>{' '}
              在任意界面呼出
            </div>
          </aside>
        )}
      </div>

      {/* Mounted only while open, and keyed by what is being edited, so the
          form initialises itself from props instead of syncing in an effect. */}
      {editorItem !== undefined ? (
        <ItemEditor
          key={editorItem?.id ?? 'new'}
          item={editorItem}
          collections={library.collections}
          knownTags={library.tags.map((tag) => tag.name)}
          defaultCollectionId={
            library.query.collection !== COLLECTION_ALL &&
            library.query.collection !== COLLECTION_NONE
              ? library.query.collection
              : null
          }
          onClose={() => setEditorItem(undefined)}
          onSaved={(saved) => {
            setSelectedId(saved.id)
            notice(editorItem ? '已保存修改' : '已新建条目', 'good')
          }}
        />
      ) : null}

      {settings ? (
        <SettingsDialog
          open={settingsOpen}
          settings={settings}
          info={info}
          onClose={() => setSettingsOpen(false)}
          onSettingsChanged={(next) => setSettings(next)}
          onDataChanged={() => library.reload()}
          onNotice={notice}
        />
      ) : null}

      {prompt !== null ? (
        <TextPromptDialog
          key={
            prompt.kind === 'create-collection'
              ? 'create-collection'
              : prompt.kind === 'rename-collection'
                ? `collection-${prompt.collection.id}`
                : `tag-${prompt.tag.id}`
          }
          title={
            prompt.kind === 'create-collection'
              ? '新建分类'
              : prompt.kind === 'rename-tag'
                ? '重命名标签'
                : '重命名分类'
          }
          label="名称"
          placeholder={prompt.kind === 'rename-tag' ? 'ssh' : '例如：服务器'}
          initialValue={
            prompt.kind === 'rename-collection'
              ? prompt.collection.name
              : prompt.kind === 'rename-tag'
                ? prompt.tag.name
                : ''
          }
          onConfirm={(value) => void submitPrompt(value)}
          onCancel={() => setPrompt(null)}
        />
      ) : null}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? null}
        confirmLabel={confirm?.confirmLabel ?? '确认'}
        danger={confirm?.danger}
        onConfirm={() => confirm?.onConfirm()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
