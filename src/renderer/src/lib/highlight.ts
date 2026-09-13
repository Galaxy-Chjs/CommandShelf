import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import cpp from 'highlight.js/lib/languages/cpp'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import ini from 'highlight.js/lib/languages/ini'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import plaintext from 'highlight.js/lib/languages/plaintext'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import yaml from 'highlight.js/lib/languages/yaml'

import { resolveHighlightLanguage } from '@shared/kinds'

/**
 * Syntax highlighting.
 *
 * highlight.js rather than Prism: Prism's language modules assign onto a
 * `window.Prism` global, which is why a bundled build can end up with a
 * half-initialised grammar and throw at import time. highlight.js has real ES
 * module exports, so registration order is explicit and there is no global.
 *
 * Only the languages a developer actually pastes into CommandShelf are
 * registered, which keeps the renderer bundle small.
 *
 * `hljs.highlight` escapes the source it is given, so the result is safe to
 * hand to `dangerouslySetInnerHTML`. `escapeHtml` covers the unhighlighted
 * path.
 */

const ALIASES: Record<string, string> = {
  cuda: 'cpp',
  docker: 'dockerfile',
}

let registered = false

function register(): void {
  if (registered) return
  hljs.registerLanguage('bash', bash)
  hljs.registerLanguage('cpp', cpp)
  hljs.registerLanguage('dockerfile', dockerfile)
  hljs.registerLanguage('ini', ini)
  hljs.registerLanguage('javascript', javascript)
  hljs.registerLanguage('json', json)
  hljs.registerLanguage('markdown', markdown)
  hljs.registerLanguage('plaintext', plaintext)
  hljs.registerLanguage('python', python)
  hljs.registerLanguage('sql', sql)
  hljs.registerLanguage('typescript', typescript)
  hljs.registerLanguage('yaml', yaml)
  registered = true
}

const PLAIN = new Set(['plain', 'text', ''])

export function highlightToHtml(source: string, language: string | null | undefined): string {
  const resolved = resolveHighlightLanguage(language)
  const id = ALIASES[resolved] ?? resolved
  if (PLAIN.has(id)) return escapeHtml(source)

  register()
  if (!hljs.getLanguage(id)) return escapeHtml(source)

  try {
    return hljs.highlight(source, { language: id, ignoreIllegals: true }).value
  } catch {
    // A grammar failure must never cost the user their content.
    return escapeHtml(source)
  }
}

export function escapeHtml(source: string): string {
  return source
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
