/**
 * Register the Workbox service worker and surface updates without ever
 * reloading a tab the user didn't ask to reload. Only the tab whose user
 * clicks "Reload" reloads; other open tabs keep their state and see the prompt.
 * If another tab already activated the update before this tab's user clicks
 * Reload, this tab reloads directly instead of posting SKIP_WAITING again.
 * The generated sw.js (vite-plugin-pwa, registerType 'prompt') activates on
 * a { type: 'SKIP_WAITING' } message.
 * Long-lived tabs also check for a new worker every `updateIntervalMs` and
 * whenever the tab becomes visible again; failed checks (offline) are ignored.
 * @param {{
 *   onUpdateReady: (apply: () => void) => void,
 *   container?: ServiceWorkerContainer,
 *   reload?: () => void,
 *   url?: string,
 *   updateIntervalMs?: number,
 *   doc?: Document,
 * }} options - `updateIntervalMs` defaults to 60 minutes (0 disables the
 *   interval); `doc` is the document whose visibilitychange triggers a check.
 */
export async function registerServiceWorker({
  onUpdateReady,
  container = navigator.serviceWorker,
  reload = () => window.location.reload(),
  url = '/sw.js',
  updateIntervalMs = 60 * 60 * 1000,
  doc = typeof document === 'undefined' ? undefined : document,
}) {
  if (!container) return;
  let reloadRequested = false;
  container.addEventListener('controllerchange', () => {
    if (reloadRequested) reload();
  });

  const registration = await container.register(url, { scope: '/' });
  const offer = (worker) => {
    // No controller means first install: nothing to update from.
    if (!container.controller) return;
    onUpdateReady(() => {
      // Another tab may have already activated this worker (e.g. its user
      // clicked Reload first). Reload directly rather than posting
      // SKIP_WAITING to a worker that's already active, which would never
      // fire another controllerchange here.
      if (worker.state === 'activated') {
        reload();
        return;
      }
      reloadRequested = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
  };

  // Offer a worker once it finishes installing and is waiting.
  const watchInstalling = (installing) => {
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed') offer(installing);
    });
  };

  if (registration.waiting) offer(registration.waiting);
  // An update may already be installing by the time register() resolves;
  // its updatefound has fired, so watch it directly.
  watchInstalling(registration.installing);
  registration.addEventListener('updatefound', () => watchInstalling(registration.installing));

  const checkForUpdate = () => {
    try {
      registration.update()?.catch?.(() => {});
    } catch (_e) { void _e; }
  };
  if (updateIntervalMs > 0) setInterval(checkForUpdate, updateIntervalMs);
  doc?.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'visible') checkForUpdate();
  });
}
