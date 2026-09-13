import type { DatabaseSync } from 'node:sqlite'

import { openDatabase } from '../../src/main/db/connection'

/**
 * An isolated in-memory database with the real schema and migrations applied.
 *
 * Using the real `openDatabase` (rather than a hand-written schema) means the
 * tests exercise the migrations themselves: a broken migration fails every
 * repository test, not just the migration suite.
 */
export function createTestDatabase(): DatabaseSync {
  return openDatabase(':memory:')
}

/** Convenience for tests that need a row count without caring about the shape. */
export function count(db: DatabaseSync, sql: string): number {
  const row = db.prepare(sql).get() as { c: number } | undefined
  return Number(row?.c ?? 0)
}
