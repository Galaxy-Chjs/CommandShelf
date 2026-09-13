/** Date and text helpers shared by the two renderer entry points. */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** `2025-03-02 14:07` in local time. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

/** `2025-03-02` in local time. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Chinese relative time. Falls back to an absolute date beyond a month, where
 * "37 天前" stops being easier to read than the date itself.
 */
export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '从未使用'
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return '从未使用'

  const diff = now - time
  if (diff < 0) return '刚刚'
  if (diff < MINUTE) return '刚刚'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`
  if (diff < 2 * DAY) return '昨天'
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} 天前`
  return formatDate(iso)
}

/** Collapses a body into a single line for list previews. */
export function firstLine(body: string, maxLength = 120): string {
  const line =
    body
      .split('\n')
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0) ?? ''
  return truncate(line, maxLength)
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}…`
}

/** Derives a title from the body when the user left the title empty. */
export function titleFromBody(body: string, kindLabel: string): string {
  const line = firstLine(body, 60)
  return line.length > 0 ? line : `未命名${kindLabel}`
}

/** `用过 12 次` / `从未使用`. */
export function formatUsage(count: number): string {
  return count > 0 ? `用过 ${count} 次` : '从未使用'
}
