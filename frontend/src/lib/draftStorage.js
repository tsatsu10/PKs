/**
 * Draft persistence so content survives page refresh (sessionStorage).
 * Keys: pks-draft-new, pks-draft-quick, pks-draft-{objectId}
 */

const PREFIX = 'pks-draft-';

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

export function setDraft(key, data) {
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch (_) {}
}

export function clearDraft(key) {
  try {
    sessionStorage.removeItem(key);
  } catch (_) {}
}
