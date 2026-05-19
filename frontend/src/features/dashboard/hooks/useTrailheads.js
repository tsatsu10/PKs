import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { deferAfterPaint } from '../../../lib/defer';

/**
 * Resolve Resume → Pending → Spark trailhead objects.
 * @param {{ userId: string | null, resumeObject: { id: string, title: string } | null }} options
 */
export function useTrailheads({ userId, resumeObject }) {
  const [pendingObject, setPendingObject] = useState(null);
  const [sparkObject, setSparkObject] = useState(null);

  useEffect(() => {
    if (!userId) {
      setPendingObject(null);
      setSparkObject(null);
      return;
    }

    let cancelled = false;
    const cancelDefer = deferAfterPaint(() => {
      (async () => {
        const nowIso = new Date().toISOString();
        const [pendingRes, sparkRes] = await Promise.all([
          supabase
            .from('knowledge_objects')
            .select('id, title, type, due_at, updated_at, current_version')
            .eq('user_id', userId)
            .eq('is_deleted', false)
            .not('due_at', 'is', null)
            .order('due_at', { ascending: true })
            .limit(3),
          supabase
            .from('knowledge_objects')
            .select('id, title, type, updated_at, current_version, is_pinned')
            .eq('user_id', userId)
            .eq('is_deleted', false)
            .order('is_pinned', { ascending: false })
            .order('updated_at', { ascending: false })
            .limit(6),
        ]);

        if (cancelled) return;

        const pendingList = (pendingRes.data || []).filter((o) => {
          if (resumeObject?.id === o.id) return false;
          if (!o.due_at) return false;
          return true;
        });
        setPendingObject(pendingList[0] ?? null);

        const sparkCandidates = (sparkRes.data || []).filter((o) => {
          if (resumeObject?.id === o.id) return false;
          if (pendingList.some((p) => p.id === o.id)) return false;
          return true;
        });
        setSparkObject(sparkCandidates[0] ?? null);
      })();
    });

    return () => {
      cancelled = true;
      cancelDefer();
    };
  }, [userId, resumeObject?.id]);

  return { resumeObject, pendingObject, sparkObject };
}
