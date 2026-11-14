import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clear } from 'idb-keyval';
import { onlineManager } from '@tanstack/react-query';
import { createTestQueryClient } from '../../../test/queryTestUtils';
import { saveHarness } from './testHarness';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../../../test/supabaseMock').mockSupabase> }));
vi.mock('../../../lib/supabase', async () => {
  const { mockSupabase } = await import('../../../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});
vi.mock('../../../lib/reportError', () => ({ reportError: vi.fn() }));

import { openSaveQueue, disposeAllSaveQueues } from './saveQueue';
import { readLocalCopy } from './localCopy';

const h = saveHarness(() => sb.current!);
let n = 0;
let id = '';
const open = (over: Partial<Parameters<typeof openSaveQueue>[0]> = {}) =>
  openSaveQueue({ objectId: id, userId: 'u1', isOwner: true, baseRevision: 3, client: createTestQueryClient(), ...over });
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(async () => {
  await clear();
  n += 1;
  id = `f000000${n}-aaaa-bbbb-cccc-000000000000`;
  h.reset({ id, revision: 3 });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
});
afterEach(() => {
  disposeAllSaveQueues();
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

describe('saveQueue: network errors', () => {
  it('retries after 1, 2, 5, 10, 30 and then every 30 s', async () => {
    const down = { data: null, error: { message: 'Failed to fetch' } };
    h.script(down, down, down, down, down, down, down);
    const { queue } = await open();
    queue.change({ title: 'A' });
    await vi.advanceTimersByTimeAsync(800);
    expect(h.updates()).toHaveLength(1);
    expect(queue.getState().status).toBe('retrying');
    const marks = [1000, 2000, 5000, 10_000, 30_000, 30_000];
    for (const [i, ms] of marks.entries()) {
      await vi.advanceTimersByTimeAsync(ms - 1);
      expect(h.updates()).toHaveLength(i + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(h.updates()).toHaveLength(i + 2);
    }
    expect(queue.getState().status).toBe('retrying');
  });

  it('waits while offline and sends when back online', async () => {
    const { queue } = await open();
    onlineManager.setOnline(false);
    queue.change({ title: 'A' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.updates()).toHaveLength(0);
    expect(queue.getState().status).toBe('offline');
    onlineManager.setOnline(true);
    await settle();
    expect(h.updates()).toHaveLength(1);
  });

  it('an expired session refreshes once and retries once, then blocks', async () => {
    const expired = { data: null, error: { code: 'PGRST301', message: 'JWT expired' } };
    h.script(expired, expired);
    const { queue } = await open();
    queue.change({ title: 'A' });
    await vi.advanceTimersByTimeAsync(800);
    await settle();
    await settle();
    expect(sb.current!.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(h.updates()).toHaveLength(2);
    expect(queue.getState().status).toBe('blocked');
  });
});

describe('saveQueue: zero rows updated (R7)', () => {
  it('a deleted object blocks with "This object was deleted"', async () => {
    h.row = null;
    const { queue } = await open();
    queue.change({ title: 'A' });
    await vi.advanceTimersByTimeAsync(800);
    await settle();
    expect(queue.getState()).toEqual({ status: 'blocked', message: 'This object was deleted' });
  });

  it('a newer revision is a conflict', async () => {
    h.row = { ...h.row!, revision: 9 };
    const { queue } = await open();
    queue.change({ title: 'A' });
    await vi.advanceTimersByTimeAsync(800);
    await settle();
    expect(queue.getState().status).toBe('conflict');
  });

  it('a lost share blocks with "You no longer have edit access"', async () => {
    h.row = { ...h.row!, user_id: 'owner' };
    h.setShareRole('viewer');
    h.script({ data: [], error: null });
    const { queue } = await open({ isOwner: false });
    queue.change({ title: 'A' });
    await vi.advanceTimersByTimeAsync(800);
    await settle();
    expect(queue.getState()).toEqual({ status: 'blocked', message: 'You no longer have edit access' });
  });

  it('typing during a conflict updates the local copy and sends nothing', async () => {
    h.row = { ...h.row!, revision: 9 };
    const { queue } = await open();
    queue.change({ title: 'A' });
    await vi.advanceTimersByTimeAsync(800);
    await settle();
    queue.change({ summary: 'more' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.updates()).toHaveLength(1);
    await vi.waitFor(async () => expect((await readLocalCopy('u1', id))?.fields).toMatchObject({ title: 'A', summary: 'more' }));
  });
});
