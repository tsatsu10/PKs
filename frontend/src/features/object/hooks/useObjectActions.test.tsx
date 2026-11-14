import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { hookWrapper, TEST_OBJECT } from '../testUtils';
import { createTestQueryClient } from '../../../test/queryTestUtils';
import { ToastProvider } from '../../../context/ToastContext';
import type { SaveQueue } from '../save/saveQueue';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../../../test/supabaseMock').mockSupabase> }));
vi.mock('../../../lib/supabase', async () => {
  const { mockSupabase } = await import('../../../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});
vi.mock('../../../lib/audit', () => ({ logAudit: vi.fn() }));

import { useObjectActions } from './useObjectActions';
import { qk } from '../../../data/keys';

function setup() {
  const setObject = vi.fn();
  const r = renderHook(() => useObjectActions({
    object: TEST_OBJECT, userId: 'owner', objectDomains: [], objectTags: [], queue: null, setObject, setError: vi.fn(),
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

  it('duplicate and delete save unsent edits first, and duplicate copies them', async () => {
    const order: string[] = [];
    const client = createTestQueryClient();
    const queue = { flush: vi.fn(async () => {
      order.push('flush');
      client.setQueryData(qk.object.detail(TEST_OBJECT.id), { ...TEST_OBJECT, title: 'Typed', content: 'typed body' });
    }) } as unknown as SaveQueue;
    sb.current!.respond = (call) => {
      if (call.ops.some(([m]) => m === 'insert' || m === 'update')) order.push(call.ops.some(([m]) => m === 'insert') ? 'insert' : 'update');
      if (call.ops.some(([m]) => m === 'single')) return { data: { id: 'copy' }, error: null };
      return { data: [], error: null };
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}><ToastProvider><MemoryRouter>{children}</MemoryRouter></ToastProvider></QueryClientProvider>
    );
    const { result } = renderHook(() => useObjectActions({
      object: TEST_OBJECT, userId: 'owner', objectDomains: [], objectTags: [], queue, setObject: vi.fn(), setError: vi.fn(),
    }), { wrapper });
    await act(() => result.current.duplicate());
    expect(order.slice(0, 2)).toEqual(['flush', 'insert']);
    const insert = sb.current!.calls.find((c) => c.ops.some(([m]) => m === 'insert'))!;
    expect(insert.ops.find(([m]) => m === 'insert')![1][0]).toMatchObject({ title: 'Copy of Typed', content: 'typed body' });
    order.length = 0;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await act(() => result.current.remove());
    expect(order).toEqual(['flush', 'update']);
  });
});
