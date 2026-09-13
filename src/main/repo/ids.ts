import { randomUUID } from 'node:crypto'

/** UUID v4 for every new row. Storage ids are opaque strings. */
export function newId(): string {
  return randomUUID()
}

/** ISO-8601 UTC timestamp, the only format stored in the database. */
export function now(): string {
  return new Date().toISOString()
}
