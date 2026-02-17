/**
 * Shared export logic: template presets and content builders.
 * Single source of truth for export templates (raw, brief, full, stakeholder)
 * and for building object content as markdown/text. Used by ObjectDetail (single export)
 * and Dashboard (bundle export).
 */

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
  lines.push(`${obj.type} · Updated ${new Date(obj.updated_at).toLocaleString()}`);
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
