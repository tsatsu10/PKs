import { useCallback, useSyncExternalStore } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { qk } from './keys';
import { queryClient as defaultClient } from './queryClient';
import { invalidateObjectLists } from './objects';

type Named = { id: string; name: string };

export type NewObject = {
  userId: string;
  /** Column values for knowledge_objects (id and user_id are added here). */
  row: Record<string, unknown>;
  domainIds?: string[];
  tagIds?: string[];
  /** Names for the seeded domain/tag panels, so the new page shows them at once. */
  domains?: Named[];
  tags?: Named[];
  /** Runs once, after the row and its domains/tags exist (audit, webhook, notification). */
  onCreated?: (id: string) => void;
};

export type CreateState = { status: 'none' | 'pending' | 'failed'; error: unknown; retry: () => void };

type Entry = {
  status: 'pending' | 'failed';
  error: unknown;
  attempt: () => void;
  done: Promise<void>;
  resolve: () => void;
};

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** A duplicate key on retry means an earlier attempt's insert did land. */
const isDuplicate = (err: unknown) => (err as { code?: string } | null)?.code === '23505';
/** For the object row only a duplicate *id* means that: a clash on another unique index (the slug) is a real failure. */
const isDuplicateObject = (err: unknown) => isDuplicate(err)
  && /knowledge_objects_pkey/.test(`${(err as { message?: string }).message ?? ''} ${(err as { details?: string }).details ?? ''}`);

/**
 * Create an object with a client-generated id and return the id at once, so the caller can
 * navigate immediately. The detail and panel caches are seeded; the insert runs in the
 * background. A failure leaves the object "failed" (useCreateState) until retry() succeeds.
 * Offline creation is out of scope (Phase 6): a failed insert is not queued.
 */
export function createObject(input: NewObject, client: QueryClient = defaultClient): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  client.setQueryData(qk.object.detail(id), {
    id, user_id: input.userId, is_deleted: false, revision: 1, is_pinned: false, current_version: null,
    created_at: now, updated_at: now, content_json: null, ...input.row,
  });
  client.setQueryData(qk.object.domains(id), input.domains ?? []);
  client.setQueryData(qk.object.tags(id), input.tags ?? []);
  client.setQueryData(qk.object.links(id), { outgoing: [], incoming: [] });
  for (const key of [qk.object.files(id), qk.object.versions(id), qk.object.runs(id)]) client.setQueryData(key, []);

  let resolve!: () => void;
  const done = new Promise<void>((r) => { resolve = r; });
  let objectInserted = false;

  async function run() {
    if (!objectInserted) {
      const { error } = await supabase.from('knowledge_objects').insert({ ...input.row, id, user_id: input.userId });
      if (error && !isDuplicateObject(error)) throw error;
      objectInserted = true;
    }
    // Junction rows: a duplicate means an earlier attempt already added them.
    if (input.domainIds?.length) {
      const { error } = await supabase.from('knowledge_object_domains')
        .insert(input.domainIds.map((domain_id) => ({ knowledge_object_id: id, domain_id })));
      if (error && !isDuplicate(error)) throw error;
    }
    if (input.tagIds?.length) {
      const { error } = await supabase.from('knowledge_object_tags')
        .insert(input.tagIds.map((tag_id) => ({ knowledge_object_id: id, tag_id })));
      if (error && !isDuplicate(error)) throw error;
    }
  }

  const entry: Entry = {
    status: 'pending', error: null, done, resolve,
    attempt: () => {
      entry.status = 'pending';
      entry.error = null;
      emit();
      run().then(() => {
        entries.delete(id);
        emit();
        resolve();
        input.onCreated?.(id);
        void invalidateObjectLists(client);
      }, (err) => {
        entry.status = 'failed';
        entry.error = err;
        emit();
      });
    },
  };
  entries.set(id, entry);
  entry.attempt();
  return id;
}

/** True while this page is still creating object `id` (its insert hasn't landed yet). */
export function isCreating(id: string): boolean {
  return entries.has(id);
}

/** Resolves once the object exists on the server: at once if no create is pending; after a successful retry if one failed. */
export function whenCreated(id: string): Promise<void> {
  return entries.get(id)?.done ?? Promise.resolve();
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** The create status of object `id` on this page (none: not being created here, or already done). */
export function useCreateState(id: string | undefined): CreateState {
  const status = useSyncExternalStore(subscribe, () => (id ? entries.get(id)?.status : undefined) ?? 'none');
  const error = useSyncExternalStore(subscribe, () => (id ? entries.get(id)?.error : null) ?? null);
  const retry = useCallback(() => { if (id) entries.get(id)?.attempt(); }, [id]);
  return { status, error, retry };
}
