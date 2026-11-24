import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(__dirname, '..', 'components', 'ui');
const cssFiles = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.css')) : [];
const read = (f: string) => readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('components/ui CSS', () => {
  it('prefixes every ui class', () => {
    const bad: string[] = [];
    for (const f of cssFiles) {
      const css = read(f);
      // selector parts: text before each `{`, after the previous `}` or `;`
      for (const m of css.matchAll(/(^|[};])([^{};]+)\{/g)) {
        const selector = m[2];
        if (selector.trim().startsWith('@')) continue;
        for (const c of selector.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
          if (!c[1].startsWith('ui-')) bad.push(`${f}: .${c[1]}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('uses only pks tokens for values', () => {
    const bad: string[] = [];
    for (const f of cssFiles) {
      const css = read(f);
      for (const re of [/#[0-9a-fA-F]{3,8}\b/g, /\brgba?\(/g, /\bhsl\(/g, /var\(--(?!pks-|mobile-nav-offset\b)[\w-]+/g]) {
        for (const m of css.matchAll(re)) bad.push(`${f}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
