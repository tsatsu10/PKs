/**
 * Browser storage that belongs to the signed-in user rather than the device.
 * Cleared on every sign-out (logout here, logout in another tab, session
 * expiry) so the next person to use this browser never sees it.
 *
 * Device preferences stay: pks-theme, pks-sidebar-collapsed,
 * pks-dashboard-density, pks-dashboard-view, pks-onboarding-dismissed.
 */
import { clearAllDrafts } from './draftStorage';
import { RUN_PROMPT_STORAGE_KEY } from '../constants';
import { SAVED_FILTERS_KEY } from '../features/dashboard/lib/dashboardUtils';

/** Keys left in localStorage by deleted features (Pulse targets, main-menu deck). */
export const ORPHANED_LOCAL_STORAGE_KEYS = ['pks-pulse-targets', 'pks-main-menu-deck'];

/** Every per-user localStorage key: the single list to extend when a feature stores user data. */
export const USER_LOCAL_STORAGE_KEYS = [SAVED_FILTERS_KEY, ...ORPHANED_LOCAL_STORAGE_KEYS];

function removeLocal(keys) {
  keys.forEach((key) => {
    try { localStorage.removeItem(key); } catch (_e) { void _e; }
  });
}

/** Remove every per-user localStorage key, keeping device preferences. */
export function clearUserLocalData() {
  removeLocal(USER_LOCAL_STORAGE_KEYS);
}

/** Remove the keys orphaned by deleted features (safe to run on every app start). */
export function clearOrphanedLocalData() {
  removeLocal(ORPHANED_LOCAL_STORAGE_KEYS);
}

/**
 * Remove everything this tab holds for the signed-in user: drafts, the pending
 * "run prompt" hand-off (sessionStorage) and per-user localStorage.
 */
export function clearUserData() {
  clearAllDrafts();
  try { sessionStorage.removeItem(RUN_PROMPT_STORAGE_KEY); } catch (_e) { void _e; }
  clearUserLocalData();
}
