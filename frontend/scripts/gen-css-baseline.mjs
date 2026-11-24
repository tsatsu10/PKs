// Rewrites stylelint.baseline.js with every src CSS file that breaks the token rules.
// Run from frontend/: node scripts/gen-css-baseline.mjs. Use only to shrink the list.
import fs from 'node:fs'
import stylelint from 'stylelint'

fs.writeFileSync('stylelint.baseline.js', 'export const cssBaseline = []\n')
const { tokenRules } = await import('../stylelint.config.js')
const { results } = await stylelint.lint({
  files: ['src/**/*.css', '!src/styles/tokens.css'],
  config: { rules: tokenRules },
})
const list = results
  .filter((r) => r.warnings.length > 0)
  .map((r) => r.source.replaceAll('\\', '/').split('/frontend/')[1])
  .sort()
const js = `// Phase 0b part 3: CSS files allowed to break the token-value rules. Only remove entries; part 3 ends with [].\nexport const cssBaseline = ${JSON.stringify(list, null, 2)}\n`
fs.writeFileSync('stylelint.baseline.js', js)
console.log('baseline files:', list.length)
