/**
 * The unsent edits of one object, kept in IndexedDB so they survive a reload, a crash or a
 * closed tab. Keyed by user, so a sign-out (or another user signing in) can remove them.
 *
 * As the tab closes there is also a synchronous copy in localStorage: an IndexedDB write started
 * then may never commit, because the page is gone before it finishes. Reads take the newer copy.
 */
import { del, get, keys, set } from 'idb-keyval';
import type { SaveFields } from './saveQueue';

export type LocalCopy = { fields: SaveFields; baseRevision: number };
/** As stored: `at` (ms) decides which of the two copies is newer. */
type Stored = LocalCopy & { at?: number };

const PREFIX = 'pks-pending-save:';
const SYNC_PREFIX = 'pks-pending-save-sync:';
export const LOCAL_COPY_THROTTLE_MS = 150;

export const localCopyKey = (userId: string, objectId: string) => `${PREFIX}${userId}:${objectId}`;
const syncKey = (userId: string, objectId: string) => `${SYNC_PREFIX}${userId}:${objectId}`;

type Scheduled = { timer: ReturnType<typeof setTimeout>; value: Stored };
const scheduled = new Map<string, Scheduled>();

function cancel(key: string) {
  const s = scheduled.get(key);
  if (s) clearTimeout(s.timer);
  scheduled.delete(key);
}

const stamp = (value: LocalCopy): Stored => ({ fields: value.fields, baseRevision: value.baseRevision, at: Date.now() });
const strip = (value: Stored): LocalCopy => ({ fields: value.fields, baseRevision: value.baseRevision });

function readSync(userId: string, objectId: string): Stored | null {
  try {
    const raw = localStorage.getItem(syncKey(userId, objectId));
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function removeSync(match: (key: string) => boolean) {
  try {
    const found: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(SYNC_PREFIX) && match(key.slice(SYNC_PREFIX.length))) found.push(key);
    }
    found.forEach((key) => localStorage.removeItem(key));
  } catch { /* storage blocked */ }
}

export async function readLocalCopy(userId: string, objectId: string): Promise<LocalCopy | null> {
  let stored: Stored | null = null;
  try {
    stored = ((await get(localCopyKey(userId, objectId))) as Stored | undefined) ?? null;
  } catch { /* fall back to the synchronous copy */ }
  const sync = readSync(userId, objectId);
  const newest = sync && (!stored || (sync.at ?? 0) > (stored.at ?? 0)) ? sync : stored;
  return newest ? strip(newest) : null;
}

/** Write now (closing the tab, or a save just changed the base). */
export async function writeLocalCopyNow(userId: string, objectId: string, value: LocalCopy): Promise<void> {
  const key = localCopyKey(userId, objectId);
  cancel(key);
  try { await set(key, stamp(value)); } catch { /* storage full or blocked: the queue still holds the edit */ }
}

/**
 * Write before returning (the tab is closing). localStorage blocks while it writes, so this is
 * only for that moment; a copy too big for it is skipped and the IndexedDB copy has to do.
 */
export function writeLocalCopySync(userId: string, objectId: string, value: LocalCopy): void {
  try { localStorage.setItem(syncKey(userId, objectId), JSON.stringify(stamp(value))); } catch { /* full or blocked */ }
}

/** Throttled: at most one write per 150 ms per object, always of the latest value. */
export function writeLocalCopy(userId: string, objectId: string, value: LocalCopy): void {
  const key = localCopyKey(userId, objectId);
  const s = scheduled.get(key);
  if (s) { s.value = stamp(value); return; }
  const entry: Scheduled = {
    value: stamp(value),
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
  removeSync((k) => k === `${userId}:${objectId}`);
  try { await del(key); } catch { /* ignore */ }
}

/** `match` gets "<userId>:<objectId>". */
async function deleteMatching(match: (userAndObject: string) => boolean): Promise<void> {
  for (const key of [...scheduled.keys()]) if (match(key.slice(PREFIX.length))) cancel(key);
  removeSync(match);
  try {
    const all = await keys();
    await Promise.all(all
      .filter((k): k is string => typeof k === 'string' && k.startsWith(PREFIX) && match(k.slice(PREFIX.length)))
      .map((k) => del(k)));
  } catch { /* ignore */ }
}

/** Sign-out: one owner's copies, or every copy when the owner isn't known. */
export function deleteLocalCopies(ownerId: string | null): Promise<void> {
  return deleteMatching((k) => ownerId == null || k.startsWith(`${ownerId}:`));
}

/** Sign-in: every copy that belongs to someone else. */
export function deleteOtherUsersLocalCopies(userId: string): Promise<void> {
  return deleteMatching((k) => !k.startsWith(`${userId}:`));
}
