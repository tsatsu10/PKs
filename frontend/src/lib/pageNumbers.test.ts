import { describe, it, expect } from 'vitest';
import { buildPageNumbers } from './pageNumbers';

describe('buildPageNumbers', () => {
  it('lists every page up to seven', () => {
    expect(buildPageNumbers(1, 1)).toEqual([1]);
    expect(buildPageNumbers(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(buildPageNumbers(1, 0)).toEqual([]);
  });

  it('collapses long ranges around the current page', () => {
    expect(buildPageNumbers(1, 10)).toEqual([1, 2, '…', 10]);
    expect(buildPageNumbers(5, 10)).toEqual([1, '…', 4, 5, 6, '…', 10]);
    expect(buildPageNumbers(10, 10)).toEqual([1, '…', 9, 10]);
    expect(buildPageNumbers(3, 10)).toEqual([1, 2, 3, 4, '…', 10]);
  });
});
