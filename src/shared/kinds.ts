import type { ItemKind, SortKey } from './types'

export interface KindMeta {
  kind: ItemKind
  label: string
  /** One-line explanation used in tooltips and the empty editor. */
  hint: string
  /** CSS custom property holding this kind's accent colour. */
  colorVar: string
}

export const KIND_META: Record<ItemKind, KindMeta> = {
  command: {
    kind: 'command',
    label: '命令',
    hint: '在终端里执行的命令，支持 {{变量}}',
    colorVar: 'var(--cs-kind-command)',
  },
  prompt: {
    kind: 'prompt',
    label: '提示词',
    hint: '发给 AI 的提示词，支持 {{变量}}',
    colorVar: 'var(--cs-kind-prompt)',
  },
  snippet: {
    kind: 'snippet',
    label: '代码片段',
    hint: '可直接粘贴进代码的片段',
    colorVar: 'var(--cs-kind-snippet)',
  },
  link: {
    kind: 'link',
    label: '链接',
    hint: '网址，复制后在浏览器打开',
    colorVar: 'var(--cs-kind-link)',
  },
  path: {
    kind: 'path',
    label: '路径',
    hint: '本地或服务器上的路径',
    colorVar: 'var(--cs-kind-path)',
  },
}

export const KIND_ORDER: readonly ItemKind[] = ['command', 'prompt', 'snippet', 'link', 'path']

export const SORT_LABELS: Record<SortKey, string> = {
  recent: '最近使用',
  created: '最近创建',
  updated: '最近修改',
  usage: '使用次数',
  title: '标题',
  relevance: '匹配度',
}

/**
 * Snippets are highlighted with highlight.js. `value` must be a language id
 * that `lib/highlight.ts` registers, or be mapped to one by this function.
 */
export const SNIPPET_LANGUAGES: readonly { value: string; label: string }[] = [
  { value: 'text', label: '纯文本' },
  { value: 'bash', label: 'Bash / Shell' },
  { value: 'python', label: 'Python' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'sql', label: 'SQL' },
  { value: 'ini', label: 'INI / TOML' },
  { value: 'docker', label: 'Dockerfile' },
  { value: 'cpp', label: 'C / C++' },
  { value: 'cuda', label: 'CUDA' },
  { value: 'markdown', label: 'Markdown' },
]

/** Normalises a stored language id; `plain` means "do not highlight". */
export function resolveHighlightLanguage(language: string | null | undefined): string {
  switch (language) {
    case 'text':
    case '':
    case null:
    case undefined:
      return 'plain'
    default:
      return language
  }
}

export const LANGUAGE_LABELS: Record<string, string> = Object.fromEntries(
  SNIPPET_LANGUAGES.map((entry) => [entry.value, entry.label]),
)
