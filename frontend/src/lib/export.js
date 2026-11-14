/**
 * Shared export logic: template presets and content builders.
 * Single source of truth for export templates (raw, brief, full, stakeholder)
 * and for building object content as markdown/text. Used by ObjectDetail (single export)
 * and Dashboard (bundle export).
 */

import { formatObjectTypeLabel } from '../constants';

/** Preset keys for export template dropdowns (must match DB export_template enum) */
export const EXPORT_TEMPLATE_IDS = ['raw', 'brief', 'full', 'stakeholder'];

/** Default include flags per template. includeLinks is for single-object export only (bundle has no links). */
const PRESETS = {
  raw: { content: true, summary: false, key_points: false, tags: false, domains: false, links: false },
  brief: { content: false, summary: true, key_points: true, tags: false, domains: false, links: false },
  full: { content: true, summary: true, key_points: true, tags: true, domains: true, links: true },
  stakeholder: { content: false, summary: true, key_points: true, tags: false, domains: false, links: true },
};

/**
 * Get include flags for an export template.
 * @param {string} template - 'raw' | 'brief' | 'full' | 'stakeholder'
 * @param {{ includeLinks?: boolean }} [opts] - includeLinks true for single-object export (default), false for bundle
 * @returns {{ content: boolean, summary: boolean, key_points: boolean, tags: boolean, domains: boolean, links: boolean }}
 */
export function getExportIncludeFromTemplate(template, opts = {}) {
  const { includeLinks = true } = opts;
  const base = PRESETS[template] || PRESETS.full;
  return {
    ...base,
    links: includeLinks ? base.links : false,
  };
}

/** Format labels for export format dropdowns (must match DB export_format enum) */
export const EXPORT_FORMAT_LABELS = {
  txt: 'TXT',
  md: 'Markdown',
  html: 'HTML',
  json: 'JSON',
  docx: 'DOCX',
  pdf: 'PDF',
};

/**
 * Build object content as markdown (or plain text if stripMarkdown).
 * obj must have: title, type, updated_at, source?, summary?, key_points?, content?, domains?, tags?
 * and optionally outgoingLinks?, incomingLinks? (each item: target?.title or to_object_id, source?.title or from_object_id).
 * @param {object} obj - normalized knowledge object with .domains and .tags as arrays of { name }
 * @param {{ content?: boolean, summary?: boolean, key_points?: boolean, tags?: boolean, domains?: boolean, links?: boolean }} include
 * @param {{ asPlainText?: boolean }} [opts] - if true, strip ## and ** for plain text
 */
export function buildObjectMarkdown(obj, include, opts = {}) {
  const { asPlainText = false } = opts;
  const lines = [];
  const nl = () => lines.push('');
  const md = (s) => (asPlainText ? s.replace(/#{1,2}\s/g, '').replace(/\*\*/g, '') : s);
  lines.push(asPlainText ? obj.title : `# ${obj.title}`);
  lines.push(`${formatObjectTypeLabel(obj.type)} · Updated ${new Date(obj.updated_at).toLocaleString()}`);
  if (obj.source) lines.push(asPlainText ? `Source: ${obj.source}` : `*Source:* ${obj.source}`);
  nl();
  if (include.summary && obj.summary) {
    lines.push(md('## Summary'));
    lines.push(obj.summary);
    nl();
  }
  if (include.key_points && obj.key_points?.length) {
    lines.push(md('## Key points'));
    obj.key_points.forEach((p) => lines.push(`- ${typeof p === 'string' ? p : JSON.stringify(p)}`));
    nl();
  }
  if (include.domains && obj.domains?.length) {
    lines.push(asPlainText ? 'Domains: ' : '**Domains:** ');
    lines.push(obj.domains.map((d) => d.name).join(', '));
    nl();
  }
  if (include.tags && obj.tags?.length) {
    lines.push(asPlainText ? 'Tags: ' : '**Tags:** ');
    lines.push(obj.tags.map((t) => t.name).join(', '));
    nl();
  }
  if (include.content && obj.content) {
    lines.push(md('## Content'));
    lines.push(obj.content);
    nl();
  }
  if (include.links && (obj.outgoingLinks?.length || obj.incomingLinks?.length)) {
    lines.push(md('## Links'));
    (obj.outgoingLinks || []).forEach((l) => lines.push(`- Out: ${l.target?.title ?? l.to_object_id}`));
    (obj.incomingLinks || []).forEach((l) => lines.push(`- In: ${l.source?.title ?? l.from_object_id}`));
  }
  return lines.join('\n');
}

/**
 * Filesystem-safe base name derived from a title. Keeps Unicode letters
 * (e.g. CJK titles) instead of stripping everything non-ASCII, strips
 * characters illegal in file names, and falls back to 'untitled' when
 * nothing usable remains.
 * @param {string} title
 * @param {number} [maxLength=80] Maximum length in code points, applied before
 *   leading/trailing '-' and '.' are trimmed (so a cut never leaves one behind).
 * @returns {string}
 */
export function safeFileBase(title, maxLength = 80) {
  const chars = Array.from(
    String(title ?? '')
      .normalize('NFKC')
      // eslint-disable-next-line no-control-regex -- strip control chars, illegal in file names
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
      .trim()
      .replace(/\s+/g, '-')
  ).slice(0, maxLength); // Array.from splits by code point, so emoji/CJK are never cut in half
  return chars.join('').replace(/^[-.]+|[-.]+$/g, '') || 'untitled';
}

/**
 * Unique, filesystem-safe name for an entry in an export ZIP. Keeps Unicode
 * letters (e.g. CJK titles) and disambiguates duplicates with the id prefix.
 * @param {string} title
 * @param {string} id
 * @param {string} ext - extension without dot
 * @param {Set<string>} used - lower-cased names already in the archive (mutated);
 *   compared case-insensitively because Windows/macOS unzip is case-insensitive
 * @returns {string}
 */
export function zipEntryName(title, id, ext, used) {
  const base = safeFileBase(title);
  const shortId = String(id).slice(0, 8);
  const taken = (candidate) => used.has(candidate.toLowerCase());
  let name = `${base}.${ext}`;
  if (taken(name)) name = `${base}-${shortId}.${ext}`;
  for (let n = 2; taken(name); n += 1) name = `${base}-${shortId}-${n}.${ext}`;
  used.add(name.toLowerCase());
  return name;
}

// ---- Single-object export (the object page). ctx = { object, domains, tags, outgoing, incoming }. ----

/**
 * One object as plain text or Markdown.
 * @param {{ object: any, domains: Array<{ name: string }>, tags: Array<{ name: string }>, outgoing: any[], incoming: any[] }} ctx
 * @param {boolean} asMarkdown
 * @param {{ content?: boolean, summary?: boolean, key_points?: boolean, tags?: boolean, domains?: boolean, links?: boolean }} include
 * @returns {string}
 */
export function buildObjectExportText(ctx, asMarkdown, include) {
  const { object, domains: objectDomains, tags: objectTags, outgoing: outgoingLinks, incoming: incomingLinks } = ctx;
  const lines = [];
  const nl = () => lines.push('');
  lines.push(object.title);
  lines.push(`${formatObjectTypeLabel(object.type)} · Updated ${new Date(object.updated_at).toLocaleString()}`);
  nl();
  if (object.source && (include.content || include.summary)) lines.push(asMarkdown ? `*Source:* ${object.source}` : `Source: ${object.source}`), nl();
  if (include.summary && object.summary) {
    lines.push(asMarkdown ? '## Summary' : '--- Summary ---');
    lines.push(object.summary);
    nl();
  }
  if (include.key_points && object.key_points && Array.isArray(object.key_points) && object.key_points.length) {
    lines.push(asMarkdown ? '## Key points' : '--- Key points ---');
    object.key_points.forEach((p) => lines.push(asMarkdown ? `- ${typeof p === 'string' ? p : JSON.stringify(p)}` : `• ${typeof p === 'string' ? p : JSON.stringify(p)}`));
    nl();
  }
  if (include.domains && objectDomains.length) {
    lines.push(asMarkdown ? '**Domains:** ' : 'Domains: ');
    lines.push(objectDomains.map((d) => d.name).join(', '));
    nl();
  }
  if (include.tags && objectTags.length) {
    lines.push(asMarkdown ? '**Tags:** ' : 'Tags: ');
    lines.push(objectTags.map((t) => t.name).join(', '));
    nl();
  }
  if (include.content && object.content) {
    lines.push(asMarkdown ? '## Content' : '--- Content ---');
    lines.push(object.content);
    nl();
  }
  if (include.links && (outgoingLinks.length || incomingLinks.length)) {
    lines.push(asMarkdown ? '## Links' : '--- Links ---');
    outgoingLinks.forEach((l) => lines.push(asMarkdown ? `- Out: ${l.target?.title ?? l.to_object_id}` : `Out: ${l.target?.title ?? l.to_object_id}`));
    incomingLinks.forEach((l) => lines.push(asMarkdown ? `- In: ${l.source?.title ?? l.from_object_id}` : `In: ${l.source?.title ?? l.from_object_id}`));
  }
  return lines.join('\n');
}

/**
 * One object as a standalone HTML document (also used for print-to-PDF).
 * @param {{ object: any, domains: Array<{ name: string }>, tags: Array<{ name: string }>, outgoing: any[], incoming: any[] }} ctx
 * @param {{ content?: boolean, summary?: boolean, key_points?: boolean, tags?: boolean, domains?: boolean, links?: boolean }} include
 * @param {(markdown: string) => string} markdownToHtml - pass lib/markdown's markdownToHtml. It is a
 *   parameter so this module does not pull marked and DOMPurify into every page that imports it.
 * @returns {string}
 */
export function buildObjectExportHtml(ctx, include, markdownToHtml) {
  const { object, domains: objectDomains, tags: objectTags, outgoing: outgoingLinks, incoming: incomingLinks } = ctx;
  const parts = [];
  parts.push(`<h1>${escapeHtml(object.title)}</h1>`);
  parts.push(`<p><em>${escapeHtml(formatObjectTypeLabel(object.type))} · Updated ${new Date(object.updated_at).toLocaleString()}</em></p>`);
  if (object.source) parts.push(`<p>Source: ${escapeHtml(object.source)}</p>`);
  if (include.summary && object.summary) parts.push('<h2>Summary</h2>', `<p>${escapeHtml(object.summary)}</p>`);
  if (include.key_points && object.key_points?.length) {
    parts.push('<h2>Key points</h2><ul>');
    object.key_points.forEach((p) => parts.push(`<li>${escapeHtml(typeof p === 'string' ? p : JSON.stringify(p))}</li>`));
    parts.push('</ul>');
  }
  if (include.domains && objectDomains.length) parts.push('<p><strong>Domains:</strong> ' + objectDomains.map((d) => escapeHtml(d.name)).join(', ') + '</p>');
  if (include.tags && objectTags.length) parts.push('<p><strong>Tags:</strong> ' + objectTags.map((t) => escapeHtml(t.name)).join(', ') + '</p>');
  if (include.content && object.content) {
    const MAX_CONTENT_FOR_HTML_EXPORT = 500000;
    const content = object.content.length > MAX_CONTENT_FOR_HTML_EXPORT
      ? object.content.slice(0, MAX_CONTENT_FOR_HTML_EXPORT) + '\n\n_[Content truncated for export — document is very long.]_'
      : object.content;
    parts.push('<h2>Content</h2>', markdownToHtml(content));
  }
  if (include.links && (outgoingLinks.length || incomingLinks.length)) {
    parts.push('<h2>Links</h2><ul>');
    outgoingLinks.forEach((l) => parts.push(`<li>Out: ${escapeHtml(l.target?.title ?? l.to_object_id)}</li>`));
    incomingLinks.forEach((l) => parts.push(`<li>In: ${escapeHtml(l.source?.title ?? l.from_object_id)}</li>`));
    parts.push('</ul>');
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(object.title)}</title></head><body>${parts.join('')}</body></html>`;
}

/**
 * One object as pretty-printed JSON. Sections that are empty or excluded are left out.
 * @param {{ object: any, domains: Array<{ name: string }>, tags: Array<{ name: string }>, outgoing: any[], incoming: any[] }} ctx
 * @param {{ content?: boolean, summary?: boolean, key_points?: boolean, tags?: boolean, domains?: boolean, links?: boolean }} include
 * @returns {string}
 */
export function buildObjectExportJson(ctx, include) {
  const { object, domains: objectDomains, tags: objectTags, outgoing: outgoingLinks, incoming: incomingLinks } = ctx;
  const out = {
    title: object.title,
    type: object.type,
    updated_at: object.updated_at,
    source: object.source || null,
  };
  if (include.summary && object.summary) out.summary = object.summary;
  if (include.key_points && object.key_points?.length) out.key_points = object.key_points;
  if (include.domains && objectDomains.length) out.domains = objectDomains.map((d) => d.name);
  if (include.tags && objectTags.length) out.tags = objectTags.map((t) => t.name);
  if (include.content && object.content) out.content = object.content;
  if (include.links && (outgoingLinks.length || incomingLinks.length)) {
    out.links = {
      outgoing: outgoingLinks.map((l) => ({ title: l.target?.title ?? l.to_object_id, type: l.relationship_type })),
      incoming: incomingLinks.map((l) => ({ title: l.source?.title ?? l.from_object_id, type: l.relationship_type })),
    };
  }
  return JSON.stringify(out, null, 2);
}

/**
 * One object as a Word document. Loads `docx` on demand.
 * @param {{ object: any, domains: Array<{ name: string }>, tags: Array<{ name: string }>, outgoing: any[], incoming: any[] }} ctx
 * @param {{ content?: boolean, summary?: boolean, key_points?: boolean, tags?: boolean, domains?: boolean, links?: boolean }} include
 * @returns {Promise<Blob>}
 */
export async function buildObjectExportDocxBlob(ctx, include) {
  const { object, domains: objectDomains, tags: objectTags, outgoing: outgoingLinks, incoming: incomingLinks } = ctx;
  const { Document, Packer, Paragraph, HeadingLevel } = await import('docx');
  const children = [];
  children.push(new Paragraph({ text: object.title, heading: HeadingLevel.TITLE }));
  children.push(new Paragraph({ text: `${formatObjectTypeLabel(object.type)} · Updated ${new Date(object.updated_at).toLocaleString()}` }));
  if (object.source) children.push(new Paragraph({ text: `Source: ${object.source}` }));
  if (include.summary && object.summary) {
    children.push(new Paragraph({ text: 'Summary', heading: HeadingLevel.HEADING_1 }));
    children.push(new Paragraph(object.summary));
  }
  if (include.key_points && object.key_points?.length) {
    children.push(new Paragraph({ text: 'Key points', heading: HeadingLevel.HEADING_1 }));
    object.key_points.forEach((p) => children.push(new Paragraph({ text: typeof p === 'string' ? p : JSON.stringify(p), bullet: { level: 0 } })));
  }
  if (include.domains && objectDomains.length) {
    children.push(new Paragraph({ text: `Domains: ${objectDomains.map((d) => d.name).join(', ')}` }));
  }
  if (include.tags && objectTags.length) {
    children.push(new Paragraph({ text: `Tags: ${objectTags.map((t) => t.name).join(', ')}` }));
  }
  if (include.content && object.content) {
    children.push(new Paragraph({ text: 'Content', heading: HeadingLevel.HEADING_1 }));
    const contentLines = object.content.split(/\n/);
    const DOCX_LINE_CHUNK = 100;
    for (let i = 0; i < contentLines.length; i += DOCX_LINE_CHUNK) {
      const chunk = contentLines.slice(i, i + DOCX_LINE_CHUNK);
      for (const line of chunk) {
        const t = line.trimEnd();
        if (/^###\s+/.test(t)) children.push(new Paragraph({ text: t.replace(/^###\s+/, ''), heading: HeadingLevel.HEADING_3 }));
        else if (/^##\s+/.test(t)) children.push(new Paragraph({ text: t.replace(/^##\s+/, ''), heading: HeadingLevel.HEADING_2 }));
        else if (/^#\s+/.test(t)) children.push(new Paragraph({ text: t.replace(/^#\s+/, ''), heading: HeadingLevel.HEADING_1 }));
        else if (/^[-*]\s+/.test(t)) children.push(new Paragraph({ text: t.replace(/^[-*]\s+/, ''), bullet: { level: 0 } }));
        else children.push(new Paragraph(t || ' '));
      }
      if (i + DOCX_LINE_CHUNK < contentLines.length) await new Promise((r) => setTimeout(r, 0));
    }
  }
  if (include.links && (outgoingLinks.length || incomingLinks.length)) {
    children.push(new Paragraph({ text: 'Links', heading: HeadingLevel.HEADING_1 }));
    outgoingLinks.forEach((l) => children.push(new Paragraph({ text: `Out: ${l.target?.title ?? l.to_object_id} (${l.relationship_type})`, bullet: { level: 0 } })));
    incomingLinks.forEach((l) => children.push(new Paragraph({ text: `In: ${l.source?.title ?? l.from_object_id} (${l.relationship_type})`, bullet: { level: 0 } })));
  }
  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBlob(doc);
}

/**
 * Escape text for HTML through the DOM.
 * @param {string} s
 * @returns {string}
 */
export function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
