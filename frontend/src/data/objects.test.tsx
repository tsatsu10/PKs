import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createTestQueryClient, wrapperFor } from '../test/queryTestUtils';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../test/supabaseMock').mockSupabase> }));
vi.mock('../lib/supabase', async () => {
  const { mockSupabase } = await import('../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});

import { useObjectsPage, useObjectsCount, setObjectInLists, invalidateObjectLists } from './objects';
import { qk, type SearchPayload } from './keys';

const empty: SearchPayload = {
  search_query: null, type_filter: null, domain_id_f: null, tag_id_f: null, date_from_f: null,
  date_to_f: null, status_filter: null, due_from_f: null, due_to_f: null,
};

describe('dashboard object list', () => {
  it('dedupes identical requests and uses the snippets RPC only for text queries', async () => {
    sb.current!.rpc.mockImplementation((name: string) =>
      Promise.resolve({ data: name === 'count_knowledge_objects' ? 3 : [{ id: '1' }], error: null }));
    const wrapper = wrapperFor(createTestQueryClient());
    renderHook(() => useObjectsPage(empty, 0), { wrapper });
    const { result } = renderHook(() => useObjectsPage(empty, 0), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([{ id: '1' }]));
    expect(sb.current!.rpc.mock.calls.filter(([n]) => n === 'search_knowledge_objects')).toHaveLength(1);

    renderHook(() => useObjectsPage({ ...empty, search_query: 'rust' }, 0), { wrapper });
    await waitFor(() => expect(sb.current!.rpc.mock.calls.some(([n]) => n === 'search_knowledge_objects_with_snippets')).toBe(true));
  });

  it('keeps the previous rows while the next filter loads (no skeleton)', async () => {
    let resolveSecond: (v: { data: { id: string }[]; error: null }) => void = () => {};
    sb.current!.rpc.mockImplementation((_n: string, args?: unknown) =>
      (args as { type_filter?: string } | undefined)?.type_filter === 'note'
        ? new Promise<{ data: { id: string }[]; error: null }>((r) => { resolveSecond = r; })
        : Promise.resolve({ data: [{ id: 'old' }], error: null }));
    const { result, rerender } = renderHook(({ p }) => useObjectsPage(p, 0), {
      wrapper: wrapperFor(createTestQueryClient()), initialProps: { p: empty },
    });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'old' }]));
    rerender({ p: { ...empty, type_filter: 'note' } });
    expect(result.current.data).toEqual([{ id: 'old' }]);
    expect(result.current.isPlaceholderData).toBe(true);
    resolveSecond({ data: [{ id: 'new' }], error: null });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'new' }]));
  });

  it('the dashboard page never asks for content_json', async () => {
    sb.current!.rpc.mockImplementation(() => Promise.resolve({ data: [{ id: '1' }], error: null }));
    const { result } = renderHook(() => useObjectsPage({ ...empty, type_filter: 'idea' }, 0), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const selects = sb.current!.rpcSelects.filter(([n]) => n === 'search_knowledge_objects');
    expect(selects.length).toBeGreaterThan(0);
    for (const [, cols] of selects) expect(cols).not.toMatch(/content_json|content_text/);
  });

  it('a failing count returns null instead of failing the list', async () => {
    sb.current!.rpc.mockImplementation(() => Promise.resolve({ data: null, error: { code: 'PGRST000', message: 'x' } }));
    const { result } = renderHook(() => useObjectsCount(empty), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('setObjectInLists patches and removes rows in cached pages', () => {
    const client = createTestQueryClient();
    client.setQueryData(qk.objects.page(empty, 0), [{ id: '1', is_pinned: false }, { id: '2' }]);
    setObjectInLists('1', { is_pinned: true }, client);
    setObjectInLists('2', null, client);
    expect(client.getQueryData(qk.objects.page(empty, 0))).toEqual([{ id: '1', is_pinned: true }]);
  });

  it('invalidateObjectLists invalidates object pages, Trash and dashboard stats', async () => {
    const client = createTestQueryClient();
    client.setQueryData(qk.objects.page(empty, 0), [{ id: '1' }]);
    client.setQueryData(qk.trash.list(), { pages: [], pageParams: [] });
    client.setQueryData(qk.dashboard.stats(), { total: 1 });
    await invalidateObjectLists(client);
    expect(client.getQueryState(qk.objects.page(empty, 0))?.isInvalidated).toBe(true);
    expect(client.getQueryState(qk.trash.list())?.isInvalidated).toBe(true);
    expect(client.getQueryState(qk.dashboard.stats())?.isInvalidated).toBe(true);
  });
});
