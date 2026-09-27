import { describe, it, expect } from 'vitest';
import {
  getExportIncludeFromTemplate,
  buildObjectMarkdown,
  EXPORT_TEMPLATE_IDS,
  EXPORT_FORMAT_LABELS,
  zipEntryName,
  safeFileBase,
} from './export.js';

describe('getExportIncludeFromTemplate', () => {
  it('returns full preset for "full" template', () => {
    const inc = getExportIncludeFromTemplate('full');
    expect(inc).toEqual({
      content: true,
      summary: true,
      key_points: true,
      tags: true,
      domains: true,
      links: true,
    });
  });

  it('returns raw preset (content only) for "raw"', () => {
    const inc = getExportIncludeFromTemplate('raw');
    expect(inc.content).toBe(true);
    expect(inc.summary).toBe(false);
    expect(inc.tags).toBe(false);
  });

  it('defaults to full for unknown template', () => {
    const inc = getExportIncludeFromTemplate('unknown');
    expect(inc.content).toBe(true);
    expect(inc.links).toBe(true);
  });

  it('opts.includeLinks false forces links false', () => {
    const inc = getExportIncludeFromTemplate('full', { includeLinks: false });
    expect(inc.links).toBe(false);
  });
});

describe('buildObjectMarkdown', () => {
  const minimalObj = {
    title: 'Test Object',
    type: 'note',
    updated_at: '2025-01-15T12:00:00Z',
  };

  it('includes title and type/date', () => {
    const md = buildObjectMarkdown(minimalObj, { content: false, summary: false, key_points: false, tags: false, domains: false, links: false });
    expect(md).toContain('# Test Object');
    expect(md).toContain('note');
    expect(md).toContain('Updated');
  });

  it('includes summary when include.summary is true', () => {
    const obj = { ...minimalObj, summary: 'A short summary.' };
    const md = buildObjectMarkdown(obj, { content: false, summary: true, key_points: false, tags: false, domains: false, links: false });
    expect(md).toContain('## Summary');
    expect(md).toContain('A short summary.');
  });

  it('includes key_points when include.key_points is true', () => {
    const obj = { ...minimalObj, key_points: ['Point one', 'Point two'] };
    const md = buildObjectMarkdown(obj, { content: false, summary: false, key_points: true, tags: false, domains: false, links: false });
    expect(md).toContain('## Key points');
    expect(md).toContain('Point one');
    expect(md).toContain('Point two');
  });

  it('asPlainText strips markdown headers/bold', () => {
    const md = buildObjectMarkdown(minimalObj, { content: false, summary: false, key_points: false, tags: false, domains: false, links: false }, { asPlainText: true });
    expect(md).not.toContain('# ');
    expect(md).toContain('Test Object');
  });
});

describe('export constants', () => {
  it('EXPORT_TEMPLATE_IDS includes expected keys', () => {
    expect(EXPORT_TEMPLATE_IDS).toContain('raw');
    expect(EXPORT_TEMPLATE_IDS).toContain('full');
    expect(EXPORT_TEMPLATE_IDS).toContain('brief');
    expect(EXPORT_TEMPLATE_IDS).toContain('stakeholder');
  });

  it('EXPORT_FORMAT_LABELS has md and txt', () => {
    expect(EXPORT_FORMAT_LABELS.md).toBe('Markdown');
    expect(EXPORT_FORMAT_LABELS.txt).toBe('TXT');
  });
});

describe('zipEntryName', () => {
  it('keeps same-titled objects as separate files', () => {
    const used = new Set();
    const a = zipEntryName('Meeting', 'aaaaaaaa-1', 'md', used);
    const b = zipEntryName('Meeting', 'bbbbbbbb-2', 'md', used);
    expect(a).toBe('Meeting.md');
    expect(b).toBe('Meeting-bbbbbbbb.md');
  });

  it('treats names that differ only in case as duplicates (Windows/macOS unzip)', () => {
    const used = new Set();
    zipEntryName('Meeting', 'aaaaaaaa', 'md', used);
    expect(zipEntryName('meeting', 'cccccccc', 'md', used)).toBe('meeting-cccccccc.md');
  });

  it('never ends a long name with a dash', () => {
    const name = zipEntryName(`${'a'.repeat(79)} b`, 'dddddddd', 'md', new Set());
    expect(name.endsWith('-.md')).toBe(false);
  });

  it('keeps non-Latin titles readable instead of collapsing to "-"', () => {
    const used = new Set();
    expect(zipEntryName('会議メモ', 'cccccccc', 'md', used)).toBe('会議メモ.md');
    expect(zipEntryName('日記', 'dddddddd', 'md', used)).toBe('日記.md');
  });

  it('strips characters that are illegal in file names and handles empty titles', () => {
    const used = new Set();
    expect(zipEntryName('a/b:c*?', 'eeeeeeee', 'txt', used)).toBe('abc.txt');
    expect(zipEntryName('   ', 'ffffffff', 'md', used)).toBe('untitled.md');
  });
});

describe('safeFileBase', () => {
  it('keeps a non-Latin title readable instead of collapsing to "-"', () => {
    expect(safeFileBase('会議メモ')).toBe('会議メモ');
  });

  it('falls back to "untitled" for a title made only of illegal characters', () => {
    expect(safeFileBase('///:::***')).toBe('untitled');
  });

  it('strips illegal characters and collapses whitespace', () => {
    expect(safeFileBase('a/b:c*?')).toBe('abc');
    expect(safeFileBase('  My Notes  ')).toBe('My-Notes');
  });

  it('returns "untitled" for empty or whitespace-only titles', () => {
    expect(safeFileBase('')).toBe('untitled');
    expect(safeFileBase('   ')).toBe('untitled');
  });

  it('cuts to maxLength by code point, never splitting an emoji at the cut', () => {
    // 49 letters then an emoji (2 UTF-16 units): .slice(0, 50) would keep half of it
    const title = `${'a'.repeat(49)}😀tail`;
    expect(safeFileBase(title, 50)).toBe(`${'a'.repeat(49)}😀`);
  });

  it('trims a dash left at the cut point by maxLength', () => {
    // character 50 is the dash that replaced the space between words
    expect(safeFileBase(`${'a'.repeat(49)} bcd`, 50)).toBe('a'.repeat(49));
  });

  it('defaults maxLength to 80', () => {
    expect(safeFileBase('x'.repeat(100))).toHaveLength(80);
  });
});
