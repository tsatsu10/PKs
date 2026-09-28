/**
 * Draft persistence so content survives page refresh (sessionStorage).
 * Keys: pks-draft-new, pks-draft-quick, pks-draft-{objectId}
 */

const PREFIX = 'pks-draft-';

/**
 * sessionStorage: id of the user who owns this tab's drafts and run prompt.
 * Per tab, like the drafts ('pks-drafts-', not 'pks-draft-', so clearAllDrafts
 * doesn't treat it as a draft). Written by claimUserData (userStorage.js) when a
 * user becomes signed in, removed by clearUserData on deliberate sign-out.
 */
export const DRAFT_OWNER_KEY = 'pks-drafts-owner';

export const DRAFT_KEYS = {
  new: PREFIX + 'new',
  quick: PREFIX + 'quick',
  object: (id) => PREFIX + id,
};

export function getDraft(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Save a draft for the tab's current owner. A no-op when the tab has no owner:
 * a draft timer firing after logout cleared the owner (while signOut is still
 * pending) must not leave an unowned draft for the next user to adopt.
 * @param {string} key
 * @param {unknown} data
 */
export function setDraft(key, data) {
  try {
    if (!sessionStorage.getItem(DRAFT_OWNER_KEY)) return;
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch (_e) { void _e; }
}

export function clearDraft(key) {
  try {
    sessionStorage.removeItem(key);
  } catch (_e) { void _e; }
}

/** Remove every PKS draft (e.g. on logout, so the next user of this tab never sees them). */
export function clearAllDrafts() {
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
  } catch (_e) { void _e; }
}
