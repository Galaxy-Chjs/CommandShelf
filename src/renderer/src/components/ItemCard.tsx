import { formatRelative, formatUsage } from '@shared/format'
import { KIND_META } from '@shared/kinds'
import type { Item } from '@shared/types'

import { CodeBlock } from './CodeBlock'
import { Icon } from './Icon'
import { KindBadge, cx } from './ui'

/**
 * One row in a result list.
 *
 * The whole card is the click target; the copy and favourite controls stop
 * propagation so they never steal the selection.
 */
export function ItemCard({
  item,
  selected,
  onActivate,
  onCopy,
  onToggleFavorite,
  showKind = true,
  compact = false,
}: {
  item: Item
  selected: boolean
  onActivate: () => void
  onCopy?: () => void
  onToggleFavorite?: () => void
  showKind?: boolean
  compact?: boolean
}) {
  const meta = KIND_META[item.kind]

  return (
    <div
      role="option"
      aria-selected={selected}
      onClick={onActivate}
      className={cx(
        'group relative cursor-pointer overflow-hidden rounded-lg border pr-2.5 pl-3 transition-colors',
        compact ? 'py-1.5' : 'py-2.5',
        selected
          ? 'border-[color-mix(in_srgb,var(--cs-accent)_55%,var(--cs-border))] bg-[color-mix(in_srgb,var(--cs-accent)_10%,var(--cs-surface))]'
          : 'border-[var(--cs-border)] bg-[var(--cs-surface)] hover:border-[var(--cs-border-strong)] hover:bg-[var(--cs-surface-2)]',
      )}
    >
      {/* Kind is encoded twice — a colour bar and a label — because the bar alone
          is not readable without colour vision. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: meta.colorVar, opacity: selected ? 1 : 0.55 }}
      />

      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.title}</h3>

        {onToggleFavorite ? (
          <button
            type="button"
            aria-label={item.favorite ? '取消收藏' : '收藏'}
            title={item.favorite ? '取消收藏' : '收藏'}
            onClick={(event) => {
              event.stopPropagation()
              onToggleFavorite()
            }}
            className={cx(
              'shrink-0 rounded p-0.5 transition-opacity',
              item.favorite
                ? 'text-[var(--cs-warn)]'
                : 'text-[var(--cs-faint)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            )}
          >
            <Icon name={item.favorite ? 'starFilled' : 'star'} size={13} />
          </button>
        ) : item.favorite ? (
          <span className="shrink-0 text-[var(--cs-warn)]" title="已收藏">
            <Icon name="starFilled" size={13} />
          </span>
        ) : null}

        {showKind ? <KindBadge kind={item.kind} className="shrink-0" /> : null}

        {onCopy ? (
          <button
            type="button"
            aria-label="复制"
            title="复制"
            onClick={(event) => {
              event.stopPropagation()
              onCopy()
            }}
            className="shrink-0 rounded p-0.5 text-[var(--cs-faint)] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-[var(--cs-accent)]"
          >
            <Icon name="copy" size={13} />
          </button>
        ) : null}
      </div>

      {item.body ? (
        <CodeBlock
          body={item.body}
          language={item.language}
          interactive={false}
          className="clamp-2 mt-1 text-[12px] text-[var(--cs-muted)]"
        />
      ) : null}

      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[var(--cs-faint)]">
        {item.tags.length > 0 ? (
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            {item.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="text-[var(--cs-muted)]">
                #{tag}
              </span>
            ))}
            {item.tags.length > 4 ? <span>+{item.tags.length - 4}</span> : null}
          </span>
        ) : null}
        <span className="ml-auto shrink-0 tabular-nums">
          {formatUsage(item.useCount)} · {formatRelative(item.lastUsedAt)}
        </span>
      </div>
    </div>
  )
}
