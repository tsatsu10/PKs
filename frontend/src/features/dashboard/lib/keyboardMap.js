const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
export const modKey = isMac ? '⌘' : 'Ctrl';

/** Dashboard + global shortcuts for ShortcutsModal (single source of truth). */
export const DASHBOARD_SHORTCUTS = [
  { keys: `${modKey}+K`, description: 'Command palette / focus search' },
  { keys: `${modKey}+[`, description: 'Previous page (dashboard list)' },
  { keys: `${modKey}+]`, description: 'Next page (dashboard list)' },
  { keys: '/', description: 'Quick add on dashboard, or focus search elsewhere' },
  { keys: 'c', description: 'Quick add object (dashboard, no input focused)' },
  { keys: 'j / k', description: 'Next / previous row in list' },
  { keys: '↑ / ↓', description: 'Next / previous row in list' },
  { keys: 'Esc', description: 'Clear selection or close panel' },
  { keys: '⌥1 / ⌥2 / ⌥3', description: 'Open Resume / Pending / Spark trailhead (Mac)' },
  { keys: 'Alt+1 / Alt+2 / Alt+3', description: 'Open Resume / Pending / Spark trailhead (Windows)' },
  { keys: '1 / 2 / 3', description: 'Switch view: Stream / Cards / Table' },
  { keys: '?', description: 'Keyboard shortcuts help' },
];

export const GLOBAL_SHORTCUTS = [
  { keys: `${modKey}+N`, description: 'New object' },
  { keys: `${modKey}+Shift+Q`, description: 'Quick capture' },
  { keys: `${modKey}+Shift+S`, description: 'Search page' },
  { keys: `${modKey}+Shift+R`, description: 'Run prompt (on object page)' },
];

export function getAllShortcutRows() {
  return [...DASHBOARD_SHORTCUTS, ...GLOBAL_SHORTCUTS];
}
