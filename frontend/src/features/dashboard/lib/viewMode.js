export const VIEW_MODE_KEY = 'pks-dashboard-view';

/** @typedef {'stream' | 'card' | 'table'} DashboardViewMode */

/** @returns {DashboardViewMode} */
export function loadViewMode() {
  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY) || 'stream';
    if (raw === 'list') return 'stream';
    if (raw === 'card' || raw === 'table' || raw === 'stream') return raw;
    return 'stream';
  } catch {
    return 'stream';
  }
}

/** @param {DashboardViewMode} mode */
export function saveViewMode(mode) {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}
