/**
 * The save engine for one object (spec 2b "The save engine"): debounce, one request in flight,
 * the IndexedDB local copy, flush on hide, and the revision check. One queue per object id,
 * kept in a module-level registry so leaving the page doesn't lose an edit still being sent.
 */
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { slugForTitle } from '../../../lib/objectForm';
import { registerUserDataHooks } from '../../../lib/userStorage';
import { queryClient as defaultClient } from '../../../data/queryClient';
import { qk } from '../../../data/keys';
import { OBJECT_COLS, invalidateObjectVersions } from '../../../data/objectDetail';
import { invalidateObjectLists, setObjectInLists } from '../../../data/objects';
import {
  readLocalCopy, writeLocalCopy, writeLocalCopyNow, deleteLocalCopy, deleteLocalCopies, deleteOtherUsersLocalCopies,
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
}

export const DEBOUNCE_MS = 800;
export const MAX_WAIT_MS = 5000;
export const SAVED_FADE_MS = 2000;

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
  private attached = false;
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
    if (this.attached) return;
    this.attached = true;
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
    if (!this.canSend()) { this.listeners.forEach((l) => l()); return; }
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

  private send() {
    this.clearTimers();
    if (this.sending || !this.canSend() || Object.keys(this.queued).length === 0) return;
    const patch = this.queued;
    this.queued = {};
    this.inFlight = patch;
    this.setState('saving');
    this.sending = this.request(patch).finally(() => {
      this.sending = null;
      // Edits made while that request was out go next, unless the user is still typing.
      if (!this.debounce && Object.keys(this.queued).length > 0) this.send();
    });
  }

  private async request(patch: Patch) {
    let row: Row | null = null;
    let failed = false;
    try {
      const { data, error } = await supabase
        .from('knowledge_objects')
        .update(patch)
        .eq('id', this.objectId)
        .eq('revision', this.base)
        .select(OBJECT_COLS);
      if (error) failed = true;
      else row = ((data as Row[] | null) ?? [])[0] ?? null;
    } catch {
      failed = true;
    }
    if (this.closed) return;
    if (failed || !row) {
      // Task 5 refines this into retrying / offline / conflict / blocked outcomes.
      this.queued = { ...patch, ...this.queued };
      this.inFlight = null;
      this.setState('blocked', 'Not saved');
      return;
    }
    this.inFlight = null;
    this.onSaved(row);
  }

  private onSaved(row: Row) {
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
    for (;;) {
      if (this.sending) { await this.sending; continue; }
      if (Object.keys(this.queued).length === 0 || !this.canSend()) return;
      this.send();
      if (!this.sending) return;
    }
  }

  private onHide = () => {
    if (this.closed || !this.hasUnsent()) return;
    void writeLocalCopyNow(this.userId, this.objectId, { fields: this.pending(), baseRevision: this.base });
    void this.flush();
  };

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') this.onHide();
  };

  dispose() {
    this.clearTimers();
    if (this.attached) {
      window.removeEventListener('pagehide', this.onHide);
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
    this.attached = false;
    // An idle queue is forgotten; one with unsent edits stays so reopening finds them.
    if (!this.hasUnsent() && registry.get(this.objectId) === this) registry.delete(this.objectId);
  }

  close() {
    this.closed = true;
    if (this.fade) clearTimeout(this.fade);
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
