import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
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

// The first lintText call loads the ESLint config and plugins cold; under full-suite
// parallel load that can exceed the default 5 s, so this file gets a generous timeout.
describe('eslint guardrails', { timeout: 30_000 }, () => {
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

  it('stops components from importing features', async () => {
    const code = "import x from '../features/dashboard/lib/keyboardMap'; export default x;"
    expect(await lintText(code, 'src/components/Z.jsx')).toContain('no-restricted-imports')
    expect(await lintText(code, 'src/pages/Z.jsx')).not.toContain('no-restricted-imports')
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

describe('css guardrails', { timeout: 60_000 }, () => {
  const runCheckCss = (...args: string[]) =>
    execFileSync('node', ['scripts/check-css.mjs', ...args], { cwd: frontendRoot, encoding: 'utf8' })

  it('keeps the CSS total within budget', () => {
    expect(() => runCheckCss()).not.toThrow()
  })

  it('shows selection without hover on touch', () => {
    // M8: a selection checkbox may hide until hover only where hover exists.
    const files = [
      'src/features/dashboard/components/DashboardObjectCard.css',
      'src/features/dashboard/components/Views/StreamView.css',
      'src/features/dashboard/components/Views/TableView.css',
      'src/pages/Dashboard.css',
    ]
    const bad: string[] = []
    for (const rel of files) {
      const css = fs.readFileSync(path.join(frontendRoot, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      const outsideHover = css.replace(/@media \(hover: hover\)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
      for (const m of outsideHover.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (/checkbox/.test(m[1]) && /opacity:\s*0\s*(;|$)/.test(m[2])) bad.push(rel + ': ' + m[1].trim())
      }
    }
    expect(bad).toEqual([])
  })

  it('has no unreferenced classes outside the allowlist', () => {
    expect(JSON.parse(runCheckCss('--unused', '--json'))).toEqual([])
  })
})

describe('page roots (M5)', () => {
  it('has no full-viewport page roots', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
      )
    const bad = ['pages', 'features']
      .flatMap((d) => walk(path.join(frontendRoot, 'src', d)))
      // Auth pages sit outside AppLayout and own the whole viewport.
      .filter((f) => f.endsWith('.css') && !f.endsWith('Auth.css'))
      .filter((f) => /min-height:\s*100d?vh/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(frontendRoot, f))
    expect(bad).toEqual([])
  })
})

describe('legacy layer is gone (part 3 exit)', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    )
  const src = path.join(frontendRoot, 'src')

  it('has an empty CSS baseline', () => {
    const { cssBaseline } = require('../../stylelint.baseline.js') as { cssBaseline: string[] }
    expect(cssBaseline).toEqual([])
  })

  it('uses no legacy button or form classes', () => {
    const legacy = /^(btn|btn-primary|btn-secondary|btn-danger|btn-ghost|btn-small|form|form-control|form-group|form-label|form-error|empty-state)$/
    const bad: string[] = []
    for (const f of walk(src).filter((p) => /\.(jsx|tsx)$/.test(p) && !/\.test\./.test(p))) {
      const code = fs.readFileSync(f, 'utf8')
      for (const m of code.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        for (const cls of (m[1] ?? m[2]).split(/[\s${}?:'"]+/)) {
          if (legacy.test(cls)) bad.push(`${path.relative(frontendRoot, f)}: ${cls}`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('defines no legacy variables', () => {
    const bad: string[] = []
    for (const f of walk(src).filter((p) => p.endsWith('.css') && !/styles[\\/](tokens|derived)\.css$/.test(p))) {
      const css = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      for (const m of css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)) {
        // Allowed outside the token files: motion, layout state, and variables a library or a component reads.
        if (!/^--(dur-|ease-|mobile-nav-offset|bn-|type-mark-|pks-)/.test(m[1])) bad.push(`${path.relative(frontendRoot, f)}: ${m[1]}`)
      }
    }
    expect(bad).toEqual([])
  })
})
