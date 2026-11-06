import { db } from './client';
import { unwrap } from './unwrap';
import { qk } from './keys';
import { afterCursorDesc, KEYSET_PAGE_SIZE, type Cursor } from './keyset';
import { useKeysetList } from './useKeysetList';

export type AuditFilters = { action: string; dateFrom: string; dateTo: string };
export type AuditRow = { id: string; action: string; entity_type: string; entity_id: string | null; payload: unknown; created_at: string };

export function useAuditLogs(userId: string | null, f: AuditFilters) {
  return useKeysetList<AuditRow>({
    queryKey: qk.auditLogs.list(f),
    column: 'created_at',
    enabled: !!userId,
    fetchPage: async (cursor: Cursor | null) => {
      let q = db.from('audit_logs').select('id, action, entity_type, entity_id, payload, created_at')
        .eq('user_id', userId as string)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(KEYSET_PAGE_SIZE);
      if (f.action) q = q.eq('action', f.action);
      if (f.dateFrom) q = q.gte('created_at', `${f.dateFrom}T00:00:00Z`);
      if (f.dateTo) q = q.lte('created_at', `${f.dateTo}T23:59:59Z`);
      if (cursor) q = q.or(afterCursorDesc('created_at', cursor));
      // audit_logs.id is numeric; String() keeps useKeysetList's { id: string } contract.
      return ((unwrap(await q) ?? []) as Array<Record<string, unknown>>).map((r) => ({ ...r, id: String(r.id) })) as AuditRow[];
    },
  });
}
