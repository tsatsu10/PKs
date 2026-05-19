/**
 * Dashboard page constants and helpers.
 */
export const CARD_COLS_BREAKPOINT_2 = 720;
export const CARD_COLS_BREAKPOINT_3 = 1100;
export const DENSITY_KEY = 'pks-dashboard-density';
export const SAVED_FILTERS_KEY = 'pks-saved-filters';
export const SEARCH_DEBOUNCE_MS = 300;

export function getCardColumns(width) {
  if (width >= CARD_COLS_BREAKPOINT_3) return 3;
  if (width >= CARD_COLS_BREAKPOINT_2) return 2;
  return 1;
}

export function loadSavedFilters() {
  try {
    const raw = localStorage.getItem(SAVED_FILTERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function resolveOwnedObjectIds(selectedIds, objectList, ownerId) {
  if (!ownerId || selectedIds.size === 0) return [];
  const owned = new Set(objectList.filter((o) => o.user_id === ownerId).map((o) => o.id));
  return Array.from(selectedIds).filter((id) => owned.has(id));
}
