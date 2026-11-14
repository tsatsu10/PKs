import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { hookWrapper, TEST_OBJECT } from '../testUtils';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../../../test/supabaseMock').mockSupabase> }));
vi.mock('../../../lib/supabase', async () => {
  const { mockSupabase } = await import('../../../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});

import { useLinks } from './useLinks';

function setup() {
  return renderHook(() => useLinks({
    object: TEST_OBJECT, userId: 'owner', otherObjects: [], outgoingLinks: [], incomingLinks: [],
    setOutgoingLinks: vi.fn(), setIncomingLinks: vi.fn(), setError: vi.fn(),
  }), { wrapper: hookWrapper() });
}

beforeEach(() => {
  sb.current!.calls.length = 0;
  sb.current!.respond = () => ({ data: [], error: null });
  sb.current!.rpc.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('useLinks', () => {
  it('search closes on Escape and on an outside click', () => {
    const { result } = setup();
    const container = document.createElement('div');
    document.body.appendChild(container);
    result.current.search.containerRef.current = container;
    act(() => result.current.search.setOpen(true));
    act(() => { container.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(result.current.search.open).toBe(true);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(result.current.search.open).toBe(false);
    act(() => result.current.search.setOpen(true));
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(result.current.search.open).toBe(false);
  });

  it('search waits 300 ms and excludes the current object', async () => {
    vi.useFakeTimers();
    sb.current!.rpc.mockResolvedValue({ data: [{ id: 'o1' }, { id: 'o9' }], error: null });
    const { result } = setup();
    act(() => result.current.search.setQuery('fo'));
    await act(async () => { vi.advanceTimersByTime(299); });
    expect(sb.current!.rpc).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); });
    await act(async () => { await Promise.resolve(); });
    expect(sb.current!.rpc).toHaveBeenCalledWith('search_knowledge_objects', expect.objectContaining({ search_query: 'fo' }));
    expect(result.current.search.results).toEqual([{ id: 'o9' }]);
  });
});
