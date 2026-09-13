import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'

import { createItem, getItem, updateItem } from '../../src/main/repo/items'
import { listTags, removeTag, renameTag } from '../../src/main/repo/tags'
import { createTestDatabase } from './helpers'

let db: DatabaseSync

beforeEach(() => {
  db = createTestDatabase()
})

afterEach(() => {
  db.close()
})

function seed(): void {
  createItem(db, { title: 'a', body: 'a', kind: 'command', tags: ['ssh', '网络'] })
  createItem(db, { title: 'b', body: 'b', kind: 'command', tags: ['ssh'] })
  createItem(db, { title: 'c', body: 'c', kind: 'command', tags: [] })
}

describe('listTags', () => {
  it('lists tags with live item counts, alphabetically', () => {
    seed()
    const tags = listTags(db)
    expect(tags.map((tag) => tag.name)).toEqual(['ssh', '网络'])
    expect(tags.find((tag) => tag.name === 'ssh')?.itemCount).toBe(2)
    expect(tags.find((tag) => tag.name === '网络')?.itemCount).toBe(1)
  })

  it('does not count deleted items', () => {
    seed()
    const item = db.prepare("SELECT id FROM items WHERE title = 'b'").get() as { id: string }
    db.prepare('UPDATE items SET deleted_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      item.id,
    )
    expect(listTags(db).find((tag) => tag.name === 'ssh')?.itemCount).toBe(1)
  })
})

describe('renameTag', () => {
  it('renames in place when the target does not exist', () => {
    seed()
    renameTag(db, '网络', '网络配置')
    expect(listTags(db).map((tag) => tag.name)).toEqual(['ssh', '网络配置'])
  })

  it('merges into an existing tag and de-duplicates the links', () => {
    seed()
    renameTag(db, '网络', 'ssh')
    // Both items already had `ssh`, so merging must not create duplicate links.
    expect(listTags(db).map((tag) => tag.name)).toEqual(['ssh'])
    expect(listTags(db)[0]?.itemCount).toBe(2)
  })

  it('matches the source tag case-insensitively', () => {
    seed()
    renameTag(db, 'SSH', 'shell')
    expect(listTags(db).map((tag) => tag.name)).toEqual(['shell', '网络'])
  })

  it('is a no-op for an unknown tag', () => {
    seed()
    expect(renameTag(db, 'nope', 'x').map((tag) => tag.name)).toEqual(['ssh', '网络'])
  })

  it('rejects a blank target name', () => {
    seed()
    expect(() => renameTag(db, 'ssh', '  ')).toThrow('标签名不能为空')
  })
})

describe('removeTag', () => {
  it('removes the tag and its links but keeps the items', () => {
    seed()
    removeTag(db, 'ssh')

    expect(listTags(db).map((tag) => tag.name)).toEqual(['网络'])
    const item = getItem(
      db,
      (db.prepare("SELECT id FROM items WHERE title = 'b'").get() as { id: string }).id,
    )
    expect(item?.tags).toEqual([])
    expect(item?.title).toBe('b')
  })

  it('is a no-op for an unknown tag', () => {
    seed()
    expect(removeTag(db, 'nope').map((tag) => tag.name)).toEqual(['ssh', '网络'])
  })
})

describe('tag hygiene through item updates', () => {
  it('prunes a tag once nothing references it', () => {
    const item = createItem(db, { title: 'a', body: 'a', kind: 'command', tags: ['lonely'] })
    updateItem(db, item.id, { title: 'a', body: 'a', kind: 'command', tags: [] })
    expect(listTags(db)).toHaveLength(0)
  })

  it('reuses an existing tag rather than creating a second one', () => {
    const first = createItem(db, { title: 'a', body: 'a', kind: 'command', tags: ['ssh'] })
    const second = createItem(db, { title: 'b', body: 'b', kind: 'command', tags: ['SSH'] })
    expect(listTags(db)).toHaveLength(1)
    expect(getItem(db, first.id)?.tags).toEqual(['ssh'])
    expect(getItem(db, second.id)?.tags).toEqual(['ssh'])
  })
})
