// @vitest-environment node
// Guards for regressions that the part 3 CSS sweep made and unit tests in jsdom could not see:
// styling that markup still needs, deleted or orphaned by mechanical edits.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  )
const rel = (f: string) => path.relative(src, f).split(path.sep).join('/')
const read = (f: string) => fs.readFileSync(f, 'utf8').replace(/\r/g, '')
const files = walk(src)
const css = files
  .filter((f) => f.endsWith('.css'))
  .map((f) => ({ file: rel(f), text: read(f).replace(/\/\*[\s\S]*?\*\//g, '') }))
const markup = files
  .filter((f) => /\.(jsx|tsx)$/.test(f) && !/\.test\./.test(f))
  .map((f) => ({ file: rel(f), text: read(f) }))
const rules = css.flatMap(({ file, text }) =>
  [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ file, selector: m[1].trim(), body: m[2] })),
)
/** Classes that are the subject (last compound) of at least one selector. */
const styledClasses = new Set(
  rules.flatMap((r) =>
    r.selector.split(',').flatMap((s) => {
      const last = s.trim().split(/[\s>+~]+/).pop() ?? ''
      return [...last.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1])
    }),
  ),
)

/** Opening tags of the given elements, read to the real end of the tag (attribute values may contain '>'). */
function openTags(text: string, names: string): Array<{ tag: string; attrs: string }> {
  const out: Array<{ tag: string; attrs: string }> = []
  const re = new RegExp(`<(${names})(?=[\\s/>])`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    let depth = 0
    let quote: string | null = null
    let i = m.index + m[0].length
    for (; i < text.length; i++) {
      const c = text[i]
      if (quote) {
        if (c === quote) quote = null
        continue
      }
      if (c === '"' || c === "'" || c === '`') quote = c
      else if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
    }
    out.push({ tag: m[1], attrs: text.slice(m.index + m[0].length, i) })
    re.lastIndex = i
  }
  return out
}
const classesOf = (attrs: string) => (attrs.match(/\sclassName="([^"]+)"/)?.[1] ?? '').split(/\s+/).filter(Boolean)
const cssOf = (name: string) => css.find((c) => c.file === name)?.text ?? ''
const sourceOf = (name: string) => markup.find((m) => m.file === name)?.text ?? ''
const boxed = (body: string) => /(^|[\s;])(border|padding)\b/.test(body)

describe('styles that markup depends on', () => {
  it('no rule uses one token for both its text and its background', () => {
    const bad = rules
      .filter((r) => {
        const color = r.body.match(/(?:^|[\s;])color:\s*(var\(--[\w-]+\))/)?.[1]
        const bg = r.body.match(/background(?:-color)?:\s*(var\(--[\w-]+\))\s*;/)?.[1]
        return color && bg && color === bg
      })
      .map((r) => `${r.file}: ${r.selector}`)
    expect(bad).toEqual([])
  })

  it('every classed raw control has a rule of its own', () => {
    // A <button>, <input>, <select> or <textarea> whose classes have no rule falls back to the
    // browser's look. Primitives (ui-*) are styled by their own stylesheets.
    const bad: string[] = []
    for (const { file, text } of markup) {
      if (file.startsWith('components/ui/')) continue
      for (const { tag, attrs } of openTags(text, 'button|input|select|textarea')) {
        const classes = classesOf(attrs)
        if (classes.length === 0 || classes.some((c) => c.startsWith('ui-') || styledClasses.has(c))) continue
        bad.push(`${file}: <${tag} className="${classes.join(' ')}">`)
      }
    }
    expect(bad).toEqual([])
  })

  it('no unclassed label wraps a text control', () => {
    // index.css used to lay these out through `.form label`; that layer is gone.
    const bad: string[] = []
    for (const { file, text } of markup) {
      for (const m of text.matchAll(/<label>([\s\S]*?)<\/label>/g)) {
        const control = openTags(m[1], 'input|select|textarea')[0]
        if (!control || /type="(checkbox|radio|file)"/.test(control.attrs)) continue
        bad.push(`${file}: ${m[1].trim().split('\n')[0].slice(0, 40)}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('text controls on pages carry the primitive look or a boxed rule of their own', () => {
    const own = (c: string) => rules.some((r) => new RegExp(`\\.${c}(?![\\w-])`).test(r.selector) && boxed(r.body))
    // e.g. `.detail-property select`: styled through a class on an ancestor in the same file
    const viaAncestor = (tag: string, text: string) =>
      rules.some((r) => {
        const m = r.selector.match(new RegExp(`\\.([\\w-]+)[^,{]*\\s${tag}(?![\\w-])`))
        return !!m && boxed(r.body) && text.includes(m[1])
      })
    const bad: string[] = []
    for (const { file, text } of markup) {
      if (!/^(pages|features)\//.test(file) || /^pages\/(Login|Register|ForgotPassword|ResetPassword)\./.test(file)) continue
      for (const { tag, attrs } of openTags(text, 'input|select|textarea')) {
        if (/type="(checkbox|radio|file|hidden)"/.test(attrs)) continue
        const classes = classesOf(attrs)
        if (classes.some((c) => c.startsWith('ui-') || own(c)) || viaAncestor(tag, text)) continue
        bad.push(`${file}: <${tag} className="${classes.join(' ')}">`)
      }
    }
    expect(bad).toEqual([])
  })

  it('notification rows are laid out and unread ones are highlighted', () => {
    const text = cssOf('components/NotificationCenter.css')
    expect(text).toMatch(/\.notification-item\s*\{[^}]*display:\s*flex/)
    expect(text).toMatch(/\.notification-item\.unread\s*\{[^}]*background/)
    // The class sits on the <li> itself, so a descendant selector under li can never match.
    expect(text).not.toMatch(/li\.unread\s+\.notification-item/)
  })

  it('object-page action errors use the shared error style', () => {
    expect(sourceOf('features/object/ObjectPage.tsx')).toContain('{error && <div className="ui-page-error" role="alert">')
  })
})

describe('colour pairs the token tests cannot see', () => {
  it('a primary or danger link-button keeps its on-accent text on hover', () => {
    // index.css gives a:hover the page text colour at higher specificity than .ui-button--primary.
    const text = cssOf('components/ui/Button.css')
    for (const variant of ['primary', 'danger']) {
      const hover = text.match(new RegExp(`\\.ui-button--${variant}:hover[^{]*\\{([^}]*)\\}`))?.[1] ?? ''
      expect(hover, `.ui-button--${variant}:hover`).toMatch(/(^|[\s;])color:\s*var\(--pks-text-on-accent\)/)
    }
  })

  it('the strong accent gradient is only a fill under on-accent text', () => {
    // --pks-accent-gradient-* are pink-700/indigo-700, made for white text on top. As a text or
    // decorative gradient they are about 2.5:1 on the dark card surface.
    const bad = rules
      .filter((r) => !r.file.startsWith('styles/') && /--pks-accent-gradient-(start|end)/.test(r.body))
      .filter((r) => !/(^|[\s;])color:\s*var\(--pks-text-on-accent\)/.test(r.body))
      .map((r) => `${r.file}: ${r.selector}`)
    expect(bad).toEqual([])
  })
})
