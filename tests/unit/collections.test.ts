import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'

import {
  createCollection,
  ensureCollectionWithin,
  listCollections,
  removeCollection,
  renameCollection,
  reorderCollections,
} from '../../src/main/repo/collections'
import { createItem } from '../../src/main/repo/items'
import { createTestDatabase } from './helpers'

let db: DatabaseSync

beforeEach(() => {
  db = createTestDatabase()
})

afterEach(() => {
  db.close()
})

describe('createCollection', () => {
  it('creates a collection with a zero item count', () => {
    const collection = createCollection(db, '服务器')
    expect(collection.name).toBe('服务器')
    expect(collection.itemCount).toBe(0)
    expect(listCollections(db)).toHaveLength(1)
  })

  it('trims and collapses whitespace in the name', () => {
    expect(createCollection(db, '  a   b  ').name).toBe('a b')
  })

  it('rejects a blank name', () => {
    expect(() => createCollection(db, '   ')).toThrow('分类名不能为空')
  })

  it('rejects a duplicate name, ignoring case', () => {
    createCollection(db, 'Server')
    expect(() => createCollection(db, 'server')).toThrow('已存在')
  })

  it('appends new collections in creation order', () => {
    createCollection(db, 'first')
    createCollection(db, 'second')
    expect(listCollections(db).map((entry) => entry.name)).toEqual(['first', 'second'])
  })
})

describe('renameCollection', () => {
  it('renames a collection', () => {
    const collection = createCollection(db, 'old')
    expect(renameCollection(db, collection.id, 'new').name).toBe('new')
  })

  it('refuses a name already in use', () => {
    createCollection(db, 'taken')
    const other = createCollection(db, 'mine')
    expect(() => renameCollection(db, other.id, 'taken')).toThrow('已存在')
  })

  it('allows renaming a collection to its own name', () => {
    const collection = createCollection(db, 'same')
    expect(renameCollection(db, collection.id, 'same').name).toBe('same')
  })

  it('throws for an unknown id', () => {
    expect(() => renameCollection(db, 'missing', 'x')).toThrow('分类不存在')
  })
})

describe('item counts', () => {
  it('counts only live items', () => {
    const collection = createCollection(db, 'c')
    createItem(db, { title: 'a', body: 'a', kind: 'command', collectionId: collection.id })
    createItem(db, { title: 'b', body: 'b', kind: 'command', collectionId: collection.id })

    expect(listCollections(db)[0]?.itemCount).toBe(2)

    const item = db.prepare('SELECT id FROM items LIMIT 1').get() as { id: string }
    db.prepare('UPDATE items SET deleted_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      item.id,
    )
    expect(listCollections(db)[0]?.itemCount).toBe(1)
  })
})

describe('removeCollection', () => {
  it('leaves the items in place', () => {
    const collection = createCollection(db, 'doomed')
    const item = createItem(db, {
      title: 'kept',
      body: 'x',
      kind: 'command',
      collectionId: collection.id,
    })
    removeCollection(db, collection.id)

    expect(listCollections(db)).toHaveLength(0)
    const row = db.prepare('SELECT collection_id FROM items WHERE id = ?').get(item.id) as {
      collection_id: string | null
    }
    expect(row.collection_id).toBeNull()
  })
})

describe('reorderCollections', () => {
  it('applies the given order', () => {
    const first = createCollection(db, 'a')
    const second = createCollection(db, 'b')
    const third = createCollection(db, 'c')

    const reordered = reorderCollections(db, [third.id, first.id, second.id])
    expect(reordered.map((entry) => entry.name)).toEqual(['c', 'a', 'b'])
  })

  it('ignores ids that do not exist', () => {
    const only = createCollection(db, 'only')
    expect(reorderCollections(db, [only.id, 'missing'])[0]?.name).toBe('only')
  })
})

describe('ensureCollectionWithin', () => {
  it('returns the existing id rather than creating a duplicate', () => {
    const first = createCollection(db, 'shared')
    expect(ensureCollectionWithin(db, 'SHARED')).toBe(first.id)
    expect(listCollections(db)).toHaveLength(1)
  })

  it('creates on demand', () => {
    const id = ensureCollectionWithin(db, 'fresh')
    expect(id).toBeTruthy()
    expect(listCollections(db)).toHaveLength(1)
  })

  it('returns null for a blank name', () => {
    expect(ensureCollectionWithin(db, '  ')).toBeNull()
  })
})
