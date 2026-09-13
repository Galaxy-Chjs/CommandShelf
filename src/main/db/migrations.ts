import type { DatabaseSync } from 'node:sqlite'

/**
 * Schema migrations.
 *
 * `PRAGMA user_version` is the single source of truth. Each migration runs
 * inside its own transaction, so a failure leaves the database exactly as it
 * was rather than half-upgraded.
 *
 * Migrations are append-only: never edit a released one, add a new one.
 */

export interface Migration {
  version: number
  name: string
  up: (db: DatabaseSync) => void
}

const INITIAL_SCHEMA = `
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE collections (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX collections_name_unique ON collections (name COLLATE NOCASE);

CREATE TABLE items (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL CHECK (kind IN ('command','prompt','snippet','link','path')),
  language      TEXT,
  collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
  favorite      INTEGER NOT NULL DEFAULT 0,
  use_count     INTEGER NOT NULL DEFAULT 0,
  last_used_at  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE INDEX items_updated_idx    ON items (updated_at DESC);
CREATE INDEX items_collection_idx ON items (collection_id);
CREATE INDEX items_kind_idx       ON items (kind);
CREATE INDEX items_deleted_idx    ON items (deleted_at);

CREATE TABLE tags (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE UNIQUE INDEX tags_name_unique ON tags (name COLLATE NOCASE);

CREATE TABLE item_tags (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);
CREATE INDEX item_tags_tag_idx ON item_tags (tag_id);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- A plain FTS5 table that mirrors title/body/tags. The repository keeps it in
-- step explicitly; see src/main/repo/items.ts. This costs a duplicate copy of
-- the text and buys a search index that cannot silently drift out of a
-- trigger's reach.
CREATE VIRTUAL TABLE items_fts USING fts5(
  id UNINDEXED,
  title,
  body,
  tags,
  tokenize = 'unicode61 remove_diacritics 2'
);
`

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial-schema',
    up: (db) => {
      db.exec(INITIAL_SCHEMA)
    },
  },
]

export const SCHEMA_VERSION = MIGRATIONS.length

function readUserVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined
  return Number(row?.user_version ?? 0)
}

/**
 * Applies every migration newer than the database's current version.
 * Returns the versions that were applied, which the caller logs.
 */
export function migrate(db: DatabaseSync): number[] {
  const applied: number[] = []
  const current = readUserVersion(db)

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue
    db.exec('BEGIN')
    try {
      migration.up(db)
      // Interpolated on purpose: PRAGMA does not accept bound parameters, and
      // the value comes from this file, never from user input.
      db.exec(`PRAGMA user_version = ${migration.version}`)
      db.exec('COMMIT')
    } catch (error) {
      try {
        db.exec('ROLLBACK')
      } catch {
        // The transaction was already aborted; the original error matters more.
      }
      throw new Error(
        `迁移失败（v${migration.version} ${migration.name}）：${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      )
    }
    applied.push(migration.version)
  }

  return applied
}
