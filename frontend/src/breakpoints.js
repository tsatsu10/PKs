/**
 * Breakpoint helpers for JS (e.g. show hamburger only when sidebar is hidden).
 * Values match CSS variables in index.css: --bp-sm, --bp-md, --bp-lg.
 */
import { useState, useEffect } from 'react';

const BP = { sm: 600, md: 768, lg: 900 };

export function getMatchMedia(query) {
  if (typeof window === 'undefined' || !window.matchMedia) return null;
  return window.matchMedia(query);
}

export function useIsMobile(threshold = BP.md) {
  const [matches, setMatches] = useState(() => {
    const m = getMatchMedia(`(max-width: ${threshold}px)`);
    return m ? m.matches : false;
  });
  useEffect(() => {
    const m = getMatchMedia(`(max-width: ${threshold}px)`);
    if (!m) return;
    queueMicrotask(() => setMatches(m.matches));
    const listener = () => setMatches(m.matches);
    m.addEventListener('change', listener);
    return () => m.removeEventListener('change', listener);
  }, [threshold]);
  return matches;
}

export { BP };

/** The app's mobile layout (bottom nav, collapsed headers): the same edge as the CSS `max-width: 768px` blocks. */
export const MOBILE_QUERY = `(max-width: ${BP.md}px)`;

/** At and above this width the dashboard activity panel is an inline sidebar; below it, a drawer (M9). */
export const ACTIVITY_INLINE_QUERY = '(min-width: 1280px)';
