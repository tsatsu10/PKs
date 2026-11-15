import { db } from './client';
import { unwrap } from './unwrap';
import { qk } from './keys';
import { afterCursorDesc, KEYSET_PAGE_SIZE, type Cursor } from './keyset';
import { useKeysetList } from './useKeysetList';

export type TrashRow = { id: string; type: string; title: string; updated_at: string };

export function useTrashList(userId: string | null) {
  return useKeysetList<TrashRow>({
    queryKey: qk.trash.list(),
    column: 'updated_at',
    enabled: !!userId,
    fetchPage: async (cursor: Cursor | null) => {
      let q = db.from('knowledge_objects').select('id, type, title, updated_at')
        .eq('user_id', userId as string).eq('is_deleted', true)
        .order('updated_at', { ascending: false }).order('id', { ascending: false })
        .limit(KEYSET_PAGE_SIZE);
      if (cursor) q = q.or(afterCursorDesc('updated_at', cursor));
      return (unwrap(await q) ?? []) as TrashRow[];
    },
  });
}

/** Take an object out of Trash (Trash page Restore, and Undo after Move to Trash). */
export async function restoreFromTrash(id: string, userId: string): Promise<void> {
  unwrap(await db.from('knowledge_objects').update({ is_deleted: false }).eq('id', id).eq('user_id', userId));
}
