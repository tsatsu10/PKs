import { vi } from 'vitest';

/** Stub window.matchMedia so `matches(query)` decides each media query. Restore with vi.restoreAllMocks(). */
export function stubMatchMedia(matches: (query: string) => boolean) {
  return vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList);
}
