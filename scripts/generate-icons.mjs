/**
 * Generates the CommandShelf icon set with no image dependencies.
 *
 * The mark is a terminal prompt — a chevron and a caret — drawn procedurally
 * with a signed-distance rasteriser and 3x3 supersampling, then written out as:
 *
 *   build/icon.png            1024x1024, for Linux and macOS packaging
 *   build/icon.ico            16…256, for the Windows executable and installer
 *   src/main/assets/tray.ts   base64 PNGs the tray loads at runtime
 *
 * Committing the generator instead of the binaries keeps the repository free of
 * opaque blobs and makes the mark reproducible.
 *
 * Usage: npm run icons
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/* ------------------------------------------------------------------ colours */

const ACCENT_TOP = [0x6c, 0xb6, 0xff]
const ACCENT_BOTTOM = [0x1f, 0x6f, 0xeb]
const GLYPH_ON_ACCENT = [0x0d, 0x11, 0x17]
const GLYPH_PLAIN = [0x58, 0xa6, 0xff]

/* ------------------------------------------------------------- rasterisation */

/** Signed distance to a rounded rectangle centred in a `w`x`h` box. */
function roundedRectDistance(px, py, w, h, radius) {
  const qx = Math.abs(px - w / 2) - (w / 2 - radius)
  const qy = Math.abs(py - h / 2) - (h / 2 - radius)
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return outside + Math.min(Math.max(qx, qy), 0) - radius
}

/** Distance to the line segment a→b, with 0 inside the segment's span. */
function segmentDistance(px, py, ax, ay, bx, by) {
  const vx = bx - ax
  const vy = by - ay
  const wx = px - ax
  const wy = py - ay
  const lengthSquared = vx * vx + vy * vy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / lengthSquared))
  return Math.hypot(wx - t * vx, wy - t * vy)
}

/** The prompt glyph as a list of stroke segments in a 0..1 coordinate space. */
function glyphSegments() {
  return [
    // chevron ">"
    [0.29, 0.33, 0.47, 0.5],
    [0.47, 0.5, 0.29, 0.67],
    // caret "_"
    [0.55, 0.67, 0.74, 0.67],
  ]
}

/**
 * Draws the mark.
 *
 * @param {number} size          output edge length in pixels
 * @param {boolean} withPlate    draw the rounded-square background
 * @param {number[]} glyphColor  RGB of the strokes
 */
function render(size, withPlate, glyphColor) {
  const rgba = Buffer.alloc(size * size * 4)
  const segments = glyphSegments().map((segment) => segment.map((value) => value * size))
  const strokeHalfWidth = size * 0.055
  const radius = size * 0.22
  const samples = 3
  const step = 1 / samples
  const offset = step / 2

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let plateHits = 0
      let glyphHits = 0

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = x + sx * step + offset
          const py = y + sy * step + offset

          // With a plate, the glyph is clipped to the rounded square; without
          // one (the tray mark) only the strokes themselves are drawn.
          if (withPlate) {
            if (roundedRectDistance(px, py, size, size, radius) > 0) continue
            plateHits += 1
          }

          let nearest = Infinity
          for (const [ax, ay, bx, by] of segments) {
            nearest = Math.min(nearest, segmentDistance(px, py, ax, ay, bx, by))
          }
          if (nearest <= strokeHalfWidth) glyphHits += 1
        }
      }

      const total = samples * samples
      const plateAlpha = withPlate ? plateHits / total : 0
      const glyphAlpha = glyphHits / total

      // Vertical gradient across the plate, then the glyph composited on top.
      const t = y / Math.max(1, size - 1)
      const base = withPlate
        ? [
            Math.round(ACCENT_TOP[0] + (ACCENT_BOTTOM[0] - ACCENT_TOP[0]) * t),
            Math.round(ACCENT_TOP[1] + (ACCENT_BOTTOM[1] - ACCENT_TOP[1]) * t),
            Math.round(ACCENT_TOP[2] + (ACCENT_BOTTOM[2] - ACCENT_TOP[2]) * t),
          ]
        : [0, 0, 0]

      const alpha = withPlate ? plateAlpha : 1
      const r = base[0] * (1 - glyphAlpha) + glyphColor[0] * glyphAlpha
      const g = base[1] * (1 - glyphAlpha) + glyphColor[1] * glyphAlpha
      const b = base[2] * (1 - glyphAlpha) + glyphColor[2] * glyphAlpha

      const index = (y * size + x) * 4
      rgba[index] = Math.round(r)
      rgba[index + 1] = Math.round(g)
      rgba[index + 2] = Math.round(b)
      rgba[index + 3] = Math.round(withPlate ? alpha * 255 : glyphAlpha * 255)
    }
  }

  return rgba
}

/* --------------------------------------------------------------- PNG output */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed), 0)
  return Buffer.concat([length, typed, crc])
}

function encodePng(size, rgba) {
  const stride = size * 4
  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // adaptive filtering
  ihdr[12] = 0 // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/* --------------------------------------------------------------- ICO output */

/**
 * Builds a PNG-compressed ICO. Windows Vista and later read PNG frames
 * directly, which keeps this to a 22-byte directory plus the images.
 */
function encodeIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)

  const directory = Buffer.alloc(16 * images.length)
  let offset = header.length + directory.length

  images.forEach((image, index) => {
    const entry = index * 16
    directory[entry] = image.size >= 256 ? 0 : image.size
    directory[entry + 1] = image.size >= 256 ? 0 : image.size
    directory[entry + 2] = 0 // palette size
    directory[entry + 3] = 0 // reserved
    directory.writeUInt16LE(1, entry + 4) // colour planes
    directory.writeUInt16LE(32, entry + 6) // bits per pixel
    directory.writeUInt32LE(image.png.length, entry + 8)
    directory.writeUInt32LE(offset, entry + 12)
    offset += image.png.length
  })

  return Buffer.concat([header, directory, ...images.map((image) => image.png)])
}

/* --------------------------------------------------------------------- main */

function main() {
  const buildDir = resolve(ROOT, 'build')
  const assetsDir = resolve(ROOT, 'src/main/assets')
  mkdirSync(buildDir, { recursive: true })
  mkdirSync(assetsDir, { recursive: true })

  const appIcon = encodePng(1024, render(1024, true, GLYPH_ON_ACCENT))
  writeFileSync(resolve(buildDir, 'icon.png'), appIcon)

  const icoSizes = [16, 24, 32, 48, 64, 128, 256]
  const ico = encodeIco(
    icoSizes.map((size) => ({ size, png: encodePng(size, render(size, true, GLYPH_ON_ACCENT)) })),
  )
  writeFileSync(resolve(buildDir, 'icon.ico'), ico)

  const tray16 = encodePng(16, render(16 * 4, false, GLYPH_PLAIN)) // 4x for crisper scaling
  const tray32 = encodePng(32, render(32, false, GLYPH_PLAIN))

  const module = `/**
 * Generated by scripts/generate-icons.mjs — do not edit by hand.
 *
 * The tray icon is embedded rather than read from disk so it works identically
 * in development and inside the packaged asar, with no path resolution.
 */

/** 64x64 source, downscaled by the OS to the tray's real size. */
export const TRAY_ICON_64 = 'data:image/png;base64,${tray16.toString('base64')}'

/** 32x32 source for high-DPI trays. */
export const TRAY_ICON_32 = 'data:image/png;base64,${tray32.toString('base64')}'
`
  writeFileSync(resolve(assetsDir, 'tray.ts'), module)

  process.stdout.write(
    `icons: build/icon.png (${appIcon.length} B), build/icon.ico (${ico.length} B), ` +
      `src/main/assets/tray.ts (16px + 32px)\n`,
  )
}

main()
