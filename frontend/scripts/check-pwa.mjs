/*
 * Phase 0b-1: verifies the built PWA artifacts (run after `npm run build`, in CI and locally).
 * - manifest has 192 and 512 PNG icons (purpose "any") and a 512 maskable PNG
 * - every icon src exists in dist/
 * - the manifest description is plain language (no "synthesize")
 * - sw.js precaches at least one .woff2 (the self-hosted font)
 */
import fs from 'node:fs'
import path from 'node:path'

const dist = path.resolve(import.meta.dirname, '..', 'dist')
const failures = []

const manifestPath = path.join(dist, 'manifest.webmanifest')
const swPath = path.join(dist, 'sw.js')

if (!fs.existsSync(manifestPath)) {
  failures.push('dist/manifest.webmanifest is missing — run npm run build first')
} else {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const icons = manifest.icons ?? []

  const png = (size, purpose) =>
    icons.some(
      (i) =>
        i.src?.endsWith('.png') &&
        i.sizes === `${size}x${size}` &&
        i.type === 'image/png' &&
        (purpose ? i.purpose === purpose : true),
    )

  if (!png(192, 'any')) failures.push('manifest: missing 192x192 PNG icon with purpose "any"')
  if (!png(512, 'any')) failures.push('manifest: missing 512x512 PNG icon with purpose "any"')
  if (!png(512, 'maskable')) failures.push('manifest: missing 512x512 maskable PNG icon')

  for (const icon of icons) {
    const file = path.join(dist, icon.src.replace(/^\//, ''))
    if (!fs.existsSync(file)) failures.push(`manifest: icon ${icon.src} does not exist in dist/`)
  }

  if (/synthesize/i.test(manifest.description ?? '')) {
    failures.push('manifest: description must not contain "synthesize"')
  }
}

if (!fs.existsSync(swPath)) {
  failures.push('dist/sw.js is missing — run npm run build first')
} else {
  const sw = fs.readFileSync(swPath, 'utf8')
  if (!sw.includes('.woff2')) failures.push('sw.js: no .woff2 in the precache (self-hosted font missing)')
}

if (failures.length) {
  console.error('PWA check failed:')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('PWA check passed')
