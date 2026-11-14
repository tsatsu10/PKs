import { describe, it, expect, vi } from 'vitest';
import { unwrap } from './unwrap';
import { fetchAll } from './fetchAll';
import { quoteFilterValue, afterCursorDesc, nextCursor } from './keyset';
import { chunk } from './chunk';

describe('unwrap', () => {
  it('returns data or throws the Supabase error', () => {
    expect(unwrap({ data: [1], error: null })).toEqual([1]);
    const error = { code: '42501', message: 'denied' };
    expect(() => unwrap({ data: null, error })).toThrow();
    try { unwrap({ data: null, error }); } catch (e) { expect(e).toBe(error); }
  });
});

describe('fetchAll', () => {
  it('loads every page past the 1,000-row server limit', async () => {
    const all = Array.from({ length: 2345 }, (_, i) => ({ id: i }));
    const page = vi.fn((from: number, to: number) => Promise.resolve({ data: all.slice(from, to + 1), error: null }));
    const rows = await fetchAll(page);
    expect(rows).toHaveLength(2345);
    expect(page.mock.calls.map((c) => c[0])).toEqual([0, 1000, 2000]);
  });

  it('stops after an exactly full last page', async () => {
    const page = vi.fn((from: number) => Promise.resolve({ data: from === 0 ? Array(1000).fill({}) : [], error: null }));
    expect(await fetchAll(page)).toHaveLength(1000);
    expect(page).toHaveBeenCalledTimes(2);
  });

  it('throws when a page fails', async () => {
    const page = () => Promise.resolve({ data: null, error: { code: 'PGRST000', message: 'down' } });
    await expect(fetchAll(page)).rejects.toMatchObject({ code: 'PGRST000' });
  });
});

describe('keyset', () => {
  it('quotes values so commas, quotes and parentheses are safe in PostgREST or()', () => {
    expect(quoteFilterValue('a,b')).toBe('"a,b"');
    expect(quoteFilterValue('say "hi" (x)')).toBe('"say \\"hi\\" (x)"');
    expect(quoteFilterValue('back\\slash')).toBe('"back\\\\slash"');
  });

  it('builds the after-cursor filter for (column desc, id desc)', () => {
    expect(afterCursorDesc('created_at', { value: '2026-10-13T01:02:03.4+00:00', id: 'b' }))
      .toBe('created_at.lt."2026-10-13T01:02:03.4+00:00",and(created_at.eq."2026-10-13T01:02:03.4+00:00",id.lt."b")');
  });

  it('returns a cursor only when the page is full', () => {
    const rows = [{ id: 'a', created_at: 't2' }, { id: 'b', created_at: 't1' }];
    expect(nextCursor(rows, 'created_at', 2)).toEqual({ value: 't1', id: 'b' });
    expect(nextCursor(rows, 'created_at', 3)).toBeNull();
  });
});

describe('chunk', () => {
  it('splits ids for .in() filters', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
});
