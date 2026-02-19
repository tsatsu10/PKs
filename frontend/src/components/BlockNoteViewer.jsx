import { useEffect } from 'react';
import '@blocknote/core/fonts/inter.css';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import './BlockNoteEditor.css';

/**
 * Read-only BlockNote view for rendering markdown as blocks.
 * Matches the editor's block rendering (todos, callouts, etc.).
 */
export default function BlockNoteViewer({ content, className = '' }) {
  const editor = useCreateBlockNote();

  useEffect(() => {
    let mounted = true;
    const md = (content ?? '').trim();
    if (!md) return;
    async function load() {
      try {
        const blocks = await editor.tryParseMarkdownToBlocks(md);
        if (mounted) {
          editor.replaceBlocks(editor.document, blocks);
        }
      } catch {
        if (mounted) {
          editor.replaceBlocks(editor.document, [{ type: 'paragraph', content: md }]);
        }
      }
    }
    load();
    return () => { mounted = false; };
  }, [editor, content]);

  if (!content || content.trim() === '') return null;

  return (
    <div
      className={`blocknote-viewer-wrapper ${className}`.trim()}
      data-mantine-color-scheme="dark"
      data-color-scheme="dark"
      aria-label="Content"
    >
      <BlockNoteView
        editor={editor}
        editable={false}
        theme="dark"
        formattingToolbar={false}
        slashMenu={false}
      />
    </div>
  );
}
