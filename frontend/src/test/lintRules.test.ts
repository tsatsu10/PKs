import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import tseslint from 'typescript-eslint'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const require = createRequire(import.meta.url)
// Plain JS at the frontend root (also imported by eslint.config.js); loaded via require
// so tsc does not need to resolve a .js file outside src/.
const { a11yBaseline } = require('../../eslint.a11y-baseline.js') as { a11yBaseline: string[] }

async function lintText(code: string, filePath: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: frontendRoot })
  const [result] = await eslint.lintText(code, { filePath: path.join(frontendRoot, filePath) })
  return result.messages.map((m) => m.ruleId).filter((ruleId): ruleId is string => Boolean(ruleId))
}

describe('eslint guardrails', () => {
  it('flags an unused PascalCase variable in JSX files', async () => {
    const rules = await lintText(
      'const Unused = 1; export default function A() { return null; }',
      'src/x.jsx',
    )
    expect(rules).toContain('no-unused-vars')
  })

  it('counts JSX usage as a use', async () => {
    const rules = await lintText(
      "import Foo from './Foo'; export default function A() { return <Foo />; }",
      'src/x.jsx',
    )
    expect(rules).not.toContain('no-unused-vars')
  })

  it('allows a leading underscore', async () => {
    expect(await lintText('const _skip = 1; export default 2;', 'src/x.jsx')).not.toContain(
      'no-unused-vars',
    )
    expect(
      await lintText('const _skip = 1; export default 2;', 'src/x.ts'),
    ).not.toContain('@typescript-eslint/no-unused-vars')
  })

  it('flags an image without alt outside the baseline', async () => {
    const rules = await lintText('export const A = () => <img src="x" />;', 'src/zz-new.jsx')
    expect(rules).toContain('jsx-a11y/alt-text')
  })

  it('every baseline file still has a jsx-a11y violation', async () => {
    // Lints each listed file with jsx-a11y forced on, bypassing the project's
    // baseline exemption. A file that no longer fails must leave the list.
    const forceA11y = new ESLint({
      cwd: frontendRoot,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.{jsx,tsx}'],
          plugins: { 'jsx-a11y': jsxA11y },
          rules: jsxA11y.flatConfigs.recommended.rules,
          languageOptions: {
            parser: tseslint.parser,
            ecmaVersion: 2022,
            parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
          },
        },
      ],
    })
    for (const rel of a11yBaseline) {
      const code = fs.readFileSync(path.join(frontendRoot, rel), 'utf8')
      const [result] = await forceA11y.lintText(code, { filePath: path.join(frontendRoot, rel) })
      const rules = result.messages.map((m) => m.ruleId)
      expect(
        rules.some((r) => r?.startsWith('jsx-a11y/')),
        `${rel} is clean now: remove it from eslint.a11y-baseline.js`,
      ).toBe(true)
    }
  }, 60_000)
})
