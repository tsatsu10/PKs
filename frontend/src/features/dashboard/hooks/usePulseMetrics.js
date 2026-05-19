import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { deferAfterPaint } from '../../../lib/defer';

const DEFAULT_TARGETS = { capture: 2, tend: 5, close: 1 };
const TARGETS_KEY = 'pks-pulse-targets';

export function loadPulseTargets() {
  try {
    const raw = localStorage.getItem(TARGETS_KEY);
    if (!raw) return { ...DEFAULT_TARGETS };
    const parsed = JSON.parse(raw);
    return {
      capture: Number(parsed.capture) || DEFAULT_TARGETS.capture,
      tend: Number(parsed.tend) || DEFAULT_TARGETS.tend,
      close: Number(parsed.close) || DEFAULT_TARGETS.close,
    };
  } catch {
    return { ...DEFAULT_TARGETS };
  }
}

export function savePulseTargets(targets) {
  try {
    localStorage.setItem(TARGETS_KEY, JSON.stringify(targets));
  } catch {
    /* ignore */
  }
}

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Daily pulse ring metrics (capture / tend / close).
 * @param {string | null} userId
 */
export function usePulseMetrics(userId) {
  const [targets, setTargets] = useState(loadPulseTargets);
  const [values, setValues] = useState({ capture: 0, tend: 0, close: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const cancelDefer = deferAfterPaint(() => {
      (async () => {
        setLoading(true);
        const since = startOfTodayIso();
        const { data: stats } = await supabase.rpc('get_dashboard_stats');
        if (cancelled) return;

        if (stats?.pulse) {
          setValues({
            capture: Number(stats.pulse.capture_today) || 0,
            tend: Number(stats.pulse.tend_today) || 0,
            close: Number(stats.pulse.close_today) || 0,
          });
          setLoading(false);
          return;
        }

        const [createdRes, updatedRes, closedRes] = await Promise.all([
          supabase
            .from('knowledge_objects')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_deleted', false)
            .gte('created_at', since),
          supabase
            .from('knowledge_objects')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_deleted', false)
            .gte('updated_at', since),
          supabase
            .from('knowledge_objects')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_deleted', false)
            .eq('status', 'archived')
            .gte('updated_at', since),
        ]);

        if (!cancelled) {
          setValues({
            capture: createdRes.count ?? 0,
            tend: updatedRes.count ?? 0,
            close: closedRes.count ?? 0,
          });
          setLoading(false);
        }
      })();
    });

    return () => {
      cancelled = true;
      cancelDefer();
    };
  }, [userId]);

  const updateTargets = (next) => {
    setTargets(next);
    savePulseTargets(next);
  };

  return { values, targets, updateTargets, loading };
}
