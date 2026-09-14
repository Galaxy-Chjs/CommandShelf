/**
 * Repeats the tail of a build log as a GitHub Actions error annotation.
 *
 * Action logs need an authenticated session to read, but annotations do not:
 * they show up on the commit and are readable through the public API. When a
 * packaging step fails on a runner you cannot log into, this is what makes the
 * reason visible.
 *
 * Usage: node scripts/ci-annotate.mjs <logfile> [title]
 */

import { readFileSync } from 'node:fs'

const [, , file, title = 'build failed'] = process.argv

if (!file) {
  console.error('usage: node scripts/ci-annotate.mjs <logfile> [title]')
  process.exit(2)
}

let text
try {
  text = readFileSync(file, 'utf8')
} catch (error) {
  console.log(`::error title=${title}::无法读取构建日志 ${file}：${error.message}`)
  process.exit(0)
}

// GitHub truncates annotations; keep the tail, which is where the error is.
const MAX = 6000
const tail = text.length > MAX ? `…（省略前 ${text.length - MAX} 字符）\n${text.slice(-MAX)}` : text

// Workflow-command escaping: `%` first, then newlines.
const escaped = tail.replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A')

process.stdout.write(`::error title=${title}::${escaped}\n`)
