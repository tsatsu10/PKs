import { useQuery, type QueryClient } from '@tanstack/react-query';
import { db } from './client';
import { unwrap } from './unwrap';
import { qk } from './keys';
import { afterCursorDesc, KEYSET_PAGE_SIZE, type Cursor } from './keyset';
import { useKeysetList } from './useKeysetList';

export type PasteListRow = { id: string; title: string | null; created_at: string; updated_at: string };

/** The list never loads content (P5); the open item does. */
export function usePasteList(userId: string | null) {
  return useKeysetList<PasteListRow>({
    queryKey: qk.pasteBin.list(),
    column: 'created_at',
    enabled: !!userId,
    fetchPage: async (cursor: Cursor | null) => {
      let q = db.from('paste_bin').select('id, title, created_at, updated_at').eq('user_id', userId as string)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(KEYSET_PAGE_SIZE);
      if (cursor) q = q.or(afterCursorDesc('created_at', cursor));
      return (unwrap(await q) ?? []) as PasteListRow[];
    },
  });
}

export function usePasteItem(id: string | null) {
  return useQuery({
    queryKey: qk.pasteBin.item(id ?? ''),
    enabled: !!id,
    refetchOnWindowFocus: false, // the item seeds an editable textarea
    refetchOnReconnect: false,
    queryFn: async () => unwrap(await db.from('paste_bin').select('id, title, content, created_at, updated_at').eq('id', id as string).maybeSingle()),
  });
}
export const invalidatePasteBin = (client: QueryClient) => client.invalidateQueries({ queryKey: qk.pasteBin.all });
