import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useCallback } from 'react';

type FakeEditor = {
  document: unknown[];
  tryParseMarkdownToBlocks: ReturnType<typeof vi.fn>;
  replaceBlocks: ReturnType<typeof vi.fn>;
  blocksToMarkdownLossy: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
};
const bn = vi.hoisted(() => ({
  options: [] as unknown[],
  editor: null as unknown as FakeEditor,
}));
vi.mock('@blocknote/react', () => ({
  useCreateBlockNote: (options: unknown) => { bn.options.push(options); return bn.editor; },
}));
vi.mock('@blocknote/mantine', () => ({
  BlockNoteView: ({ onChange }: { onChange?: () => void }) => <button type="button" onClick={() => onChange?.()}>bn-change</button>,
}));

import Editor from './Editor';
import { toContentFields } from './content';

const JSON_DOC = [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi', styles: {} }], children: [] }];

beforeEach(() => {
  bn.options = [];
  bn.editor = {
    document: JSON_DOC,
    tryParseMarkdownToBlocks: vi.fn(async () => JSON_DOC),
    replaceBlocks: vi.fn(),
    blocksToMarkdownLossy: vi.fn(async () => 'Hi\n'),
    focus: vi.fn(),
  };
});

describe('Editor', () => {
  it('seeds from JSON when present', async () => {
    render(<Editor initialJson={JSON_DOC} initialMarkdown="ignored" onChange={vi.fn()} />);
    await act(async () => {});
    expect(bn.options[0]).toMatchObject({ initialContent: JSON_DOC });
    expect(bn.editor.tryParseMarkdownToBlocks).not.toHaveBeenCalled();
  });

  it('falls back to Markdown', async () => {
    render(<Editor initialJson={null} initialMarkdown="# Old" onChange={vi.fn()} />);
    await act(async () => {});
    expect(bn.editor.tryParseMarkdownToBlocks).toHaveBeenCalledWith('# Old');
    expect((bn.options[0] as { initialContent?: unknown }).initialContent).toBeUndefined();
  });

  it('reports both columns on change without re-rendering its parent (P3)', async () => {
    const rendered = vi.fn();
    const seen: unknown[] = [];
    function Parent() {
      rendered();
      const onChange = useCallback((f: unknown) => { seen.push(f); }, []);
      return <Editor initialJson={JSON_DOC} initialMarkdown="" onChange={onChange} />;
    }
    render(<Parent />);
    await act(async () => {});
    await act(async () => { fireEvent.click(screen.getByText('bn-change')); });
    expect(seen).toEqual([{ content: 'Hi\n', content_json: JSON_DOC }]);
    expect(rendered).toHaveBeenCalledTimes(1);
  });
});

describe('content', () => {
  it('toContentFields returns both columns', async () => {
    await expect(toContentFields(bn.editor as never)).resolves.toEqual({ content: 'Hi\n', content_json: JSON_DOC });
  });

  it('an empty document gives empty Markdown', async () => {
    bn.editor.blocksToMarkdownLossy = vi.fn(async () => '\n');
    await expect(toContentFields(bn.editor as never)).resolves.toMatchObject({ content: '' });
  });
});
