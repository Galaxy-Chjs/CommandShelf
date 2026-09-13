import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'

import { applyImport, buildExport, EXPORT_FORMAT_VERSION } from '../../src/main/repo/transfer'
import { listItems } from '../../src/main/repo/items'
import { listCollections } from '../../src/main/repo/collections'
import { buildSeedPayload, isEmpty, seedDemoData } from '../../src/main/repo/seed'
import { count, createTestDatabase } from './helpers'

let db: DatabaseSync

beforeEach(() => {
  db = createTestDatabase()
})

afterEach(() => {
  db.close()
})

describe('buildExport', () => {
  it('exports an empty shelf with only metadata', () => {
    const payload = buildExport(db)
    expect(payload.app).toBe('CommandShelf')
    expect(payload.formatVersion).toBe(EXPORT_FORMAT_VERSION)
    expect(payload.items).toEqual([])
    expect(payload.collections).toEqual([])
  })

  it('exports collections by name and items with their tags', () => {
    seedDemoData(db)
    const payload = buildExport(db)

    expect(payload.collections).toContain('服务器')
    expect(payload.items.length).toBeGreaterThan(20)

    const tunnelled = payload.items.find((item) => item.title === '端口转发到本地')
    expect(tunnelled?.collection).toBe('服务器')
    expect(tunnelled?.tags).toContain('ssh')
    expect(tunnelled?.favorite).toBe(true)
  })

  it('omits soft-deleted items', () => {
    seedDemoData(db)
    const before = buildExport(db).items.length
    db.prepare('UPDATE items SET deleted_at = ? WHERE title = ?').run(
      new Date().toISOString(),
      '端口转发到本地',
    )
    expect(buildExport(db).items).toHaveLength(before - 1)
  })
})

describe('applyImport', () => {
  it('round-trips an export without losing anything', () => {
    seedDemoData(db)
    const original = buildExport(db)

    const fresh = createTestDatabase()
    try {
      const summary = applyImport(fresh, original)
      expect(summary.items).toBe(original.items.length)
      expect(summary.skipped).toBe(0)

      const copy = buildExport(fresh)
      expect(copy.items.map((item) => item.title).sort()).toEqual(
        original.items.map((item) => item.title).sort(),
      )
      expect(copy.collections.sort()).toEqual(original.collections.sort())
    } finally {
      fresh.close()
    }
  })

  it('skips duplicates on a second import', () => {
    seedDemoData(db)
    const payload = buildExport(db)

    const summary = applyImport(db, payload)
    expect(summary.items).toBe(0)
    expect(summary.skipped).toBe(payload.items.length)
  })

  it('imports duplicates when asked to', () => {
    seedDemoData(db)
    const payload = buildExport(db)
    const before = count(db, 'SELECT COUNT(*) AS c FROM items')
    const summary = applyImport(db, payload, { skipDuplicates: false })
    expect(summary.items).toBe(payload.items.length)
    expect(count(db, 'SELECT COUNT(*) AS c FROM items')).toBe(before * 2)
  })

  it('accepts a payload with only items', () => {
    const summary = applyImport(db, {
      app: 'CommandShelf',
      formatVersion: 1,
      items: [{ title: 'x', body: 'y', kind: 'command', tags: ['t'] }],
    })
    expect(summary.items).toBe(1)
    expect(listItems(db, undefined)).toHaveLength(1)
  })

  it('preserves timestamps and use counts', () => {
    const createdAt = '2024-01-02T03:04:05.000Z'
    applyImport(db, {
      app: 'CommandShelf',
      formatVersion: 1,
      items: [
        {
          title: 'x',
          body: 'y',
          kind: 'command',
          useCount: 7,
          createdAt,
          updatedAt: createdAt,
          lastUsedAt: createdAt,
        },
      ],
    })
    const [item] = listItems(db, undefined)
    expect(item?.createdAt).toBe(createdAt)
    expect(item?.useCount).toBe(7)
    expect(item?.lastUsedAt).toBe(createdAt)
  })

  it('rebuilds the search index for imported items', () => {
    applyImport(db, {
      app: 'CommandShelf',
      formatVersion: 1,
      items: [{ title: 'tunnel', body: 'ssh -L 1:2', kind: 'command' }],
    })
    expect(listItems(db, { text: 'tunnel' })).toHaveLength(1)
    expect(listItems(db, { text: 'ssh' })).toHaveLength(1)
  })

  it('rejects a non-CommandShelf file', () => {
    expect(() => applyImport(db, { items: [] })).toThrow('不是 CommandShelf')
  })

  it('rejects a payload without an items array', () => {
    expect(() => applyImport(db, { app: 'CommandShelf', formatVersion: 1 })).toThrow('缺少 items')
  })

  it('rejects a newer format version', () => {
    expect(() => applyImport(db, { app: 'CommandShelf', formatVersion: 99, items: [] })).toThrow(
      '高于当前支持',
    )
  })

  it('rejects a non-object payload', () => {
    expect(() => applyImport(db, 'nope')).toThrow('不是 JSON 对象')
    expect(() => applyImport(db, null)).toThrow('不是 JSON 对象')
  })

  it('skips malformed entries instead of failing the whole import', () => {
    const summary = applyImport(db, {
      app: 'CommandShelf',
      formatVersion: 1,
      items: [null, 'nonsense', { title: '', body: '' }, { title: 'good', body: 'body' }],
    })
    expect(summary.items).toBe(1)
    expect(summary.skipped).toBe(3)
  })

  it('tolerates a non-array collections field', () => {
    const summary = applyImport(db, {
      app: 'CommandShelf',
      formatVersion: 1,
      items: [{ title: 'a', body: 'b', kind: 'command' }],
      collections: 42,
    })
    expect(summary.items).toBe(1)
    expect(count(db, 'SELECT COUNT(*) AS c FROM items')).toBe(1)
  })

  it('coerces unknown kinds and ignores unusable tag entries', () => {
    const summary = applyImport(db, {
      app: 'CommandShelf',
      formatVersion: 1,
      items: [
        {
          title: 'coerced',
          body: 'body',
          kind: 'bogus' as never,
          tags: ['ok', 7 as never, ''],
          favorite: 'yes' as never,
          useCount: '12' as never,
        },
      ],
    })
    expect(summary.items).toBe(1)

    const [item] = listItems(db, undefined)
    expect(item?.kind).toBe('command')
    expect(item?.tags).toEqual(['ok'])
    // `asBoolean` only accepts a real true / 1 / "true".
    expect(item?.favorite).toBe(false)
    expect(item?.useCount).toBe(12)
  })

  it('skips an entry with neither a title nor a body', () => {
    const summary = applyImport(db, {
      app: 'CommandShelf',
      formatVersion: 1,
      items: [{ title: 123 as never, body: { not: 'a string' } as never }],
    })
    expect(summary.items).toBe(0)
    expect(summary.skipped).toBe(1)
    expect(listItems(db, undefined)).toHaveLength(0)
  })
})

describe('seed data', () => {
  it('is empty before seeding and not after', () => {
    expect(isEmpty(db)).toBe(true)
    seedDemoData(db)
    expect(isEmpty(db)).toBe(false)
  })

  it('creates the documented collections', () => {
    seedDemoData(db)
    expect(
      listCollections(db)
        .map((entry) => entry.name)
        .sort(),
    ).toEqual(['服务器', '模型与数据', '训练与实验', '日常开发'].sort())
  })

  it('covers every kind so the UI has something to show', () => {
    seedDemoData(db)
    const payload = buildExport(db)
    const kinds = new Set(payload.items.map((item) => item.kind))
    expect([...kinds].sort()).toEqual(['command', 'link', 'path', 'prompt', 'snippet'])
  })

  it('includes template variables so the feature is discoverable', () => {
    seedDemoData(db)
    const payload = buildExport(db)
    expect(payload.items.some((item) => item.body.includes('{{'))).toBe(true)
  })

  it('is idempotent', () => {
    seedDemoData(db)
    const first = count(db, 'SELECT COUNT(*) AS c FROM items')
    seedDemoData(db)
    expect(count(db, 'SELECT COUNT(*) AS c FROM items')).toBe(first)
  })

  it('builds a payload that is itself valid to import', () => {
    const fresh = createTestDatabase()
    try {
      const summary = applyImport(fresh, buildSeedPayload())
      expect(summary.items).toBeGreaterThan(20)
    } finally {
      fresh.close()
    }
  })
})
