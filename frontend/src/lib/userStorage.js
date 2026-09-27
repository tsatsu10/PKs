/**
 * Browser storage that belongs to the signed-in user rather than the device.
 *
 * - Deliberate logout (this tab or another): cleared, so the next person to use
 *   this browser never sees it.
 * - Session expiry: kept (a user mid-edit must not lose unsaved work), with the
 *   owner recorded; when a user next signs in, it is cleared only if that user
 *   is someone else ({@link claimUserData}).
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

/**
 * sessionStorage: id of the user who owns this tab's drafts and run prompt.
 * Per tab, like the drafts ('pks-drafts-', not 'pks-draft-', so clearAllDrafts
 * doesn't treat it as a draft).
 */
export const DRAFT_OWNER_KEY = 'pks-drafts-owner';

/** localStorage: id of the user who owns the per-user localStorage keys (shared by all tabs). */
export const DATA_OWNER_KEY = 'pks-data-owner';

function removeLocal(keys) {
  keys.forEach((key) => {
    try { localStorage.removeItem(key); } catch (_e) { void _e; }
  });
}

function readItem(storage, key) {
  try { return storage.getItem(key); } catch { return null; }
}

function writeItem(storage, key, value) {
  try { storage.setItem(key, value); } catch (_e) { void _e; }
}

function clearTabUserData() {
  clearAllDrafts();
  try { sessionStorage.removeItem(RUN_PROMPT_STORAGE_KEY); } catch (_e) { void _e; }
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
 * Deliberate sign-out: remove everything this tab holds for the user (drafts,
 * the pending "run prompt" hand-off, per-user localStorage) and the owner markers.
 */
export function clearUserData() {
  clearTabUserData();
  clearUserLocalData();
  try { sessionStorage.removeItem(DRAFT_OWNER_KEY); } catch (_e) { void _e; }
  removeLocal([DATA_OWNER_KEY]);
}

/**
 * Whether stored data recorded for `recordedOwner` must be discarded now that
 * `userId` is signing in. Unowned data (written before owners were recorded)
 * is adopted, not discarded.
 * @param {string | null} recordedOwner
 * @param {string} userId
 * @returns {boolean}
 */
export function shouldClearForOwner(recordedOwner, userId) {
  return recordedOwner != null && recordedOwner !== userId;
}

/**
 * A user became signed in: drop data left by a different user (e.g. after the
 * previous user's session expired) and record `userId` as the owner. Drafts are
 * checked against this tab's owner, per-user localStorage against the shared one.
 * @param {string | null | undefined} userId
 */
export function claimUserData(userId) {
  if (!userId) return;
  if (shouldClearForOwner(readItem(sessionStorage, DRAFT_OWNER_KEY), userId)) clearTabUserData();
  writeItem(sessionStorage, DRAFT_OWNER_KEY, userId);
  if (shouldClearForOwner(readItem(localStorage, DATA_OWNER_KEY), userId)) clearUserLocalData();
  writeItem(localStorage, DATA_OWNER_KEY, userId);
}
