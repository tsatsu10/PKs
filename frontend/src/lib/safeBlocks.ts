/**
 * BlockNote documents come from the database, and shared editors can write content_json
 * directly through the API. BlockNote filters inline link hrefs but not the `url` of image,
 * file, audio and video blocks, so every stored document passes through here before it is
 * rendered or loaded into an editor.
 */

const SAFE_SCHEME = /^(https?:|mailto:|blob:|data:image\/)/i;

/**
 * Web, mail, blob and inline-image URLs, relative paths and empty values. Anything else is
 * unsafe, including non-strings: the DOM stringifies an array or object assigned to href/src.
 */
export function isSafeUrl(url: unknown): boolean {
  if (url === undefined || url === null) return true;
  if (typeof url !== 'string') return false;
  // Browsers ignore whitespace and control characters inside a scheme ("java\nscript:").
  // eslint-disable-next-line no-control-regex
  const compact = url.replace(/[\u0000- ]/g, '');
  if (compact === '') return true;
  const scheme = /^[a-z][a-z0-9+.-]*:/i.exec(compact);
  return !scheme || SAFE_SCHEME.test(compact);
}

type Node = Record<string, unknown>;
const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null && !Array.isArray(v);

function sanitizeInline(content: unknown): unknown {
  if (Array.isArray(content)) {
    return content.flatMap((item) => {
      if (isNode(item) && item.type === 'link' && !isSafeUrl(item.href)) {
        // Keep the text, drop the link.
        return (sanitizeInline(item.content) as unknown[] | undefined) ?? [];
      }
      return [isNode(item) && 'content' in item ? { ...item, content: sanitizeInline(item.content) } : item];
    });
  }
  if (isNode(content) && Array.isArray(content.rows)) {
    // Table content: rows of cells; a cell is inline content or { content: inline }.
    return {
      ...content,
      rows: content.rows.map((row) => (isNode(row) && Array.isArray(row.cells)
        ? { ...row, cells: row.cells.map((cell) => (isNode(cell) ? { ...cell, content: sanitizeInline(cell.content) } : sanitizeInline(cell))) }
        : row)),
    };
  }
  return content;
}

function sanitizeBlock(block: unknown): unknown {
  if (!isNode(block)) return block;
  const out: Node = { ...block };
  if (isNode(block.props) && !isSafeUrl(block.props.url)) out.props = { ...block.props, url: '' };
  if ('content' in block) out.content = sanitizeInline(block.content);
  if (Array.isArray(block.children)) out.children = block.children.map(sanitizeBlock);
  return out;
}

/** A copy of the blocks with unsafe media URLs blanked and unsafe links unwrapped. */
export function sanitizeBlocks<T>(blocks: T): T {
  return (Array.isArray(blocks) ? blocks.map(sanitizeBlock) : blocks) as T;
}
