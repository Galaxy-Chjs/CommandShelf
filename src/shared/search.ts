/** Query preparation shared by the repository layer and its tests. */

const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

export function containsCjk(text: string): boolean {
  return CJK.test(text)
}

/**
 * Turns a user query into an FTS5 MATCH expression.
 *
 * Every token becomes a quoted prefix term joined with `AND`, so `ssh tun`
 * matches "ssh -L tunnel". Quoting means FTS5 operators a user types (`AND`,
 * `NEAR`, `-`, `*`) are treated as literal text instead of syntax errors.
 *
 * Returns `null` when there is nothing searchable, which callers read as
 * "no text filter".
 */
export function buildFtsQuery(text: string): string | null {
  const tokens = text
    .split(/\s+/)
    .map((token) => token.trim())
    // FTS5 tokenises on word characters, so a token with none of them (CJK, or
    // pure punctuation) cannot contribute a prefix term.
    .filter((token) => /[A-Za-z0-9_]/.test(token))

  if (tokens.length === 0) return null
  return tokens.map((token) => `"${token.replace(/"/g, '""')}"*`).join(' AND ')
}

/** Escapes `%`, `_` and `\` for use with `LIKE ... ESCAPE '\'`. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`)
}

export function likePattern(text: string): string {
  return `%${escapeLike(text)}%`
}

/**
 * Tags are stored and compared case-insensitively in ASCII, trimmed, and
 * without the leading `#` people habitually type.
 */
export function normalizeTag(name: string): string {
  return name.replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, 40)
}

/** Splits a tag input field on commas, Chinese commas and newlines. */
export function splitTagInput(input: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of input.split(/[,，\n\r\t]+/)) {
    const tag = normalizeTag(raw)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(tag)
  }
  return result
}

/** Sorts tag names the way a person expects: ASCII first, then by length. */
export function compareTagNames(a: string, b: string): number {
  return a.localeCompare(b, 'zh-Hans-CN', { sensitivity: 'base', numeric: true })
}
