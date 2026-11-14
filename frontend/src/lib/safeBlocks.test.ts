import { describe, it, expect } from 'vitest';
import { isSafeUrl, sanitizeBlocks } from './safeBlocks';

describe('isSafeUrl', () => {
  it('allows web, mail, blob and image data URLs and relative paths', () => {
    for (const url of ['https://x.example/a.png', 'http://x', 'mailto:a@b.c', 'blob:https://x/1', 'data:image/png;base64,AAA', '/files/a', '']) {
      expect(isSafeUrl(url)).toBe(true);
    }
  });

  it('fails closed for non-string values (an array or object would be stringified into href/src)', () => {
    expect(isSafeUrl(undefined)).toBe(true);
    expect(isSafeUrl(null)).toBe(true);
    for (const url of [['javascript:alert(1)'], { toString: () => 'javascript:alert(1)' }, 42]) {
      expect(isSafeUrl(url)).toBe(false);
    }
    const [out] = sanitizeBlocks([{ type: 'image', props: { url: ['javascript:alert(1)'] }, children: [] }]);
    expect(out.props.url).toBe('');
  });

  it('rejects script and other schemes, however they are spelled', () => {
    for (const url of ['javascript:alert(1)', ' JavaScript:alert(1)', 'java\nscript:alert(1)', 'vbscript:x', 'data:text/html,<script>', 'file:///etc/passwd']) {
      expect(isSafeUrl(url)).toBe(false);
    }
  });
});

describe('sanitizeBlocks', () => {
  it('blanks unsafe media URLs and unwraps unsafe links, at any depth, without touching safe ones', () => {
    const blocks = [
      { type: 'image', props: { url: 'javascript:alert(1)', name: 'x' }, content: undefined, children: [] },
      { type: 'file', props: { url: 'https://ok.example/f.pdf' }, children: [] },
      {
        type: 'paragraph', props: {},
        content: [
          { type: 'link', href: 'javascript:alert(1)', content: [{ type: 'text', text: 'bad', styles: {} }] },
          { type: 'link', href: 'https://ok.example', content: [{ type: 'text', text: 'good', styles: {} }] },
        ],
        children: [{ type: 'video', props: { url: 'vbscript:x' }, children: [] }],
      },
      {
        type: 'table', props: {},
        content: { type: 'tableContent', rows: [{ cells: [[{ type: 'link', href: 'javascript:x', content: [{ type: 'text', text: 'cell', styles: {} }] }]] }] },
        children: [],
      },
    ];
    const out = sanitizeBlocks(blocks) as typeof blocks;
    expect(out[0].props.url).toBe('');
    expect(out[1].props.url).toBe('https://ok.example/f.pdf');
    expect(out[2].content).toEqual([
      { type: 'text', text: 'bad', styles: {} },
      { type: 'link', href: 'https://ok.example', content: [{ type: 'text', text: 'good', styles: {} }] },
    ]);
    expect((out[2].children[0] as { props: { url: string } }).props.url).toBe('');
    expect(JSON.stringify(out[3])).not.toContain('javascript');
    expect(JSON.stringify(blocks)).toContain('javascript'); // the input is not mutated
  });

  it('passes through anything that is not a block list', () => {
    expect(sanitizeBlocks(null)).toBeNull();
  });
});
