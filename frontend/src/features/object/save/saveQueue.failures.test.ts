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

import { openSaveQueue, disposeAllSaveQueues, flushAllSaveQueues, prepareSignOut } from './saveQueue';
import { readLocalCopy, writeLocalCopyNow } from './localCopy';
import { slugForTitle } from '../../../lib/objectForm';

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

describe('saveQueue: review fixes', () => {
  it('a blocked queue tries again when the object is reopened', async () => {
    const expired = { data: null, error: { code: 'PGRST301', message: 'JWT expired' } };
    h.script(expired, expired);
    const { queue } = await open();
    queue.change({ title: 'A' });
    await vi.advanceTimersByTimeAsync(800);
    await settle();
    expect(queue.getState().status).toBe('blocked');
    queue.dispose();
    const again = await open();
    expect(again.queue).toBe(queue);
    await vi.advanceTimersByTimeAsync(800);
    await settle();
    expect(h.updates()).toHaveLength(3);
    expect(queue.getState().status).toBe('saved');
  });

  it('leaving while retrying keeps retrying in the background', async () => {
    h.script({ data: null, error: { message: 'Failed to fetch' } });
    const { queue } = await open();
    queue.change({ title: 'A' });
    await vi.advanceTimersByTimeAsync(800);
    expect(queue.getState().status).toBe('retrying');
    queue.dispose();
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.updates()).toHaveLength(2);
    expect(queue.getState().status).toBe('saved');
  });

  it('leaving while offline sends when the connection returns', async () => {
    const { queue } = await open();
    onlineManager.setOnline(false);
    queue.change({ title: 'A' });
    await vi.advanceTimersByTimeAsync(800);
    queue.dispose();
    onlineManager.setOnline(true);
    await settle();
    expect(h.updates()).toHaveLength(1);
  });

  it('a save whose response was lost is recognised on reopen instead of raising a conflict', async () => {
    const json = [{ type: 'paragraph', props: { textColor: 'default', backgroundColor: 'default' }, content: [], children: [] }];
    const serverJson = [{ children: [], content: [], props: { backgroundColor: 'default', textColor: 'default' }, type: 'paragraph' }];
    h.row = { ...h.row!, revision: 9, title: 'A', slug: slugForTitle('A', id), content: 'x', content_json: serverJson };
    await writeLocalCopyNow('u1', id, { fields: { title: 'A', content: 'x', content_json: json }, baseRevision: 3 });
    const { queue } = await open();
    await vi.advanceTimersByTimeAsync(800);
    await settle();
    await settle();
    expect(queue.getState().status).toBe('saved');
    expect(queue.baseRevision()).toBe(9);
    await vi.waitFor(async () => expect(await readLocalCopy('u1', id)).toBeNull());
  });

  it('flushAllSaveQueues sends edits still inside the debounce window', async () => {
    const { queue } = await open();
    queue.change({ title: 'A' });
    await flushAllSaveQueues(3000);
    expect(h.updates()).toHaveLength(1);
    expect(queue.getState().status).toBe('saved');
  });

  it('prepareSignOut saves first, and asks before discarding edits it could not save', async () => {
    const confirm = vi.fn(() => false);
    const { queue } = await open();
    queue.change({ title: 'A' });
    await expect(prepareSignOut(confirm)).resolves.toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    h.row = { ...h.row!, revision: 99 };
    queue.change({ title: 'B' });
    await expect(prepareSignOut(confirm)).resolves.toBe(false);
    expect(confirm).toHaveBeenCalledWith(1);
  });
});
