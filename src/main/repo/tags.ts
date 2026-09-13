import type { DatabaseSync } from 'node:sqlite'

import { normalizeTag } from '@shared/search'
import type { Tag } from '@shared/types'

import { placeholders, transact } from '../db/connection'
import { newId } from './ids'

/**
 * Tags, and the item↔tag join.
 *
 * Convention for this folder: the functions exported for the IPC layer open
 * their own transaction; the `*Within` helpers assume one is already open and
 * are used to keep a larger write atomic.
 */

interface TagRow {
  id: string
  name: string
}

/** Tags with a count of live (non-deleted) items, ordered for display. */
export function listTags(db: DatabaseSync): Tag[] {
  const rows = db
    .prepare(
      `SELECT t.id AS id, t.name AS name, COUNT(i.id) AS item_count
         FROM tags t
         LEFT JOIN item_tags it ON it.tag_id = t.id
         LEFT JOIN items i ON i.id = it.item_id AND i.deleted_at IS NULL
        GROUP BY t.id, t.name
        ORDER BY t.name COLLATE NOCASE ASC`,
    )
    .all() as { id: string; name: string; item_count: number }[]

  return rows.map((row) => ({ id: row.id, name: row.name, itemCount: Number(row.item_count) }))
}

function findTag(db: DatabaseSync, name: string): TagRow | undefined {
  return db.prepare('SELECT id, name FROM tags WHERE name = ? COLLATE NOCASE').get(name) as
    TagRow | undefined
}

/** Creates the tag if it is new; returns its id either way. */
function ensureTagWithin(db: DatabaseSync, name: string): string | null {
  const normalized = normalizeTag(name)
  if (!normalized) return null
  const existing = findTag(db, normalized)
  if (existing) return existing.id
  const id = newId()
  db.prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run(id, normalized)
  return id
}

/**
 * Tags of the given items, as a map from item id to tag names.
 *
 * Names come back in case-insensitive alphabetical order, not the order they
 * were typed: an item's tags are a set, and a stable order keeps the list, the
 * detail pane and the sidebar consistent with each other.
 */
export function tagsForItems(db: DatabaseSync, itemIds: readonly string[]): Map<string, string[]> {
  const result = new Map<string, string[]>()
  if (itemIds.length === 0) return result

  const rows = db
    .prepare(
      `SELECT it.item_id AS item_id, t.name AS name
         FROM item_tags it
         JOIN tags t ON t.id = it.tag_id
        WHERE it.item_id IN (${placeholders(itemIds.length)})
        ORDER BY t.name COLLATE NOCASE ASC`,
    )
    .all(...itemIds) as { item_id: string; name: string }[]

  for (const row of rows) {
    const list = result.get(row.item_id)
    if (list) list.push(row.name)
    else result.set(row.item_id, [row.name])
  }
  return result
}

/**
 * Makes the item's tags exactly `names`. Requires an open transaction.
 * Returns the tag names actually stored, which may differ from the input if a
 * name normalised to empty.
 */
export function replaceItemTagsWithin(
  db: DatabaseSync,
  itemId: string,
  names: readonly string[],
): string[] {
  const desired = new Map<string, string>()
  for (const name of names) {
    const tagId = ensureTagWithin(db, name)
    if (tagId) desired.set(tagId, normalizeTag(name))
  }

  const current = db.prepare('SELECT tag_id FROM item_tags WHERE item_id = ?').all(itemId) as {
    tag_id: string
  }[]

  const currentIds = new Set(current.map((row) => row.tag_id))
  const remove = db.prepare('DELETE FROM item_tags WHERE item_id = ? AND tag_id = ?')
  for (const tagId of currentIds) {
    if (!desired.has(tagId)) remove.run(itemId, tagId)
  }

  const add = db.prepare('INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)')
  for (const tagId of desired.keys()) {
    if (!currentIds.has(tagId)) add.run(itemId, tagId)
  }

  return [...desired.values()]
}

/** Drops tags that no longer label anything. Requires an open transaction. */
export function pruneUnusedTagsWithin(db: DatabaseSync): void {
  db.exec('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM item_tags)')
}

export function renameTag(db: DatabaseSync, from: string, to: string): Tag[] {
  const source = normalizeTag(from)
  const target = normalizeTag(to)
  if (!source || !target) throw new Error('标签名不能为空')

  return transact(db, () => {
    const sourceRow = findTag(db, source)
    if (!sourceRow) return listTags(db)

    const targetRow = findTag(db, target)
    if (targetRow && targetRow.id !== sourceRow.id) {
      // Merging into an existing tag: move the links, then drop the source.
      db.prepare(
        'INSERT OR IGNORE INTO item_tags (item_id, tag_id) SELECT item_id, ? FROM item_tags WHERE tag_id = ?',
      ).run(targetRow.id, sourceRow.id)
      db.prepare('DELETE FROM item_tags WHERE tag_id = ?').run(sourceRow.id)
      db.prepare('DELETE FROM tags WHERE id = ?').run(sourceRow.id)
    } else {
      db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(target, sourceRow.id)
    }
    pruneUnusedTagsWithin(db)
    return listTags(db)
  })
}

export function removeTag(db: DatabaseSync, name: string): Tag[] {
  const tag = normalizeTag(name)
  if (!tag) return listTags(db)

  return transact(db, () => {
    const row = findTag(db, tag)
    if (row) {
      db.prepare('DELETE FROM item_tags WHERE tag_id = ?').run(row.id)
      db.prepare('DELETE FROM tags WHERE id = ?').run(row.id)
    }
    // The tag list is part of the FTS document, so affected items are resynced
    // by the caller (repo/items.ts) after this returns.
    return listTags(db)
  })
}
