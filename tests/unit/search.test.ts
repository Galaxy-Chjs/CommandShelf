import { describe, expect, it } from 'vitest'

import {
  buildFtsQuery,
  containsCjk,
  escapeLike,
  likePattern,
  normalizeTag,
  splitTagInput,
} from '@shared/search'

describe('containsCjk', () => {
  it('detects Chinese', () => {
    expect(containsCjk('服务器')).toBe(true)
    expect(containsCjk('ssh 服务器')).toBe(true)
  })

  it('detects Japanese kana', () => {
    expect(containsCjk('サーバ')).toBe(true)
  })

  it('rejects pure ASCII', () => {
    expect(containsCjk('ssh -L 8080')).toBe(false)
    expect(containsCjk('')).toBe(false)
  })
})

describe('buildFtsQuery', () => {
  it('quotes each token as a prefix term joined by AND', () => {
    expect(buildFtsQuery('ssh tun')).toBe('"ssh"* AND "tun"*')
  })

  it('collapses extra whitespace', () => {
    expect(buildFtsQuery('  ssh   tun  ')).toBe('"ssh"* AND "tun"*')
  })

  it('returns null when there is nothing searchable', () => {
    expect(buildFtsQuery('')).toBeNull()
    expect(buildFtsQuery('   ')).toBeNull()
    expect(buildFtsQuery('服务器')).toBeNull()
    expect(buildFtsQuery('!!! ---')).toBeNull()
  })

  it('escapes embedded double quotes', () => {
    expect(buildFtsQuery('a"b')).toBe('"a""b"*')
  })

  it('treats FTS operators as literal text', () => {
    // Unquoted, these would be FTS5 syntax and could throw at query time.
    expect(buildFtsQuery('AND OR NOT')).toBe('"AND"* AND "OR"* AND "NOT"*')
    expect(buildFtsQuery('a*')).toBe('"a*"*')
    expect(buildFtsQuery('"unbalanced')).toBe('"""unbalanced"*')
    // Tokens are split on whitespace only, so `NEAR(a` stays one term — quoting
    // is what keeps the parenthesis from being parsed as syntax.
    expect(buildFtsQuery('NEAR(a b)')).toBe('"NEAR(a"* AND "b)"*')
  })

  it('keeps tokens with an underscore', () => {
    expect(buildFtsQuery('use_count')).toBe('"use_count"*')
  })
})

describe('LIKE helpers', () => {
  it('escapes wildcards and the escape character itself', () => {
    expect(escapeLike('100%')).toBe('100\\%')
    expect(escapeLike('a_b')).toBe('a\\_b')
    expect(escapeLike('c:\\path')).toBe('c:\\\\path')
  })

  it('wraps a pattern', () => {
    expect(likePattern('ssh')).toBe('%ssh%')
  })
})

describe('normalizeTag', () => {
  it('drops leading hashes so typing #ssh and ssh are the same tag', () => {
    expect(normalizeTag('##ssh')).toBe('ssh')
  })

  it('collapses inner whitespace and trims', () => {
    expect(normalizeTag('  a   b  ')).toBe('a b')
  })

  it('caps the length', () => {
    expect(normalizeTag('x'.repeat(100))).toHaveLength(40)
  })
})

describe('splitTagInput', () => {
  it('splits on commas and newlines', () => {
    expect(splitTagInput('ssh, 服务器\n实验,git')).toEqual(['ssh', '服务器', '实验', 'git'])
  })

  it('splits on the full-width comma', () => {
    expect(splitTagInput('a，b')).toEqual(['a', 'b'])
  })

  it('removes duplicates case-insensitively', () => {
    expect(splitTagInput('ssh, SSH, Ssh')).toEqual(['ssh'])
  })

  it('ignores empty fragments', () => {
    expect(splitTagInput('a,,  ,b')).toEqual(['a', 'b'])
  })

  it('returns an empty list for blank input', () => {
    expect(splitTagInput('   ')).toEqual([])
  })
})
