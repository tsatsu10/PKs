import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, screen, fireEvent, waitFor } from '@testing-library/react';
import type { FormEvent } from 'react';
import { hookWrapper, TEST_OBJECT, holdNext } from '../testUtils';

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

  describe('revoke', () => {
    const SHARE = { id: 's1', shared_with_email: 'bo@x.co', role: 'editor', created_at: '2026-11-01T00:00:00Z' };
    async function loaded() {
      sb.current!.respond = (call) => ({ data: call.table === 'share_permissions' ? [SHARE] : [], error: null });
      const r = setup();
      await act(() => r.result.current.load());
      expect(r.result.current.shares.map((x) => x.id)).toEqual(['s1']);
      return r;
    }

    it('removes the share at once and Undo shares it again with the same email and role', async () => {
      const { result } = await loaded();
      const d = holdNext(sb.current!);
      let p!: Promise<void>;
      act(() => { p = result.current.revoke('s1'); });
      expect(result.current.shares).toEqual([]);
      await act(async () => { d.resolve({ data: [], error: null }); await p; });
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      await waitFor(() => expect(sb.current!.rpc).toHaveBeenCalledWith('share_object_by_email',
        { p_object_id: 'o1', p_email: 'bo@x.co', p_role: 'editor' }));
    });

    it('a failed revoke brings the share back and withdraws the Undo', async () => {
      const { result, setError } = await loaded();
      const d = holdNext(sb.current!);
      let p!: Promise<void>;
      act(() => { p = result.current.revoke('s1'); });
      await act(async () => { d.resolve({ data: null, error: { code: 'PGRST000', message: 'down' } }); await p; });
      expect(result.current.shares.map((x) => x.id)).toEqual(['s1']);
      expect(setError).toHaveBeenLastCalledWith(expect.stringMatching(/.+/));
      expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    });
  });
});
