import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient, type InfiniteData, type QueryKey } from '@tanstack/react-query';
import { KEYSET_PAGE_SIZE, nextCursor, type Cursor } from './keyset';

/** A page remembers the cursor computed when it was fetched, so removing rows later can't move it. */
type Page<T> = { rows: T[]; next: Cursor | null };

export function useKeysetList<T extends { id: string }>(opts: {
  queryKey: QueryKey;
  column: keyof T & string;
  fetchPage: (cursor: Cursor | null) => Promise<T[]>;
  enabled?: boolean;
}) {
  const client = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: opts.queryKey,
    queryFn: async ({ pageParam }): Promise<Page<T>> => {
      const rows = await opts.fetchPage(pageParam);
      return { rows, next: nextCursor(rows, opts.column, KEYSET_PAGE_SIZE) };
    },
    initialPageParam: null as Cursor | null,
    getNextPageParam: (last: Page<T>) => last.next,
    enabled: opts.enabled ?? true,
  });
  const rows = useMemo(() => query.data?.pages.flatMap((p) => p.rows) ?? [], [query.data]);
  const update = useCallback((fn: (rows: T[]) => T[]) => {
    client.setQueryData<InfiniteData<Page<T>, Cursor | null>>(opts.queryKey, (data) =>
      data && { ...data, pages: data.pages.map((p) => ({ ...p, rows: fn(p.rows) })) });
  }, [client, opts.queryKey]);
  const removeRow = useCallback((id: string) => update((r) => r.filter((x) => x.id !== id)), [update]);
  const patchRow = useCallback((id: string, patch: Partial<T>) =>
    update((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x))), [update]);
  return { rows, query, removeRow, patchRow };
}
