import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'

import { COLLECTION_ALL, COLLECTION_NONE, type Item, type ItemDraft } from '@shared/types'

import {
  createItem,
  getCounts,
  getItem,
  listItems,
  markUsed,
  normalizeDraft,
  purgeItem,
  removeItem,
  restoreItem,
  sanitizeQuery,
  setFavorite,
  updateItem,
} from '../../src/main/repo/items'
import { createCollection, removeCollection } from '../../src/main/repo/collections'
import { count, createTestDatabase } from './helpers'

let db: DatabaseSync

beforeEach(() => {
  db = createTestDatabase()
})

afterEach(() => {
  db.close()
})

function add(overrides: Partial<ItemDraft> = {}): Item {
  return createItem(db, {
    title: 'a command',
    body: 'ssh host',
    kind: 'command',
    ...overrides,
  })
}

function titles(items: Item[]): string[] {
  return items.map((item) => item.title)
}

describe('createItem', () => {
  it('stores an item and returns it with its tags', () => {
    const item = add({ tags: ['ssh', '服务器'] })
    expect(item.id).toBeTruthy()
    expect(item.tags).toEqual(['ssh', '服务器'])
    expect(item.favorite).toBe(false)
    expect(item.useCount).toBe(0)
    expect(item.deletedAt).toBeNull()
  })

  it('derives a title from the body when the title is blank', () => {
    const item = add({ title: '   ', body: 'git reset --soft HEAD~1' })
    expect(item.title).toBe('git reset --soft HEAD~1')
  })

  it('falls back to a placeholder title when there is no body either', () => {
    const item = add({ title: '', body: '' })
    expect(item.title).toBe('未命名命令')
  })

  it('keeps the language only for snippets', () => {
    expect(add({ kind: 'snippet', language: 'python' }).language).toBe('python')
    expect(add({ kind: 'command', language: 'python' }).language).toBeNull()
  })

  it('defaults a snippet to plain text', () => {
    expect(add({ kind: 'snippet' }).language).toBe('text')
  })

  it('rejects an unknown kind by falling back to command', () => {
    expect(add({ kind: 'nonsense' as never }).kind).toBe('command')
  })
})

describe('normalizeDraft', () => {
  it('truncates an over-long title', () => {
    expect(
      normalizeDraft({ title: 'x'.repeat(500), body: '', kind: 'command' }).title,
    ).toHaveLength(200)
  })
})

describe('getItem', () => {
  it('returns null for an unknown id', () => {
    expect(getItem(db, 'missing')).toBeNull()
  })

  it('round-trips every persisted field', () => {
    const created = add({ tags: ['a'], favorite: true })
    const loaded = getItem(db, created.id)
    expect(loaded).toMatchObject({
      id: created.id,
      title: created.title,
      body: created.body,
      kind: created.kind,
      favorite: true,
      tags: ['a'],
    })
  })
})

describe('updateItem', () => {
  it('replaces fields and tags', () => {
    const created = add({ tags: ['old'] })
    const updated = updateItem(db, created.id, {
      title: 'new title',
      body: 'new body',
      kind: 'prompt',
      tags: ['new', 'fresh'],
    })
    expect(updated.title).toBe('new title')
    expect(updated.kind).toBe('prompt')
    // Tags are returned in a stable alphabetical order, not input order.
    expect(updated.tags).toEqual(['fresh', 'new'])
    expect(updated.updatedAt >= created.updatedAt).toBe(true)
  })

  it('drops tags that are no longer used anywhere', () => {
    const created = add({ tags: ['temporary'] })
    updateItem(db, created.id, {
      title: created.title,
      body: created.body,
      kind: 'command',
      tags: [],
    })
    expect(count(db, 'SELECT COUNT(*) AS c FROM tags')).toBe(0)
  })

  it('throws for an unknown id', () => {
    expect(() => updateItem(db, 'missing', { title: 't', body: 'b', kind: 'command' })).toThrow(
      '条目不存在',
    )
  })
})

describe('soft delete and restore', () => {
  it('hides a deleted item from the list but keeps the row', () => {
    const item = add()
    removeItem(db, item.id)

    expect(listItems(db, undefined)).toHaveLength(0)
    expect(count(db, 'SELECT COUNT(*) AS c FROM items')).toBe(1)
    expect(getItem(db, item.id)?.deletedAt).not.toBeNull()
  })

  it('excludes a deleted item from counts', () => {
    const item = add()
    removeItem(db, item.id)
    expect(getCounts(db).all).toBe(0)
  })

  it('restores a deleted item', () => {
    const item = add()
    removeItem(db, item.id)
    const restored = restoreItem(db, item.id)
    expect(restored?.deletedAt).toBeNull()
    expect(listItems(db, undefined)).toHaveLength(1)
  })

  it('can list deleted items explicitly', () => {
    const item = add()
    removeItem(db, item.id)
    expect(listItems(db, { includeDeleted: true })).toHaveLength(1)
  })

  it('purges permanently, taking its tag links with it', () => {
    const item = add({ tags: ['gone'] })
    purgeItem(db, item.id)
    expect(count(db, 'SELECT COUNT(*) AS c FROM items')).toBe(0)
    expect(count(db, 'SELECT COUNT(*) AS c FROM item_tags')).toBe(0)
    expect(count(db, 'SELECT COUNT(*) AS c FROM tags')).toBe(0)
  })
})

describe('usage and favourites', () => {
  it('increments the use count and stamps last used, without touching updatedAt', () => {
    const item = add()
    const used = markUsed(db, item.id)
    expect(used?.useCount).toBe(1)
    expect(used?.lastUsedAt).toBeTruthy()
    expect(used?.updatedAt).toBe(item.updatedAt)
  })

  it('toggles the favourite flag', () => {
    const item = add()
    expect(setFavorite(db, item.id, true)?.favorite).toBe(true)
    expect(setFavorite(db, item.id, false)?.favorite).toBe(false)
  })
})

describe('search', () => {
  beforeEach(() => {
    add({ title: 'ssh tunnel', body: 'ssh -L 8080:localhost:80 box' })
    add({ title: '端口转发', body: 'ssh -L {{local}}:localhost:{{remote}} server' })
    add({ title: 'pytest rerun', body: 'pytest --lf -x', kind: 'command', tags: ['testing'] })
    add({ title: 'a prompt', body: 'review this code', kind: 'prompt' })
  })

  it('returns everything for an empty query', () => {
    expect(listItems(db, { text: '' })).toHaveLength(4)
  })

  it('matches a prefix of a word in the body', () => {
    expect(titles(listItems(db, { text: 'tun' }))).toEqual(['ssh tunnel'])
  })

  it('matches a substring in the middle of a word', () => {
    // FTS prefix terms cannot do this; the LIKE fallback is what makes it work.
    expect(titles(listItems(db, { text: 'unnel' }))).toEqual(['ssh tunnel'])
  })

  it('requires every token to match', () => {
    expect(listItems(db, { text: 'ssh tunnel' })).toHaveLength(1)
    expect(listItems(db, { text: 'ssh pytest' })).toHaveLength(0)
  })

  it('matches Chinese content', () => {
    expect(titles(listItems(db, { text: '端口' }))).toEqual(['端口转发'])
  })

  it('matches a mixed Chinese and ASCII query', () => {
    expect(titles(listItems(db, { text: 'ssh 端口' }))).toEqual(['端口转发'])
  })

  it('matches by tag name', () => {
    expect(titles(listItems(db, { text: 'testing' }))).toEqual(['pytest rerun'])
  })

  it('matches by collection name', () => {
    const collection = createCollection(db, '服务器')
    const item = add({ title: 'box address', body: 'user@10.0.0.1', kind: 'path' })
    updateItem(db, item.id, {
      title: item.title,
      body: item.body,
      kind: 'path',
      collectionId: collection.id,
    })
    const found = titles(listItems(db, { text: '服务器' }))
    expect(found).toContain('box address')
  })

  it('is case-insensitive', () => {
    expect(listItems(db, { text: 'SSH TUNNEL' })).toHaveLength(1)
  })

  it('does not throw on FTS operator syntax', () => {
    // Unquoted these would be FTS5 syntax errors rather than searches.
    for (const query of ['AND', 'NOT x', 'a OR b', 'NEAR(a b)', '"unbalanced', 'a*', '-x', '^x']) {
      expect(() => listItems(db, { text: query })).not.toThrow()
    }
  })

  it('does not throw on punctuation-only queries', () => {
    expect(() => listItems(db, { text: '!!! ???' })).not.toThrow()
  })

  it('returns nothing when nothing matches', () => {
    expect(listItems(db, { text: 'zzzznotfound' })).toHaveLength(0)
  })

  it('does not match deleted items', () => {
    const [first] = listItems(db, { text: 'tunnel' })
    removeItem(db, first!.id)
    expect(listItems(db, { text: 'tunnel' })).toHaveLength(0)
  })
})

describe('filters', () => {
  it('filters by kind', () => {
    add({ kind: 'command', title: 'c' })
    add({ kind: 'prompt', title: 'p' })
    expect(titles(listItems(db, { kinds: ['prompt'] }))).toEqual(['p'])
    expect(listItems(db, { kinds: ['link', 'path'] })).toHaveLength(0)
  })

  it('filters to favourites', () => {
    add({ title: 'plain' })
    const starred = add({ title: 'starred' })
    setFavorite(db, starred.id, true)
    expect(titles(listItems(db, { favoriteOnly: true }))).toEqual(['starred'])
  })

  it('filters by collection', () => {
    const collection = createCollection(db, '服务器')
    add({ title: 'filed', collectionId: collection.id })
    add({ title: 'loose' })
    expect(titles(listItems(db, { collection: collection.id }))).toEqual(['filed'])
    expect(titles(listItems(db, { collection: COLLECTION_NONE }))).toEqual(['loose'])
    expect(listItems(db, { collection: COLLECTION_ALL })).toHaveLength(2)
  })

  it('filters by tag, case-insensitively', () => {
    add({ title: 'tagged', tags: ['SSH'] })
    add({ title: 'plain' })
    expect(titles(listItems(db, { tag: 'ssh' }))).toEqual(['tagged'])
  })
})

describe('sorting', () => {
  it('orders by title', () => {
    add({ title: 'cherry' })
    add({ title: 'apple' })
    add({ title: 'banana' })
    expect(titles(listItems(db, { sort: 'title' }))).toEqual(['apple', 'banana', 'cherry'])
  })

  it('orders by use count, descending', () => {
    const rare = add({ title: 'rare' })
    const often = add({ title: 'often' })
    markUsed(db, often.id)
    markUsed(db, often.id)
    markUsed(db, rare.id)
    expect(titles(listItems(db, { sort: 'usage' }))).toEqual(['often', 'rare'])
  })

  it('orders by creation, newest first', () => {
    const first = add({ title: 'first' })
    const second = add({ title: 'second' })
    // createdAt is ISO to the millisecond; nudge to avoid a tie.
    db.prepare('UPDATE items SET created_at = ? WHERE id = ?').run(
      '2000-01-01T00:00:00.000Z',
      first.id,
    )
    expect(titles(listItems(db, { sort: 'created' }))).toEqual(['second', 'first'])
    expect(second.createdAt >= first.createdAt).toBe(true)
  })

  it('ranks the best match first when sorting by relevance', () => {
    const weak = add({ title: 'tunnel of ssh', body: 'nothing' })
    const strong = add({ title: 'ssh tunnel', body: 'nothing' })
    const ranked = listItems(db, { text: 'ssh tunnel', sort: 'relevance' })
    expect(ranked[0]?.id).toBe(strong.id)
    expect(ranked.map((item) => item.id)).toContain(weak.id)
  })
})

describe('paging', () => {
  it('honours limit and offset', () => {
    for (let index = 0; index < 10; index += 1) add({ title: `item ${index}` })
    expect(listItems(db, { sort: 'title', limit: 3 })).toHaveLength(3)
    expect(titles(listItems(db, { sort: 'title', limit: 3, offset: 1 }))[0]).toBe('item 1')
  })
})

describe('sanitizeQuery', () => {
  it('applies defaults to an empty input', () => {
    expect(sanitizeQuery(undefined)).toMatchObject({
      text: '',
      kinds: [],
      collection: COLLECTION_ALL,
      tag: null,
      favoriteOnly: false,
      sort: 'recent',
      limit: 200,
      offset: 0,
    })
  })

  it('clamps the limit and offset', () => {
    expect(sanitizeQuery({ limit: 99_999 }).limit).toBe(1000)
    expect(sanitizeQuery({ limit: 0 }).limit).toBe(1)
    expect(sanitizeQuery({ offset: -5 }).offset).toBe(0)
    expect(sanitizeQuery({ offset: 1e9 }).offset).toBe(1_000_000)
  })

  it('rejects an unknown kind and sort, and de-duplicates kinds', () => {
    const query = sanitizeQuery({
      kinds: ['command', 'command', 'bogus' as never],
      sort: 'bogus' as never,
    })
    expect(query.kinds).toEqual(['command'])
    expect(query.sort).toBe('recent')
  })

  it('caps the search text length', () => {
    expect(sanitizeQuery({ text: 'x'.repeat(1000) }).text).toHaveLength(500)
  })
})

describe('counts', () => {
  it('breaks down by kind, favourite, collection and uncategorised', () => {
    const collection = createCollection(db, 'server')
    add({ kind: 'command', tags: ['x'] })
    add({ kind: 'prompt', favorite: true })
    add({ kind: 'link', collectionId: collection.id })

    const counts = getCounts(db)
    expect(counts.all).toBe(3)
    expect(counts.favorite).toBe(1)
    expect(counts.uncategorized).toBe(2)
    expect(counts.byKind.command).toBe(1)
    expect(counts.byKind.prompt).toBe(1)
    expect(counts.byKind.link).toBe(1)
    expect(counts.byKind.path).toBe(0)
    expect(counts.byCollection[collection.id]).toBe(1)
  })
})

describe('collection deletion', () => {
  it('keeps the items and makes them uncategorised', () => {
    const collection = createCollection(db, 'doomed')
    const item = add({ collectionId: collection.id })
    removeCollection(db, collection.id)

    expect(getItem(db, item.id)?.collectionId).toBeNull()
    expect(getCounts(db).uncategorized).toBe(1)
  })
})
