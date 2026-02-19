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
    setMatches(m.matches);
    const listener = () => setMatches(m.matches);
    m.addEventListener('change', listener);
    return () => m.removeEventListener('change', listener);
  }, [threshold]);
  return matches;
}

export { BP };
