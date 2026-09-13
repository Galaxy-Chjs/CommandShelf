import { describe, expect, it } from 'vitest'

import {
  firstLine,
  formatDate,
  formatDateTime,
  formatRelative,
  formatUsage,
  titleFromBody,
  truncate,
} from '@shared/format'

/** Local-time ISO string, so the assertions do not depend on the test machine's zone. */
function localIso(year: number, month: number, day: number, hour = 0, minute = 0): string {
  return new Date(year, month - 1, day, hour, minute).toISOString()
}

describe('formatDateTime', () => {
  it('renders a local timestamp to the minute', () => {
    expect(formatDateTime(localIso(2025, 3, 2, 14, 7))).toBe('2025-03-02 14:07')
  })

  it('pads single digits', () => {
    expect(formatDateTime(localIso(2025, 1, 5, 9, 3))).toBe('2025-01-05 09:03')
  })

  it('renders a dash for missing or invalid input', () => {
    expect(formatDateTime(null)).toBe('—')
    expect(formatDateTime(undefined)).toBe('—')
    expect(formatDateTime('not a date')).toBe('—')
  })
})

describe('formatDate', () => {
  it('renders a local date', () => {
    expect(formatDate(localIso(2025, 12, 31, 23, 59))).toBe('2025-12-31')
  })

  it('renders a dash for missing input', () => {
    expect(formatDate(null)).toBe('—')
  })
})

describe('formatRelative', () => {
  const now = new Date(2025, 5, 15, 12, 0).getTime()

  it('says 从未使用 when there is no timestamp', () => {
    expect(formatRelative(null, now)).toBe('从未使用')
    expect(formatRelative('nonsense', now)).toBe('从未使用')
  })

  it('describes the recent past in Chinese', () => {
    expect(formatRelative(new Date(now - 10_000).toISOString(), now)).toBe('刚刚')
    expect(formatRelative(new Date(now - 3 * 60_000).toISOString(), now)).toBe('3 分钟前')
    expect(formatRelative(new Date(now - 5 * 3_600_000).toISOString(), now)).toBe('5 小时前')
  })

  it('says 昨天 for the previous day', () => {
    expect(formatRelative(new Date(now - 30 * 3_600_000).toISOString(), now)).toBe('昨天')
  })

  it('counts days up to a month', () => {
    expect(formatRelative(new Date(now - 5 * 24 * 3_600_000).toISOString(), now)).toBe('5 天前')
  })

  it('falls back to an absolute date beyond a month', () => {
    const old = new Date(2025, 0, 3, 8, 0)
    expect(formatRelative(old.toISOString(), now)).toBe('2025-01-03')
  })

  it('treats a future timestamp as 刚刚 rather than a negative duration', () => {
    expect(formatRelative(new Date(now + 60_000).toISOString(), now)).toBe('刚刚')
  })
})

describe('firstLine', () => {
  it('takes the first non-blank line', () => {
    expect(firstLine('\n\n   \nssh host\nsecond')).toBe('ssh host')
  })

  it('returns an empty string for blank input', () => {
    expect(firstLine('\n  \n')).toBe('')
  })

  it('truncates with an ellipsis', () => {
    const long = 'x'.repeat(200)
    const result = firstLine(long, 20)
    expect(result).toHaveLength(20)
    expect(result.endsWith('…')).toBe(true)
  })
})

describe('truncate', () => {
  it('leaves short text alone', () => {
    expect(truncate('abc', 10)).toBe('abc')
  })

  it('truncates at the requested length', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcd…')
  })
})

describe('titleFromBody', () => {
  it('uses the first line of the body', () => {
    expect(titleFromBody('git status\nmore', '命令')).toBe('git status')
  })

  it('falls back to a kind-specific placeholder', () => {
    expect(titleFromBody('   ', '提示词')).toBe('未命名提示词')
  })
})

describe('formatUsage', () => {
  it('describes used and never-used items', () => {
    expect(formatUsage(12)).toBe('用过 12 次')
    expect(formatUsage(0)).toBe('从未使用')
  })
})
