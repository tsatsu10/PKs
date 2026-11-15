import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { db } from './client';
import { unwrap } from './unwrap';
import { qk } from './keys';
import { queryClient as defaultClient } from './queryClient';
import { promptsQuery } from './prompts';
import { LIST_COLS } from './objects';
import { whenCreated } from './createObject';

export const OBJECT_COLS = `${LIST_COLS}, content_json`;
export type ObjectRow = Record<string, unknown> & { id: string; user_id: string; is_deleted: boolean; revision: number };
type Named = { id: string; name: string };
type LinkTarget = { id: string; title: string; type: string };

export async function fetchObjectRow(id: string): Promise<ObjectRow | null> {
  return (unwrap(await db.from('knowledge_objects').select(OBJECT_COLS).eq('id', id).maybeSingle()) as ObjectRow | null);
}

export type VersionSnapshot = { title: string; content: string | null; content_json: unknown[] | null; summary: string | null; key_points: unknown };

/** One version snapshot, read fresh so a partially-loaded version list can never restore blanks. */
export async function fetchVersionSnapshot(versionId: string): Promise<VersionSnapshot> {
  const row = unwrap(await db.from('knowledge_object_versions').select('title, content, content_json, summary, key_points')
    .eq('id', versionId).maybeSingle()) as VersionSnapshot | null;
  if (!row) throw new Error("That version doesn't exist or was deleted.");
  return row;
}

/** One version of an object by its number (Undo of a restore names the snapshot by number). */
export async function fetchVersionSnapshotByNumber(objectId: string, version: number): Promise<VersionSnapshot & { version: number }> {
  const row = unwrap(await db.from('knowledge_object_versions').select('version, title, content, content_json, summary, key_points')
    .eq('knowledge_object_id', objectId).eq('version', version).maybeSingle()) as (VersionSnapshot & { version: number }) | null;
  if (!row) throw new Error("That version doesn't exist or was deleted.");
  return row;
}

export type SaveCheck = {
  row: { revision: number; user_id: string; is_deleted: boolean } | null;
  shareRole: 'viewer' | 'editor' | null;
};

/** After a save matched zero rows (R7): is the object gone, moved on, or no longer mine to edit? */
export async function fetchSaveCheck(id: string, userId: string): Promise<SaveCheck> {
  const [row, share] = await Promise.all([
    db.from('knowledge_objects').select('revision, user_id, is_deleted').eq('id', id).maybeSingle(),
    db.from('share_permissions').select('role').eq('knowledge_object_id', id).eq('shared_with_user_id', userId).maybeSingle(),
  ]);
  const role = (unwrap(share) as { role: string } | null)?.role;
  return {
    row: (unwrap(row) as SaveCheck['row']) ?? null,
    shareRole: role === 'editor' || role === 'viewer' ? role : null,
  };
}

export const objectDetailQuery = (id: string) => queryOptions({
  queryKey: qk.object.detail(id),
  // An object created on this page is read only once its insert has landed (createObject).
  queryFn: async () => { await whenCreated(id); return fetchObjectRow(id); },
  // The editor seeds from this data; never swap it underneath a user (part 2 adds "changed elsewhere").
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

async function fetchLinks(id: string) {
  const [out, inc] = await Promise.all([
    db.from('link_edges').select('id, to_object_id, relationship_type').eq('from_object_id', id),
    db.from('link_edges').select('id, from_object_id, relationship_type').eq('to_object_id', id),
  ]);
  const outRows = (unwrap(out) ?? []) as Array<{ id: string; to_object_id: string; relationship_type: string | null }>;
  const inRows = (unwrap(inc) ?? []) as Array<{ id: string; from_object_id: string; relationship_type: string | null }>;
  const ids = [...new Set([...outRows.map((r) => r.to_object_id), ...inRows.map((r) => r.from_object_id)])];
  const targets: Record<string, LinkTarget> = {};
  const trashed = new Set<string>();
  if (ids.length) {
    const rows = (unwrap(await db.from('knowledge_objects').select('id, title, type, is_deleted').in('id', ids)) ?? []) as Array<LinkTarget & { is_deleted: boolean }>;
    for (const { is_deleted, ...o } of rows) {
      if (is_deleted) trashed.add(o.id);
      else targets[o.id] = o;
    }
  }
  // Links to objects in Trash are hidden (D7). Targets RLS doesn't return keep the 'Unknown' placeholder.
  const target = (oid: string) => targets[oid] ?? { id: oid, title: 'Unknown', type: '' };
  return {
    outgoing: outRows.filter((r) => !trashed.has(r.to_object_id)).map((r) => ({ id: r.id, to_object_id: r.to_object_id, relationship_type: r.relationship_type || 'references', target: target(r.to_object_id) })),
    incoming: inRows.filter((r) => !trashed.has(r.from_object_id)).map((r) => ({ id: r.id, from_object_id: r.from_object_id, relationship_type: r.relationship_type || 'references', source: target(r.from_object_id) })),
  };
}

export function useObjectPanels(id: string | undefined, userId: string | undefined, enabled: boolean) {
  const on = enabled && !!id && !!userId;
  const oid = id as string;
  return {
    versions: useQuery({ queryKey: qk.object.versions(oid), enabled: on, queryFn: async () => unwrap(await db
      .from('knowledge_object_versions').select('id, version, title, content, summary, key_points, created_at, edited_by')
      .eq('knowledge_object_id', oid).order('created_at', { ascending: false }).limit(50)) ?? [] }),
    domains: useQuery({ queryKey: qk.object.domains(oid), enabled: on, queryFn: async () =>
      // The domains/tags FKs are many-to-one; the typed client may widen them to arrays.
      ((unwrap(await db.from('knowledge_object_domains').select('domain_id, domains(id, name)').eq('knowledge_object_id', oid)) ?? []) as Array<{ domains: Named | null }>)
        .map((r) => r.domains).filter((d): d is Named => !!d) }),
    tags: useQuery({ queryKey: qk.object.tags(oid), enabled: on, queryFn: async () =>
      ((unwrap(await db.from('knowledge_object_tags').select('tag_id, tags(id, name)').eq('knowledge_object_id', oid)) ?? []) as Array<{ tags: Named | null }>)
        .map((r) => r.tags).filter((t): t is Named => !!t) }),
    links: useQuery({ queryKey: qk.object.links(oid), enabled: on, queryFn: () => fetchLinks(oid) }),
    files: useQuery({ queryKey: qk.object.files(oid), enabled: on, queryFn: async () =>
      ((unwrap(await db.from('knowledge_object_files').select('file_id, files(id, filename, mime_type, size_bytes, storage_key)').eq('knowledge_object_id', oid)) ?? []) as Array<{ files: unknown }>)
        .map((r) => r.files).filter(Boolean) }),
    runs: useQuery({ queryKey: qk.object.runs(oid), enabled: on, queryFn: async () => unwrap(await db
      .from('prompt_runs').select('id, prompt_template_id, status, output, created_at')
      .eq('knowledge_object_id', oid).order('created_at', { ascending: false }).limit(20)) ?? [] }),
    myShare: useQuery({ queryKey: qk.object.myShare(oid), enabled: on, queryFn: async () => unwrap(await db
      .from('share_permissions').select('id, role').eq('knowledge_object_id', oid).eq('shared_with_user_id', userId as string).maybeSingle()) }),
    linkCandidates: useQuery({ queryKey: qk.objects.linkCandidates(oid), enabled: on, queryFn: async () => unwrap(await db
      .from('knowledge_objects').select('id, title, type').eq('user_id', userId as string).eq('is_deleted', false)
      .neq('id', oid).order('title').limit(200)) ?? [] }),
    prompts: useQuery({ ...promptsQuery(userId ?? ''), enabled: on }),
    suggestedTags: useQuery({ queryKey: qk.suggestions.tags(oid), enabled: on, queryFn: async () => {
      const primary = unwrap(await supabase.rpc('suggest_tags_for_object', { p_object_id: oid })) as unknown[] | null;
      if (primary?.length) return primary;
      return (unwrap(await supabase.rpc('suggest_tags_for_object_fallback', { p_object_id: oid })) as unknown[] | null) ?? [];
    } }),
    suggestedLinks: useQuery({ queryKey: qk.suggestions.links(oid), enabled: on, queryFn: async () =>
      (unwrap(await supabase.rpc('suggest_linked_objects', { p_object_id: oid, limit_n: 10 }).select(LIST_COLS)) as unknown[] | null) ?? [] }),
  };
}

export type ShareRow = { id: string; shared_with_email: string; role: string; created_at: string; pending?: boolean };

export async function fetchShares(objectId: string): Promise<ShareRow[]> {
  const [shares, invites] = await Promise.all([
    db.from('share_permissions').select('id, shared_with_email, role, created_at').eq('knowledge_object_id', objectId).order('created_at', { ascending: false }),
    db.from('share_invites').select('id, email, role, created_at').eq('knowledge_object_id', objectId).is('accepted_at', null).order('created_at', { ascending: false }),
  ]);
  const pending = ((unwrap(invites) ?? []) as Array<{ id: string; email: string; role: string; created_at: string }>)
    .map((i) => ({ id: `invite:${i.id}`, shared_with_email: i.email, role: i.role, created_at: i.created_at, pending: true }));
  return [...pending, ...((unwrap(shares) ?? []) as ShareRow[])];
}

export async function searchLinkTargets(query: string) {
  return ((unwrap(await supabase.rpc('search_knowledge_objects', { search_query: query, limit_n: 8, offset_n: 0 }).select(LIST_COLS)) ?? []) as Array<LinkTarget & { user_id: string }>);
}

export const invalidateObject = (id: string, client: QueryClient = defaultClient) =>
  client.invalidateQueries({ queryKey: qk.object.all(id) });

export const invalidateObjectVersions = (id: string, client: QueryClient = defaultClient) =>
  client.invalidateQueries({ queryKey: qk.object.versions(id) });

export function prefetchObject(id: string, client: QueryClient = defaultClient): void {
  void client.prefetchQuery(objectDetailQuery(id));
}
