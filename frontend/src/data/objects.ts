import {
  keepPreviousData, useInfiniteQuery, useQuery, type InfiniteData, type QueryClient,
} from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { unwrap } from './unwrap';
import { qk, type SearchPayload } from './keys';
import { queryClient as defaultClient } from './queryClient';

export const DASHBOARD_PAGE_SIZE = 20;
export type ObjectRow = { id: string } & Record<string, unknown>;

// The search RPCs return computed rows (snippets, rank), so they use the untyped client.
async function searchPage(p: SearchPayload, offset: number): Promise<ObjectRow[]> {
  const rpc = p.search_query ? 'search_knowledge_objects_with_snippets' : 'search_knowledge_objects';
  return unwrap(await supabase.rpc(rpc, { ...p, limit_n: DASHBOARD_PAGE_SIZE, offset_n: offset })) ?? [];
}

export function useObjectsPage(payload: SearchPayload | null, offset: number) {
  return useQuery({
    queryKey: qk.objects.page(payload as SearchPayload, offset),
    queryFn: () => searchPage(payload as SearchPayload, offset),
    enabled: payload !== null,
    placeholderData: keepPreviousData,
  });
}

export function useObjectsCount(payload: SearchPayload | null) {
  return useQuery({
    queryKey: qk.objects.count(payload as SearchPayload),
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase.rpc('count_knowledge_objects', payload);
      const n = Number(data);
      return error || data == null || !Number.isFinite(n) ? null : n;
    },
    enabled: payload !== null,
    placeholderData: keepPreviousData,
  });
}

export function useSearchResults(payload: SearchPayload | null) {
  return useInfiniteQuery({
    queryKey: qk.search.results(payload as SearchPayload),
    queryFn: ({ pageParam }) => searchPage(payload as SearchPayload, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.length === DASHBOARD_PAGE_SIZE ? pages.reduce((n, p) => n + p.length, 0) : undefined,
    enabled: payload !== null,
  });
}

/**
 * After any write that creates, deletes, restores or changes knowledge objects (or their tags,
 * domains or links): dashboard pages, counts, resume/trailheads, search, Trash and dashboard stats.
 */
export async function invalidateObjectLists(client: QueryClient = defaultClient): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: qk.objects.all }),
    client.invalidateQueries({ queryKey: ['search'] }),
    client.invalidateQueries({ queryKey: qk.trash.list() }),
    client.invalidateQueries({ queryKey: ['dashboard'] }),
  ]);
}

const patchRows = (rows: ObjectRow[], id: string, patch: Record<string, unknown> | null) =>
  patch === null ? rows.filter((r) => r.id !== id) : rows.map((r) => (r.id === id ? { ...r, ...patch } : r));

export function setObjectInLists(id: string, patch: Record<string, unknown> | null, client: QueryClient = defaultClient): void {
  client.setQueriesData<ObjectRow[]>({ queryKey: ['objects', 'page'] }, (rows) => rows && patchRows(rows, id, patch));
  client.setQueriesData<InfiniteData<ObjectRow[]>>({ queryKey: ['search', 'results'] }, (data) =>
    data && { ...data, pages: data.pages.map((rows) => patchRows(rows, id, patch)) });
}
