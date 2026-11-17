import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

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
})
