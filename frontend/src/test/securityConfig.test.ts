import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const vercelJson = JSON.parse(fs.readFileSync(path.join(frontendRoot, 'vercel.json'), 'utf8'))
const indexHtml = fs.readFileSync(path.join(frontendRoot, 'index.html'), 'utf8')

type HeaderEntry = { source: string; headers: { key: string; value: string }[] }

export function header(source: string, key: string): string | undefined {
  const entry = (vercelJson.headers as HeaderEntry[]).find((h) => h.source === source)
  return entry?.headers.find((h) => h.key === key)?.value
}

export function csp(): Map<string, string[]> {
  const value = header('/(.*)', 'Content-Security-Policy') ?? ''
  return new Map(
    value
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...rest] = d.split(/\s+/)
        return [name, rest]
      }),
  )
}

/** All app source files, excluding tests and test support. */
function srcFiles(dir = path.join(frontendRoot, 'src')): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'test' || entry.name === 'data') return []
      return srcFiles(full)
    }
    const isSource = /\.[jt]sx?$/.test(entry.name)
    const isTest = /\.test\.[jt]sx?$/.test(entry.name)
    return isSource && !isTest ? [full] : []
  })
}

describe('index.html and CSP', () => {  it('serves no Google Fonts', () => {
    expect(indexHtml).not.toContain('fonts.googleapis')
    expect(indexHtml).not.toContain('fonts.gstatic')
    for (const [directive, values] of csp()) {
      expect(values.join(' '), directive).not.toContain('fonts.googleapis')
      expect(values.join(' '), directive).not.toContain('fonts.gstatic')
    }
  })

  it('has no inline scripts or handlers', () => {
    expect(indexHtml).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/)
    expect(indexHtml).not.toMatch(/ on[a-z]+=/i)
    const scriptSrc = csp().get('script-src') ?? []
    expect(scriptSrc).not.toContain("'unsafe-hashes'")
    expect(scriptSrc.some((v) => v.startsWith('sha256-'))).toBe(false)
  })

  it('loads the theme before paint', () => {
    expect(indexHtml).toContain('<script src="/theme-init.js"></script>')
    expect(indexHtml).not.toMatch(/<script[^>]*theme-init\.js[^>]*(async|defer|type=)/)
    const head = indexHtml.split('</head>')[0]
    expect(head).toContain('<script src="/theme-init.js"></script>')
  })

  it('keeps Turnstile allowed', () => {
    for (const directive of ['script-src', 'connect-src', 'frame-src']) {
      expect(csp().get(directive) ?? [], directive).toContain(
        'https://challenges.cloudflare.com',
      )
    }
  })

  it('pins connect-src to the project', () => {
    const expected = [
      "'self'",
      'https://qtsxnipmbuvfflifvusn.supabase.co',
      'wss://qtsxnipmbuvfflifvusn.supabase.co',
      'https://challenges.cloudflare.com',
    ]
    expect([...(csp().get('connect-src') ?? [])].sort()).toEqual([...expected].sort())
    for (const [directive, values] of csp()) {
      expect(values.join(' '), directive).not.toContain('*.supabase.co')
    }
  })

  it('sends COOP and HSTS preload', () => {
    expect(header('/(.*)', 'Cross-Origin-Opener-Policy')).toBe('same-origin')
    expect(header('/(.*)', 'Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains; preload',
    )
  })

  it('caches only hashed assets forever', () => {
    const entries = vercelJson.headers as HeaderEntry[]
    const assets = entries.filter((e) => e.source === '/assets/(.*)')
    expect(assets).toHaveLength(1)
    expect(assets[0].headers.find((h) => h.key === 'Cache-Control')?.value).toBe(
      'public, max-age=31536000, immutable',
    )
    for (const e of entries) {
      if (e.source === '/assets/(.*)') continue
      expect(e.headers.some((h) => h.key === 'Cache-Control'), e.source).toBe(false)
    }
  })

  it('has no popup flows that COOP would break', () => {
    // COOP same-origin severs cross-origin opener access, so src must not use window.open
    // at all: downloads use an anchor click, printing uses a same-origin iframe. A future
    // window.open flow breaks under COOP and must use one of those patterns instead.
    const offenders = srcFiles()
      .filter((file) => fs.readFileSync(file, 'utf8').includes('window.open('))
      .map((file) => path.relative(frontendRoot, file).replaceAll('\\', '/'))
    expect(offenders).toEqual([])
  })
})
