/**
 * Fails when a documentation link points at a file that does not exist.
 *
 * Portfolio repositories rot quietly: a screenshot is renamed, a doc is moved,
 * and the README keeps rendering a broken image. This runs in CI so that cannot
 * happen unnoticed.
 *
 * Usage: npm run check:docs
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Files whose relative links are checked. */
const DOCUMENTS = [
  'README.md',
  'README.zh-CN.md',
  'docs/architecture.md',
  'docs/ACCEPTANCE.md',
  'Project.md',
]

const LINK = /!?\[[^\]]*\]\(([^)]+)\)/g

/** Links that are not repository files. */
function isExternal(target) {
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#') || target.startsWith('mailto:')
  )
}

function stripAnchor(target) {
  const hash = target.indexOf('#')
  return hash === -1 ? target : target.slice(0, hash)
}

let checked = 0
const broken = []

for (const document of DOCUMENTS) {
  if (!existsSync(join(ROOT, document))) continue
  const contents = readFileSync(join(ROOT, document), 'utf8')

  for (const match of contents.matchAll(LINK)) {
    const raw = match[1].trim()
    if (!raw || isExternal(raw)) continue

    const target = stripAnchor(raw)
    if (!target) continue

    checked += 1
    const resolved = normalize(join(ROOT, dirname(document), decodeURIComponent(target)))
    if (!existsSync(resolved)) {
      broken.push(`${document} -> ${raw}`)
    }
  }
}

if (broken.length > 0) {
  process.stderr.write(`broken documentation links (${broken.length}):\n`)
  for (const entry of broken) process.stderr.write(`  ${entry}\n`)
  process.exit(1)
}

process.stdout.write(`docs: ${checked} relative links resolve\n`)
