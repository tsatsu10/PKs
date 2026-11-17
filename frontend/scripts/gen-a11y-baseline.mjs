import fs from 'node:fs'
const r = JSON.parse(fs.readFileSync('a11y.json', 'utf8'))
const files = new Set()
for (const f of r) {
  if (f.messages.some((m) => m.ruleId && m.ruleId.startsWith('jsx-a11y/'))) {
    const normalized = f.filePath.replaceAll('\\', '/')
    files.add(normalized.split('/frontend/')[1])
  }
}
const list = [...files].sort()
const js = `// Phase 0b: files allowed to fail jsx-a11y. Only remove entries; part 4 ends with [].\nexport const a11yBaseline = ${JSON.stringify(list, null, 2)}\n`
fs.writeFileSync('eslint.a11y-baseline.js', js)
console.log('baseline files:', list.length)
