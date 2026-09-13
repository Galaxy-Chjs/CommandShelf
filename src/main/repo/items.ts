import type { DatabaseSync } from 'node:sqlite'

import { titleFromBody } from '@shared/format'
import { KIND_META } from '@shared/kinds'
import { buildFtsQuery, containsCjk, likePattern } from '@shared/search'
import {
  COLLECTION_ALL,
  COLLECTION_NONE,
  isItemKind,
  isSortKey,
  type Counts,
  type Item,
  type ItemDraft,
  type ItemKind,
  type ItemQuery,
  type SortKey,
} from '@shared/types'

import { asRows, bool, placeholders, transact, type SqlValue } from '../db/connection'
import { rebuildFts, syncItemFts } from './fts'
import { newId, now } from './ids'
import { pruneUnusedTagsWithin, replaceItemTagsWithin, tagsForItems } from './tags'

/**
 * Items: the pieces of content themselves.
 *
 * Convention for this folder: exported functions open their own transaction;
 * helpers ending in `Within` assume one is already open.
 */

interface ItemRow {
  id: string
  title: string
  body: string
  kind: string
  language: string | null
  collection_id: string | null
  favorite: number
  use_count: number
  last_used_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

function toItem(row: ItemRow, tags: string[]): Item {
  const kind: ItemKind = isItemKind(row.kind) ? row.kind : 'command'
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    kind,
    language: row.language,
    collectionId: row.collection_id,
    favorite: Number(row.favorite) === 1,
    useCount: Number(row.use_count),
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    tags,
  }
}

function hydrate(db: DatabaseSync, rows: ItemRow[]): Item[] {
  const tags = tagsForItems(
    db,
    rows.map((row) => row.id),
  )
  return rows.map((row) => toItem(row, tags.get(row.id) ?? []))
}

interface NormalizedDraft {
  title: string
  body: string
  kind: ItemKind
  language: string | null
  collectionId: string | null
  favorite: boolean
  tags: string[]
}

const MAX_TITLE = 200

export function normalizeDraft(draft: ItemDraft): NormalizedDraft {
  const kind: ItemKind = isItemKind(draft.kind) ? draft.kind : 'command'
  const body = typeof draft.body === 'string' ? draft.body : ''
  const title = (typeof draft.title === 'string' ? draft.title : '').trim()
  const language = kind === 'snippet' ? (draft.language ?? 'text') || 'text' : null
  return {
    title: (title || titleFromBody(body, KIND_META[kind].label)).slice(0, MAX_TITLE),
    body,
    kind,
    language,
    collectionId: draft.collectionId ?? null,
    favorite: draft.favorite === true,
    tags: Array.isArray(draft.tags) ? draft.tags : [],
  }
}

/* -------------------------------------------------------------------------- */
/* Text matching                                                              */
/* -------------------------------------------------------------------------- */

interface TextPlan {
  clauses: string
  params: SqlValue[]
  /** The FTS expression, when one is usable — it also enables relevance rank. */
  fts: string | null
}

const LIKE_ESCAPE = `ESCAPE '\\'`

function likeClause(column: string): string {
  return `${column} LIKE ? ${LIKE_ESCAPE}`
}

const TAG_LIKE = `EXISTS (SELECT 1 FROM item_tags it JOIN tags t ON t.id = it.tag_id
                            WHERE it.item_id = i.id AND t.name LIKE ? ${LIKE_ESCAPE})`

const COLLECTION_LIKE = `EXISTS (SELECT 1 FROM collections c
                                  WHERE c.id = i.collection_id AND c.name LIKE ? ${LIKE_ESCAPE})`

/**
 * Decides how a query string is matched.
 *
 * ASCII queries use FTS5 with prefix terms, plus substring `LIKE` as a
 * fallback so "unnel" still finds "tunnel". Queries containing CJK cannot use
 * FTS5's `unicode61` tokenizer usefully (it does not split Chinese words), so
 * those fall back to an AND of substring matches per token.
 */
function planText(text: string): TextPlan | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const tokens = trimmed.split(/\s+/).filter(Boolean)
  const fts = tokens.every((token) => !containsCjk(token)) ? buildFtsQuery(trimmed) : null

  if (fts) {
    return {
      clauses: `(i.id IN (SELECT id FROM items_fts WHERE items_fts MATCH ?) OR ${likeClause(
        'i.title',
      )} OR ${likeClause('i.body')} OR ${TAG_LIKE} OR ${COLLECTION_LIKE})`,
      params: [
        fts,
        likePattern(trimmed),
        likePattern(trimmed),
        likePattern(trimmed),
        likePattern(trimmed),
      ],
      fts,
    }
  }

  const parts: string[] = []
  const params: SqlValue[] = []
  for (const token of tokens) {
    const pattern = likePattern(token)
    parts.push(
      `(${likeClause('i.title')} OR ${likeClause('i.body')} OR ${TAG_LIKE} OR ${COLLECTION_LIKE})`,
    )
    params.push(pattern, pattern, pattern, pattern)
  }
  if (parts.length === 0) return null
  return { clauses: `(${parts.join(' AND ')})`, params, fts: null }
}

/* -------------------------------------------------------------------------- */
/* Ordering                                                                   */
/* -------------------------------------------------------------------------- */

function orderBy(sort: SortKey, hasRank: boolean): string {
  switch (sort) {
    case 'created':
      return 'i.created_at DESC'
    case 'updated':
      return 'i.updated_at DESC'
    case 'usage':
      return 'i.use_count DESC, COALESCE(i.last_used_at, i.created_at) DESC'
    case 'title':
      return 'i.title COLLATE NOCASE ASC'
    case 'relevance':
      return hasRank
        ? 'f.rank ASC NULLS LAST, i.favorite DESC, i.use_count DESC, COALESCE(i.last_used_at, i.created_at) DESC'
        : 'COALESCE(i.last_used_at, i.created_at) DESC'
    case 'recent':
    default:
      // Never-used items fall back to their creation time, so a fresh shelf is
      // ordered by "most recent activity" rather than by nothing at all.
      return 'COALESCE(i.last_used_at, i.created_at) DESC'
  }
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

/** Normalises an untrusted query object coming over IPC. */
export function sanitizeQuery(input: Partial<ItemQuery> | undefined): ItemQuery {
  const raw = input ?? {}
  const kinds = Array.isArray(raw.kinds) ? raw.kinds.filter(isItemKind) : []
  const collection =
    typeof raw.collection === 'string' && raw.collection.length > 0
      ? raw.collection
      : COLLECTION_ALL
  return {
    text: typeof raw.text === 'string' ? raw.text.slice(0, 500) : '',
    kinds: [...new Set(kinds)],
    collection,
    tag: typeof raw.tag === 'string' && raw.tag.trim() ? raw.tag.trim() : null,
    favoriteOnly: raw.favoriteOnly === true,
    sort: isSortKey(raw.sort) ? raw.sort : 'recent',
    limit: clamp(Number(raw.limit ?? 200), 1, 1000),
    offset: clamp(Number(raw.offset ?? 0), 0, 1_000_000),
    includeDeleted: raw.includeDeleted === true,
  }
}

export function listItems(db: DatabaseSync, input: Partial<ItemQuery> | undefined): Item[] {
  const query = sanitizeQuery(input)

  const where: string[] = []
  const whereParams: SqlValue[] = []
  const joinParams: SqlValue[] = []

  if (!query.includeDeleted) where.push('i.deleted_at IS NULL')

  if (query.kinds.length > 0) {
    where.push(`i.kind IN (${placeholders(query.kinds.length)})`)
    whereParams.push(...query.kinds)
  }
  if (query.favoriteOnly) where.push('i.favorite = 1')

  if (query.collection === COLLECTION_NONE) {
    where.push('i.collection_id IS NULL')
  } else if (query.collection !== COLLECTION_ALL) {
    where.push('i.collection_id = ?')
    whereParams.push(query.collection)
  }

  if (query.tag) {
    where.push(`EXISTS (SELECT 1 FROM item_tags it JOIN tags t ON t.id = it.tag_id
                          WHERE it.item_id = i.id AND t.name = ? COLLATE NOCASE)`)
    whereParams.push(query.tag)
  }

  const text = planText(query.text)
  let join = ''
  if (text?.fts) {
    join = `LEFT JOIN (SELECT id AS fid, bm25(items_fts) AS rank
                        FROM items_fts WHERE items_fts MATCH ?) f ON f.fid = i.id`
    joinParams.push(text.fts)
  }
  if (text) {
    where.push(text.clauses)
    whereParams.push(...text.params)
  }

  const sql = `SELECT i.*, ${text?.fts ? 'f.rank' : 'NULL'} AS rank
                 FROM items i
                 ${join}
                 ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
                ORDER BY ${orderBy(query.sort, Boolean(text?.fts))}
                LIMIT ? OFFSET ?`

  const rows = asRows<ItemRow>(
    db.prepare(sql).all(...joinParams, ...whereParams, query.limit, query.offset),
  )
  return hydrate(db, rows)
}

export function getItem(db: DatabaseSync, id: string): Item | null {
  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined
  if (!row) return null
  const tags = tagsForItems(db, [id]).get(id) ?? []
  return toItem(row, tags)
}

export function getCounts(db: DatabaseSync): Counts {
  const totals = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM items WHERE deleted_at IS NULL) AS live,
         (SELECT COUNT(*) FROM items WHERE deleted_at IS NULL AND favorite = 1) AS favorite,
         (SELECT COUNT(*) FROM items WHERE deleted_at IS NULL AND collection_id IS NULL) AS uncategorized`,
    )
    .get() as { live: number; favorite: number; uncategorized: number }

  const byKind: Record<ItemKind, number> = {
    command: 0,
    prompt: 0,
    snippet: 0,
    link: 0,
    path: 0,
  }
  const kindRows = db
    .prepare('SELECT kind, COUNT(*) AS c FROM items WHERE deleted_at IS NULL GROUP BY kind')
    .all() as { kind: string; c: number }[]
  for (const row of kindRows) {
    if (isItemKind(row.kind)) byKind[row.kind] = Number(row.c)
  }

  const byCollection: Record<string, number> = {}
  const collectionRows = db
    .prepare(
      `SELECT collection_id AS id, COUNT(*) AS c
         FROM items
        WHERE deleted_at IS NULL AND collection_id IS NOT NULL
        GROUP BY collection_id`,
    )
    .all() as { id: string; c: number }[]
  for (const row of collectionRows) byCollection[row.id] = Number(row.c)

  return {
    all: Number(totals.live),
    favorite: Number(totals.favorite),
    uncategorized: Number(totals.uncategorized),
    byKind,
    byCollection,
  }
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

function insertItemWithin(db: DatabaseSync, input: NormalizedDraft): string {
  const id = newId()
  const timestamp = now()
  db.prepare(
    `INSERT INTO items
       (id, title, body, kind, language, collection_id, favorite, use_count,
        last_used_at, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, NULL)`,
  ).run(
    id,
    input.title,
    input.body,
    input.kind,
    input.language,
    input.collectionId,
    bool(input.favorite),
    timestamp,
    timestamp,
  )
  replaceItemTagsWithin(db, id, input.tags)
  syncItemFts(db, id)
  return id
}

/** Inserts an item with an explicit id/timestamp — used only by import. */
export function insertRawItemWithin(db: DatabaseSync, item: Item): void {
  db.prepare(
    `INSERT INTO items
       (id, title, body, kind, language, collection_id, favorite, use_count,
        last_used_at, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    item.id,
    item.title,
    item.body,
    item.kind,
    item.language,
    item.collectionId,
    bool(item.favorite),
    item.useCount,
    item.lastUsedAt,
    item.createdAt,
    item.updatedAt,
    item.deletedAt,
  )
  replaceItemTagsWithin(db, item.id, item.tags)
  syncItemFts(db, item.id)
}

export function createItem(db: DatabaseSync, draft: ItemDraft): Item {
  const input = normalizeDraft(draft)
  return transact(db, () => {
    const id = insertItemWithin(db, input)
    const created = getItem(db, id)
    if (!created) throw new Error('条目创建后无法读回')
    return created
  })
}

export function updateItem(db: DatabaseSync, id: string, draft: ItemDraft): Item {
  const input = normalizeDraft(draft)
  return transact(db, () => {
    const existing = db.prepare('SELECT id FROM items WHERE id = ?').get(id) as
      { id: string } | undefined
    if (!existing) throw new Error('条目不存在或已被删除')

    db.prepare(
      `UPDATE items
          SET title = ?, body = ?, kind = ?, language = ?, collection_id = ?,
              favorite = ?, updated_at = ?
        WHERE id = ?`,
    ).run(
      input.title,
      input.body,
      input.kind,
      input.language,
      input.collectionId,
      bool(input.favorite),
      now(),
      id,
    )
    replaceItemTagsWithin(db, id, input.tags)
    pruneUnusedTagsWithin(db)
    syncItemFts(db, id)

    const updated = getItem(db, id)
    if (!updated) throw new Error('条目更新后无法读回')
    return updated
  })
}

/** Soft delete. The row stays so the UI can offer an undo. */
export function removeItem(db: DatabaseSync, id: string): void {
  transact(db, () => {
    db.prepare('UPDATE items SET deleted_at = ? WHERE id = ?').run(now(), id)
    syncItemFts(db, id)
  })
}

export function restoreItem(db: DatabaseSync, id: string): Item | null {
  return transact(db, () => {
    db.prepare('UPDATE items SET deleted_at = NULL WHERE id = ?').run(id)
    syncItemFts(db, id)
    return getItem(db, id)
  })
}

/** Permanent delete. */
export function purgeItem(db: DatabaseSync, id: string): void {
  transact(db, () => {
    db.prepare('DELETE FROM items WHERE id = ?').run(id)
    db.prepare('DELETE FROM items_fts WHERE id = ?').run(id)
    pruneUnusedTagsWithin(db)
  })
}

/** Records a use. Deliberately does not touch `updated_at`: copying an item is
 *  not editing it, and bumping it would reshuffle the "最近修改" order. */
export function markUsed(db: DatabaseSync, id: string): Item | null {
  return transact(db, () => {
    db.prepare('UPDATE items SET use_count = use_count + 1, last_used_at = ? WHERE id = ?').run(
      now(),
      id,
    )
    return getItem(db, id)
  })
}

export function setFavorite(db: DatabaseSync, id: string, favorite: boolean): Item | null {
  return transact(db, () => {
    db.prepare('UPDATE items SET favorite = ?, updated_at = ? WHERE id = ?').run(
      bool(favorite),
      now(),
      id,
    )
    return getItem(db, id)
  })
}

/** Rewrites the whole search index. Called after tag renames and imports. */
export function refreshSearchIndex(db: DatabaseSync): number {
  return rebuildFts(db)
}
