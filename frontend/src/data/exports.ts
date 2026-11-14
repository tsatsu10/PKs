import { supabase } from '../lib/supabase';
import { unwrap } from './unwrap';
import { chunk, IN_CHUNK } from './chunk';
import { fetchAll } from './fetchAll';
import { fetchDomains, fetchTags, type Entity } from './taxonomy';
import type { SearchPayload } from './keys';

type AnyRow = Record<string, unknown>;
export type ExportObject = AnyRow & { id: string; domains: Entity[]; tags: Entity[] };

// "Export my data" means every column, but never the fts search index (P5). Confirmed against
// supabase/migrations: add any new column (except fts) that is missing here.
export const OBJECT_EXPORT_COLS = 'id, user_id, type, title, source, content, summary, key_points, is_deleted, current_version, created_at, updated_at, is_pinned, status, slug, cover_url, due_at, remind_at, last_viewed_at, revision';
export const JOURNAL_EXPORT_COLS = 'id, user_id, entry_date, content, created_at, updated_at';
export const PASTE_EXPORT_COLS = 'id, user_id, title, content, created_at, updated_at';

// Export collectors are one-off actions, not cached queries. They take table names dynamically,
// so they use the untyped client.
export async function fetchByIdsChunked<T = AnyRow>(table: string, columns: string, column: string, ids: string[]): Promise<T[]> {
  const out: T[] = [];
  for (const part of chunk(ids, IN_CHUNK)) {
    out.push(...((unwrap(await supabase.from(table).select(columns).in(column, part)) ?? []) as T[]));
  }
  return out;
}

type JoinRow = { knowledge_object_id: string; domains?: Entity | null; tags?: Entity | null };

function groupBy(rows: JoinRow[], pick: (r: JoinRow) => Entity | null | undefined): Record<string, Entity[]> {
  const out: Record<string, Entity[]> = {};
  for (const r of rows) {
    const v = pick(r);
    if (v) (out[r.knowledge_object_id] ??= []).push(v);
  }
  return out;
}

async function attachTaxonomy(objs: Array<AnyRow & { id: string }>): Promise<ExportObject[]> {
  const ids = objs.map((o) => o.id);
  const [kod, kot] = await Promise.all([
    fetchByIdsChunked<JoinRow>('knowledge_object_domains', 'knowledge_object_id, domain_id, domains(id, name)', 'knowledge_object_id', ids),
    fetchByIdsChunked<JoinRow>('knowledge_object_tags', 'knowledge_object_id, tag_id, tags(id, name)', 'knowledge_object_id', ids),
  ]);
  const domains = groupBy(kod, (r) => r.domains);
  const tags = groupBy(kot, (r) => r.tags);
  return objs.map((o) => ({ ...o, domains: domains[o.id] ?? [], tags: tags[o.id] ?? [] }));
}

/** All of the user's non-deleted objects, newest first (the Markdown ZIP numbers files in this order). */
export async function fetchOwnObjectsForExport(userId: string): Promise<ExportObject[]> {
  const objs = await fetchAll<AnyRow & { id: string }>((from, to) => supabase.from('knowledge_objects')
    .select(OBJECT_EXPORT_COLS).eq('user_id', userId).eq('is_deleted', false)
    .order('updated_at', { ascending: false }).order('id', { ascending: false }).range(from, to));
  return attachTaxonomy(objs);
}

export async function fetchObjectsByIdsForExport(ids: string[]): Promise<ExportObject[]> {
  return attachTaxonomy(await fetchByIdsChunked<AnyRow & { id: string }>('knowledge_objects', OBJECT_EXPORT_COLS, 'id', ids));
}

export async function fetchAccountExtras(userId: string) {
  const [journal_entries, paste_bin, domains, tags] = await Promise.all([
    fetchAll<AnyRow>((from, to) => supabase.from('journal_entries').select(JOURNAL_EXPORT_COLS).eq('user_id', userId)
      .order('entry_date', { ascending: false }).order('id').range(from, to)),
    fetchAll<AnyRow>((from, to) => supabase.from('paste_bin').select(PASTE_EXPORT_COLS).eq('user_id', userId)
      .order('created_at', { ascending: false }).order('id').range(from, to)),
    fetchDomains(userId),
    fetchTags(userId),
  ]);
  return { journal_entries, paste_bin, domains, tags };
}

/** Ids of every object matching the applied dashboard filters ("export all matching"). */
export async function fetchFilteredObjectIds(payload: SearchPayload): Promise<string[]> {
  const PAGE = 100;
  const rpc = payload.search_query ? 'search_knowledge_objects_with_snippets' : 'search_knowledge_objects';
  const ids: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const args = { ...payload, limit_n: PAGE, offset_n: offset };
    const rows = ((rpc === 'search_knowledge_objects'
      ? unwrap(await supabase.rpc(rpc, args).select('id'))
      : unwrap(await supabase.rpc(rpc, args))) ?? []) as { id: string }[];
    ids.push(...rows.map((r) => r.id));
    if (rows.length < PAGE) return ids;
  }
}
