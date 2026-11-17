/**
 * The save engine for one object (spec 2b "The save engine"): debounce, one request in flight,
 * the IndexedDB local copy, flush on hide, and the revision check. One queue per object id,
 * kept in a module-level registry so leaving the page doesn't lose an edit still being sent.
 * The sending itself is in queueCore.ts; this file adds the conflict and history actions.
 */
import { supabase } from '../../../lib/supabase';
import { registerUserDataHooks } from '../../../lib/userStorage';
import { fetchSaveCheck, invalidateObjectVersions, objectDetailQuery } from '../../../data/objectDetail';
import { readLocalCopy, deleteLocalCopy, deleteLocalCopies, deleteOtherUsersLocalCopies } from './localCopy';
import { QueueCore, onForget } from './queueCore';
import {
  DELETED_MESSAGE, KEEP_MINE_REASON, LOAD_THEIRS_REASON, SNAPSHOT_KEYS,
  type Options, type SaveFields, type SaveState, type VersionFields,
} from './saveTypes';

export {
  DEBOUNCE_MS, MAX_WAIT_MS, SAVED_FADE_MS, RETRY_DELAYS_MS, DELETED_MESSAGE, NO_ACCESS_MESSAGE,
  KEEP_MINE_REASON, LOAD_THEIRS_REASON,
} from './saveTypes';
export type { SaveFields, SaveStatus, SaveState, VersionFields } from './saveTypes';

export interface SaveQueue {
  readonly objectId: string;
  getState(): SaveState;
  subscribe(listener: () => void): () => void;
  change(fields: SaveFields): void;
  /** Send now, skipping the debounce; resolves when nothing is pending or the queue is not sending. */
  flush(): Promise<void>;
  pending(): SaveFields;
  baseRevision(): number;
  /** Stop timers and listeners; keeps the local copy. */
  dispose(): void;
  /** Conflict: save their version to history, then overwrite it with mine. */
  keepMine(): Promise<void>;
  /** Conflict: save my unsent edit to history, drop it, and reload theirs (emits onReloaded). */
  loadTheirs(): Promise<void>;
  /** Save version: flush, then snapshot the current row. Resolves to the new version number. */
  snapshot(reason?: string): Promise<number>;
  /** Restore: flush, snapshot the current row, then save the version's fields (emits onReloaded). */
  /** Restore `v`: resolves to the version number of the snapshot taken just before (for Undo). */
  applyVersion(v: VersionFields): Promise<number>;
  /** The fields on the page must be re-seeded from the server row plus pending(). */
  onReloaded(listener: () => void): () => void;
  /**
   * A newer server row arrived (e.g. the refetch after opening from a cached copy). With nothing
   * typed yet, move the base to it and re-seed the page (emits onReloaded); otherwise leave it.
   */
  adoptServerRevision(revision: number): void;
}

class Queue extends QueueCore implements SaveQueue {
  private reloadListeners = new Set<() => void>();

  private async rpcSnapshot(fields: SaveFields | null, reason: string | null): Promise<number> {
    const { data, error } = await supabase.rpc('snapshot_knowledge_object', {
      p_object_id: this.objectId, p_fields: fields, p_reason: reason,
    });
    if (error) throw error;
    void invalidateObjectVersions(this.objectId, this.client).catch(() => undefined);
    return data as number;
  }

  async keepMine(): Promise<void> {
    await this.rpcSnapshot(null, KEEP_MINE_REASON);
    const check = await fetchSaveCheck(this.objectId, this.userId);
    if (!check.row || check.row.is_deleted) { this.block(DELETED_MESSAGE); return; }
    this.base = check.row.revision;
    this.setState('pending');
    await this.flush();
  }

  async loadTheirs(): Promise<void> {
    const pending = this.pending();
    const mine: Record<string, unknown> = {};
    for (const k of SNAPSHOT_KEYS) if (k in pending) mine[k] = pending[k];
    await this.rpcSnapshot(mine as SaveFields, LOAD_THEIRS_REASON);
    this.clearTimers();
    this.stopRetry();
    this.queued = {};
    await deleteLocalCopy(this.userId, this.objectId);
    const row = await this.client.fetchQuery({ ...objectDetailQuery(this.objectId), staleTime: 0 });
    if (row) this.base = row.revision;
    this.setState('idle');
    this.reloadListeners.forEach((l) => l());
  }

  async snapshot(reason?: string): Promise<number> {
    await this.flush();
    return this.rpcSnapshot(null, reason ?? null);
  }

  async applyVersion(v: VersionFields): Promise<number> {
    await this.flush();
    const before = await this.snapshot(`Before restoring v${v.version}`);
    this.change({
      title: v.title,
      content: v.content ?? '',
      content_json: v.content_json,
      summary: v.summary,
      key_points: Array.isArray(v.key_points) ? v.key_points : [],
    });
    await this.flush();
    this.reloadListeners.forEach((l) => l());
    return before;
  }

  adoptServerRevision = (revision: number) => {
    if (this.closed || revision <= this.base || this.hasUnsent() || this.sending) return;
    this.base = revision;
    this.reloadListeners.forEach((l) => l());
  };

  onReloaded = (listener: () => void) => {
    this.reloadListeners.add(listener);
    return () => { this.reloadListeners.delete(listener); };
  };
}

const registry = new Map<string, Queue>();
const opening = new Map<string, Promise<Queue>>();

onForget((queue, onlyIfCurrent) => {
  if (!onlyIfCurrent || registry.get(queue.objectId) === queue) registry.delete(queue.objectId);
});

export async function openSaveQueue(opts: Options): Promise<{
  queue: SaveQueue; restored: { fields: SaveFields; baseRevision: number } | null;
}> {
  const existing = registry.get(opts.objectId);
  if (existing && existing.userId === opts.userId) {
    existing.attach(opts.isOwner, opts.client);
    const fields = existing.pending();
    return { queue: existing, restored: Object.keys(fields).length ? { fields, baseRevision: existing.baseRevision() } : null };
  }
  let pendingOpen = opening.get(opts.objectId);
  let restored: { fields: SaveFields; baseRevision: number } | null = null;
  if (!pendingOpen) {
    pendingOpen = (async () => {
      const stored = await readLocalCopy(opts.userId, opts.objectId);
      const queue = new Queue(opts);
      if (stored && Object.keys(stored.fields ?? {}).length) {
        restored = { fields: stored.fields, baseRevision: stored.baseRevision };
        queue.seed(stored.fields, stored.baseRevision);
      }
      registry.set(opts.objectId, queue);
      return queue;
    })().finally(() => opening.delete(opts.objectId));
    opening.set(opts.objectId, pendingOpen);
    const queue = await pendingOpen;
    queue.attach(opts.isOwner, opts.client);
    return { queue, restored };
  }
  const queue = await pendingOpen;
  queue.attach(opts.isOwner, opts.client);
  const fields = queue.pending();
  return { queue, restored: Object.keys(fields).length ? { fields, baseRevision: queue.baseRevision() } : null };
}

/** Send every queue's edits now (bounded by `timeoutMs`), e.g. before signing out. */
export async function flushAllSaveQueues(timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs); });
  const flushes = Promise.all([...registry.values()].map((q) => q.flush().catch(() => undefined)));
  await Promise.race([flushes, timeout]);
  clearTimeout(timer);
}

const confirmDiscard = (n: number) => window.confirm(
  `You have unsaved changes on ${n === 1 ? 'one object' : `${n} objects`} (offline, or waiting for you to resolve a conflict). Sign out and discard them?`,
);

/**
 * Before a deliberate sign-out (which deletes local copies): save what can be saved, then ask
 * before discarding the rest. Resolves to false when the user chose to stay signed in.
 */
export async function prepareSignOut(confirm: (unsent: number) => boolean = confirmDiscard): Promise<boolean> {
  await flushAllSaveQueues(3000);
  const unsent = [...registry.values()].filter((q) => !q.closed && q.hasUnsentEdits()).length;
  return unsent === 0 || confirm(unsent);
}

/** Sign-out: stop every queue at once (their local copies are deleted by the caller). */
export function disposeAllSaveQueues(): void {
  for (const queue of registry.values()) queue.close();
  registry.clear();
}

/** Called once at startup: logout deletes local copies, another user signing in deletes the old ones. */
export function connectSaveQueuesToSession(): () => void {
  return registerUserDataHooks({
    onClear: (owner) => {
      disposeAllSaveQueues();
      void deleteLocalCopies(owner);
    },
    onClaim: (userId) => {
      for (const [id, queue] of registry) {
        if (queue.userId !== userId) { queue.close(); registry.delete(id); }
      }
      void deleteOtherUsersLocalCopies(userId);
    },
  });
}
