// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rgb, ratio, blend } from './contrast.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexCss = readFileSync(join(SRC, 'index.css'), 'utf8');

function cssFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return cssFiles(p);
    return p.endsWith('.css') ? [p] : [];
  });
}
const allCss = cssFiles(SRC).map((file) => ({ file, text: readFileSync(file, 'utf8') }));

function tokenBlock(re) {
  const m = indexCss.match(re);
  if (!m) throw new Error(`token block not found: ${re}`);
  return Object.fromEntries([...m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
}
const dark = tokenBlock(/:root,\s*\[data-theme="dark"\]\s*\{([^}]*)\}/);
const light = { ...dark, ...tokenBlock(/\[data-theme="light"\]\s*\{([^}]*)\}/) };

const t = (theme, name) => rgb(theme[name]);

describe('text contrast meets WCAG AA (4.5:1)', () => {
  it('faint text on dark surfaces', () => {
    expect(ratio(t(dark, '--polar-faint'), t(dark, '--surface'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t(dark, '--polar-faint'), t(dark, '--surface-elevated'))).toBeGreaterThanOrEqual(4.5);
  });
  it('faint text on the light background', () => {
    expect(ratio(t(light, '--polar-faint'), t(light, '--space-black'))).toBeGreaterThanOrEqual(4.5);
  });
  it('primary button text on both gradient stops, in both themes', () => {
    for (const theme of [dark, light]) {
      expect(ratio(t(theme, '--on-accent'), t(theme, '--accent-strong-start'))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t(theme, '--on-accent'), t(theme, '--accent-strong-end'))).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('success toast text in light theme', () => {
    const toastBg = blend([34, 197, 94], 0.2, t(light, '--space-black'));
    expect(ratio(t(light, '--success-text'), toastBg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('stylesheet hygiene', () => {
  it('every var() without a fallback refers to a defined custom property', () => {
    const defined = new Set(allCss.flatMap(({ text }) => [...text.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1])));
    const missing = allCss.flatMap(({ file, text }) =>
      [...text.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)]
        .map((m) => m[1])
        .filter((name) => !defined.has(name) && !/^--(bn|mantine)-/.test(name))
        .map((name) => `${name} in ${file.slice(SRC.length + 1)}`));
    expect(missing).toEqual([]);
  });
  it('no :focus-visible rule removes the outline', () => {
    const offenders = allCss.flatMap(({ file, text }) =>
      [...text.matchAll(/([^{}]*:focus-visible[^{}]*)\{([^}]*)\}/g)]
        .filter((m) => /outline:\s*(none|0)\b/.test(m[2]))
        .map((m) => `${m[1].trim()} in ${file.slice(SRC.length + 1)}`));
    expect(offenders).toEqual([]);
  });
  it('no .btn-primary rule re-applies the low-contrast accent gradient', () => {
    const offenders = allCss.flatMap(({ file, text }) =>
      [...text.matchAll(/([^{}]*\.btn-primary[^{}]*)\{([^}]*)\}/g)]
        .filter((m) => /--accent-gradient|color:\s*var\(--polar-white\)/.test(m[2]))
        .map((m) => `${m[1].trim()} in ${file.slice(SRC.length + 1)}`));
    expect(offenders).toEqual([]);
  });
  it('no media query uses var(), which browsers ignore', () => {
    const offenders = allCss.filter(({ text }) => /@media[^{]*var\(/.test(text)).map(({ file }) => file.slice(SRC.length + 1));
    expect(offenders).toEqual([]);
  });
  it('no rule pairs the low-contrast accent gradient with a text color', () => {
    const offenders = allCss.flatMap(({ file, text }) =>
      [...text.matchAll(/([^{}]*)\{([^}]*)\}/g)]
        .filter((m) => /var\(--accent-gradient\)/.test(m[2]) && /(?:^|[^-])color:/.test(m[2]))
        .map((m) => `${m[1].trim()} in ${file.slice(SRC.length + 1)}`));
    expect(offenders).toEqual([]);
  });
});

describe('mobile shell', () => {
  it('enables safe-area insets via viewport-fit=cover', () => {
    const html = readFileSync(join(SRC, '..', 'index.html'), 'utf8');
    expect(html).toMatch(/<meta name="viewport"[^>]*viewport-fit=cover/);
  });
  it('sets --mobile-nav-offset on small screens', () => {
    const layout = readFileSync(join(SRC, 'components', 'AppLayout.css'), 'utf8');
    expect(layout).toMatch(/@media \(max-width: 768px\)[\s\S]*--mobile-nav-offset:\s*calc\(56px \+ env\(safe-area-inset-bottom/);
  });
});
