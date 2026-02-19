/**
 * Convert Markdown string to HTML for export (e.g. HTML export in ObjectDetail).
 * Uses marked with GFM.
 */
import { marked } from 'marked';

marked.setOptions({ gfm: true });

/**
 * @param {string} content - Markdown source
 * @returns {string} HTML string (no surrounding wrapper)
 */
export function markdownToHtml(content) {
  if (content == null || content === '') return '';
  return marked.parse(content);
}
