import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { deferAfterPaint } from '../../../lib/defer';

const EMPTY_ACTIVITY = {
  capture7d: [],
  tend7d: [],
  trendingTags: [],
  recentLinks: [],
};

/**
 * Right-rail activity data: 7-day sparklines, trending tags, recent links.
 * @param {string | null} userId
 */
export function useActivityPulse(userId) {
  // Keyed by userId: loading is derived as "no result yet for this user".
  const [result, setResult] = useState({ userId: null, activity: EMPTY_ACTIVITY });

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    const cancelDefer = deferAfterPaint(() => {
      (async () => {
        const { data, error } = await supabase.rpc('get_dashboard_activity');
        if (cancelled) return;

        if (error || !data) {
          setResult({ userId, activity: EMPTY_ACTIVITY });
          return;
        }

        setResult({ userId, activity: {
          capture7d: Array.isArray(data.capture_7d) ? data.capture_7d : [],
          tend7d: Array.isArray(data.tend_7d) ? data.tend_7d : [],
          trendingTags: Array.isArray(data.trending_tags) ? data.trending_tags : [],
          recentLinks: Array.isArray(data.recent_links) ? data.recent_links : [],
        } });
      })();
    });

    return () => {
      cancelled = true;
      cancelDefer();
    };
  }, [userId]);

  if (!userId) return { activity: EMPTY_ACTIVITY, loading: false };
  const loaded = result.userId === userId;
  return { activity: loaded ? result.activity : EMPTY_ACTIVITY, loading: !loaded };
}
