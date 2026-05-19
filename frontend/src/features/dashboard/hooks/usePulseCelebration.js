import { useState, useEffect, useRef } from 'react';

const CELEBRATE_MS = 220;
const RINGS = ['capture', 'tend', 'close'];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function celebratedToday(ring) {
  try {
    return localStorage.getItem(`pks-pulse-celebrated-${ring}-${todayKey()}`) === '1';
  } catch {
    return false;
  }
}

function markCelebratedToday(ring) {
  try {
    localStorage.setItem(`pks-pulse-celebrated-${ring}-${todayKey()}`, '1');
  } catch {
    /* ignore */
  }
}

function ringComplete(values, targets, ring) {
  const target = targets[ring] ?? 0;
  if (target <= 0) return false;
  return (values[ring] ?? 0) >= target;
}

/**
 * Fires a one-time hero bloom when a pulse ring newly hits its daily target.
 * Persists per-ring per-day in localStorage; respects prefers-reduced-motion.
 */
export function usePulseCelebration(values, targets, loading) {
  const [celebrateRing, setCelebrateRing] = useState(null);
  const prevCompleteRef = useRef({ capture: false, tend: false, close: false });
  const initializedRef = useRef(false);
  const timerRef = useRef(null);

  const clearCelebrate = () => setCelebrateRing(null);

  useEffect(() => {
    if (loading) return;

    if (!initializedRef.current) {
      RINGS.forEach((ring) => {
        prevCompleteRef.current[ring] = ringComplete(values, targets, ring);
      });
      initializedRef.current = true;
      return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      RINGS.forEach((ring) => {
        prevCompleteRef.current[ring] = ringComplete(values, targets, ring);
      });
      return;
    }

    for (const ring of RINGS) {
      const complete = ringComplete(values, targets, ring);
      const wasComplete = prevCompleteRef.current[ring];
      prevCompleteRef.current[ring] = complete;

      if (complete && !wasComplete && !celebratedToday(ring)) {
        markCelebratedToday(ring);
        setCelebrateRing(ring);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCelebrateRing(null), CELEBRATE_MS);
        break;
      }
    }
  }, [values, targets, loading]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return { celebrateRing, clearCelebrate };
}
