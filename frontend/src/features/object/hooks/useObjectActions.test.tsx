import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, render, act, screen, fireEvent, waitFor } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { hookWrapper, TEST_OBJECT, holdNext, deferred } from '../testUtils';
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
import { logAudit } from '../../../lib/audit';

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
  vi.mocked(logAudit).mockReset();
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

  it('duplicate opens the copy before its insert finishes, with the domains and tags', async () => {
    const client = createTestQueryClient();
    client.setQueryData(qk.object.detail(TEST_OBJECT.id), TEST_OBJECT);
    const insert = deferred<{ data: unknown; error: unknown }>();
    sb.current!.respond = (call) => (call.table === 'knowledge_objects' && call.ops.some(([m]) => m === 'insert') ? insert.promise as never : OK);
    const domains = [{ id: 'd1', name: 'Work' }];
    const tags = [{ id: 't1', name: 'idea' }];
    const { result } = renderHook(() => useObjectActions({
      object: TEST_OBJECT, userId: 'owner', objectDomains: domains, objectTags: tags, queue: null, setError: vi.fn(),
    }), { wrapper: hookWrapper(client) });
    await act(() => result.current.duplicate());
    expect(navigate).toHaveBeenCalledTimes(1);
    const path = navigate.mock.calls[0][0] as string;
    expect(path).toMatch(/^\/objects\/[0-9a-f-]{36}$/);
    const id = path.split('/').pop()!;
    expect(client.getQueryData(qk.object.detail(id))).toMatchObject({ id, title: 'Copy of First', content: 'body' });
    expect(client.getQueryData(qk.object.domains(id))).toEqual(domains);
    expect(client.getQueryData(qk.object.tags(id))).toEqual(tags);
    expect(logAudit).not.toHaveBeenCalled();
    await act(async () => { insert.resolve(OK); await Promise.resolve(); });
    await waitFor(() => expect(logAudit).toHaveBeenCalledWith('owner', expect.anything(), expect.anything(), id, expect.objectContaining({ duplicated_from: 'o1' })));
    const junction = (t: string) => sb.current!.calls.find((c) => c.table === t)!.ops.find(([m]) => m === 'insert')![1][0];
    expect(junction('knowledge_object_domains')).toEqual([{ knowledge_object_id: id, domain_id: 'd1' }]);
    expect(junction('knowledge_object_tags')).toEqual([{ knowledge_object_id: id, tag_id: 't1' }]);
  });

  it('restoring a version offers Undo, which puts back the snapshot taken just before', async () => {
    const client = createTestQueryClient();
    const applyVersion = vi.fn().mockResolvedValueOnce(5).mockResolvedValue(9);
    const queue = { applyVersion } as unknown as SaveQueue;
    sb.current!.respond = (call) => {
      if (call.table !== 'knowledge_object_versions') return OK;
      const v = call.ops.find(([m, a]) => m === 'eq' && a[0] === 'version')?.[1][1] ?? 2;
      return { data: { version: v, title: `v${v}`, content: `body ${v}`, content_json: null, summary: null, key_points: [] }, error: null };
    };
    const { result } = renderHook(() => useObjectActions({
      object: TEST_OBJECT, userId: 'owner', objectDomains: [], objectTags: [], queue, setError: vi.fn(),
    }), { wrapper: hookWrapper(client) });
    await act(() => result.current.restoreVersion({ id: 'v2id', version: 2 }));
    expect(applyVersion).toHaveBeenLastCalledWith(expect.objectContaining({ version: 2, title: 'v2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(applyVersion).toHaveBeenCalledTimes(2));
    expect(applyVersion).toHaveBeenLastCalledWith(expect.objectContaining({ version: 5, title: 'v5', content: 'body 5' }));
    const read = sb.current!.calls.filter((c) => c.table === 'knowledge_object_versions').at(-1)!;
    expect(read.ops).toContainEqual(['eq', ['knowledge_object_id', 'o1']]);
    expect(read.ops).toContainEqual(['eq', ['version', 5]]);
  });
});
