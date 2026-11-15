import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get, set, keys, clear } from 'idb-keyval';
import { onlineManager, useQuery } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { createTestQueryClient, renderWithClient } from '../test/queryTestUtils';
import {
  cacheKey, startPersisting, stopPersisting, dropQueryCache, claimQueryCache, shouldPersistQuery,
} from './persistence';
import { shouldRetry } from './queryClient';

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));

const flushPersist = () => new Promise((r) => setTimeout(r, 1200)); // persister throttle is 1000 ms

beforeEach(async () => { stopPersisting(); await clear(); onlineManager.setOnline(true); });

describe('shouldRetry', () => {
  it('retries network and server twice, auth once, others never', () => {
    expect(shouldRetry(0, { message: 'Failed to fetch' })).toBe(true);
    expect(shouldRetry(2, { message: 'Failed to fetch' })).toBe(false);
    expect(shouldRetry(1, { code: 'PGRST000', message: 'x' })).toBe(true);
    expect(shouldRetry(0, { code: 'PGRST301', message: 'JWT expired' })).toBe(true);
    expect(shouldRetry(1, { code: 'PGRST301', message: 'JWT expired' })).toBe(false);
    expect(shouldRetry(0, { code: '42501', message: 'x' })).toBe(false);
    expect(shouldRetry(0, { code: '23505', message: 'x' })).toBe(false);
  });
});

describe('shouldPersistQuery', () => {
  it('persists successful queries under allowed roots only', () => {
    const q = (key: unknown[], status: string) => ({ queryKey: key, state: { status } }) as never;
    expect(shouldPersistQuery(q(['object', '1', 'detail'], 'success'))).toBe(true);
    expect(shouldPersistQuery(q(['search', {}], 'success'))).toBe(false);
    expect(shouldPersistQuery(q(['notifications', 'recent'], 'success'))).toBe(false);
    expect(shouldPersistQuery(q(['object', '1', 'detail'], 'error'))).toBe(false);
    expect(shouldPersistQuery(q(['object', '1', 'versions'], 'success'))).toBe(false);
  });
});

describe('cache lifecycle', () => {
  it('persists, and an explicit logout deletes the entry and clears memory', async () => {
    const client = createTestQueryClient();
    await startPersisting('A', client);
    client.setQueryData(['object', '1', 'detail'], { id: '1', title: 'A note' });
    await flushPersist();
    expect(await get(cacheKey('A'))).toBeTruthy();

    await dropQueryCache('A', client);
    await flushPersist();
    expect(await get(cacheKey('A'))).toBeUndefined();
    expect(client.getQueryData(['object', '1', 'detail'])).toBeUndefined();
  });

  it('a different user signing in after an expiry never sees the first user\'s data', async () => {
    const client = createTestQueryClient();
    await claimQueryCache('A', client);
    await startPersisting('A', client);
    client.setQueryData(['object', '1', 'detail'], { id: '1', title: 'A private' });
    await flushPersist();
    stopPersisting(); // session expired: memory and IndexedDB are kept

    await claimQueryCache('B', client);
    expect(client.getQueryData(['object', '1', 'detail'])).toBeUndefined();
    expect((await keys()).filter((k) => String(k).startsWith('pks-query-cache:'))).toEqual([]);
  });

  it('the same user signing back in after an expiry keeps the cache', async () => {
    const client = createTestQueryClient();
    await claimQueryCache('A', client);
    client.setQueryData(['object', '1', 'detail'], { id: '1' });
    await claimQueryCache('A', client);
    expect(client.getQueryData(['object', '1', 'detail'])).toEqual({ id: '1' });
  });

  it('restores a saved cache and renders it with the network off', async () => {
    const first = createTestQueryClient();
    await startPersisting('A', first);
    first.setQueryData(['object', '1', 'detail'], { id: '1', title: 'Cached title' });
    await flushPersist();
    stopPersisting();

    onlineManager.setOnline(false);
    const second = createTestQueryClient();
    await startPersisting('A', second);
    const queryFn = vi.fn(() => Promise.reject(new Error('should not run')));
    function Probe() {
      const { data } = useQuery({ queryKey: ['object', '1', 'detail'], queryFn, staleTime: Infinity });
      return <p>{(data as { title?: string } | undefined)?.title ?? 'empty'}</p>;
    }
    renderWithClient(<Probe />, second);
    expect(await screen.findByText('Cached title')).toBeInTheDocument();
    expect(queryFn).not.toHaveBeenCalled();
  });

  it('shows a restored entry at once but refetches it, however fresh it looks', async () => {
    // The cache is written at most once a second, so after a quick reload the restored entry can
    // predate the last change (a save, an added link) while its timestamp still looks fresh.
    const first = createTestQueryClient();
    await startPersisting('A', first);
    first.setQueryData(['object', '1', 'links'], { title: 'Before the change' });
    await flushPersist();
    stopPersisting();

    const second = createTestQueryClient();
    await startPersisting('A', second);
    const queryFn = vi.fn(() => Promise.resolve({ title: 'From the server' }));
    function Probe() {
      const { data } = useQuery({ queryKey: ['object', '1', 'links'], queryFn, staleTime: 60_000 });
      return <p>{(data as { title?: string } | undefined)?.title ?? 'empty'}</p>;
    }
    renderWithClient(<Probe />, second);
    expect(screen.getByText('Before the change')).toBeInTheDocument();
    expect(await screen.findByText('From the server')).toBeInTheDocument();
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('ignores a cache written by another schema version', async () => {
    await set(cacheKey('A'), JSON.stringify({ buster: 'old', timestamp: Date.now(), clientState: { queries: [], mutations: [] } }));
    const client = createTestQueryClient();
    await startPersisting('A', client);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
