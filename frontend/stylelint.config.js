// Phase 0b part 3: CSS values come from --pks-* tokens. Files in stylelint.baseline.js are
// exempt until their page migrates; that list only shrinks (see src/test/lintRules.test.ts).
import { cssBaseline } from './stylelint.baseline.js'

export const tokenRules = {
  'color-no-hex': true,
  'function-disallowed-list': ['rgb', 'rgba', 'hsl', 'hsla'],
  // Motion has no pks tokens yet; --mobile-nav-offset is runtime layout state.
  'declaration-property-value-disallowed-list': {
    '/.*/': ['/var\\(--(?!pks-|mobile-nav-offset|dur-|ease-)/'],
  },
}

const off = Object.fromEntries(Object.keys(tokenRules).map((rule) => [rule, null]))

export default {
  ignoreFiles: ['src/styles/tokens.css', 'dist/**'],
  rules: tokenRules,
  overrides: cssBaseline.length ? [{ files: cssBaseline, rules: off }] : [],
}
