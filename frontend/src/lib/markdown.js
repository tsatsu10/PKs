/**
 * Convert Markdown string to HTML for export (e.g. HTML export in ObjectDetail).
 * Uses marked with GFM; output is sanitized with DOMPurify to prevent XSS.
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true });

/**
 * @param {string} content - Markdown source
 * @returns {string} Sanitized HTML string (no surrounding wrapper)
 */
export function markdownToHtml(content) {
  if (content == null || content === '') return '';
  const raw = marked.parse(content);
  return typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(raw, { ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'code', 'pre', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'] }) : raw;
}
