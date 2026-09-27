#!/usr/bin/env node
/**
 * Post-build guard. Fails when:
 *  - index.html (or the entry chunk) loads the BlockNote editor chunk,
 *  - a non-editor page chunk statically imports the editor chunk,
 *  - the service worker does not precache the editor chunk (offline editing),
 *  - unused Inter fonts are precached.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const assets = join(dist, 'assets');
const EDITOR_PAGES = ['BlockNoteEditor-', 'ObjectDetail-', 'ObjectNew-', 'QuickCapture-'];
const STATIC_EDITOR_IMPORT = /(from\s*|import\s*)["']\.\/blocknote-/;
const failures = [];

const html = readFileSync(join(dist, 'index.html'), 'utf8');
if (/href="\/assets\/blocknote-[^"]+\.js"/.test(html)) failures.push('index.html preloads the editor chunk');

for (const file of readdirSync(assets).filter((f) => f.endsWith('.js'))) {
  if (file.startsWith('blocknote-')) continue;
  if (EDITOR_PAGES.some((p) => file.startsWith(p))) continue;
  const src = readFileSync(join(assets, file), 'utf8');
  if (STATIC_EDITOR_IMPORT.test(src)) failures.push(`${file} statically imports the editor chunk`);
}

const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
if (!/assets\/blocknote-[\w-]+\.js/.test(sw)) failures.push('service worker does not precache the editor chunk');
if (/inter-v\d+/.test(sw)) failures.push('service worker precaches unused Inter font files');

if (failures.length) {
  console.error('check-bundle failed:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
console.log('check-bundle: ok');
