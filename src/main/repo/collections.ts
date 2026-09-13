import type { DatabaseSync } from 'node:sqlite'

import type { Collection } from '@shared/types'

import { asRows, transact } from '../db/connection'
import { newId, now } from './ids'

/** Collections ("分类"): one optional folder per item. */

interface CollectionRow {
  id: string
  name: string
  sort_order: number
  created_at: string
  item_count: number
}

const SELECT_COLLECTIONS = `
  SELECT c.id AS id,
         c.name AS name,
         c.sort_order AS sort_order,
         c.created_at AS created_at,
         (SELECT COUNT(*) FROM items i
           WHERE i.collection_id = c.id AND i.deleted_at IS NULL) AS item_count
    FROM collections c
   ORDER BY c.sort_order ASC, c.name COLLATE NOCASE ASC
`

function toCollection(row: CollectionRow): Collection {
  return {
    id: row.id,
    name: row.name,
    sortOrder: Number(row.sort_order),
    createdAt: row.created_at,
    itemCount: Number(row.item_count),
  }
}

function cleanName(name: string): string {
  const trimmed = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
  if (!trimmed) throw new Error('分类名不能为空')
  return trimmed
}

export function listCollections(db: DatabaseSync): Collection[] {
  const rows = asRows<CollectionRow>(db.prepare(SELECT_COLLECTIONS).all())
  return rows.map(toCollection)
}

export function createCollection(db: DatabaseSync, name: string): Collection {
  const cleaned = cleanName(name)
  return transact(db, () => {
    const existing = db
      .prepare('SELECT id FROM collections WHERE name = ? COLLATE NOCASE')
      .get(cleaned) as { id: string } | undefined
    if (existing) throw new Error(`分类「${cleaned}」已存在`)

    const next = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM collections')
      .get() as {
      next: number
    }
    const id = newId()
    db.prepare(
      'INSERT INTO collections (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)',
    ).run(id, cleaned, Number(next.next), now())
    const created = listCollections(db).find((entry) => entry.id === id)
    if (!created) throw new Error('分类创建后无法读回')
    return created
  })
}

/** Finds a collection by name or creates it. Returns its id. Used by import. */
export function ensureCollectionWithin(db: DatabaseSync, name: string): string | null {
  const cleaned = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
  if (!cleaned) return null
  const existing = db
    .prepare('SELECT id FROM collections WHERE name = ? COLLATE NOCASE')
    .get(cleaned) as { id: string } | undefined
  if (existing) return existing.id

  const next = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM collections')
    .get() as {
    next: number
  }
  const id = newId()
  db.prepare('INSERT INTO collections (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    cleaned,
    Number(next.next),
    now(),
  )
  return id
}

export function renameCollection(db: DatabaseSync, id: string, name: string): Collection {
  const cleaned = cleanName(name)
  return transact(db, () => {
    const clash = db
      .prepare('SELECT id FROM collections WHERE name = ? COLLATE NOCASE AND id <> ?')
      .get(cleaned, id) as { id: string } | undefined
    if (clash) throw new Error(`分类「${cleaned}」已存在`)

    const result = db.prepare('UPDATE collections SET name = ? WHERE id = ?').run(cleaned, id)
    if (Number(result.changes) === 0) throw new Error('分类不存在')

    const updated = listCollections(db).find((entry) => entry.id === id)
    if (!updated) throw new Error('分类更新后无法读回')
    return updated
  })
}

/**
 * Deletes a collection. Its items are kept and become uncategorised — the
 * schema's `ON DELETE SET NULL` is what guarantees that.
 */
export function removeCollection(db: DatabaseSync, id: string): void {
  transact(db, () => {
    db.prepare('DELETE FROM collections WHERE id = ?').run(id)
  })
}

export function reorderCollections(db: DatabaseSync, ids: readonly string[]): Collection[] {
  return transact(db, () => {
    const update = db.prepare('UPDATE collections SET sort_order = ? WHERE id = ?')
    ids.forEach((id, index) => update.run(index, id))
    return listCollections(db)
  })
}
