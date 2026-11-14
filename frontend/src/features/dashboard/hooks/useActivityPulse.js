import { useDashboardActivity } from '../../../data/dashboard';

const EMPTY_ACTIVITY = {
  trendingTags: [],
  recentLinks: [],
};

/**
 * Right-rail activity data: trending tags, recent links.
 * @param {string | null} userId
 */
export function useActivityPulse(userId) {
  const q = useDashboardActivity(!!userId);
  return {
    activity: q.data ?? EMPTY_ACTIVITY,
    loading: !!userId && q.isPending,
    error: q.error,
    retry: () => q.refetch(),
  };
}
