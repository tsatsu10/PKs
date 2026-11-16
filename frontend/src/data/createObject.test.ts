import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { clear } from 'idb-keyval';
import { onlineManager } from '@tanstack/react-query';
import { createTestQueryClient } from '../test/queryTestUtils';
import { saveHarness } from '../features/object/save/testHarness';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../test/supabaseMock').mockSupabase> }));
vi.mock('../lib/supabase', async () => {
  const { mockSupabase } = await import('../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});

import { createObject, whenCreated, useCreateState } from './createObject';
import { objectDetailQuery } from './objectDetail';
import { qk } from './keys';
import { openSaveQueue, disposeAllSaveQueues } from '../features/object/save/saveQueue';
import { readLocalCopy } from '../features/object/save/localCopy';

type Call = { table: string; ops: Array<[string, unknown[]]> };
type R = { data: unknown; error: unknown };
const isInsert = (c: Call) => c.ops.some(([m]) => m === 'insert');
const objectInserts = () => sb.current!.calls.filter((c) => c.table === 'knowledge_objects' && isInsert(c));

/** Insert results, in order; each is a value or a promise the test settles. */
let inserts: Array<R | Promise<R>> = [];
let log: string[] = [];
function respond(call: Call): R {
  if (call.table === 'knowledge_objects' && isInsert(call)) {
    log.push('insert');
    return (inserts.shift() ?? { data: null, error: null }) as R;
  }
  if (call.table === 'knowledge_objects' && call.ops.some(([m]) => m === 'maybeSingle')) log.push('read');
  return { data: call.ops.some(([m]) => m === 'maybeSingle') ? { id: 'x', revision: 1 } : [], error: null };
}

function held() {
  let resolve!: (r: R) => void;
  const promise = new Promise<R>((r) => { resolve = r; });
  return { promise, resolve };
}

const ROW = { type: 'note', title: 'New', content: 'body' };
const OK: R = { data: null, error: null };
const DOWN: R = { data: null, error: { code: 'PGRST000', message: 'down' } };
const DUP: R = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "knowledge_objects_pkey"' } };
const SLUG_DUP: R = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "idx_knowledge_objects_user_slug"' } };

beforeEach(() => {
  sb.current!.calls.length = 0;
  sb.current!.respond = respond as never;
  inserts = [];
  log = [];
});
afterEach(() => { disposeAllSaveQueues(); });

describe('createObject', () => {
  it('returns a new uuid and seeds the detail cache before the insert finishes', async () => {
    const client = createTestQueryClient();
    const h = held();
    inserts = [h.promise];
    const id = createObject({ userId: 'u1', row: ROW }, client);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(client.getQueryData(qk.object.detail(id))).toMatchObject({ id, user_id: 'u1', title: 'New', is_deleted: false, revision: 1 });
    expect(client.getQueryData(qk.object.tags(id))).toEqual([]);
    expect(objectInserts()[0].ops).toContainEqual(['insert', [expect.objectContaining({ id, user_id: 'u1', title: 'New' })]]);
    h.resolve(OK);
    await whenCreated(id);
  });

  it('reports pending, then none once the insert succeeds, and calls onCreated', async () => {
    const client = createTestQueryClient();
    const h = held();
    inserts = [h.promise];
    const onCreated = vi.fn();
    const id = createObject({ userId: 'u1', row: ROW, onCreated }, client);
    const { result } = renderHook(() => useCreateState(id));
    expect(result.current.status).toBe('pending');
    await act(async () => { h.resolve(OK); await whenCreated(id); });
    expect(result.current.status).toBe('none');
    expect(onCreated).toHaveBeenCalledWith(id);
  });

  it('a failed insert shows failed and keeps whenCreated waiting until Retry succeeds', async () => {
    const client = createTestQueryClient();
    inserts = [DOWN, OK];
    const id = createObject({ userId: 'u1', row: ROW, tagIds: ['t1'] }, client);
    const { result } = renderHook(() => useCreateState(id));
    await waitFor(() => expect(result.current.status).toBe('failed'));
    let done = false;
    void whenCreated(id).then(() => { done = true; });
    await new Promise((r) => setTimeout(r, 10));
    expect(done).toBe(false);
    await act(async () => { result.current.retry(); await whenCreated(id); });
    expect(done).toBe(true);
    expect(result.current.status).toBe('none');
    const ids = objectInserts().map((c) => (c.ops.find(([m]) => m === 'insert')![1][0] as { id: string }).id);
    expect(ids).toEqual([id, id]);
    const tagInsert = sb.current!.calls.find((c) => c.table === 'knowledge_object_tags');
    expect(tagInsert?.ops).toContainEqual(['insert', [[{ knowledge_object_id: id, tag_id: 't1' }]]]);
  });

  it('a retry that finds the row already inserted (23505) still finishes the create', async () => {
    const client = createTestQueryClient();
    inserts = [DOWN, DUP];
    const onCreated = vi.fn();
    const id = createObject({ userId: 'u1', row: ROW, domainIds: ['d1'], onCreated }, client);
    const { result } = renderHook(() => useCreateState(id));
    await waitFor(() => expect(result.current.status).toBe('failed'));
    await act(async () => { result.current.retry(); await whenCreated(id); });
    expect(result.current.status).toBe('none');
    expect(sb.current!.calls.some((c) => c.table === 'knowledge_object_domains')).toBe(true);
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it('a 23505 on another unique index (the slug) is a real failure, not a landed insert', async () => {
    const client = createTestQueryClient();
    inserts = [SLUG_DUP];
    const id = createObject({ userId: 'u1', row: ROW }, client);
    const { result } = renderHook(() => useCreateState(id));
    await waitFor(() => expect(result.current.status).toBe('failed'));
  });

  it('whenCreated resolves at once for an object that was never created here', async () => {
    await expect(whenCreated('not-pending')).resolves.toBeUndefined();
  });

  it('a detail fetch started during the create reads the row only after the insert', async () => {
    const client = createTestQueryClient();
    const h = held();
    inserts = [h.promise];
    const id = createObject({ userId: 'u1', row: ROW }, client);
    const fetching = client.fetchQuery({ ...objectDetailQuery(id), staleTime: 0 });
    await new Promise((r) => setTimeout(r, 10));
    expect(log).toEqual(['insert']);
    h.resolve(OK);
    await fetching;
    expect(log).toEqual(['insert', 'read']);
  });
});

describe('createObject and the save queue', () => {
  const h = saveHarness(() => sb.current!);
  beforeEach(async () => { await clear(); localStorage.clear(); });

  it('edits typed before the insert lands are saved after it, never blocked as deleted', async () => {
    const client = createTestQueryClient();
    const insert = held();
    const id = createObject({ userId: 'u1', row: ROW }, client);
    h.reset({ id, revision: 1 });
    // The harness answers updates from its fake row; inserts wait on the test.
    const harness = sb.current!.respond;
    sb.current!.respond = ((call: Call) => {
      if (isInsert(call)) { log.push('insert'); return insert.promise; }
      if (call.ops.some(([m]) => m === 'update')) log.push('update');
      return harness(call as never);
    }) as never;
    const { queue } = await openSaveQueue({ objectId: id, userId: 'u1', isOwner: true, baseRevision: 1, client });
    queue.change({ title: 'Typed early' });
    const flushing = queue.flush();
    await new Promise((r) => setTimeout(r, 20));
    expect(log).not.toContain('update');
    expect(queue.getState().status).not.toBe('blocked');
    insert.resolve(OK);
    await flushing;
    expect(log.filter((x) => x === 'update')).toHaveLength(1);
    expect(h.patch(0)).toMatchObject({ title: 'Typed early' });
    expect(queue.getState().status).not.toBe('blocked');
  });

  it('edits made while the create has failed are kept locally, then all saved after Retry', async () => {
    const client = createTestQueryClient();
    inserts = [DOWN, OK];
    const id = createObject({ userId: 'u1', row: ROW }, client);
    h.reset({ id, revision: 1 });
    const harness = sb.current!.respond;
    sb.current!.respond = ((call: Call) => {
      if (isInsert(call)) return respond(call);
      if (call.ops.some(([m]) => m === 'update')) log.push('update');
      return harness(call as never);
    }) as never;
    const { result } = renderHook(() => useCreateState(id));
    await waitFor(() => expect(result.current.status).toBe('failed'));

    const { queue } = await openSaveQueue({ objectId: id, userId: 'u1', isOwner: true, baseRevision: 1, client });
    queue.change({ title: 'First' });
    const flushing = queue.flush();
    queue.change({ content: 'Edited body' });
    queue.change({ title: 'Second' });
    await new Promise((r) => setTimeout(r, 20));
    expect(log).not.toContain('update');
    expect(queue.getState().status).not.toBe('blocked');
    expect(queue.pending()).toMatchObject({ title: 'Second', content: 'Edited body' });
    await vi.waitFor(async () => expect((await readLocalCopy('u1', id))?.fields).toMatchObject({ title: 'Second', content: 'Edited body' }));

    await act(async () => { result.current.retry(); await whenCreated(id); });
    expect(result.current.status).toBe('none');
    await flushing;
    await vi.waitFor(() => expect(h.row).toMatchObject({ title: 'Second', content: 'Edited body' }));
    expect(log.indexOf('update')).toBeGreaterThan(log.lastIndexOf('insert'));
    await vi.waitFor(() => expect(queue.getState().status).toBe('saved'));
    expect(queue.pending()).toEqual({});
    await vi.waitFor(async () => expect(await readLocalCopy('u1', id)).toBeNull());
  });

  it('a connection lost while waiting for the insert holds the edit back as offline', async () => {
    const client = createTestQueryClient();
    const insert = held();
    const id = createObject({ userId: 'u1', row: ROW }, client);
    h.reset({ id, revision: 1 });
    const harness = sb.current!.respond;
    sb.current!.respond = ((call: Call) => {
      if (isInsert(call)) return insert.promise;
      if (call.ops.some(([m]) => m === 'update')) log.push('update');
      return harness(call as never);
    }) as never;
    const { queue } = await openSaveQueue({ objectId: id, userId: 'u1', isOwner: true, baseRevision: 1, client });
    queue.change({ title: 'Typed early' });
    const flushing = queue.flush();
    await new Promise((r) => setTimeout(r, 20));
    onlineManager.setOnline(false);
    try {
      insert.resolve(OK);
      await flushing;
      expect(log).not.toContain('update');
      expect(queue.getState().status).toBe('offline');
      expect(queue.pending()).toMatchObject({ title: 'Typed early' });
    } finally {
      onlineManager.setOnline(true);
    }
    await vi.waitFor(() => expect(log.filter((x) => x === 'update')).toHaveLength(1));
  });
});
