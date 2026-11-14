import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// jsdom has no matchMedia; Mantine (BlockNote's UI) calls it on mount.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  });
}
