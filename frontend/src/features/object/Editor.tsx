import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import BlockNoteMantineProvider from '../../components/BlockNoteMantineProvider';
import { createPasteHandler } from '../../components/blockNotePaste';
import { useTheme } from '../../context/ThemeContext';
import '../../components/BlockNoteEditor.css';
import { toContentFields, type ContentFields } from './content';
import { sanitizeBlocks } from '../../lib/safeBlocks';

type Props = {
  /** BlockNote blocks (content_json). Preferred when present. */
  initialJson: unknown[] | null;
  /** Markdown (content), parsed once when there is no JSON. */
  initialMarkdown: string;
  onChange: (fields: ContentFields) => void;
  autoFocus?: boolean;
};

const MIN_HEIGHT = 280;

/** What the page can do with the editor: put the cursor at the end (a click below the content). */
export type EditorHandle = { focusEnd: () => void };

/**
 * The content editor. It seeds once (remount it with a new key to reload) and reports both
 * content columns through `onChange`; it never sets state per keystroke, so typing doesn't
 * re-render the page (P3).
 */
const Editor = forwardRef<EditorHandle, Props>(function Editor({ initialJson, initialMarkdown, onChange, autoFocus = false }, ref) {
  const hasJson = Array.isArray(initialJson) && initialJson.length > 0;
  // Seeded once per mount: later prop changes never replace what the user is typing.
  const [options] = useState(() => ({
    pasteHandler: createPasteHandler(),
    initialContent: hasJson ? (sanitizeBlocks(initialJson) as never) : undefined,
  }));
  const editor = useCreateBlockNote(options);
  const markdownRef = useRef(initialMarkdown);
  const initializing = useRef(!hasJson);
  const [ready, setReady] = useState(hasJson);
  const onChangeRef = useRef(onChange);
  const { resolvedTheme } = useTheme() as { resolvedTheme: 'light' | 'dark' };

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!initializing.current) return;
    let mounted = true;
    const md = (markdownRef.current ?? '').trim();
    (async () => {
      try {
        const blocks = md ? await editor.tryParseMarkdownToBlocks(md) : [{ type: 'paragraph', content: [] }];
        if (mounted) editor.replaceBlocks(editor.document, sanitizeBlocks(blocks) as never);
      } catch {
        // Keep the raw text visible rather than an empty editor, so an edit can't wipe it.
        if (mounted) editor.replaceBlocks(editor.document, [{ type: 'paragraph', content: md }] as never);
      }
      if (mounted) {
        initializing.current = false;
        setReady(true);
      }
    })();
    return () => { mounted = false; };
  }, [editor]);

  useEffect(() => {
    if (ready && autoFocus) editor.focus();
  }, [ready, autoFocus, editor]);

  useImperativeHandle(ref, () => ({
    focusEnd() {
      const blocks = editor.document;
      const last = blocks[blocks.length - 1];
      if (last) editor.setTextCursorPosition(last, 'end');
      editor.focus();
    },
  }), [editor]);

  const handleChange = useCallback(async () => {
    if (initializing.current) return;
    try {
      onChangeRef.current(await toContentFields(editor as never));
    } catch {
      // Conversion failed: keep the last good value instead of reporting empty content.
    }
  }, [editor]);

  return (
    <BlockNoteMantineProvider>
      <div
        className="blocknote-editor-wrapper"
        data-mantine-color-scheme={resolvedTheme}
        data-color-scheme={resolvedTheme}
        style={{ minHeight: `${MIN_HEIGHT}px` }}
        aria-label="Content"
      >
        {ready ? (
          <BlockNoteView editor={editor} onChange={handleChange} theme={resolvedTheme} formattingToolbar slashMenu />
        ) : (
          <div style={{ minHeight: `${MIN_HEIGHT}px` }} className="blocknote-editor-placeholder" aria-hidden="true" />
        )}
      </div>
    </BlockNoteMantineProvider>
  );
});

export default memo(Editor);
