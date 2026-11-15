import { describe, it, expect, vi, afterEach } from 'vitest';
import { keepaliveActive, keepaliveFetch, withKeepalive, KEEPALIVE_MAX_BYTES } from './keepalive';

afterEach(() => vi.useRealTimers());

describe('keepalive', () => {
  it('is on for requests started in the same task, then off', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    expect(keepaliveActive()).toBe(false);
    withKeepalive(() => { expect(keepaliveActive()).toBe(true); });
    await Promise.resolve();
    expect(keepaliveActive()).toBe(true); // microtasks (supabase-js building the request) still count
    await vi.advanceTimersByTimeAsync(1);
    expect(keepaliveActive()).toBe(false);
  });

  it('adds keepalive to small requests while on, and never otherwise', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const base = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response('[]')));
    const f = keepaliveFetch(base);
    await f('/a', { method: 'PATCH', body: '{"title":"x"}' });
    expect(base.mock.calls[0][1]).not.toHaveProperty('keepalive');

    withKeepalive(() => { void f('/a', { method: 'PATCH', body: '{"title":"x"}' }); });
    expect(base.mock.calls[1][1]).toMatchObject({ keepalive: true });

    // Browsers reject keepalive bodies over 64 KB; a big document goes as a normal request.
    withKeepalive(() => { void f('/a', { method: 'PATCH', body: 'é'.repeat(KEEPALIVE_MAX_BYTES / 2 + 1) }); });
    expect(base.mock.calls[2][1]).not.toHaveProperty('keepalive');
  });
});
