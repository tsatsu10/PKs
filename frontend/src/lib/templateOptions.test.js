import { describe, it, expect } from 'vitest';
import { parseOptions } from './templateOptions';

describe('parseOptions', () => {
  it('splits on commas, trims, drops blanks and duplicates', () => {
    expect(parseOptions(' Draft, In review ,, Done, Draft ')).toEqual(['Draft', 'In review', 'Done']);
  });
  it('returns [] for empty input', () => {
    expect(parseOptions('')).toEqual([]);
  });
});
