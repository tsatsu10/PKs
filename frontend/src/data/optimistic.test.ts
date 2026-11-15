import { describe, it, expect, vi } from 'vitest';
import { createTestQueryClient } from '../test/queryTestUtils';
import { optimistic } from './optimistic';

function deferred<T>() {
  let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('optimistic', () => {
  it('applies the cache change before the request settles', async () => {
    const client = createTestQueryClient();
    client.setQueryData(['a'], [1]);
    const d = deferred<string>();
    const p = optimistic(client, { keys: [{ queryKey: ['a'] }], apply: () => client.setQueryData(['a'], [1, 2]), run: () => d.promise });
    expect(client.getQueryData(['a'])).toEqual([1, 2]);
    d.resolve('ok');
    await expect(p).resolves.toBe('ok');
  });

  it('restores every snapshotted key and rethrows on failure', async () => {
    const client = createTestQueryClient();
    client.setQueryData(['a', 1], 'one');
    client.setQueryData(['a', 2], 'two');
    client.setQueryData(['b'], { x: 1 });
    const err = new Error('nope');
    const p = optimistic(client, {
      keys: [{ queryKey: ['a'] }, { queryKey: ['b'] }],
      apply: () => { client.setQueryData(['a', 1], 'ONE'); client.setQueryData(['a', 2], 'TWO'); client.setQueryData(['b'], { x: 2 }); },
      run: () => Promise.reject(err),
    });
    await expect(p).rejects.toBe(err);
    expect(client.getQueryData(['a', 1])).toBe('one');
    expect(client.getQueryData(['a', 2])).toBe('two');
    expect(client.getQueryData(['b'])).toEqual({ x: 1 });
  });

  it('removes a key that had no data before apply when rolling back', async () => {
    const client = createTestQueryClient();
    const p = optimistic(client, { keys: [{ queryKey: ['new'] }], apply: () => client.setQueryData(['new'], 'seeded'), run: () => Promise.reject(new Error('x')) });
    await expect(p).rejects.toThrow('x');
    expect(client.getQueryData(['new'])).toBeUndefined();
  });

  it('keeps the change and invalidates each filter on success', async () => {
    const client = createTestQueryClient();
    client.setQueryData(['a'], 1);
    const spy = vi.spyOn(client, 'invalidateQueries');
    await optimistic(client, { keys: [{ queryKey: ['a'] }, { queryKey: ['b'] }], apply: () => client.setQueryData(['a'], 2), run: async () => 'ok' });
    expect(client.getQueryData(['a'])).toBe(2);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['a'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['b'] });
  });
});
