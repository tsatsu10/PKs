import { useRef, useEffect, useCallback, useMemo, memo, useState } from 'react';
import '@blocknote/core/fonts/inter.css';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import './BlockNoteEditor.css';

/**
 * When pasting plain text into a list block, convert each line into a list item
 * so numbering/bullets continue instead of becoming paragraphs.
 */
function createPasteHandler() {
  return ({ event, editor, defaultPasteHandler }) => {
    const plain = event.clipboardData?.getData?.('text/plain');
    if (plain == null || plain === '') return defaultPasteHandler();

    try {
      const pos = editor.getTextCursorPosition();
      const blockType = pos?.block?.type;
      const isNumberedList = blockType === 'numberedListItem';
      const isBulletList = blockType === 'bulletListItem';
      if (!isNumberedList && !isBulletList) return defaultPasteHandler();

      const lines = plain.split(/\r?\n/).map((s) => s.trimEnd()).filter((s) => s.length > 0);
      if (lines.length <= 1) return defaultPasteHandler();

      const looksNumbered = /^\d+\.\s/.test(lines[0]);
      const looksBullet = /^[-*]\s/.test(lines[0]);
      if (isNumberedList && looksNumbered) {
        editor.pasteMarkdown(plain);
        return true;
      }
      if (isBulletList && looksBullet) {
        editor.pasteMarkdown(plain);
        return true;
      }

      const markdown = isNumberedList
        ? lines.map((line, i) => `${i + 1}. ${line}`).join('\n')
        : lines.map((line) => `- ${line}`).join('\n');
      editor.pasteMarkdown(markdown);
      return true;
    } catch {
      return defaultPasteHandler();
    }
  };
}

/**
 * Block-based editor (Notion-style) with slash commands.
 * Accepts value (markdown) for initial load and onChange(markdown) on content change.
 * Loads from value only on mount; does not overwrite while user types.
 */
function BlockNoteEditor({
  value,
  initialValue,
  onChange,
  minHeight = 200,
  id,
  'aria-label': ariaLabel,
}) {
  const contentForLoad = initialValue !== undefined ? initialValue : (value ?? '');
  const initialValueRef = useRef(contentForLoad);
  const isInitializingRef = useRef(true);
  const editorOptions = useMemo(() => ({ pasteHandler: createPasteHandler() }), []);

  const editor = useCreateBlockNote(editorOptions);
  const onChangeRef = useRef(onChange);
  const [initialContentReady, setInitialContentReady] = useState(false);

  useEffect(() => {
    initialValueRef.current = contentForLoad;
  }, [contentForLoad]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const md = (initialValueRef.current ?? '').trim();
      try {
        const blocks = md
          ? await editor.tryParseMarkdownToBlocks(md)
          : [{ type: 'paragraph', content: [] }];
        if (mounted) {
          editor.replaceBlocks(editor.document, blocks);
        }
      } catch {
        if (mounted) {
          editor.replaceBlocks(editor.document, [{ type: 'paragraph', content: [] }]);
        }
      }
      if (mounted) {
        isInitializingRef.current = false;
        setInitialContentReady(true);
      }
    }
    load();
    return () => { mounted = false; };
  }, [editor]);

  const handleChange = useCallback(async () => {
    if (isInitializingRef.current) return;
    try {
      const md = await editor.blocksToMarkdownLossy(editor.document);
      const trimmed = (md ?? '').trim();
      onChangeRef.current?.(trimmed === '' ? '' : md);
    } catch {
      onChangeRef.current?.('');
    }
  }, [editor]);

  return (
    <div
      className="blocknote-editor-wrapper"
      data-mantine-color-scheme="dark"
      data-color-scheme="dark"
      style={{ minHeight: `${minHeight}px` }}
      aria-label={ariaLabel}
    >
      {initialContentReady ? (
        <BlockNoteView
          id={id}
          editor={editor}
          onChange={handleChange}
          theme="dark"
          formattingToolbar={true}
          slashMenu={true}
        />
      ) : (
        <div style={{ minHeight: `${minHeight}px` }} className="blocknote-editor-placeholder" aria-hidden="true" />
      )}
    </div>
  );
}

export default memo(BlockNoteEditor);
