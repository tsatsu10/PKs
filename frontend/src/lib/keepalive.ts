/**
 * Requests that must outlive the page (the save sent as the tab closes). A request started with
 * `keepalive: true` is completed by the browser even after the page is gone; without it, closing
 * the tab cancels it.
 */

/** Browsers reject keepalive requests whose bodies add up to more than 64 KiB; stay under it. */
export const KEEPALIVE_MAX_BYTES = 60_000;

let active = false;

/**
 * Run `fn`; requests it starts in this task (including the microtasks supabase-js needs to build
 * them) go out with keepalive. Anything later, such as a retry after a response, goes as usual.
 */
export function withKeepalive<T>(fn: () => T): T {
  active = true;
  setTimeout(() => { active = false; }, 0);
  return fn();
}

export function keepaliveActive(): boolean {
  return active;
}

const encoder = new TextEncoder();

/** Wrap a fetch so requests made inside `withKeepalive` carry `keepalive: true` when small enough. */
export function keepaliveFetch(base: typeof fetch): typeof fetch {
  return (input, init) => {
    if (!active) return base(input, init);
    const body = init?.body;
    const size = body == null ? 0 : typeof body === 'string' ? encoder.encode(body).length : Number.POSITIVE_INFINITY;
    return size <= KEEPALIVE_MAX_BYTES ? base(input, { ...init, keepalive: true }) : base(input, init);
  };
}
