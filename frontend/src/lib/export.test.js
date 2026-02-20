import { describe, it, expect } from 'vitest';
import {
  getExportIncludeFromTemplate,
  buildObjectMarkdown,
  EXPORT_TEMPLATE_IDS,
  EXPORT_FORMAT_LABELS,
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
