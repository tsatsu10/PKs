import { useMemo } from 'react';
import { useTrailheadCandidates } from '../../../data/dashboard';

/**
 * Resolve Resume → Pending → Spark trailhead objects.
 * @param {{ userId: string | null, resumeObject: { id: string, title: string } | null }} options
 */
export function useTrailheads({ userId, resumeObject }) {
  const q = useTrailheadCandidates(userId);

  const { pendingObject, sparkObject } = useMemo(() => {
    const pendingList = (q.data?.pending ?? []).filter((o) => {
      if (resumeObject?.id === o.id) return false;
      if (!o.due_at) return false;
      return true;
    });
    const sparkCandidates = (q.data?.spark ?? []).filter((o) => {
      if (resumeObject?.id === o.id) return false;
      if (pendingList.some((p) => p.id === o.id)) return false;
      return true;
    });
    return {
      pendingObject: pendingList[0] ?? null,
      sparkObject: sparkCandidates[0] ?? null,
    };
  }, [q.data, resumeObject?.id]);

  return { resumeObject, pendingObject, sparkObject };
}
