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

import { useObjectDetail } from '../hooks/useObjectDetail';

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

describe('useObjectDetail', () => {
  it('a failing panel reports its own error while the object still loads', async () => {
    respondAll('knowledge_object_tags');
    const { result } = renderHook(() => useObjectDetail({ id: 'o1', userId: 'u1' }), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.object?.title).toBe('T'));
    await waitFor(() => expect(result.current.panelErrors.tags).toBeTruthy());
    expect(result.current.panelErrors.domains).toBeFalsy();
    expect(result.current.error).toBe('');
  });

  it('a missing object is a not-found message, not a crash', async () => {
    respondAll();
    sb.current!.respond = (call) => (call.table === 'knowledge_objects' ? { data: null, error: null } : { data: [], error: null });
    const { result } = renderHook(() => useObjectDetail({ id: 'gone', userId: 'u1' }), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.object).toBeNull();
    expect(result.current.error).toMatch(/doesn't exist|deleted/i);
  });

  it('window focus and reconnect do not refetch the object (editor safety)', async () => {
    respondAll();
    const { result } = renderHook(() => useObjectDetail({ id: 'o1', userId: 'u1' }), { wrapper: wrapperFor(createTestQueryClient()) });
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
    const { result } = renderHook(() => useObjectDetail({ id: 'o1', userId: 'u1' }), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.object).toBeTruthy());
    // Let the tags panel settle first, so its resolution can't overwrite the manual update.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await act(async () => { result.current.setObjectTags((prev: unknown[]) => [...prev, { id: 't1', name: 'x' }]); });
    await waitFor(() => expect(result.current.objectTags).toEqual([{ id: 't1', name: 'x' }]));
  });
});
