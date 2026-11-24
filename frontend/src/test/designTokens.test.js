// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rgb, ratio } from './contrast.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

function cssFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return cssFiles(p);
    return p.endsWith('.css') ? [p] : [];
  });
}
const allCss = cssFiles(SRC).map((file) => ({ file, text: readFileSync(file, 'utf8') }));

const tokensCss = readFileSync(join(SRC, 'styles', 'tokens.css'), 'utf8');

function tokenBlock(re) {
  const m = tokensCss.match(re);
  if (!m) throw new Error(`token block not found: ${re}`);
  return Object.fromEntries([...m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
}
// tokens.css: core palette, then the dark theme's semantic tokens, then the light theme's.
const core = tokenBlock(/^:root\s*\{([^}]*)\}/m);
const dark = { ...core, ...tokenBlock(/:root,\s*\[data-theme="dark"\]\s*\{([^}]*)\}/) };
const light = { ...dark, ...tokenBlock(/\[data-theme="light"\]\s*\{([^}]*)\}/) };

/** A token's colour in a theme, following var() references down to the palette. */
function t(theme, name) {
  let value = theme[name];
  for (let i = 0; i < 5 && value && value.startsWith('var('); i++) value = theme[value.slice(4, -1).trim()];
  if (!value || !value.startsWith('#')) throw new Error(`${name} does not resolve to a colour`);
  return rgb(value);
}

// Part 3 moved every page from hand-tuned legacy variables onto these pairs; each must hold in both themes.
const THEMES = [['dark', dark], ['light', light]];
const TEXT_ON_SURFACE = [
  ['--pks-text-primary', '--pks-bg-app'],
  ['--pks-text-primary', '--pks-surface-card'],
  ['--pks-text-primary', '--pks-surface-raised'],
  ['--pks-text-secondary', '--pks-bg-app'],
  ['--pks-text-secondary', '--pks-surface-card'],
  ['--pks-text-secondary', '--pks-surface-raised'],
  ['--pks-text-muted', '--pks-bg-app'],
  ['--pks-text-muted', '--pks-surface-card'],
  ['--pks-text-muted', '--pks-surface-raised'],
  ['--pks-text-primary', '--pks-surface-input'],
  ['--pks-accent-link', '--pks-bg-app'],
  ['--pks-accent-link', '--pks-surface-card'],
  ['--pks-text-on-accent', '--pks-accent-primary-strong'],
  ['--pks-text-on-accent', '--pks-status-danger-fill'],
  ['--pks-status-danger', '--pks-status-danger-surface'],
  ['--pks-status-success', '--pks-status-success-surface'],
  ['--pks-status-warning', '--pks-status-warning-surface'],
  ['--pks-accent-ai-text', '--pks-accent-ai-surface'],
  ['--pks-accent-link', '--pks-accent-selected-surface'],
  ['--pks-status-danger', '--pks-bg-app'],
  ['--pks-status-danger', '--pks-surface-card'],
  ['--pks-status-success', '--pks-surface-card'],
  ['--pks-status-warning', '--pks-surface-card'],
];

describe('text contrast meets WCAG AA (4.5:1)', () => {
  describe.each(THEMES)('%s theme', (_name, theme) => {
    it.each(TEXT_ON_SURFACE)('%s on %s', (fg, bg) => {
      expect(ratio(t(theme, fg), t(theme, bg))).toBeGreaterThanOrEqual(4.5);
    });
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
  it('--pks-accent-primary is never text or the fill under on-accent text', () => {
    // White on pink-500 is 3.5:1 in the dark theme and pink-600 on the light page is under 4.5:1.
    // Text uses --pks-accent-link; fills under --pks-text-on-accent use --pks-accent-primary-strong.
    const bad = [];
    for (const { file, text } of allCss) {
      const css = text.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const body = m[2];
        const asText = /(^|[\s;])color:\s*var\(--pks-accent-primary\)/.test(body);
        const underText = /background(-color)?:\s*var\(--pks-accent-primary\)/.test(body) && /(^|[\s;])color:\s*var\(--pks-text-on-accent\)/.test(body);
        if (asText || underText) bad.push(`${file.slice(SRC.length + 1)}: ${m[1].trim().split('\n').pop()}`);
      }
    }
    expect(bad).toEqual([]);
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
