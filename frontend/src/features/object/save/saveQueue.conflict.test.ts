import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clear } from 'idb-keyval';
import type { QueryClient } from '@tanstack/react-query';
import { createTestQueryClient } from '../../../test/queryTestUtils';
import { saveHarness } from './testHarness';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../../../test/supabaseMock').mockSupabase> }));
vi.mock('../../../lib/supabase', async () => {
  const { mockSupabase } = await import('../../../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});
vi.mock('../../../lib/reportError', () => ({ reportError: vi.fn() }));

import { openSaveQueue, disposeAllSaveQueues, type SaveQueue } from './saveQueue';
import { readLocalCopy } from './localCopy';
import { objectDetailQuery } from '../../../data/objectDetail';

const h = saveHarness(() => sb.current!);
let n = 0;
let id = '';
let client: QueryClient;
let log: string[] = [];
const settle = () => vi.advanceTimersByTimeAsync(0);
const rpcArgs = () => sb.current!.rpc.mock.calls.map(([, args]) => args as Record<string, unknown>);

/** Wraps the fake so every update, detail read and RPC lands in `log`, in order. */
function track() {
  const inner = sb.current!.respond;
  sb.current!.respond = (call) => {
    if (call.table === 'knowledge_objects') {
      if (call.ops.some(([m]) => m === 'update')) log.push('update');
      else if (call.ops.some(([m, a]) => m === 'select' && String(a[0]).includes('content_json'))) log.push('refetch');
    }
    return inner(call);
  };
  sb.current!.rpc.mockImplementation(() => { log.push('rpc'); return Promise.resolve({ data: 7, error: null }); });
}

async function inConflict(): Promise<SaveQueue> {
  h.row = { ...h.row!, revision: 9, title: 'Theirs' };
  const { queue } = await openSaveQueue({ objectId: id, userId: 'u1', isOwner: true, baseRevision: 3, client });
  queue.change({ title: 'Mine', content: 'my body' });
  await vi.advanceTimersByTimeAsync(800);
  await settle();
  expect(queue.getState().status).toBe('conflict');
  log = [];
  return queue;
}

beforeEach(async () => {
  await clear();
  n += 1;
  id = `c000000${n}-aaaa-bbbb-cccc-000000000000`;
  h.reset({ id, revision: 3 });
  client = createTestQueryClient();
  log = [];
  track();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
});
afterEach(() => {
  disposeAllSaveQueues();
  vi.useRealTimers();
});

describe('saveQueue: Keep mine', () => {
  it('snapshots theirs, re-reads the revision, then sends everything pending on it', async () => {
    const queue = await inConflict();
    await queue.keepMine();
    expect(log).toEqual(['rpc', 'update']);
    expect(rpcArgs().at(-1)).toEqual({ p_object_id: id, p_fields: null, p_reason: 'Kept from a conflict before overwrite' });
    expect(h.revision(h.updates().length - 1)).toBe(9);
    expect(h.patch(h.updates().length - 1)).toMatchObject({ title: 'Mine', content: 'my body' });
    expect(queue.getState().status).toBe('saved');
  });
});

describe('saveQueue: Load theirs', () => {
  it('snapshots my unsent edit, drops it, refetches, then announces the reload', async () => {
    void client.prefetchQuery(objectDetailQuery(id));
    const queue = await inConflict();
    let copyAtReload: unknown = 'unset';
    queue.onReloaded(() => { log.push('reloaded'); });
    queue.onReloaded(() => { void readLocalCopy('u1', id).then((c) => { copyAtReload = c; }); });
    await queue.loadTheirs();
    expect(log).toEqual(['rpc', 'refetch', 'reloaded']);
    expect(rpcArgs().at(-1)).toEqual({
      p_object_id: id, p_fields: { title: 'Mine', content: 'my body' }, p_reason: 'Unsaved edit kept from a conflict',
    });
    await vi.waitFor(() => expect(copyAtReload).toBeNull());
    expect(queue.pending()).toEqual({});
    expect(queue.baseRevision()).toBe(9);
    expect(queue.getState().status).toBe('idle');
  });
});

describe('saveQueue: a failing snapshot (offline, 5xx)', () => {
  it('Keep mine and Load theirs both reject and keep the conflict and the local copy', async () => {
    const queue = await inConflict();
    sb.current!.rpc.mockImplementation(() => Promise.resolve({ data: null, error: { message: 'Failed to fetch' } }));
    await expect(queue.keepMine()).rejects.toBeTruthy();
    await expect(queue.loadTheirs()).rejects.toBeTruthy();
    expect(queue.getState().status).toBe('conflict');
    expect(queue.pending()).toMatchObject({ title: 'Mine', content: 'my body' });
    await vi.waitFor(async () => expect((await readLocalCopy('u1', id))?.fields).toMatchObject({ title: 'Mine' }));
  });
});

describe('saveQueue: version actions flush unsent edits first', () => {
  it('applyVersion sends what you typed, snapshots, then sends the version', async () => {
    const { queue } = await openSaveQueue({ objectId: id, userId: 'u1', isOwner: true, baseRevision: 3, client });
    queue.change({ title: 'Typed' });
    await queue.applyVersion({ version: 1, title: 'Old', content: 'old body', content_json: null, summary: null, key_points: [] });
    expect(log).toEqual(['update', 'rpc', 'update']);
    expect(h.patch(0)).toMatchObject({ title: 'Typed' });
    expect(rpcArgs().at(-1)).toMatchObject({ p_object_id: id, p_reason: 'Before restoring v1' });
    expect(h.patch(1)).toMatchObject({ title: 'Old', content: 'old body', content_json: null });
  });

  it('applyVersion resolves to the number of the snapshot it took first', async () => {
    const { queue } = await openSaveQueue({ objectId: id, userId: 'u1', isOwner: true, baseRevision: 3, client });
    await expect(queue.applyVersion({ version: 1, title: 'Old', content: 'old', content_json: null, summary: null, key_points: [] }))
      .resolves.toBe(7);
  });

  it('snapshot sends what you typed before calling the RPC', async () => {
    const { queue } = await openSaveQueue({ objectId: id, userId: 'u1', isOwner: true, baseRevision: 3, client });
    queue.change({ title: 'Typed' });
    await expect(queue.snapshot()).resolves.toBe(7);
    expect(log).toEqual(['update', 'rpc']);
    expect(rpcArgs().at(-1)).toEqual({ p_object_id: id, p_fields: null, p_reason: null });
  });
});
