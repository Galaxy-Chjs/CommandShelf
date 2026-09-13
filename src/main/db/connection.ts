import { DatabaseSync, type StatementSync } from 'node:sqlite'

import { migrate } from './migrations'

/**
 * Values SQLite accepts as bound parameters.
 *
 * `node:sqlite` rejects booleans and `undefined`, so the repository layer
 * converts both before binding (see `bool` / `optional` below).
 */
export type SqlValue = string | number | bigint | null | Uint8Array

export function bool(value: boolean): number {
  return value ? 1 : 0
}

/** `undefined` is not bindable; `null` means SQL NULL. */
export function optional(value: string | null | undefined): string | null {
  return value ?? null
}

/**
 * Opens (creating if needed) the CommandShelf database and brings it up to the
 * current schema version.
 *
 * WAL keeps a long-running read from blocking a write, and `busy_timeout`
 * covers the case where the quick panel and the main window touch the same row
 * at the same moment.
 */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec('PRAGMA busy_timeout = 5000')
  migrate(db)
  return db
}

/**
 * Tracks how deep each connection is inside `transact`, so nesting uses
 * SAVEPOINTs instead of trying to `BEGIN` twice (which SQLite rejects with
 * "cannot start a transaction within a transaction").
 *
 * A WeakMap rather than a module-level number: tests open several databases at
 * once, and the depth must belong to one connection.
 */
const transactionDepth = new WeakMap<DatabaseSync, number>()

/**
 * Runs `fn` in a transaction, rolling back if it throws.
 *
 * `node:sqlite` has no `transaction()` helper like better-sqlite3, so this is
 * the single place that spells out BEGIN/COMMIT/ROLLBACK.
 *
 * Nesting is supported: the outermost call opens a real transaction and inner
 * calls become savepoints, so a repository function that manages its own
 * transaction can safely be called from inside another one.
 */
export function transact<T>(db: DatabaseSync, fn: () => T): T {
  const depth = transactionDepth.get(db) ?? 0
  const savepoint = `cs_sp_${depth}`

  if (depth === 0) db.exec('BEGIN IMMEDIATE')
  else db.exec(`SAVEPOINT ${savepoint}`)
  transactionDepth.set(db, depth + 1)

  try {
    const result = fn()
    if (depth === 0) db.exec('COMMIT')
    else db.exec(`RELEASE ${savepoint}`)
    return result
  } catch (error) {
    try {
      if (depth === 0) {
        db.exec('ROLLBACK')
      } else {
        // Undo only this nested unit; the outer transaction stays usable.
        db.exec(`ROLLBACK TO ${savepoint}`)
        db.exec(`RELEASE ${savepoint}`)
      }
    } catch {
      // The transaction may already be aborted by SQLite itself.
    }
    throw error
  } finally {
    if (depth === 0) transactionDepth.delete(db)
    else transactionDepth.set(db, depth)
  }
}

/** Prepares a statement, reusing SQLite's own statement cache semantics. */
export function prepare(db: DatabaseSync, sql: string): StatementSync {
  return db.prepare(sql)
}

/** Builds `?, ?, ?` for an IN clause. Returns '' for an empty list. */
export function placeholders(count: number): string {
  return new Array(count).fill('?').join(', ')
}

/**
 * `node:sqlite` types every result as `Record<string, SQLOutputValue>`, which
 * never structurally overlaps a row interface with required properties. These
 * two helpers keep that unavoidable assertion in one place instead of
 * scattering `as unknown as` through the repository layer.
 */
export function asRows<T>(value: unknown): T[] {
  return value as T[]
}

export function asRow<T>(value: unknown): T | undefined {
  return value as T | undefined
}
