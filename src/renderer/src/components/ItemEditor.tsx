import { useMemo, useState } from 'react'

import { KIND_META, KIND_ORDER, SNIPPET_LANGUAGES } from '@shared/kinds'
import { splitTagInput } from '@shared/search'
import { parseTemplate } from '@shared/template'
import type { Collection, Item, ItemDraft, ItemKind } from '@shared/types'

import { Icon, type IconName } from './Icon'
import { Button, Field, Input, Modal, Select, Textarea, Toggle, cx } from './ui'
import { api } from '../lib/api'

/**
 * Create / edit dialog.
 *
 * The kind and language controls change what the body is highlighted as, so the
 * form shows the same rendering the list will.
 */

const KIND_ICONS: Record<ItemKind, IconName> = {
  command: 'terminal',
  prompt: 'sparkles',
  snippet: 'braces',
  link: 'link',
  path: 'folder',
}

export function ItemEditor({
  item,
  collections,
  knownTags,
  defaultCollectionId,
  onClose,
  onSaved,
}: {
  /** null creates a new item. The caller mounts this only while it is open. */
  item: Item | null
  collections: Collection[]
  knownTags: string[]
  defaultCollectionId: string | null
  onClose: () => void
  onSaved: (saved: Item) => void
}) {
  const [kind, setKind] = useState<ItemKind>(item?.kind ?? 'command')
  const [title, setTitle] = useState(item?.title ?? '')
  const [body, setBody] = useState(item?.body ?? '')
  const [language, setLanguage] = useState(item?.language ?? 'text')
  const [collectionId, setCollectionId] = useState(item?.collectionId ?? defaultCollectionId ?? '')
  const [tagsText, setTagsText] = useState(item?.tags.join(', ') ?? '')
  const [favorite, setFavorite] = useState(item?.favorite ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const variables = useMemo(() => parseTemplate(body), [body])
  const usedTags = useMemo(() => splitTagInput(tagsText), [tagsText])
  const suggestions = useMemo(
    () =>
      knownTags
        .filter((tag) => !usedTags.some((used) => used.toLowerCase() === tag.toLowerCase()))
        .slice(0, 12),
    [knownTags, usedTags],
  )

  const canSave = body.trim().length > 0 && !saving

  const save = async () => {
    if (!canSave) return
    setSaving(true)

    const draft: ItemDraft = {
      title: title.trim(),
      body,
      kind,
      language: kind === 'snippet' ? language : null,
      collectionId: collectionId || null,
      tags: usedTags,
      favorite,
    }

    const result = item ? await api.items.update(item.id, draft) : await api.items.create(draft)

    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onSaved(result.data)
    onClose()
  }

  return (
    <Modal
      open
      title={item ? '编辑条目' : '新建条目'}
      onClose={onClose}
      width={680}
      footer={
        <>
          {error ? <span className="mr-auto text-[12px] text-[var(--cs-bad)]">{error}</span> : null}
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!canSave} onClick={() => void save()}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Field label="类型" as="group">
          <div className="flex flex-wrap gap-1.5">
            {KIND_ORDER.map((option) => {
              const meta = KIND_META[option]
              const selected = kind === option
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setKind(option)}
                  title={meta.hint}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors',
                    selected
                      ? 'border-transparent text-[#0d1117]'
                      : 'border-[var(--cs-border)] text-[var(--cs-muted)] hover:border-[var(--cs-border-strong)] hover:text-[var(--cs-text)]',
                  )}
                  style={selected ? { background: meta.colorVar } : undefined}
                >
                  <Icon name={KIND_ICONS[option]} size={13} />
                  {meta.label}
                </button>
              )
            })}
          </div>
        </Field>

        <Field label="标题" hint="留空时会自动使用正文的第一行">
          <Input
            value={title}
            placeholder="例如：端口转发到本地"
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>

        <div className="grid grid-cols-[1fr_170px] gap-3">
          <Field
            label="正文"
            hint={
              variables.length > 0
                ? `检测到 ${variables.length} 个参数：${variables.map((v) => v.name).join('、')}`
                : '用 {{参数}} 表示需要每次填写的部分，例如 {{port}}、{{server=user@10.0.0.12}}'
            }
          >
            <Textarea
              value={body}
              rows={9}
              spellCheck={false}
              placeholder={
                kind === 'command'
                  ? 'ssh -L {{local_port=8888}}:localhost:{{remote_port=8888}} {{server}}'
                  : '在这里粘贴内容…'
              }
              onChange={(event) => setBody(event.target.value)}
            />
          </Field>

          <div className="flex flex-col gap-3.5">
            {kind === 'snippet' ? (
              <Field label="语言">
                <Select value={language} onChange={(event) => setLanguage(event.target.value)}>
                  {SNIPPET_LANGUAGES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <Field label="分类">
              <Select
                value={collectionId}
                onChange={(event) => setCollectionId(event.target.value)}
              >
                <option value="">未分类</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="标签" hint="用逗号分隔">
              <Input
                value={tagsText}
                placeholder="ssh, 服务器"
                onChange={(event) => setTagsText(event.target.value)}
              />
            </Field>

            {suggestions.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {suggestions.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setTagsText((current) => (current.trim() ? `${current.trim()}, ${tag}` : tag))
                    }
                    className="rounded-full border border-[var(--cs-border)] px-2 py-[1px] text-[11px] text-[var(--cs-muted)] hover:border-[var(--cs-accent)] hover:text-[var(--cs-accent)]"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            ) : null}

            <Toggle checked={favorite} onChange={setFavorite} label="收藏" />
          </div>
        </div>
      </div>
    </Modal>
  )
}
