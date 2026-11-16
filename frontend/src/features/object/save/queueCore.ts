/**
 * The save engine's core (spec 2b "The save engine"): debounce, one request in flight, the local
 * copy, flush on hide, and the revision check with its error handling. saveQueue.ts adds the
 * conflict and history actions on top and keeps the per-object registry.
 */
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { classifyError, getErrorMessage } from '../../../lib/errors';
import { reportError } from '../../../lib/reportError';
import { slugForTitle } from '../../../lib/objectForm';
import { withKeepalive } from '../../../lib/keepalive';
import { queryClient as defaultClient } from '../../../data/queryClient';
import { qk } from '../../../data/keys';
import { OBJECT_COLS, fetchObjectRow, fetchSaveCheck, invalidateObjectVersions } from '../../../data/objectDetail';
import { isCreating, whenCreated } from '../../../data/createObject';
import { invalidateObjectLists, setObjectInLists } from '../../../data/objects';
import { writeLocalCopy, writeLocalCopyNow, writeLocalCopySync, deleteLocalCopy } from './localCopy';
import { sameValue } from './sameValue';
import {
  DEBOUNCE_MS, DELETED_MESSAGE, MAX_WAIT_MS, NO_ACCESS_MESSAGE, OWNER_ONLY, RETRY_DELAYS_MS, SAVED_FADE_MS,
  type Options, type Patch, type Row, type SaveFields, type SaveState, type SaveStatus,
} from './saveTypes';

/**
 * A detached queue with nothing left to send is dropped from saveQueue.ts's registry. `onlyIfCurrent`
 * leaves the entry alone when another queue now holds that id. (Set there, so this module doesn't
 * import its importer.)
 */
type Forget = (queue: QueueCore, onlyIfCurrent: boolean) => void;
let forget: Forget = () => undefined;
export function onForget(fn: Forget) { forget = fn; }

export abstract class QueueCore {
  readonly objectId: string;
  readonly userId: string;
  private isOwner: boolean;
  protected client: QueryClient;
  protected base: number;
  protected queued: Patch = {};
  private inFlight: Patch | null = null;
  protected sending: Promise<void> | null = null;
  private state: SaveState = { status: 'idle', message: null };
  private listeners = new Set<() => void>();
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private maxWait: ReturnType<typeof setTimeout> | null = null;
  private fade: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private authRetried = false;
  private stopWaitingOnline: (() => void) | null = null;
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

  protected setState(status: SaveStatus, message: string | null = null) {
    if (this.fade) { clearTimeout(this.fade); this.fade = null; }
    this.state = { status, message };
    this.listeners.forEach((l) => l());
  }

  protected hasUnsent() {
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

  protected clearTimers() {
    if (this.debounce) clearTimeout(this.debounce);
    if (this.maxWait) clearTimeout(this.maxWait);
    this.debounce = null;
    this.maxWait = null;
  }

  protected stopRetry() {
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

  protected block(message: string) {
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
    if (!this.attached) forget(this, false);
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
    if (!this.hasUnsent()) forget(this, true);
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
