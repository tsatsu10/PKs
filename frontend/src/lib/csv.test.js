import { describe, it, expect } from 'vitest';
import { parseCsvRows } from './csv';

describe('parseCsvRows', () => {
  it('parses simple unquoted rows', () => {
    expect(parseCsvRows('title,content\nA,B')).toEqual([
      ['title', 'content'],
      ['A', 'B'],
    ]);
  });

  it('keeps commas inside quoted fields', () => {
    expect(parseCsvRows('title,content\n"Hello, world",body')).toEqual([
      ['title', 'content'],
      ['Hello, world', 'body'],
    ]);
  });

  it('keeps newlines inside quoted fields', () => {
    expect(parseCsvRows('title,content\nA,"line one\nline two"')).toEqual([
      ['title', 'content'],
      ['A', 'line one\nline two'],
    ]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsvRows('title\n"She said ""hi"""')).toEqual([
      ['title'],
      ['She said "hi"'],
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsvRows('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('ignores empty trailing lines', () => {
    expect(parseCsvRows('a,b\nc,d\n\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps empty cells in multi-column rows', () => {
    expect(parseCsvRows('a,,c')).toEqual([['a', '', 'c']]);
  });
});
