import { describe, it, expect } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createTestQueryClient, wrapperFor } from '../test/queryTestUtils';
import { useKeysetList } from './useKeysetList';
import type { Cursor } from './keyset';

type Row = { id: string; updated_at: string };
// 120 rows, newest first: r119 (t=119) … r0 (t=0). Timestamps zero-padded so string order matches.
let table: Row[] = Array.from({ length: 120 }, (_, i) => ({ id: `r${String(i).padStart(3, '0')}`, updated_at: String(i).padStart(4, '0') })).reverse();

function fetchPage(cursor: Cursor | null): Promise<Row[]> {
  const after = cursor
    ? table.filter((r) => r.updated_at < cursor.value || (r.updated_at === cursor.value && r.id < cursor.id))
    : table;
  return Promise.resolve(after.slice(0, 50));
}

describe('useKeysetList', () => {
  it('neither skips nor repeats rows when rows are removed between pages', async () => {
    const { result } = renderHook(
      () => useKeysetList<Row>({ queryKey: ['trash', 'list'], column: 'updated_at', fetchPage }),
      { wrapper: wrapperFor(createTestQueryClient()) },
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(50));
    const restored = result.current.rows.slice(0, 5).map((r) => r.id);
    table = table.filter((r) => !restored.includes(r.id));        // restored elsewhere / in this tab
    act(() => restored.forEach((id) => result.current.removeRow(id)));
    await act(async () => { await result.current.query.fetchNextPage(); });
    await act(async () => { await result.current.query.fetchNextPage(); });
    const ids = result.current.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);                    // no repeats
    expect(ids).toHaveLength(115);                                 // no skips
    expect(result.current.query.hasNextPage).toBe(false);
  });

  it('patchRow updates a row in place (mark read)', async () => {
    const { result } = renderHook(
      () => useKeysetList<Row & { read_at?: string | null }>({ queryKey: ['notifications', 'list', 'all'], column: 'updated_at', fetchPage }),
      { wrapper: wrapperFor(createTestQueryClient()) },
    );
    await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(0));
    const id = result.current.rows[0].id;
    act(() => result.current.patchRow(id, { read_at: 'now' }));
    await waitFor(() => expect(result.current.rows[0].read_at).toBe('now'));
  });
});
