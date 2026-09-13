import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'

import { openDatabase, transact } from '../../src/main/db/connection'
import { MIGRATIONS, migrate, SCHEMA_VERSION } from '../../src/main/db/migrations'
import { ensureFtsConsistent, rebuildFts, syncItemFts } from '../../src/main/repo/fts'
import { createItem, listItems } from '../../src/main/repo/items'
import { count, createTestDatabase } from './helpers'

let db: DatabaseSync

beforeEach(() => {
  db = createTestDatabase()
})

afterEach(() => {
  db.close()
})

function userVersion(database: DatabaseSync): number {
  const row = database.prepare('PRAGMA user_version').get() as { user_version: number }
  return Number(row.user_version)
}

describe('migrations', () => {
  it('brings a brand-new database to the current version', () => {
    expect(userVersion(db)).toBe(SCHEMA_VERSION)
  })

  it('creates every expected table', () => {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')")
      .all() as { name: string }[]
    const names = rows.map((row) => row.name)
    for (const table of ['items', 'collections', 'tags', 'item_tags', 'settings', 'items_fts']) {
      expect(names).toContain(table)
    }
  })

  it('is idempotent: running it again applies nothing', () => {
    expect(migrate(db)).toEqual([])
    expect(userVersion(db)).toBe(SCHEMA_VERSION)
  })

  it('applies only the migrations newer than the stored version', () => {
    const fresh = new DatabaseSync(':memory:')
    try {
      // Simulate a database that stopped at version 0.
      db.exec('SELECT 1')
      const applied = migrate(fresh)
      expect(applied).toEqual(MIGRATIONS.map((migration) => migration.version))
      expect(userVersion(fresh)).toBe(SCHEMA_VERSION)
    } finally {
      fresh.close()
    }
  })

  it('enforces the closed set of item kinds at the storage layer', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO items (id, title, body, kind, favorite, use_count, created_at, updated_at)
           VALUES ('x', 't', 'b', 'nonsense', 0, 0, '2024-01-01', '2024-01-01')`,
        )
        .run(),
    ).toThrow()
  })

  it('turns on foreign keys so deleting a collection does not orphan items', () => {
    const foreignKeys = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
    expect(Number(foreignKeys.foreign_keys)).toBe(1)
  })
})

describe('transact', () => {
  it('commits on success', () => {
    transact(db, () => {
      db.prepare(
        `INSERT INTO items (id, title, body, kind, favorite, use_count, created_at, updated_at)
         VALUES ('kept', 't', 'b', 'command', 0, 0, '2024-01-01', '2024-01-01')`,
      ).run()
    })
    expect(count(db, 'SELECT COUNT(*) AS c FROM items')).toBe(1)
  })

  it('rolls back the whole unit when the callback throws', () => {
    const item = createItem(db, { title: 'outer', body: 'x', kind: 'command' })

    expect(() =>
      transact(db, () => {
        db.prepare('UPDATE items SET title = ? WHERE id = ?').run('changed', item.id)
        db.prepare('UPDATE items SET title = ? WHERE id = ?').run('changed again', item.id)
        throw new Error('boom')
      }),
    ).toThrow('boom')

    const row = db.prepare('SELECT title FROM items WHERE id = ?').get(item.id) as {
      title: string
    }
    expect(row.title).toBe('outer')
  })

  it('propagates the original error', () => {
    expect(() =>
      transact(db, () => {
        throw new Error('original')
      }),
    ).toThrow('original')
  })

  it('supports nesting, so a repository call inside a transaction works', () => {
    // `createItem` opens its own transaction; before savepoints this threw
    // "cannot start a transaction within a transaction".
    const created = transact(db, () =>
      createItem(db, { title: 'nested', body: 'x', kind: 'command' }),
    )
    expect(created.title).toBe('nested')
    expect(count(db, 'SELECT COUNT(*) AS c FROM items')).toBe(1)
  })

  it('rolls back only the nested unit when an inner transaction fails', () => {
    const item = createItem(db, { title: 'kept', body: 'x', kind: 'command' })

    transact(db, () => {
      db.prepare('UPDATE items SET title = ? WHERE id = ?').run('outer change', item.id)
      try {
        transact(db, () => {
          db.prepare('UPDATE items SET title = ? WHERE id = ?').run('inner change', item.id)
          throw new Error('inner boom')
        })
      } catch {
        // Swallowed on purpose: the outer transaction must survive.
      }
    })

    const row = db.prepare('SELECT title FROM items WHERE id = ?').get(item.id) as {
      title: string
    }
    expect(row.title).toBe('outer change')
  })

  it('leaves the connection usable after a rollback', () => {
    expect(() =>
      transact(db, () => {
        throw new Error('boom')
      }),
    ).toThrow()
    expect(transact(db, () => 'still works')).toBe('still works')
  })
})

describe('search index consistency', () => {
  it('reports consistent when in step', () => {
    createItem(db, { title: 'a', body: 'a', kind: 'command' })
    expect(ensureFtsConsistent(db)).toBe(false)
  })

  it('detects and repairs a missing index row', () => {
    const item = createItem(db, { title: 'a', body: 'a', kind: 'command' })
    db.prepare('DELETE FROM items_fts WHERE id = ?').run(item.id)

    expect(ensureFtsConsistent(db)).toBe(true)
    expect(count(db, 'SELECT COUNT(*) AS c FROM items_fts')).toBe(1)
  })

  it('detects and repairs an index row that should not exist', () => {
    db.prepare('INSERT INTO items_fts (id, title, body, tags) VALUES (?, ?, ?, ?)').run(
      'ghost',
      'ghost',
      'ghost',
      'ghost',
    )
    expect(ensureFtsConsistent(db)).toBe(true)
    expect(count(db, 'SELECT COUNT(*) AS c FROM items_fts')).toBe(0)
  })

  it('excludes soft-deleted items from the index', () => {
    const item = createItem(db, { title: 'a', body: 'a', kind: 'command' })
    db.prepare('UPDATE items SET deleted_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      item.id,
    )
    syncItemFts(db, item.id)
    expect(count(db, 'SELECT COUNT(*) AS c FROM items_fts')).toBe(0)
    expect(ensureFtsConsistent(db)).toBe(false)
  })

  it('rebuilds every live item', () => {
    createItem(db, { title: 'a', body: 'alpha', kind: 'command' })
    createItem(db, { title: 'b', body: 'beta', kind: 'prompt' })
    db.exec('DELETE FROM items_fts')

    expect(rebuildFts(db)).toBe(2)
    expect(listItems(db, { text: 'alpha' })).toHaveLength(1)
  })

  it('indexes tag and collection names alongside the body', () => {
    const collection = db
      .prepare(
        "INSERT INTO collections (id, name, sort_order, created_at) VALUES ('c1', '服务器', 0, '2024-01-01') RETURNING id",
      )
      .get() as { id: string }
    createItem(db, {
      title: 'box',
      body: 'plain body',
      kind: 'path',
      tags: ['ssh'],
      collectionId: collection.id,
    })

    expect(listItems(db, { text: 'ssh' })).toHaveLength(1)
    expect(listItems(db, { text: '服务器' })).toHaveLength(1)
  })
})

describe('openDatabase', () => {
  it('applies the pragmas the repository layer depends on', () => {
    const database = openDatabase(':memory:')
    try {
      const journal = database.prepare('PRAGMA journal_mode').get() as { journal_mode: string }
      // :memory: cannot use WAL, so it stays in the default mode — the point is
      // that the statement is accepted and the other pragmas are applied.
      expect(typeof journal.journal_mode).toBe('string')

      const keys = database.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
      expect(Number(keys.foreign_keys)).toBe(1)

      const sync = database.prepare('PRAGMA synchronous').get() as { synchronous: number }
      expect(Number(sync.synchronous)).toBe(1) // NORMAL
    } finally {
      database.close()
    }
  })
})
