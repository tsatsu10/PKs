import type { Query, QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { del, get, keys, set } from 'idb-keyval';
import { queryClient as defaultClient } from './queryClient';
import { registerUserDataHooks } from '../lib/userStorage';

export const PERSISTED_ROOTS = ['objects', 'object', 'taxonomy', 'templates', 'prompts'] as const;
export const CACHE_PREFIX = 'pks-query-cache:';
/** Bump when a persisted data shape changes; old caches are then ignored. */
export const CACHE_SCHEMA_VERSION = '1';
export const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export const cacheKey = (userId: string) => `${CACHE_PREFIX}${userId}`;

/** Large and rarely needed instantly: version history holds up to 50 full copies of an object. */
const NOT_PERSISTED_LEAVES = new Set(['versions']);

export function shouldPersistQuery(query: Query): boolean {
  return query.state.status === 'success'
    && (PERSISTED_ROOTS as readonly unknown[]).includes(query.queryKey[0])
    && !NOT_PERSISTED_LEAVES.has(String(query.queryKey[2]));
}

let active: { userId: string; enabled: boolean; unsubscribe: () => void } | null = null;
let lastClaimedUserId: string | null = null;

/** Restore this user's saved cache, then keep saving it. Resolves once the restore has finished. */
export async function startPersisting(userId: string, client: QueryClient = defaultClient): Promise<void> {
  if (active?.userId === userId) return;
  stopPersisting();
  const session = { userId, enabled: true, unsubscribe: () => {} };
  const persister = createAsyncStoragePersister({
    key: cacheKey(userId),
    throttleTime: 1000,
    storage: {
      getItem: async (k) => (await get<string>(k)) ?? null,
      // A save already scheduled when persistence stopped must not recreate the entry.
      setItem: async (k, v) => { if (session.enabled) await set(k, v); },
      removeItem: (k) => del(k),
    },
  });
  const [unsubscribe, restored] = persistQueryClient({
    queryClient: client,
    persister,
    maxAge: CACHE_MAX_AGE,
    buster: CACHE_SCHEMA_VERSION,
    dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
  });
  session.unsubscribe = unsubscribe;
  active = session;
  await restored.catch(() => undefined);
}

export function stopPersisting(): void {
  if (!active) return;
  active.enabled = false;
  active.unsubscribe();
  active = null;
}

/** Explicit logout: forget everything in memory and delete the owner's saved cache. */
export async function dropQueryCache(ownerId: string | null, client: QueryClient = defaultClient): Promise<void> {
  stopPersisting();
  client.clear();
  lastClaimedUserId = null;
  const all = await keys();
  await Promise.all(all
    .filter((k) => typeof k === 'string' && k.startsWith(CACHE_PREFIX) && (ownerId == null || k === cacheKey(ownerId)))
    .map((k) => del(k)));
}

/** Sign-in: a different user than the last one clears memory; other users' saved caches are deleted. */
export async function claimQueryCache(userId: string, client: QueryClient = defaultClient): Promise<void> {
  if (lastClaimedUserId !== null && lastClaimedUserId !== userId) {
    stopPersisting();
    client.clear();
  }
  lastClaimedUserId = userId;
  const all = await keys();
  await Promise.all(all
    .filter((k) => typeof k === 'string' && k.startsWith(CACHE_PREFIX) && k !== cacheKey(userId))
    .map((k) => del(k)));
}

/** Called once from QueryProvider's module: logout and sign-in drive the cache lifecycle. */
export function connectCacheToSession(): () => void {
  return registerUserDataHooks({
    // Async IndexedDB work; nothing waits for it because each user only reads their own key.
    onClear: (owner) => { void dropQueryCache(owner).catch(() => undefined); },
    onClaim: (userId) => { void claimQueryCache(userId).catch(() => undefined); },
  });
}
