import type { ReactNode } from 'react'

import { KIND_META, KIND_ORDER } from '@shared/kinds'
import {
  COLLECTION_ALL,
  COLLECTION_NONE,
  type Collection,
  type Counts,
  type ItemQuery,
  type Tag,
} from '@shared/types'

import { Icon, type IconName } from '../components/Icon'
import { cx } from '../components/ui'

/**
 * Filter navigation.
 *
 * Counts come from the same `getCounts` aggregate the header uses, so the
 * numbers next to a filter always match what selecting it will show.
 */

const KIND_ICONS: Record<string, IconName> = {
  command: 'terminal',
  prompt: 'sparkles',
  snippet: 'braces',
  link: 'link',
  path: 'folder',
}

export interface SidebarActions {
  createCollection: () => void
  renameCollection: (collection: Collection) => void
  deleteCollection: (collection: Collection) => void
  renameTag: (tag: Tag) => void
  deleteTag: (tag: Tag) => void
}

export function Sidebar({
  query,
  counts,
  collections,
  tags,
  setQuery,
  actions,
}: {
  query: ItemQuery
  counts: Counts | null
  collections: Collection[]
  tags: Tag[]
  setQuery: (patch: Partial<ItemQuery>) => void
  actions: SidebarActions
}) {
  const activeKind = query.kinds.length === 1 ? query.kinds[0] : null

  return (
    <nav
      aria-label="筛选"
      className="scroll-area flex w-[218px] shrink-0 flex-col gap-4 border-r border-[var(--cs-border)] bg-[var(--cs-surface)] px-2 py-3"
    >
      <Group label="内容">
        <Row
          label="全部"
          icon="layers"
          count={counts?.all}
          active={
            !query.favoriteOnly &&
            activeKind === null &&
            query.collection === COLLECTION_ALL &&
            query.tag === null
          }
          onClick={() =>
            setQuery({
              favoriteOnly: false,
              kinds: [],
              collection: COLLECTION_ALL,
              tag: null,
            })
          }
        />
        <Row
          label="收藏"
          icon="star"
          count={counts?.favorite}
          active={query.favoriteOnly}
          onClick={() => setQuery({ favoriteOnly: !query.favoriteOnly })}
        />
      </Group>

      <Group label="类型">
        {KIND_ORDER.map((kind) => {
          const meta = KIND_META[kind]
          const active = activeKind === kind
          return (
            <Row
              key={kind}
              label={meta.label}
              icon={KIND_ICONS[kind]}
              iconColor={meta.colorVar}
              count={counts?.byKind[kind]}
              active={active}
              onClick={() => setQuery({ kinds: active ? [] : [kind] })}
            />
          )
        })}
      </Group>

      <Group
        label="分类"
        action={{ icon: 'plus', label: '新建分类', onClick: actions.createCollection }}
      >
        <Row
          label="未分类"
          icon="inbox"
          count={counts?.uncategorized}
          active={query.collection === COLLECTION_NONE}
          onClick={() =>
            setQuery({
              collection: query.collection === COLLECTION_NONE ? COLLECTION_ALL : COLLECTION_NONE,
            })
          }
        />
        {collections.length === 0 ? (
          <p className="px-2 py-1 text-[11.5px] text-[var(--cs-faint)]">还没有分类</p>
        ) : (
          collections.map((collection) => (
            <Row
              key={collection.id}
              label={collection.name}
              icon="folder"
              count={counts?.byCollection[collection.id] ?? 0}
              active={query.collection === collection.id}
              onClick={() =>
                setQuery({
                  collection: query.collection === collection.id ? COLLECTION_ALL : collection.id,
                })
              }
              onRename={() => actions.renameCollection(collection)}
              onDelete={() => actions.deleteCollection(collection)}
            />
          ))
        )}
      </Group>

      <Group label="标签">
        {tags.length === 0 ? (
          <p className="px-2 py-1 text-[11.5px] text-[var(--cs-faint)]">还没有标签</p>
        ) : (
          tags.map((tag) => (
            <Row
              key={tag.id}
              label={`#${tag.name}`}
              icon="tag"
              count={tag.itemCount}
              active={query.tag === tag.name}
              onClick={() => setQuery({ tag: query.tag === tag.name ? null : tag.name })}
              onRename={() => actions.renameTag(tag)}
              onDelete={() => actions.deleteTag(tag)}
            />
          ))
        )}
      </Group>
    </nav>
  )
}

function Group({
  label,
  action,
  children,
}: {
  label: string
  action?: { icon: IconName; label: string; onClick: () => void }
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="text-[10.5px] font-semibold tracking-[0.07em] text-[var(--cs-faint)] uppercase">
          {label}
        </span>
        {action ? (
          <button
            type="button"
            title={action.label}
            aria-label={action.label}
            onClick={action.onClick}
            className="rounded p-0.5 text-[var(--cs-faint)] transition-colors hover:bg-[var(--cs-surface-2)] hover:text-[var(--cs-text)]"
          >
            <Icon name={action.icon} size={12} />
          </button>
        ) : null}
      </div>
      {children}
    </div>
  )
}

function Row({
  label,
  icon,
  iconColor,
  count,
  active,
  onClick,
  onRename,
  onDelete,
}: {
  label: string
  icon: IconName
  iconColor?: string
  count?: number
  active: boolean
  onClick: () => void
  onRename?: () => void
  onDelete?: () => void
}) {
  return (
    <div
      className={cx(
        'group flex items-center gap-2 rounded-md pr-1 pl-2 transition-colors',
        active
          ? 'bg-[color-mix(in_srgb,var(--cs-accent)_14%,transparent)] text-[var(--cs-text)]'
          : 'text-[var(--cs-muted)] hover:bg-[var(--cs-surface-2)] hover:text-[var(--cs-text)]',
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'true' : undefined}
        // Without this the accessible name absorbs the count ("收藏 5"), which
        // is noise for a screen reader and for anything locating by name.
        aria-label={label}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-[12.5px]"
      >
        <span style={iconColor ? { color: iconColor } : undefined} className="shrink-0 opacity-90">
          <Icon name={icon} size={13} />
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count !== undefined && count > 0 ? (
          <span className="shrink-0 text-[11px] text-[var(--cs-faint)] tabular-nums">{count}</span>
        ) : null}
      </button>

      {onRename || onDelete ? (
        <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {onRename ? (
            <button
              type="button"
              title="重命名"
              aria-label={`重命名 ${label}`}
              onClick={onRename}
              className="rounded p-0.5 text-[var(--cs-faint)] hover:text-[var(--cs-text)]"
            >
              <Icon name="pencil" size={11} />
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              title="删除"
              aria-label={`删除 ${label}`}
              onClick={onDelete}
              className="rounded p-0.5 text-[var(--cs-faint)] hover:text-[var(--cs-bad)]"
            >
              <Icon name="trash" size={11} />
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  )
}
