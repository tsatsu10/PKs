/**
 * The unsent edits of one object, kept in IndexedDB so they survive a reload, a crash or a
 * closed tab. Keyed by user, so a sign-out (or another user signing in) can remove them.
 */
import { del, get, keys, set } from 'idb-keyval';
import type { SaveFields } from './saveQueue';

export type LocalCopy = { fields: SaveFields; baseRevision: number };

const PREFIX = 'pks-pending-save:';
export const LOCAL_COPY_THROTTLE_MS = 150;

export const localCopyKey = (userId: string, objectId: string) => `${PREFIX}${userId}:${objectId}`;

type Scheduled = { timer: ReturnType<typeof setTimeout>; value: LocalCopy };
const scheduled = new Map<string, Scheduled>();

function cancel(key: string) {
  const s = scheduled.get(key);
  if (s) clearTimeout(s.timer);
  scheduled.delete(key);
}

export async function readLocalCopy(userId: string, objectId: string): Promise<LocalCopy | null> {
  try {
    return ((await get(localCopyKey(userId, objectId))) as LocalCopy | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Write now (closing the tab, or a save just changed the base). */
export async function writeLocalCopyNow(userId: string, objectId: string, value: LocalCopy): Promise<void> {
  const key = localCopyKey(userId, objectId);
  cancel(key);
  try { await set(key, value); } catch { /* storage full or blocked: the queue still holds the edit */ }
}

/** Throttled: at most one write per 150 ms per object, always of the latest value. */
export function writeLocalCopy(userId: string, objectId: string, value: LocalCopy): void {
  const key = localCopyKey(userId, objectId);
  const s = scheduled.get(key);
  if (s) { s.value = value; return; }
  const entry: Scheduled = {
    value,
    timer: setTimeout(() => {
      scheduled.delete(key);
      void set(key, entry.value).catch(() => undefined);
    }, LOCAL_COPY_THROTTLE_MS),
  };
  scheduled.set(key, entry);
}

export async function deleteLocalCopy(userId: string, objectId: string): Promise<void> {
  const key = localCopyKey(userId, objectId);
  cancel(key);
  try { await del(key); } catch { /* ignore */ }
}

async function deleteMatching(match: (key: string) => boolean): Promise<void> {
  for (const key of [...scheduled.keys()]) if (match(key)) cancel(key);
  try {
    const all = await keys();
    await Promise.all(all.filter((k): k is string => typeof k === 'string' && k.startsWith(PREFIX) && match(k)).map((k) => del(k)));
  } catch { /* ignore */ }
}

/** Sign-out: one owner's copies, or every copy when the owner isn't known. */
export function deleteLocalCopies(ownerId: string | null): Promise<void> {
  return deleteMatching((k) => ownerId == null || k.startsWith(`${PREFIX}${ownerId}:`));
}

/** Sign-in: every copy that belongs to someone else. */
export function deleteOtherUsersLocalCopies(userId: string): Promise<void> {
  return deleteMatching((k) => !k.startsWith(`${PREFIX}${userId}:`));
}
