import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { createTestQueryClient, wrapperFor } from '../test/queryTestUtils';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../test/supabaseMock').mockSupabase> }));
vi.mock('../lib/supabase', async () => {
  const { mockSupabase } = await import('../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});

import { useObjectPage } from '../features/object/useObjectPage';
import { fetchSaveCheck } from './objectDetail';

const OBJ = { id: 'o1', user_id: 'u1', type: 'note', title: 'T', content: 'body', is_deleted: false, revision: 1 };

function respondAll(failTable?: string) {
  sb.current!.respond = (call) => {
    if (call.table === failTable) return { data: null, error: { code: 'PGRST000', message: 'down' } };
    if (call.table === 'knowledge_objects' && call.ops.some(([m]) => m === 'maybeSingle')) return { data: OBJ, error: null };
    if (call.table === 'share_permissions') return { data: null, error: null };
    return { data: [], error: null };
  };
  sb.current!.rpc.mockResolvedValue({ data: [], error: null });
}

describe('useObjectPage', () => {
  it('a failing panel reports its own error while the object still loads', async () => {
    respondAll('knowledge_object_tags');
    const { result } = renderHook(() => useObjectPage({ id: 'o1', userId: 'u1' }), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.object?.title).toBe('T'));
    await waitFor(() => expect(result.current.panelErrors.tags).toBeTruthy());
    expect(result.current.panelErrors.domains).toBeFalsy();
    expect(result.current.error).toBe('');
  });

  it('a missing object is a not-found message, not a crash', async () => {
    respondAll();
    sb.current!.respond = (call) => (call.table === 'knowledge_objects' ? { data: null, error: null } : { data: [], error: null });
    const { result } = renderHook(() => useObjectPage({ id: 'gone', userId: 'u1' }), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.object).toBeNull();
    expect(result.current.error).toMatch(/doesn't exist|deleted/i);
  });

  it('window focus and reconnect do not refetch the object (editor safety)', async () => {
    respondAll();
    const { result } = renderHook(() => useObjectPage({ id: 'o1', userId: 'u1' }), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.object).toBeTruthy());
    const objectReads = () => sb.current!.calls.filter((c) => c.table === 'knowledge_objects' && c.ops.some(([m]) => m === 'maybeSingle')).length;
    const before = objectReads();
    act(() => { focusManager.setFocused(false); focusManager.setFocused(true); });
    act(() => { onlineManager.setOnline(false); onlineManager.setOnline(true); });
    await new Promise((r) => setTimeout(r, 20));
    expect(objectReads()).toBe(before);
    focusManager.setFocused(undefined);
  });

  it('setObjectTags updates the cached panel like the old state setter', async () => {
    respondAll();
    const { result } = renderHook(() => useObjectPage({ id: 'o1', userId: 'u1' }), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.object).toBeTruthy());
    // Let the tags panel settle first, so its resolution can't overwrite the manual update.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await act(async () => { result.current.setObjectTags((prev) => [...prev, { id: 't1', name: 'x' }]); });
    await waitFor(() => expect(result.current.objectTags).toEqual([{ id: 't1', name: 'x' }]));
  });

  it('links to trashed objects are hidden', async () => {
    respondAll();
    sb.current!.respond = (call) => {
      const eq = (col: string) => call.ops.some(([m, a]) => m === 'eq' && a[0] === col);
      if (call.table === 'knowledge_objects' && call.ops.some(([m]) => m === 'maybeSingle')) return { data: OBJ, error: null };
      if (call.table === 'link_edges' && eq('from_object_id')) return { data: [{ id: 'e1', to_object_id: 'a', relationship_type: 'references' }, { id: 'e2', to_object_id: 'b', relationship_type: 'references' }, { id: 'e4', to_object_id: 'x', relationship_type: 'references' }], error: null };
      if (call.table === 'link_edges' && eq('to_object_id')) return { data: [{ id: 'e3', from_object_id: 'b', relationship_type: 'references' }], error: null };
      if (call.table === 'knowledge_objects' && call.ops.some(([m]) => m === 'in')) {
        return { data: [{ id: 'a', title: 'A', type: 'note', is_deleted: false }, { id: 'b', title: 'B', type: 'note', is_deleted: true }], error: null };
      }
      if (call.table === 'share_permissions') return { data: null, error: null };
      return { data: [], error: null };
    };
    const { result } = renderHook(() => useObjectPage({ id: 'o1', userId: 'u1' }), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.outgoingLinks.length).toBeGreaterThan(0));
    // 'x' wasn't returned (RLS hides it): it keeps the 'Unknown' placeholder, as before.
    expect(result.current.outgoingLinks.map((l) => l.to_object_id)).toEqual(['a', 'x']);
    expect(result.current.outgoingLinks[1].target.title).toBe('Unknown');
    expect(result.current.incomingLinks).toEqual([]);
  });
});

describe('objectDetail', () => {
  it('fetchSaveCheck returns the row and my share role', async () => {
    sb.current!.respond = (call) => {
      if (call.table === 'knowledge_objects') return { data: { revision: 4, user_id: 'owner', is_deleted: false }, error: null };
      if (call.table === 'share_permissions') return { data: { role: 'editor' }, error: null };
      return { data: null, error: null };
    };
    await expect(fetchSaveCheck('o1', 'u2')).resolves.toEqual({
      row: { revision: 4, user_id: 'owner', is_deleted: false }, shareRole: 'editor',
    });
    const share = sb.current!.calls.filter((c) => c.table === 'share_permissions').at(-1)!;
    expect(share.ops).toContainEqual(['eq', ['shared_with_user_id', 'u2']]);
  });

  it('fetchSaveCheck returns row null when RLS hides it', async () => {
    sb.current!.respond = () => ({ data: null, error: null });
    await expect(fetchSaveCheck('o1', 'u2')).resolves.toEqual({ row: null, shareRole: null });
  });
});
