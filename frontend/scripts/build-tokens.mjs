/**
 * Turns the Penpot design tokens (design-tokens/tokens.json, exported from the
 * PKS design file) into CSS custom properties in src/styles/tokens.css.
 *
 *   npm run tokens          regenerate tokens.css
 *
 * src/test/buildTokens.test.js fails in CI if the committed tokens.css is stale.
 *
 * Output:
 *   :root                            core tokens (palette, space, radius, type, sizes)
 *   :root, [data-theme="dark"]       the dark theme's semantic tokens
 *   [data-theme="light"]             the light theme's semantic tokens
 *
 * Every property is prefixed --pks- so it can't collide with the older
 * variables in index.css while screens move over. Semantic tokens point at core
 * ones with var(), so a palette change flows through both themes.
 */
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PREFIX = 'pks';
const BASE_FONT_SIZE = 16;
const CORE = 'core';
const DARK = 'mode/dark';
const LIGHT = 'mode/light';

/** A bare number, as Penpot writes dimensions. '8px', '1.5rem' or '4 * 2' is an error, not NaN in the CSS. */
function number(v, name) {
  const s = String(v).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`${name} has value "${v}", expected a plain number`);
  return Number(s);
}
const px = (v, name) => (number(v, name) === 0 ? '0' : `${number(v, name)}px`);
const rem = (v, name) => `${number(v, name) / BASE_FONT_SIZE}rem`;
const plain = (v) => String(v);

function fontStack(families, name) {
  const generic = /mono/i.test(name) ? 'ui-monospace, monospace' : 'system-ui, sans-serif';
  // Penpot exports an array, but accept a comma-separated string too.
  const list = (Array.isArray(families) ? families : String(families).split(','))
    .map((f) => String(f).trim().replace(/^(["'])(.*)\1$/, '$2'))
    .filter(Boolean);
  return [...list.map((f) => `"${f.replace(/["\\]/g, '\\$&')}"`), generic].join(', ');
}

/** How each Penpot token type becomes a CSS value. Unknown types are an error, not a silent skip. */
const FORMAT = {
  color: (v) => String(v).toLowerCase(),
  spacing: px,
  borderRadius: px,
  sizing: px,
  dimension: px,
  borderWidth: px,
  fontSizes: rem,
  fontWeights: plain,
  opacity: plain,
  number: plain,
  fontFamilies: fontStack,
};

/** Flattens a token set into [[path, token]] in file order. */
function flatten(set, path = []) {
  return Object.entries(set).flatMap(([key, node]) => {
    if (key.startsWith('$')) return [];
    if (node && typeof node === 'object' && '$value' in node) return [[[...path, key], node]];
    return flatten(node, [...path, key]);
  });
}

const varName = (path) => `--${PREFIX}-${path.join('-')}`;
const REF = /^\{([^{}]+)\}$/;

function cssValue(path, token, known, setName) {
  const { $value: value, $type: type } = token;
  const ref = typeof value === 'string' && value.match(REF);
  if (ref) {
    const target = ref[1];
    if (!known.has(target)) throw new Error(`${setName} ${path.join('.')} refers to {${target}}, which is not a token`);
    return `var(${varName(target.split('.'))})`;
  }
  if (typeof value === 'string' && /[{}]/.test(value)) {
    throw new Error(`${setName} ${path.join('.')} has an unsupported expression: ${value}`);
  }
  const format = FORMAT[type];
  if (!format) throw new Error(`${setName} ${path.join('.')} has token type "${type}", which build-tokens.mjs can't write yet`);
  return format(value, path.join('.'));
}

function declarations(entries, known, setName) {
  return entries.map(([path, token]) => `  ${varName(path)}: ${cssValue(path, token, known, setName)};`).join('\n');
}

/** Builds the full tokens.css text from a parsed Penpot tokens.json. */
export function buildTokensCss(tokens) {
  for (const name of [CORE, DARK, LIGHT]) {
    if (!tokens[name]) throw new Error(`tokens.json has no "${name}" set`);
  }
  const core = flatten(tokens[CORE]);
  const dark = flatten(tokens[DARK]);
  const light = flatten(tokens[LIGHT]);

  // Themes may only refer to core tokens; core may refer to itself.
  const coreKnown = new Set(core.map(([p]) => p.join('.')));

  // Each theme must define the same names, or one theme silently falls back to the other.
  const darkNames = new Set(dark.map(([p]) => p.join('.')));
  const lightNames = new Set(light.map(([p]) => p.join('.')));
  const onlyLight = [...lightNames].filter((n) => !darkNames.has(n));
  const onlyDark = [...darkNames].filter((n) => !lightNames.has(n));
  if (onlyLight.length || onlyDark.length) {
    throw new Error(`Themes differ. Only in light: ${onlyLight.join(', ') || 'none'}. Only in dark: ${onlyDark.join(', ') || 'none'}`);
  }
  // Different paths can map to one property (text.size.body and text.size-body are
  // both --pks-text-size-body), and a later declaration would silently win.
  for (const [setName, entries] of [['core + dark', [...core, ...dark]], ['core + light', [...core, ...light]]]) {
    const seen = new Map();
    for (const [path] of entries) {
      const css = varName(path);
      const dotted = path.join('.');
      if (seen.has(css)) throw new Error(`${setName}: ${seen.get(css)} and ${dotted} both become ${css}`);
      seen.set(css, dotted);
    }
  }

  return [
    '/*',
    ' * Generated by scripts/build-tokens.mjs from design-tokens/tokens.json. Do not edit by hand.',
    ' * Update tokens.json from the Penpot export, then run `npm run tokens`.',
    ' */',
    '',
    ':root {',
    declarations(core, coreKnown, CORE),
    '}',
    '',
    ':root,',
    '[data-theme="dark"] {',
    '  color-scheme: dark;',
    declarations(dark, coreKnown, DARK),
    '}',
    '',
    '[data-theme="light"] {',
    '  color-scheme: light;',
    declarations(light, coreKnown, LIGHT),
    '}',
    '',
  ].join('\n');
}

/** True when node ran this file directly. Compares real paths, since drive-letter case, junctions and symlinks (OneDrive) can differ. */
function ranDirectly() {
  if (!process.argv[1]) return false;
  const norm = (p) => {
    const real = realpathSync(p);
    return process.platform === 'win32' ? real.toLowerCase() : real;
  };
  try {
    return norm(resolve(process.argv[1])) === norm(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (ranDirectly()) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const input = resolve(process.argv[2] ?? join(root, 'design-tokens', 'tokens.json'));
  const output = join(root, 'src', 'styles', 'tokens.css');
  writeFileSync(output, buildTokensCss(JSON.parse(readFileSync(input, 'utf8'))));
  console.log(`Wrote ${output}`);
}
