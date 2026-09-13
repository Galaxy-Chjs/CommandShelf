import type { DatabaseSync } from 'node:sqlite'

/**
 * Search index maintenance.
 *
 * `items_fts` mirrors `items.title`, `items.body`, the item's tag names, and the
 * name of its collection. Everything searchable but not a column of `items`
 * goes in the `tags` field — it is just a bag of words to FTS, and indexing
 * them there is what makes `ssh` find both `#ssh` and the 服务器 collection.
 *
 * It is an ordinary (non-contentless, non-external-content) FTS5 table, so rows
 * are added and removed with plain SQL.
 *
 * Kept out of tags.ts / items.ts so neither has to import the other.
 */

const DOCUMENT_COLUMNS = `
  SELECT i.id            AS id,
         i.title         AS title,
         i.body          AS body,
         i.deleted_at    AS deleted_at,
         TRIM(
           COALESCE((
             SELECT GROUP_CONCAT(t.name, ' ')
               FROM item_tags it
               JOIN tags t ON t.id = it.tag_id
              WHERE it.item_id = i.id
           ), '')
           || ' ' ||
           COALESCE((SELECT c.name FROM collections c WHERE c.id = i.collection_id), '')
         ) AS tags
    FROM items i
`

const DOCUMENT_ONE = `${DOCUMENT_COLUMNS} WHERE i.id = ?`
const DOCUMENT_LIVE = `${DOCUMENT_COLUMNS} WHERE i.deleted_at IS NULL`

interface FtsDocument {
  id: string
  title: string
  body: string
  deleted_at: string | null
  tags: string
}

/**
 * Rewrites the index row for one item. Soft-deleted items are removed from the
 * index so a deleted entry never shows up in a search result.
 */
export function syncItemFts(db: DatabaseSync, itemId: string): void {
  db.prepare('DELETE FROM items_fts WHERE id = ?').run(itemId)

  const document = db.prepare(DOCUMENT_ONE).get(itemId) as FtsDocument | undefined
  if (!document || document.deleted_at) return

  db.prepare('INSERT INTO items_fts (id, title, body, tags) VALUES (?, ?, ?, ?)').run(
    document.id,
    document.title,
    document.body,
    document.tags,
  )
}

/** Rewrites the whole index. Used after an import and by the repair action. */
export function rebuildFts(db: DatabaseSync): number {
  db.exec('DELETE FROM items_fts')
  const insert = db.prepare('INSERT INTO items_fts (id, title, body, tags) VALUES (?, ?, ?, ?)')
  const rows = db.prepare(DOCUMENT_LIVE).all() as Omit<FtsDocument, 'deleted_at'>[]
  for (const row of rows) insert.run(row.id, row.title, row.body, row.tags)
  return rows.length
}

/**
 * Startup guard: if the index and the table disagree — an interrupted write, a
 * database copied from elsewhere, an upgrade bug — rebuild rather than serve
 * incomplete search results. Returns true when a rebuild happened.
 */
export function ensureFtsConsistent(db: DatabaseSync): boolean {
  const live = db.prepare('SELECT COUNT(*) AS c FROM items WHERE deleted_at IS NULL').get() as {
    c: number
  }
  const indexed = db.prepare('SELECT COUNT(*) AS c FROM items_fts').get() as { c: number }
  if (Number(live.c) === Number(indexed.c)) return false
  rebuildFts(db)
  return true
}
