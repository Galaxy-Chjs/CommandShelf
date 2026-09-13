import { useMemo, useState } from 'react'

import { formatDateTime, formatRelative, formatUsage } from '@shared/format'
import { KIND_META, LANGUAGE_LABELS } from '@shared/kinds'
import { defaultValues, fillTemplate, parseTemplate } from '@shared/template'
import type { Collection, Item } from '@shared/types'

import { CodeBlock } from './CodeBlock'
import { Icon } from './Icon'
import { VariableForm } from './VariableForm'
import { Badge, Button, IconButton, KindBadge, cx, type ToastAction } from './ui'
import { api } from '../lib/api'

/**
 * The detail pane.
 *
 * Templates get their fill-in form here too, so a command with parameters can
 * be copied from the management window without opening the quick panel.
 */
export function ItemDetail({
  item,
  collection,
  onEdit,
  onDelete,
  onToggleFavorite,
  onTagClick,
  onNotice,
  onUsed,
}: {
  item: Item
  collection: Collection | null
  onEdit: () => void
  onDelete: () => void
  onToggleFavorite: () => void
  onTagClick: (tag: string) => void
  onNotice: (message: string, tone?: 'info' | 'good' | 'bad', action?: ToastAction) => void
  /** Called with the refreshed item after a use is recorded. */
  onUsed?: (item: Item) => void
}) {
  const variables = useMemo(() => parseTemplate(item.body), [item.body])
  // Initialised once per mount; the caller remounts this component per item.
  const [values, setValues] = useState<Record<string, string>>(() => defaultValues(item.body))
  const [copied, setCopied] = useState(false)

  const finalText = variables.length > 0 ? fillTemplate(item.body, values) : item.body

  const copy = async () => {
    const result = await api.app.copy(finalText)
    if (!result.ok) {
      onNotice(result.error, 'bad')
      return
    }
    const used = await api.items.markUsed(item.id)
    if (used.ok && used.data) onUsed?.(used.data)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  const meta = KIND_META[item.kind]

  return (
    <aside className="flex h-full w-[400px] shrink-0 flex-col border-l border-[var(--cs-border)] bg-[var(--cs-surface)]">
      <header className="flex items-start gap-2 border-b border-[var(--cs-border)] px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[14.5px] leading-snug font-semibold break-words">{item.title}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <KindBadge kind={item.kind} />
            {item.language && item.kind === 'snippet' ? (
              <Badge>{LANGUAGE_LABELS[item.language] ?? item.language}</Badge>
            ) : null}
            {variables.length > 0 ? <Badge tone="accent">{variables.length} 个参数</Badge> : null}
          </div>
        </div>
        <IconButton
          icon={item.favorite ? 'starFilled' : 'star'}
          label={item.favorite ? '取消收藏' : '收藏'}
          active={item.favorite}
          className={item.favorite ? 'text-[var(--cs-warn)]' : undefined}
          onClick={onToggleFavorite}
        />
        <IconButton icon="pencil" label="编辑 (E)" onClick={onEdit} />
        <IconButton icon="trash" label="删除 (Delete)" onClick={onDelete} />
      </header>

      <div className="scroll-area min-h-0 flex-1 px-3.5 py-3">
        <div
          className="rounded-md border border-[var(--cs-border)] px-2.5 py-2"
          style={{
            background: `color-mix(in srgb, ${meta.colorVar} 6%, var(--cs-surface-2))`,
          }}
        >
          <CodeBlock body={item.body} language={item.language} />
        </div>

        {variables.length > 0 ? (
          <div className="mt-3">
            <p className="mb-1.5 text-[11px] font-semibold tracking-[0.05em] text-[var(--cs-muted)] uppercase">
              参数
            </p>
            <VariableForm
              variables={variables}
              values={values}
              onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))}
              onSubmit={() => void copy()}
              className="[&_input]:h-7 [&_input]:text-[12px]"
            />
          </div>
        ) : null}

        {item.tags.length > 0 ? (
          <div className="mt-3">
            <p className="mb-1.5 text-[11px] font-semibold tracking-[0.05em] text-[var(--cs-muted)] uppercase">
              标签
            </p>
            <div className="flex flex-wrap gap-1">
              {item.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onTagClick(tag)}
                  className="rounded-full border border-[var(--cs-border)] px-2 py-[1px] text-[11px] text-[var(--cs-muted)] transition-colors hover:border-[var(--cs-accent)] hover:text-[var(--cs-accent)]"
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <dl className="mt-3.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11.5px]">
          <dt className="text-[var(--cs-faint)]">分类</dt>
          <dd className="text-[var(--cs-muted)]">{collection?.name ?? '未分类'}</dd>
          <dt className="text-[var(--cs-faint)]">使用</dt>
          <dd className="text-[var(--cs-muted)] tabular-nums">
            {formatUsage(item.useCount)} · {formatRelative(item.lastUsedAt)}
          </dd>
          <dt className="text-[var(--cs-faint)]">创建</dt>
          <dd className="text-[var(--cs-muted)] tabular-nums">{formatDateTime(item.createdAt)}</dd>
          <dt className="text-[var(--cs-faint)]">修改</dt>
          <dd className="text-[var(--cs-muted)] tabular-nums">{formatDateTime(item.updatedAt)}</dd>
        </dl>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--cs-border)] px-3.5 py-2.5">
        <Button
          variant="primary"
          icon={copied ? 'check' : 'copy'}
          onClick={() => void copy()}
          className={cx(copied && 'brightness-110')}
        >
          {copied ? '已复制' : variables.length > 0 ? '复制最终内容' : '复制'}
        </Button>

        {item.kind === 'link' ? (
          <Button icon="externalLink" onClick={() => void api.app.openExternal(item.body.trim())}>
            打开链接
          </Button>
        ) : null}

        {item.kind === 'path' ? (
          <Button icon="folder" onClick={() => void api.app.openPath(item.body.trim())}>
            打开路径
          </Button>
        ) : null}

        <span className="ml-auto flex items-center gap-1 text-[11px] text-[var(--cs-faint)]">
          <Icon name="keyboard" size={12} />
          <span>E 编辑</span>
        </span>
      </footer>
    </aside>
  )
}
