import { useState } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import BlockNoteMantineProvider from '../../components/BlockNoteMantineProvider';
import BlockNoteViewer from '../../components/BlockNoteViewer';
import { useTheme } from '../../context/ThemeContext';
import '../../components/BlockNoteEditor.css';
import { sanitizeBlocks } from '../../lib/safeBlocks';

type Props = { json: unknown[] | null; markdown: string | null };

/** Read-only content: from BlockNote JSON on the first render when present (P7), else from Markdown. */
export default function ContentView({ json, markdown }: Props) {
  if (Array.isArray(json) && json.length > 0) return <JsonView json={json} />;
  if (!markdown || markdown.trim() === '') return null;
  return <BlockNoteViewer content={markdown} className="detail-content" />;
}

function JsonView({ json }: { json: unknown[] }) {
  // Seeded once per mount; the parent keys this view on the object.
  const [options] = useState(() => ({ initialContent: sanitizeBlocks(json) as never }));
  const editor = useCreateBlockNote(options);
  const { resolvedTheme } = useTheme() as { resolvedTheme: 'light' | 'dark' };
  return (
    <BlockNoteMantineProvider>
      <div
        className="blocknote-viewer-wrapper detail-content"
        data-mantine-color-scheme={resolvedTheme}
        data-color-scheme={resolvedTheme}
        aria-label="Content"
      >
        <BlockNoteView editor={editor} editable={false} theme={resolvedTheme} formattingToolbar={false} slashMenu={false} />
      </div>
    </BlockNoteMantineProvider>
  );
}
