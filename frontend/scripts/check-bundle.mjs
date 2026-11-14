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
const EDITOR_PAGES = ['BlockNoteEditor-', 'ObjectPage-', 'ObjectNew-', 'QuickCapture-'];
const STATIC_EDITOR_IMPORT = /(from\s*|import\s*)["']\.\/blocknote-/;
const failures = [];

const html = readFileSync(join(dist, 'index.html'), 'utf8');
if (/href="\/assets\/blocknote-[^"]+\.js"/.test(html)) failures.push('index.html preloads the editor chunk');

const jsFiles = readdirSync(assets).filter((f) => f.endsWith('.js'));
const sources = new Map(jsFiles.map((f) => [f, readFileSync(join(assets, f), 'utf8')]));
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const staticImporters = (file) => {
  const re = new RegExp(`(from\\s*|import\\s*)["']\\./${escape(file)}["']`);
  return jsFiles.filter((f) => f !== file && re.test(sources.get(f)));
};

// Editor-side chunks: the editor pages, plus shared chunks (e.g. the app's BlockNote wrappers,
// split out because several editor pages use them) that only editor-side chunks import statically.
const editorSide = new Set(jsFiles.filter((f) => f.startsWith('blocknote-') || EDITOR_PAGES.some((p) => f.startsWith(p))));
const loadsEditor = jsFiles.filter((f) => !editorSide.has(f) && STATIC_EDITOR_IMPORT.test(sources.get(f)));
for (let grew = true; grew;) {
  grew = false;
  for (const file of loadsEditor) {
    if (editorSide.has(file)) continue;
    const importers = staticImporters(file);
    if (importers.length && importers.every((f) => editorSide.has(f))) { editorSide.add(file); grew = true; }
  }
}
for (const file of loadsEditor) {
  if (!editorSide.has(file)) failures.push(`${file} statically imports the editor chunk`);
}
// Nothing else may reach the editor through an editor-side chunk either.
for (const file of editorSide) {
  if (file.startsWith('blocknote-')) continue;
  for (const importer of staticImporters(file)) {
    if (!editorSide.has(importer)) failures.push(`${importer} statically imports ${file}, which loads the editor`);
  }
}

const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
if (!/assets\/blocknote-[\w-]+\.js/.test(sw)) failures.push('service worker does not precache the editor chunk');
if (/inter-v\d+/.test(sw)) failures.push('service worker precaches unused Inter font files');

if (failures.length) {
  console.error('check-bundle failed:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
console.log('check-bundle: ok');
