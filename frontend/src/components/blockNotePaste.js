/**
 * When pasting plain text into a list block, convert each line into a list item
 * so numbering/bullets continue instead of becoming paragraphs.
 */
export function createPasteHandler() {
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
