/**
 * Tiny store for "a new service worker is waiting". The app only reloads when
 * the user clicks Reload, so a deploy never discards unsaved edits.
 */
let applyFn = null;
let available = false;
const listeners = new Set();

/** @param {() => void} apply - activates the waiting worker and reloads this tab */
export function markUpdateAvailable(apply) {
  applyFn = apply;
  available = true;
  listeners.forEach((listener) => listener());
}

export function isUpdateAvailable() {
  return available;
}

/** @param {() => void} listener @returns {() => void} unsubscribe */
export function subscribeUpdate(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function applyUpdate() {
  applyFn?.();
}

export function resetUpdateStateForTests() {
  applyFn = null;
  available = false;
  listeners.clear();
}
