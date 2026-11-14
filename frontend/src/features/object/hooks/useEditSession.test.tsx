import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { hookWrapper, TEST_OBJECT } from '../testUtils';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../../../test/supabaseMock').mockSupabase> }));
vi.mock('../../../lib/supabase', async () => {
  const { mockSupabase } = await import('../../../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});
vi.mock('../../../lib/audit', () => ({ logAudit: vi.fn() }));

import { useEditSession } from './useEditSession';

function setup() {
  let renders = 0;
  const setObject = vi.fn();
  const setError = vi.fn();
  const r = renderHook(() => {
    renders += 1;
    return useEditSession({ id: 'o1', object: TEST_OBJECT, isOwner: true, draft: null, setObject, setError, userId: 'owner' });
  }, { wrapper: hookWrapper() });
  return { ...r, renders: () => renders, setObject, setError };
}

beforeEach(() => {
  sessionStorage.clear();
  sb.current!.calls.length = 0;
  sb.current!.respond = (call) => (call.ops.some(([m]) => m === 'update')
    ? { data: [{ ...TEST_OBJECT, revision: 4 }], error: null }
    : { data: [], error: null });
});
afterEach(() => vi.useRealTimers());

describe('useEditSession', () => {
  it('typing content does not re-render the host', () => {
    const { result, renders } = setup();
    act(() => result.current.start());
    const before = renders();
    act(() => { result.current.onContentChange('a'); result.current.onContentChange('ab'); });
    expect(renders()).toBe(before);
  });

  it('save sends the latest typed content', async () => {
    const { result } = setup();
    act(() => result.current.start());
    act(() => result.current.onContentChange('typed'));
    await act(() => result.current.save());
    const update = sb.current!.calls.find((c) => c.ops.some(([m]) => m === 'update'))!;
    expect(update.ops.find(([m]) => m === 'update')![1][0]).toMatchObject({ content: 'typed' });
    expect(update.ops).toContainEqual(['eq', ['revision', 3]]);
    expect(result.current.editing).toBe(false);
  });

  it('the draft includes the latest content after 500 ms', () => {
    vi.useFakeTimers();
    sessionStorage.setItem('pks-drafts-owner', 'u1');
    const { result } = setup();
    act(() => result.current.start());
    act(() => result.current.onContentChange('x'));
    act(() => { vi.advanceTimersByTime(499); });
    expect(sessionStorage.getItem('pks-draft-o1')).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(JSON.parse(sessionStorage.getItem('pks-draft-o1')!).content).toBe('x');
  });

  it('cancel drops the draft and a pending draft write', () => {
    vi.useFakeTimers();
    sessionStorage.setItem('pks-drafts-owner', 'u1');
    const { result } = setup();
    act(() => result.current.start());
    act(() => result.current.setField('title', 'T2'));
    act(() => result.current.cancel());
    act(() => { vi.advanceTimersByTime(1000); });
    expect(sessionStorage.getItem('pks-draft-o1')).toBeNull();
    expect(result.current.editing).toBe(false);
    expect(result.current.editForm.title).toBe('First');
  });
});
