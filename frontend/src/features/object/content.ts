/** Object content in both stored forms: BlockNote blocks (content_json) and Markdown (content). */
export type ContentFields = { content: string; content_json: unknown[] };

/** The parts of a BlockNote editor this module reads. */
type ContentSource = {
  document: unknown[];
  blocksToMarkdownLossy: (blocks?: never) => string | Promise<string>;
};

/** The editor's document as JSON, plus lossy Markdown for exports and old clients (empty → ''). */
export async function toContentFields(editor: ContentSource): Promise<ContentFields> {
  const blocks = editor.document;
  const md = await editor.blocksToMarkdownLossy(blocks as never);
  return { content: (md ?? '').trim() === '' ? '' : md, content_json: blocks };
}
