// Generates PWA icons procedurally (no image dependencies).
// Draws a green rounded-square app icon with a white wallet glyph using
// signed distance functions, then encodes the pixels as PNG via zlib.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

// --- minimal PNG encoder -----------------------------------------------------
function crc32(buf) {
  let c, table = crc32.table
  if (!table) {
    table = crc32.table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
  }
  c = -1
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xff]
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePNG(size, pixels /* RGBA Uint8Array */) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // color type RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    pixels.copy ? null : null
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- signed distance helpers -------------------------------------------------
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
// rounded rectangle SDF centered at (cx,cy), half-size (hw,hh), corner radius r
function sdRoundRect(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - hw + r
  const qy = Math.abs(y - cy) - hh + r
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r
}
function sdCircle(x, y, cx, cy, r) {
  return Math.hypot(x - cx, y - cy) - r
}
// coverage from SDF (1px anti-alias edge)
const cov = (d) => clamp(0.5 - d, 0, 1)

function blend(dst, i, r, g, b, a) {
  const inv = 1 - a
  dst[i] = r * a + dst[i] * inv
  dst[i + 1] = g * a + dst[i + 1] * inv
  dst[i + 2] = b * a + dst[i + 2] * inv
  dst[i + 3] = Math.min(255, 255 * a + dst[i + 3] * inv)
}

// --- icon renderer ------------------------------------------------------------
function renderIcon(size, { maskable = false } = {}) {
  const px = new Uint8Array(size * size * 4)
  const u = size / 100 // design units: 100x100 canvas
  // maskable icons need a full-bleed background (safe zone = inner 80%)
  const bgRadius = maskable ? 0 : 22 * u
  const pad = maskable ? 0 : 2 * u
  const glyphScale = maskable ? 0.78 : 1

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      // background: dark→green vertical gradient in a rounded square
      const dBg = sdRoundRect(x + 0.5, y + 0.5, size / 2, size / 2, size / 2 - pad, size / 2 - pad, bgRadius)
      const aBg = cov(dBg)
      if (aBg <= 0) continue
      const t = y / size
      blend(px, i, 16 + 14 * t, 92 + 80 * t, 52 + 46 * t, aBg) // #105c34 → #1eac62

      // wallet glyph (white), centered, in design units scaled by glyphScale
      const g = (v) => size / 2 + (v - 50) * u * glyphScale
      const s = (v) => v * u * glyphScale
      // wallet body
      const dBody = sdRoundRect(x, y, g(50), g(53), s(22), s(15), s(7))
      // flap line: cut a horizontal notch near the top of the body
      const dFlap = sdRoundRect(x, y, g(50), g(41.5), s(24), s(2.2), s(2.2))
      // clasp: small circle on the right edge
      const dClasp = sdCircle(x, y, g(63), g(53), s(4.4))
      const dClaspHole = sdCircle(x, y, g(63), g(53), s(1.8))

      let aGlyph = cov(Math.min(dBody, dFlap, dClasp))
      aGlyph = Math.min(aGlyph, 1 - cov(dClaspHole) * 0.85)
      if (aGlyph > 0) blend(px, i, 245, 250, 247, aGlyph * aBg)
    }
  }
  return encodePNG(size, px)
}

const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['maskable-512.png', 512, { maskable: true }],
]
for (const [name, size, opts] of targets) {
  writeFileSync(join(outDir, name), renderIcon(size, opts))
  console.log(`wrote public/icons/${name}`)
}
