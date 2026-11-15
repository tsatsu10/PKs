import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { clear } from 'idb-keyval';
import { createTestQueryClient } from '../../../test/queryTestUtils';
import { saveHarness } from './testHarness';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../../../test/supabaseMock').mockSupabase> }));
vi.mock('../../../lib/supabase', async () => {
  const { mockSupabase } = await import('../../../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});

import { openSaveQueue, disposeAllSaveQueues, connectSaveQueuesToSession } from './saveQueue';
import { readLocalCopy, writeLocalCopyNow } from './localCopy';
import { clearUserData, claimUserData } from '../../../lib/userStorage';
import { qk } from '../../../data/keys';
import { keepaliveActive } from '../../../lib/keepalive';

const h = saveHarness(() => sb.current!);
let n = 0;
let id = '';
const open = (over: Partial<Parameters<typeof openSaveQueue>[0]> = {}) =>
  openSaveQueue({ objectId: id, userId: 'u1', isOwner: true, baseRevision: 3, client: createTestQueryClient(), ...over });

beforeAll(() => { connectSaveQueuesToSession(); });
beforeEach(async () => {
  await clear();
  localStorage.clear();
  n += 1;
  id = `0000000${n}-aaaa-bbbb-cccc-000000000000`;
  h.reset({ id, revision: 3 });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
});
afterEach(() => {
  disposeAllSaveQueues();
  vi.useRealTimers();
});

describe('saveQueue: debounce', () => {
  it('coalesces changes and sends once, 800 ms after the last one', async () => {
    const { queue } = await open();
    queue.change({ title: 'A' });
    await vi.advanceTimersByTimeAsync(500);
    queue.change({ summary: 'S' });
    await vi.advanceTimersByTimeAsync(799);
    expect(h.updates()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.updates()).toHaveLength(1);
    expect(h.patch(0)).toMatchObject({ title: 'A', summary: 'S' });
  });

  it('continuous typing still sends after 5 s', async () => {
    const { queue } = await open();
    for (let t = 0; t < 5000; t += 300) {
      queue.change({ content: `c${t}` });
      await vi.advanceTimersByTimeAsync(300);
      if (t + 300 < 5000) expect(h.updates()).toHaveLength(0);
    }
    expect(h.updates()).toHaveLength(1);
  });
});

describe('saveQueue: one request in flight', () => {
  it('holds changes made during a save and sends them next, based on the returned revision', async () => {
    const { queue } = await open();
    const release = h.hold();
    queue.change({ title: 'A' });
    await vi.advanceTimersByTimeAsync(800);
    queue.change({ title: 'B' });
    queue.change({ summary: 'S' });
    queue.change({ content: 'C' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.updates()).toHaveLength(1);
    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.updates()).toHaveLength(2);
    expect(h.patch(1)).toMatchObject({ title: 'B', summary: 'S', content: 'C' });
    expect(h.revision(1)).toBe(4);
  });
});

describe('saveQueue: patch rules', () => {
  it('an owner title change sends a slug', async () => {
    const { queue } = await open();
    queue.change({ title: 'New title' });
    await vi.advanceTimersByTimeAsync(800);
    expect(String(h.patch(0).slug)).toMatch(/^new-title-/);
  });

  it('an editor title change sends no slug, and owner-only fields are dropped', async () => {
    const { queue } = await open({ isOwner: false });
    queue.change({ title: 'New', status: 'archived', source: 'src' });
    await vi.advanceTimersByTimeAsync(800);
    expect(h.patch(0)).toEqual({ title: 'New', source: 'src' });
  });
});

describe('saveQueue: success', () => {
  it('caches the returned row, shows saved then idle, and deletes the local copy', async () => {
    const client = createTestQueryClient();
    const { queue } = await open({ client });
    const seen: string[] = [];
    queue.subscribe(() => seen.push(queue.getState().status));
    queue.change({ title: 'A' });
    await vi.advanceTimersByTimeAsync(800);
    expect(client.getQueryData(qk.object.detail(id))).toMatchObject({ title: 'A', revision: 4 });
    expect(queue.getState().status).toBe('saved');
    expect(seen).toContain('saving');
    await vi.advanceTimersByTimeAsync(2000);
    expect(queue.getState().status).toBe('idle');
    await vi.waitFor(async () => expect(await readLocalCopy('u1', id)).toBeNull());
  });
});

describe('saveQueue: local copy', () => {
  it('is written 150 ms after a change', async () => {
    const { queue } = await open();
    h.hold();
    queue.change({ title: 'A' });
    await vi.advanceTimersByTimeAsync(150);
    await vi.waitFor(async () => expect(await readLocalCopy('u1', id)).toMatchObject({ fields: { title: 'A' }, baseRevision: 3 }));
  });

  it('a stored copy is restored and sent with its own base revision', async () => {
    await writeLocalCopyNow('u1', id, { fields: { title: 'Unsent' }, baseRevision: 2 });
    const { restored } = await open();
    expect(restored).toEqual({ fields: { title: 'Unsent' }, baseRevision: 2 });
    await vi.advanceTimersByTimeAsync(800);
    expect(h.updates()).toHaveLength(1);
    expect(h.patch(0)).toMatchObject({ title: 'Unsent' });
    expect(h.revision(0)).toBe(2);
  });
});

describe('saveQueue: leaving', () => {
  it('pagehide sends at once', async () => {
    const { queue } = await open();
    queue.change({ title: 'A' });
    await vi.advanceTimersByTimeAsync(100);
    window.dispatchEvent(new Event('pagehide'));
    expect(h.updates()).toHaveLength(1);
  });

  it('pagehide keeps the edit synchronously, before any await (the tab may be gone after)', async () => {
    const { queue } = await open();
    queue.change({ title: 'A' });
    queue.change({ title: 'AB' });
    window.dispatchEvent(new Event('pagehide'));
    const key = Object.keys(localStorage).find((k) => k.endsWith(`:u1:${id}`));
    expect(key).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(key!)!)).toMatchObject({ fields: { title: 'AB' } });
  });

  it('pagehide sends with keepalive, so the request outlives the tab', async () => {
    const { queue } = await open();
    queue.change({ title: 'A' });
    window.dispatchEvent(new Event('pagehide'));
    expect(keepaliveActive()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(keepaliveActive()).toBe(false);
  });

  it('leaving within the debounce window still saves (flush, then dispose)', async () => {
    const { queue } = await open();
    queue.change({ title: 'A' });
    await vi.advanceTimersByTimeAsync(200);
    const done = queue.flush().finally(() => queue.dispose());
    expect(h.updates()).toHaveLength(1);
    await done;
    expect(h.patch(0)).toMatchObject({ title: 'A' });
  });

  it('opening the same object again returns the same queue', async () => {
    const a = await open();
    const b = await open();
    expect(b.queue).toBe(a.queue);
  });

  it('a queue opened twice keeps working until both have disposed it', async () => {
    const a = await open();
    await open();
    a.queue.dispose();
    a.queue.change({ title: 'A' });
    window.dispatchEvent(new Event('pagehide'));
    expect(h.updates()).toHaveLength(1);
  });
});

describe('saveQueue: sign out', () => {
  it('sign out stops sending and deletes the local copy', async () => {
    claimUserData('u1');
    const { queue } = await open();
    queue.change({ title: 'A' });
    await vi.advanceTimersByTimeAsync(150);
    clearUserData();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.updates()).toHaveLength(0);
    await vi.waitFor(async () => expect(await readLocalCopy('u1', id)).toBeNull());
  });

  it('another user signing in deletes the old user\'s copies; session expiry keeps them', async () => {
    claimUserData('u1');
    await writeLocalCopyNow('u1', id, { fields: { title: 'Mine' }, baseRevision: 3 });
    claimUserData('u1'); // same user back after an expiry
    await vi.advanceTimersByTimeAsync(0);
    expect(await readLocalCopy('u1', id)).not.toBeNull();
    claimUserData('other');
    await vi.waitFor(async () => expect(await readLocalCopy('u1', id)).toBeNull());
  });
});
