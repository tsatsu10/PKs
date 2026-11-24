// CSS byte budget (Phase 0b exit criterion 2) and unreferenced-class report.
//   node scripts/check-css.mjs            fail when src/**/*.css exceeds css-budget.json maxBytes
//   node scripts/check-css.mjs --unused   list class selectors no source file references (--json for machines)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const budget = JSON.parse(fs.readFileSync(path.join(root, 'css-budget.json'), 'utf8'))
const walk = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
      )
    : []
const rel = (f) => path.relative(root, f).split(path.sep).join('/')
// LF-normalised so a CRLF working copy on Windows measures the same as the git blob.
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r/g, '')
const srcFiles = walk(path.join(root, 'src'))
const cssFiles = srcFiles.filter((f) => f.endsWith('.css'))

if (process.argv.includes('--unused')) {
  const code = [
    ...srcFiles.filter((f) => /\.(jsx?|tsx?)$/.test(f) && !/\.test\./.test(f)),
    ...walk(path.join(root, 'e2e')),
    path.join(root, 'index.html'),
  ]
    .map(read)
    .join('\n')
  const words = new Set(code.match(/[A-Za-z_][\w-]*/g))
  // Classes built in template literals, e.g. `dashboard-density-${x}`.
  const dynamicPrefixes = [...code.matchAll(/([A-Za-z][\w-]*-)\$\{/g)].map((m) => m[1])
  const allow = new Set(budget.allow ?? [])
  const report = []
  for (const f of cssFiles) {
    const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '')
    const classes = new Set([...css.matchAll(/\.([a-zA-Z_][\w-]*)(?=[^{}]*\{)/g)].map((m) => m[1]))
    const unused = [...classes].filter(
      (c) => !words.has(c) && !allow.has(c) && !dynamicPrefixes.some((p) => c.startsWith(p)),
    )
    if (unused.length) report.push({ file: rel(f), classes: unused })
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(report))
  else for (const r of report) console.log(`${r.file}\n  ${r.classes.join(' ')}`)
  process.exit(0)
}

const sizes = cssFiles.map((f) => [Buffer.byteLength(read(f)), rel(f)]).sort((a, b) => b[0] - a[0])
const total = sizes.reduce((sum, [n]) => sum + n, 0)
for (const [n, f] of sizes.slice(0, 10)) console.log(String(n).padStart(7), f)
console.log(`CSS total: ${total} bytes (budget ${budget.maxBytes})`)
if (total > budget.maxBytes) {
  console.error(`CSS is ${total - budget.maxBytes} bytes over budget`)
  process.exit(1)
}
