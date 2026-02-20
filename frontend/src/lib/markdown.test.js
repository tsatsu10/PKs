import { describe, it, expect } from 'vitest';
import { markdownToHtml } from './markdown.js';

describe('markdownToHtml', () => {
  it('returns empty string for null or empty input', () => {
    expect(markdownToHtml(null)).toBe('');
    expect(markdownToHtml('')).toBe('');
  });

  it('converts simple markdown to sanitized HTML', () => {
    expect(markdownToHtml('Hello')).toContain('Hello');
    expect(markdownToHtml('**bold**')).toContain('bold');
    expect(markdownToHtml('# Title')).toContain('Title');
  });

  it('sanitizes script tags (XSS)', () => {
    const html = markdownToHtml('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('alert(1)');
  });

  it('allows safe tags like p, strong, a', () => {
    const html = markdownToHtml('**[link](https://example.com)**');
    expect(html).toContain('strong');
    expect(html).toContain('href=');
  });
});
