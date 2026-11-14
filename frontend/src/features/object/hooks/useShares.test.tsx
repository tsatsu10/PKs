import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { FormEvent } from 'react';
import { hookWrapper, TEST_OBJECT } from '../testUtils';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../../../test/supabaseMock').mockSupabase> }));
vi.mock('../../../lib/supabase', async () => {
  const { mockSupabase } = await import('../../../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});

import { useShares } from './useShares';

const submit = { preventDefault: () => {} } as FormEvent;

function setup() {
  const setError = vi.fn();
  const r = renderHook(() => useShares({ object: TEST_OBJECT, userId: 'owner', setError }), { wrapper: hookWrapper() });
  return { ...r, setError };
}

beforeEach(() => {
  sb.current!.calls.length = 0;
  sb.current!.respond = () => ({ data: [], error: null });
  sb.current!.rpc.mockReset();
  sb.current!.rpc.mockResolvedValue({ data: null, error: null });
});

describe('useShares', () => {
  it('revoke of a pending invite deletes from share_invites', async () => {
    const { result } = setup();
    await act(() => result.current.revoke('invite:i1'));
    const del = sb.current!.calls.find((c) => c.table === 'share_invites');
    expect(del?.ops).toContainEqual(['delete', []]);
    expect(del?.ops).toContainEqual(['eq', ['id', 'i1']]);
    expect(sb.current!.calls.some((c) => c.table === 'share_permissions')).toBe(false);
  });

  it('add rejects an invalid email without calling the RPC', async () => {
    const { result, setError } = setup();
    act(() => result.current.setEmail('not-an-email'));
    await act(() => result.current.add(submit));
    expect(setError).toHaveBeenCalledWith('Please enter a valid email address.');
    expect(sb.current!.rpc).not.toHaveBeenCalled();
  });
});
