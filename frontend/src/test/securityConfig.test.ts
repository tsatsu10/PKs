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

describe('index.html and CSP', () => {
  it('serves no Google Fonts', () => {
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
})
