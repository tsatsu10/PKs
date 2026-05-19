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
  const [activity, setActivity] = useState(EMPTY_ACTIVITY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setActivity(EMPTY_ACTIVITY);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const cancelDefer = deferAfterPaint(() => {
      (async () => {
        setLoading(true);
        const { data, error } = await supabase.rpc('get_dashboard_activity');
        if (cancelled) return;

        if (error || !data) {
          setActivity(EMPTY_ACTIVITY);
          setLoading(false);
          return;
        }

        setActivity({
          capture7d: Array.isArray(data.capture_7d) ? data.capture_7d : [],
          tend7d: Array.isArray(data.tend_7d) ? data.tend_7d : [],
          trendingTags: Array.isArray(data.trending_tags) ? data.trending_tags : [],
          recentLinks: Array.isArray(data.recent_links) ? data.recent_links : [],
        });
        setLoading(false);
      })();
    });

    return () => {
      cancelled = true;
      cancelDefer();
    };
  }, [userId]);

  return { activity, loading };
}
