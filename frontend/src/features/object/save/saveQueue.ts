/**
 * The save engine for one object (spec 2b "The save engine"): debounce, one request in flight,
 * the IndexedDB local copy, flush on hide, and the revision check. One queue per object id,
 * kept in a module-level registry so leaving the page doesn't lose an edit still being sent.
 */
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { classifyError, getErrorMessage } from '../../../lib/errors';
import { reportError } from '../../../lib/reportError';
import { slugForTitle } from '../../../lib/objectForm';
import { registerUserDataHooks } from '../../../lib/userStorage';
import { withKeepalive } from '../../../lib/keepalive';
import { queryClient as defaultClient } from '../../../data/queryClient';
import { qk } from '../../../data/keys';
import { OBJECT_COLS, fetchObjectRow, fetchSaveCheck, invalidateObjectVersions, objectDetailQuery } from '../../../data/objectDetail';
import { isCreating, whenCreated } from '../../../data/createObject';
import { invalidateObjectLists, setObjectInLists } from '../../../data/objects';
import {
  readLocalCopy, writeLocalCopy, writeLocalCopyNow, writeLocalCopySync, deleteLocalCopy, deleteLocalCopies,
  deleteOtherUsersLocalCopies,
} from './localCopy';

export type SaveFields = Partial<{
  title: string; content: string; content_json: unknown[] | null; summary: string | null;
  key_points: unknown[]; type: string; status: string; source: string | null;
  due_at: string | null; remind_at: string | null; cover_url: string | null;
}>;
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'retrying' | 'offline' | 'conflict' | 'blocked';
export type SaveState = { status: SaveStatus; message: string | null };
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
export type VersionFields = {
  version: number; title: string; content: string | null; content_json: unknown[] | null;
  summary: string | null; key_points: unknown;
};

export const DEBOUNCE_MS = 800;
export const MAX_WAIT_MS = 5000;
export const SAVED_FADE_MS = 2000;
export const RETRY_DELAYS_MS = [1000, 2000, 5000, 10_000, 30_000];
export const DELETED_MESSAGE = 'This object was deleted';
export const NO_ACCESS_MESSAGE = 'You no longer have edit access';
export const KEEP_MINE_REASON = 'Kept from a conflict before overwrite';
export const LOAD_THEIRS_REASON = 'Unsaved edit kept from a conflict';
const SNAPSHOT_KEYS = ['title', 'content', 'content_json', 'summary', 'key_points'] as const;

const OWNER_ONLY = ['type', 'status', 'due_at', 'remind_at', 'cover_url'] as const;
type Patch = SaveFields & { slug?: string | null };
type Row = Record<string, unknown> & { id: string; revision: number; title?: string; updated_at?: string; current_version?: number };

type Options = { objectId: string; userId: string; isOwner: boolean; baseRevision: number; client?: QueryClient };

class Queue implements SaveQueue {
  readonly objectId: string;
  readonly userId: string;
  private isOwner: boolean;
  private client: QueryClient;
  private base: number;
  private queued: Patch = {};
  private inFlight: Patch | null = null;
  private sending: Promise<void> | null = null;
  private state: SaveState = { status: 'idle', message: null };
  private listeners = new Set<() => void>();
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private maxWait: ReturnType<typeof setTimeout> | null = null;
  private fade: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private authRetried = false;
  private stopWaitingOnline: (() => void) | null = null;
  private reloadListeners = new Set<() => void>();
  /** Pages holding this queue open (StrictMode and quick re-opens can overlap). */
  private holders = 0;
  private get attached() { return this.holders > 0; }
  /** Signed out: never send or write again. */
  closed = false;

  constructor(opts: Options) {
    this.objectId = opts.objectId;
    this.userId = opts.userId;
    this.isOwner = opts.isOwner;
    this.base = opts.baseRevision;
    this.client = opts.client ?? defaultClient;
  }

  getState = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  pending = (): SaveFields => ({ ...this.inFlight, ...this.queued });
  /** Edits not yet saved (queued or in flight). */
  hasUnsentEdits = () => this.hasUnsent();
  baseRevision = () => this.base;

  private setState(status: SaveStatus, message: string | null = null) {
    if (this.fade) { clearTimeout(this.fade); this.fade = null; }
    this.state = { status, message };
    this.listeners.forEach((l) => l());
  }

  private hasUnsent() {
    return Object.keys(this.queued).length > 0 || this.inFlight !== null;
  }

  private canSend() {
    return !this.closed && !['conflict', 'blocked'].includes(this.state.status);
  }

  /** Called when the page (re)opens this object. */
  attach(isOwner: boolean, client: QueryClient | undefined) {
    this.isOwner = isOwner;
    if (client) this.client = client;
    this.holders += 1;
    if (this.holders > 1) return;
    if (this.state.status === 'blocked') {
      // Blocked is not forever: the session may be back, or access granted again. Re-diagnose.
      this.authRetried = false;
      this.setState('pending');
    }
    window.addEventListener('pagehide', this.onHide);
    document.addEventListener('visibilitychange', this.onVisibility);
    if (Object.keys(this.queued).length > 0 && !this.sending) this.schedule();
  }

  /** Seed unsent edits restored from the local copy. */
  seed(fields: SaveFields, baseRevision: number) {
    this.base = baseRevision;
    this.queued = { ...fields };
    this.setState('pending');
  }

  change(fields: SaveFields) {
    if (this.closed) return;
    const next: Patch = { ...fields };
    if (!this.isOwner) for (const k of OWNER_ONLY) delete next[k];
    if (this.isOwner && typeof next.title === 'string') next.slug = slugForTitle(next.title, this.objectId);
    if (Object.keys(next).length === 0) return;
    this.queued = { ...this.queued, ...next };
    writeLocalCopy(this.userId, this.objectId, { fields: this.pending(), baseRevision: this.base });
    // Paused (conflict, blocked) or waiting (retry timer, offline): keep it, don't send yet.
    if (!this.canSend() || this.state.status === 'retrying' || this.state.status === 'offline') {
      this.listeners.forEach((l) => l());
      return;
    }
    if (!this.sending) this.setState('pending');
    this.schedule();
  }

  private schedule() {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.send(), DEBOUNCE_MS);
    if (!this.maxWait) this.maxWait = setTimeout(() => this.send(), MAX_WAIT_MS);
  }

  private clearTimers() {
    if (this.debounce) clearTimeout(this.debounce);
    if (this.maxWait) clearTimeout(this.maxWait);
    this.debounce = null;
    this.maxWait = null;
  }

  private stopRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private stopWaiting() {
    this.stopWaitingOnline?.();
    this.stopWaitingOnline = null;
  }

  private send() {
    this.clearTimers();
    this.stopRetry();
    if (this.sending || !this.canSend() || Object.keys(this.queued).length === 0) return;
    if (!onlineManager.isOnline()) { this.goOffline(); return; }
    const patch = this.queued;
    this.queued = {};
    this.inFlight = patch;
    this.setState('saving');
    this.sending = this.request(patch).finally(() => {
      this.sending = null;
      // Edits made while that request was out (or a retry due now) go next, unless the user
      // is still typing or a backoff timer owns the next attempt.
      if (!this.debounce && !this.retryTimer && Object.keys(this.queued).length > 0) this.send();
    });
  }

  private async request(patch: Patch) {
    let row: Row | null = null;
    let failed = false;
    let error: unknown = null;
    // Edits typed into a just-created object wait for its insert, instead of matching zero rows
    // and reading as "deleted". While the create is failing they stay here, unsent and kept locally.
    // Only then: otherwise the request must start synchronously (pagehide, see onHide).
    if (isCreating(this.objectId)) {
      await whenCreated(this.objectId);
      if (this.closed) return;
      // send() checked the connection before the wait; check again before the request goes out.
      if (!onlineManager.isOnline()) {
        this.queued = { ...patch, ...this.queued };
        this.inFlight = null;
        this.goOffline();
        return;
      }
    }
    try {
      const result = await supabase
        .from('knowledge_objects')
        .update(patch)
        .eq('id', this.objectId)
        .eq('revision', this.base)
        .select(OBJECT_COLS);
      if (result.error) { failed = true; error = result.error; }
      else row = ((result.data as Row[] | null) ?? [])[0] ?? null;
    } catch (err) {
      failed = true;
      error = err;
    }
    if (this.closed) return;
    if (failed || !row) {
      // Not saved: the patch goes back in front of anything typed since.
      this.queued = { ...patch, ...this.queued };
      this.inFlight = null;
      if (failed) await this.onError(error);
      else await this.onZeroRows(patch);
      return;
    }
    this.inFlight = null;
    this.onSaved(row);
  }

  private block(message: string) {
    this.setState('blocked', message);
  }

  private retryLater() {
    const delay = RETRY_DELAYS_MS[Math.min(this.retryCount, RETRY_DELAYS_MS.length - 1)];
    this.retryCount += 1;
    this.setState('retrying');
    this.stopRetry();
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this.send(); }, delay);
  }

  private goOffline() {
    this.setState('offline');
    if (this.stopWaitingOnline) return;
    this.stopWaitingOnline = onlineManager.subscribe((online) => {
      if (!online) return;
      this.stopWaiting();
      this.send();
    });
  }

  private async onError(err: unknown) {
    const kind = classifyError(err);
    if (kind === 'server' || kind === 'permission') reportError(err);
    if (kind === 'offline') { this.goOffline(); return; }
    if (kind === 'auth') {
      if (this.authRetried) { this.block(getErrorMessage(err)); return; }
      this.authRetried = true;
      this.setState('retrying');
      try { await supabase.auth.refreshSession(); } catch { /* the retry will tell */ }
      return; // send()'s finally retries at once (no timer is set)
    }
    if (kind === 'validation' || kind === 'permission' || kind === 'not_found' || kind === 'conflict') {
      this.block(getErrorMessage(err));
      return;
    }
    this.retryLater(); // network, server, rate limited, unknown
  }

  /**
   * The revision moved, but maybe only because this very patch was saved and its response was
   * lost (tab closed mid-request, a dropped connection). If the server already holds every value
   * in the patch, adopt its revision and count the patch as saved instead of raising a conflict.
   */
  private async alreadySaved(patch: Patch): Promise<boolean> {
    let row: Row | null;
    try {
      row = (await fetchObjectRow(this.objectId)) as Row | null;
    } catch {
      return false;
    }
    if (this.closed || !row) return false;
    const fields = patch as Record<string, unknown>;
    if (!Object.keys(fields).every((k) => sameValue(k, fields[k], row[k]))) return false;
    const queued = this.queued as Record<string, unknown>;
    for (const k of Object.keys(fields)) if (queued[k] === fields[k]) delete queued[k];
    this.onSaved(row);
    return true;
  }

  /** R7: zero rows matched. Say why, instead of always blaming another edit. */
  private async onZeroRows(patch: Patch) {
    let check;
    try {
      check = await fetchSaveCheck(this.objectId, this.userId);
    } catch (err) {
      await this.onError(err);
      return;
    }
    if (this.closed) return;
    if (!check.row || check.row.is_deleted) this.block(DELETED_MESSAGE);
    else if (check.row.revision !== this.base) {
      if (!(await this.alreadySaved(patch))) this.setState('conflict');
    }
    else if (check.row.user_id !== this.userId && check.shareRole !== 'editor') this.block(NO_ACCESS_MESSAGE);
    else this.retryLater();
  }

  private onSaved(row: Row) {
    this.retryCount = 0;
    this.authRetried = false;
    const prev = this.client.getQueryData<Row>(qk.object.detail(this.objectId));
    this.base = row.revision;
    this.client.setQueryData(qk.object.detail(this.objectId), row);
    setObjectInLists(this.objectId, { title: row.title, updated_at: row.updated_at }, this.client);
    void invalidateObjectLists(this.client).catch(() => undefined);
    if (prev && prev.current_version !== row.current_version) {
      void invalidateObjectVersions(this.objectId, this.client).catch(() => undefined);
    }
    if (Object.keys(this.queued).length > 0) {
      // Edits made while that request was out: keep them on disk with the new base, send next.
      void writeLocalCopyNow(this.userId, this.objectId, { fields: this.pending(), baseRevision: this.base });
      this.setState('pending');
      return;
    }
    void deleteLocalCopy(this.userId, this.objectId);
    this.setState('saved');
    this.fade = setTimeout(() => {
      this.fade = null;
      if (this.state.status === 'saved') this.setState('idle');
    }, SAVED_FADE_MS);
    if (!this.attached) registry.delete(this.objectId);
  }

  async flush(): Promise<void> {
    let tried = false;
    for (;;) {
      if (this.sending) { await this.sending; continue; }
      if (Object.keys(this.queued).length === 0 || !this.canSend() || this.state.status === 'offline') return;
      // One attempt now, even mid-backoff; then leave it to the retry timer.
      if (tried && this.state.status === 'retrying') return;
      tried = true;
      this.send();
      if (!this.sending) return;
    }
  }

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

  /**
   * The tab may be closing: nothing awaited here is sure to finish. Keep the edit synchronously,
   * then send it with keepalive so the request outlives the page.
   */
  private onHide = () => {
    if (this.closed || !this.hasUnsent()) return;
    const copy = { fields: this.pending(), baseRevision: this.base };
    writeLocalCopySync(this.userId, this.objectId, copy);
    void writeLocalCopyNow(this.userId, this.objectId, copy);
    void withKeepalive(() => this.flush());
  };

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') this.onHide();
  };

  dispose() {
    if (this.holders > 1) { this.holders -= 1; return; }
    this.clearTimers();
    if (!this.hasUnsent()) {
      this.stopRetry();
      this.stopWaiting();
    }
    // With unsent edits, the backoff timer and the online wait keep running after the page
    // leaves, so the edit is sent when the connection returns (onSaved then forgets the queue).
    if (this.attached) {
      window.removeEventListener('pagehide', this.onHide);
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
    this.holders = 0;
    // An idle queue is forgotten; one with unsent edits stays so reopening finds them.
    if (!this.hasUnsent() && registry.get(this.objectId) === this) registry.delete(this.objectId);
  }

  close() {
    this.closed = true;
    if (this.fade) clearTimeout(this.fade);
    this.stopRetry();
    this.stopWaiting();
    this.holders = Math.min(this.holders, 1);
    this.dispose();
  }
}

const registry = new Map<string, Queue>();
const opening = new Map<string, Promise<Queue>>();

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

const TIMESTAMP_KEYS = new Set(['due_at', 'remind_at']);

/** Does the server's value match what we sent? (jsonb reorders object keys; timestamps reformat.) */
function sameValue(key: string, sent: unknown, stored: unknown): boolean {
  if (TIMESTAMP_KEYS.has(key) && sent && stored) return Date.parse(String(sent)) === Date.parse(String(stored));
  return deepEqual(sent ?? null, stored ?? null);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => deepEqual(v, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = Object.keys(ao);
  return keys.length === Object.keys(bo).length && keys.every((k) => k in bo && deepEqual(ao[k], bo[k]));
}
