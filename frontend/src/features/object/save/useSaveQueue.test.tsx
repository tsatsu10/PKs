import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StrictMode, type ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { clear } from 'idb-keyval';
import { saveHarness } from './testHarness';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../../../test/supabaseMock').mockSupabase> }));
vi.mock('../../../lib/supabase', async () => {
  const { mockSupabase } = await import('../../../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});

import { useSaveQueue } from './useSaveQueue';
import { disposeAllSaveQueues } from './saveQueue';

const h = saveHarness(() => sb.current!);
let n = 0;
let id = '';
const strict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

beforeEach(async () => {
  await clear();
  n += 1;
  id = `5000000${n}-aaaa-bbbb-cccc-000000000000`;
  h.reset({ id, revision: 3 });
});
afterEach(() => disposeAllSaveQueues());

describe('useSaveQueue', () => {
  it('opens the queue and follows its state', async () => {
    const { result } = renderHook(() => useSaveQueue({ objectId: id, userId: 'u1', isOwner: true, baseRevision: 3 }));
    expect(result.current.ready).toBe(false);
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => { result.current.queue!.change({ title: 'A' }); });
    expect(result.current.state.status).toBe('pending');
  });

  it('bumps seed when the queue reloads', async () => {
    const { result } = renderHook(() => useSaveQueue({ objectId: id, userId: 'u1', isOwner: true, baseRevision: 3 }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const before = result.current.seed;
    await act(async () => { await result.current.queue!.applyVersion({ version: 1, title: 'Old', content: '', content_json: null, summary: null, key_points: [] }); });
    expect(result.current.seed).toBe(before + 1);
  });

  it('unmounting sends an edit still inside the debounce window', async () => {
    const { result, unmount } = renderHook(() => useSaveQueue({ objectId: id, userId: 'u1', isOwner: true, baseRevision: 3 }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => { result.current.queue!.change({ title: 'Leaving' }); });
    unmount();
    await waitFor(() => expect(h.updates()).toHaveLength(1));
    expect(h.patch(0)).toMatchObject({ title: 'Leaving' });
  });

  it('survives StrictMode double mounting (still flushes on pagehide)', async () => {
    const { result } = renderHook(() => useSaveQueue({ objectId: id, userId: 'u1', isOwner: true, baseRevision: 3 }), { wrapper: strict });
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => { result.current.queue!.change({ title: 'A' }); });
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(h.updates()).toHaveLength(1);
  });
});
