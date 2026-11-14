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

import { useObjectActions } from './useObjectActions';

function setup() {
  const setObject = vi.fn();
  const r = renderHook(() => useObjectActions({
    object: TEST_OBJECT, userId: 'owner', objectDomains: [], objectTags: [], reload: vi.fn(), setObject, setError: vi.fn(),
  }), { wrapper: hookWrapper() });
  return { ...r, setObject };
}

beforeEach(() => {
  sb.current!.calls.length = 0;
  sb.current!.respond = () => ({ data: [], error: null });
});
afterEach(() => vi.restoreAllMocks());

const updates = () => sb.current!.calls.filter((c) => c.ops.some(([m]) => m === 'update'));

describe('useObjectActions', () => {
  it('delete is cancelled when confirm returns false', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { result } = setup();
    await act(() => result.current.remove());
    expect(updates()).toHaveLength(0);
  });

  it('togglePin flips is_pinned for the owner row', async () => {
    const { result, setObject } = setup();
    await act(() => result.current.togglePin());
    expect(updates()[0].ops).toContainEqual(['update', [{ is_pinned: true }]]);
    expect(updates()[0].ops).toContainEqual(['eq', ['user_id', 'owner']]);
    expect(setObject).toHaveBeenCalled();
  });
});
