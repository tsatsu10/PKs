/**
 * Register the Workbox service worker and surface updates without ever
 * reloading a tab the user didn't ask to reload. Only the tab whose user
 * clicks "Reload" reloads; other open tabs keep their state and see the prompt.
 * If another tab already activated the update before this tab's user clicks
 * Reload, this tab reloads directly instead of posting SKIP_WAITING again.
 * The generated sw.js (vite-plugin-pwa, registerType 'prompt') activates on
 * a { type: 'SKIP_WAITING' } message.
 * @param {{
 *   onUpdateReady: (apply: () => void) => void,
 *   container?: ServiceWorkerContainer,
 *   reload?: () => void,
 *   url?: string,
 * }} options
 */
export async function registerServiceWorker({
  onUpdateReady,
  container = navigator.serviceWorker,
  reload = () => window.location.reload(),
  url = '/sw.js',
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

  if (registration.waiting) offer(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed') offer(installing);
    });
  });
}
