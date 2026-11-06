import type { QueryClient } from '@tanstack/react-query';
import { db } from './client';
import { unwrap } from './unwrap';
import { qk } from './keys';
import { afterCursorDesc, KEYSET_PAGE_SIZE, type Cursor } from './keyset';
import { useKeysetList } from './useKeysetList';

export const NOTIFICATION_COLS = 'id, type, title, body, read_at, related_type, related_id, created_at';
export type NotificationRow = { id: string; type: string; title: string; body: string | null; read_at: string | null; related_type: string | null; related_id: string | null; created_at: string };

export function useNotificationsList(userId: string | null, filter: 'all' | 'unread') {
  return useKeysetList<NotificationRow>({
    queryKey: qk.notifications.list(filter),
    column: 'created_at',
    enabled: !!userId,
    fetchPage: async (cursor: Cursor | null) => {
      let q = db.from('notifications').select(NOTIFICATION_COLS).eq('user_id', userId as string)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(KEYSET_PAGE_SIZE);
      if (filter === 'unread') q = q.is('read_at', null);
      if (cursor) q = q.or(afterCursorDesc('created_at', cursor));
      return (unwrap(await q) ?? []) as NotificationRow[];
    },
  });
}

export const invalidateNotifications = (client: QueryClient) =>
  client.invalidateQueries({ queryKey: qk.notifications.all });
