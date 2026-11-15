import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, render, act, screen, fireEvent, waitFor } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { hookWrapper, TEST_OBJECT, holdNext } from '../testUtils';
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
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigate }));

import { useObjectActions } from './useObjectActions';
import { qk } from '../../../data/keys';

function setup() {
  const client = createTestQueryClient();
  client.setQueryData(qk.object.detail(TEST_OBJECT.id), TEST_OBJECT);
  const setError = vi.fn();
  const r = renderHook(() => useObjectActions({
    object: TEST_OBJECT, userId: 'owner', objectDomains: [], objectTags: [], queue: null, setError,
  }), { wrapper: hookWrapper(client) });
  const pinned = () => (client.getQueryData(qk.object.detail(TEST_OBJECT.id)) as { is_pinned: boolean }).is_pinned;
  return { ...r, client, pinned, setError };
}

const OK = { data: [], error: null };
const DOWN = { data: null, error: { code: 'PGRST000', message: 'down' } };

beforeEach(() => {
  sb.current!.calls.length = 0;
  sb.current!.respond = () => OK;
  navigate.mockReset();
});
afterEach(() => vi.restoreAllMocks());

const updates = () => sb.current!.calls.filter((c) => c.ops.some(([m]) => m === 'update'));

describe('useObjectActions', () => {
  it('delete never asks for confirmation and leaves the page before the update finishes', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const { result } = setup();
    const d = holdNext(sb.current!);
    let p!: Promise<void>;
    await act(async () => { p = result.current.remove(); await Promise.resolve(); });
    expect(confirm).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    expect(screen.getByText('Moved to Trash')).toBeInTheDocument();
    await act(async () => { d.resolve(OK); await p; });
    expect(updates()[0].ops).toContainEqual(['update', [{ is_deleted: true }]]);
  });

  it("Undo after delete restores the object even once the page is gone", async () => {
    const client = createTestQueryClient();
    const api: { remove?: () => Promise<void> } = {};
    function Page() {
      const actions = useObjectActions({
        object: TEST_OBJECT, userId: 'owner', objectDomains: [], objectTags: [], queue: null, setError: vi.fn(),
      });
      useEffect(() => { api.remove = actions.remove; });
      return null;
    }
    const tree = (show: boolean) => (
      <QueryClientProvider client={client}><ToastProvider><MemoryRouter>{show && <Page />}</MemoryRouter></ToastProvider></QueryClientProvider>
    );
    const { rerender } = render(tree(true));
    await act(() => api.remove!());
    rerender(tree(false));
    sb.current!.calls.length = 0;
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(updates()[0]?.ops).toContainEqual(['update', [{ is_deleted: false }]]));
    await waitFor(() => expect(screen.getByText('Restored')).toBeInTheDocument());
  });

  it('a failed delete withdraws the Undo and reports', async () => {
    sb.current!.respond = () => DOWN;
    const { result, setError } = setup();
    await act(() => result.current.remove());
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(setError).toHaveBeenLastCalledWith(expect.stringMatching(/.+/));
  });

  it('togglePin flips the pin at once and sends it for the owner row', async () => {
    const { result, pinned } = setup();
    const d = holdNext(sb.current!);
    let p!: Promise<void>;
    act(() => { p = result.current.togglePin(); });
    expect(pinned()).toBe(true);
    await act(async () => { d.resolve(OK); await p; });
    expect(pinned()).toBe(true);
    expect(updates()[0].ops).toContainEqual(['update', [{ is_pinned: true }]]);
    expect(updates()[0].ops).toContainEqual(['eq', ['user_id', 'owner']]);
  });

  it('a failed togglePin flips the pin back', async () => {
    const { result, pinned } = setup();
    const d = holdNext(sb.current!);
    let p!: Promise<void>;
    act(() => { p = result.current.togglePin(); });
    await act(async () => { d.resolve(DOWN); await p; });
    expect(pinned()).toBe(false);
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
      object: TEST_OBJECT, userId: 'owner', objectDomains: [], objectTags: [], queue, setError: vi.fn(),
    }), { wrapper });
    await act(() => result.current.duplicate());
    expect(order.slice(0, 2)).toEqual(['flush', 'insert']);
    const insert = sb.current!.calls.find((c) => c.ops.some(([m]) => m === 'insert'))!;
    expect(insert.ops.find(([m]) => m === 'insert')![1][0]).toMatchObject({ title: 'Copy of Typed', content: 'typed body' });
    order.length = 0;
    await act(() => result.current.remove());
    expect(order).toEqual(['flush', 'update']);
  });
});
