/**
 * Run work after first paint / when the browser is idle.
 * @param {() => void} fn
 * @param {{ delay?: number, timeout?: number }} [options]
 * @returns {() => void} cancel
 */
export function deferAfterPaint(fn, { delay = 300, timeout = 2000 } = {}) {
  let cancelled = false;
  let idleId;
  let timeoutId;

  const run = () => {
    if (!cancelled) fn();
  };

  if (typeof requestIdleCallback !== 'undefined') {
    idleId = requestIdleCallback(run, { timeout });
  } else {
    timeoutId = setTimeout(run, delay);
  }

  return () => {
    cancelled = true;
    if (idleId != null && typeof cancelIdleCallback !== 'undefined') {
      cancelIdleCallback(idleId);
    }
    if (timeoutId != null) clearTimeout(timeoutId);
  };
}
