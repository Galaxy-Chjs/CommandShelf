import type { DatabaseSync } from 'node:sqlite'

import { normalizeTag } from '@shared/search'
import { isItemKind, type Item, type TransferSummary } from '@shared/types'

import { asRows, transact } from '../db/connection'
import { ensureCollectionWithin } from './collections'
import { rebuildFts } from './fts'
import { newId, now } from './ids'
import { insertRawItemWithin } from './items'
import { replaceItemTagsWithin } from './tags'

/**
 * JSON export and import.
 *
 * Collections and tags are exported by *name*, not by id, so the file is
 * readable and survives being imported into a different database. Item ids are
 * intentionally not exported either: an import always creates new rows, which
 * makes "import twice by accident" a duplicate-detection problem rather than a
 * corrupted-database problem.
 */

export const EXPORT_FORMAT_VERSION = 1

/**
 * Joins kind/title/body into a duplicate-detection key.
 *
 * A unit separator, not `\u0000`: a literal NUL inside a SQL string terminates
 * SQLite's statement parser ("unrecognized token"), and the value has to be
 * built identically on the SQL side and the JavaScript side for the comparison
 * to mean anything. `char(31)` in SQL and `\u001f` here are the same character.
 */
const FINGERPRINT_SEPARATOR = '\u001f'
const FINGERPRINT_SQL = 'kind || char(31) || title || char(31) || body'

function fingerprintOf(kind: string, title: string, body: string): string {
  return [kind, title, body].join(FINGERPRINT_SEPARATOR)
}

export interface ExportItem {
  title: string
  body: string
  kind: string
  language: string | null
  collection: string | null
  tags: string[]
  favorite: boolean
  useCount: number
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ExportPayload {
  app: 'CommandShelf'
  formatVersion: number
  exportedAt: string
  collections: string[]
  items: ExportItem[]
}

export function buildExport(db: DatabaseSync): ExportPayload {
  const items = asRows<{
    title: string
    body: string
    kind: string
    language: string | null
    collection: string | null
    favorite: number
    use_count: number
    last_used_at: string | null
    created_at: string
    updated_at: string
    tags: string
  }>(
    db
      .prepare(
        `SELECT i.title, i.body, i.kind, i.language,
                c.name AS collection,
                i.favorite, i.use_count, i.last_used_at, i.created_at, i.updated_at,
                COALESCE((
                  SELECT GROUP_CONCAT(t.name, ',')
                    FROM item_tags it JOIN tags t ON t.id = it.tag_id
                   WHERE it.item_id = i.id
                ), '') AS tags
           FROM items i
           LEFT JOIN collections c ON c.id = i.collection_id
          WHERE i.deleted_at IS NULL
          ORDER BY i.created_at ASC`,
      )
      .all(),
  )

  const collections = asRows<{ name: string }>(
    db.prepare('SELECT name FROM collections ORDER BY sort_order ASC, name ASC').all(),
  ).map((row) => row.name)

  return {
    app: 'CommandShelf',
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: now(),
    collections,
    items: items.map((row) => ({
      title: row.title,
      body: row.body,
      kind: row.kind,
      language: row.language,
      collection: row.collection,
      tags: row.tags ? row.tags.split(',').filter(Boolean) : [],
      favorite: Number(row.favorite) === 1,
      useCount: Number(row.use_count),
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  }
}

/* -------------------------------------------------------------------------- */
/* Import                                                                     */
/* -------------------------------------------------------------------------- */

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === 'true'
}

function asNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export interface ImportOptions {
  /** Skip items whose kind+title+body already exist. Default true. */
  skipDuplicates?: boolean
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

/**
 * Imports a previously exported payload.
 *
 * Throws a readable Chinese error when the file is not a CommandShelf export,
 * so the UI can say what is wrong instead of "unexpected token <".
 */
export function applyImport(
  db: DatabaseSync,
  raw: unknown,
  options: ImportOptions = {},
): TransferSummary {
  if (typeof raw !== 'object' || raw === null) throw new Error('导入失败：文件内容不是 JSON 对象')
  const payload = raw as Partial<ExportPayload>
  if (payload.app !== 'CommandShelf') {
    throw new Error('导入失败：这不是 CommandShelf 导出的文件')
  }
  if (!Array.isArray(payload.items)) throw new Error('导入失败：文件缺少 items 列表')
  if (Number(payload.formatVersion ?? 0) > EXPORT_FORMAT_VERSION) {
    throw new Error(
      `导入失败：文件格式版本 v${payload.formatVersion} 高于当前支持的 v${EXPORT_FORMAT_VERSION}，请升级 CommandShelf`,
    )
  }

  const skipDuplicates = options.skipDuplicates !== false
  // Narrowed once, outside the transaction closure, so the loop body sees a
  // definite array type rather than `ExportItem[] | undefined`.
  const incoming: unknown[] = Array.isArray(payload.items) ? payload.items : []
  const collectionNames: unknown[] = Array.isArray(payload.collections) ? payload.collections : []

  return transact(db, () => {
    const knownCollections = new Set(
      asRows<{ name: string }>(db.prepare('SELECT name FROM collections').all()).map((row) =>
        row.name.toLowerCase(),
      ),
    )
    let collectionCount = 0

    const ensured = new Map<string, string | null>()
    const ensure = (name: string | null): string | null => {
      if (!name) return null
      const key = name.toLowerCase()
      const cached = ensured.get(key)
      if (cached !== undefined) return cached

      if (!knownCollections.has(key)) {
        collectionCount += 1
        knownCollections.add(key)
      }
      const id = ensureCollectionWithin(db, name)
      ensured.set(key, id)
      return id
    }

    for (const name of collectionNames) {
      if (typeof name === 'string') ensure(name)
    }

    const existing = new Set(
      asRows<{ fingerprint: string }>(
        db.prepare(`SELECT (${FINGERPRINT_SQL}) AS fingerprint FROM items`).all(),
      ).map((row) => row.fingerprint),
    )

    let imported = 0
    let skipped = 0
    const tagNames = new Set<string>()

    for (const entry of incoming) {
      if (typeof entry !== 'object' || entry === null) {
        skipped += 1
        continue
      }
      const source = entry as Partial<ExportItem>
      const title = asString(source.title).trim()
      const body = asString(source.body)
      if (!title && !body) {
        skipped += 1
        continue
      }

      const kind = isItemKind(source.kind) ? source.kind : 'command'
      const fingerprint = fingerprintOf(kind, title, body)
      if (skipDuplicates && existing.has(fingerprint)) {
        skipped += 1
        continue
      }

      const tags = (Array.isArray(source.tags) ? source.tags : [])
        .map((tag) => normalizeTag(asString(tag)))
        .filter(Boolean)
      for (const tag of tags) tagNames.add(tag)

      const createdAt = isoTimestamp(source.createdAt) ?? now()
      const item: Item = {
        id: newId(),
        title: title || '未命名条目',
        body,
        kind,
        language: kind === 'snippet' ? asString(source.language, 'text') || 'text' : null,
        collectionId: ensure(asString(source.collection) || null),
        favorite: asBoolean(source.favorite),
        useCount: Math.max(0, Math.trunc(asNumber(source.useCount))),
        lastUsedAt: isoTimestamp(source.lastUsedAt),
        createdAt,
        updatedAt: isoTimestamp(source.updatedAt) ?? createdAt,
        deletedAt: null,
        tags: [],
      }

      insertRawItemWithin(db, item)
      replaceItemTagsWithin(db, item.id, tags)
      existing.add(fingerprint)
      imported += 1
    }

    rebuildFts(db)

    return {
      items: imported,
      collections: collectionCount,
      tags: tagNames.size,
      skipped,
    }
  })
}
