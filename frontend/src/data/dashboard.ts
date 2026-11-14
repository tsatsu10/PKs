import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { db } from './client';
import { unwrap } from './unwrap';
import { qk } from './keys';

export type TrailRow = { id: string; title: string; type: string; due_at?: string | null; updated_at: string; current_version: number; is_pinned?: boolean };

export function useDashboardStats(enabled: boolean) {
  return useQuery({
    queryKey: qk.dashboard.stats(),
    queryFn: async () => unwrap(await supabase.rpc('get_dashboard_stats')),
    enabled,
  });
}

export function useDashboardActivity(enabled: boolean) {
  return useQuery({
    queryKey: qk.dashboard.activity(),
    queryFn: async () => {
      const data = unwrap(await supabase.rpc('get_dashboard_activity')) as { trending_tags?: unknown; recent_links?: unknown } | null;
      return {
        trendingTags: Array.isArray(data?.trending_tags) ? data.trending_tags : [],
        recentLinks: Array.isArray(data?.recent_links) ? data.recent_links : [],
      };
    },
    enabled,
  });
}

export function useResumeObject(userId: string | null) {
  return useQuery({
    queryKey: qk.objects.resume(),
    queryFn: async () => {
      const row = unwrap(await db.from('knowledge_objects')
        .select('id, title, last_viewed_at')
        .eq('user_id', userId as string)
        .eq('is_deleted', false)
        .not('last_viewed_at', 'is', null)
        .order('last_viewed_at', { ascending: false })
        .limit(1)
        .maybeSingle()) as { id: string; title: string } | null;
      return row ? { id: row.id, title: row.title } : null;
    },
    enabled: !!userId,
  });
}

export function useTrailheadCandidates(userId: string | null) {
  return useQuery({
    queryKey: qk.objects.trailheads(),
    queryFn: async () => {
      const [pending, spark] = await Promise.all([
        db.from('knowledge_objects').select('id, title, type, due_at, updated_at, current_version')
          .eq('user_id', userId as string).eq('is_deleted', false).not('due_at', 'is', null).order('due_at', { ascending: true }).limit(3),
        db.from('knowledge_objects').select('id, title, type, updated_at, current_version, is_pinned')
          .eq('user_id', userId as string).eq('is_deleted', false)
          .order('is_pinned', { ascending: false }).order('updated_at', { ascending: false }).limit(6),
      ]);
      return { pending: (unwrap(pending) ?? []) as TrailRow[], spark: (unwrap(spark) ?? []) as TrailRow[] };
    },
    enabled: !!userId,
  });
}

export async function fetchObjectLinksBatch(ids: string[]): Promise<Record<string, { links: unknown[]; total: number }>> {
  const data = (unwrap(await supabase.rpc('get_object_links_batch', { p_object_ids: ids, p_limit_per: 3 })) ?? {}) as
    Record<string, { links?: unknown[]; total?: unknown }>;
  return Object.fromEntries(ids.map((id) => {
    const entry = data[id];
    return [id, entry ? { links: entry.links ?? [], total: Number(entry.total) || 0 } : { links: [], total: 0 }];
  }));
}
