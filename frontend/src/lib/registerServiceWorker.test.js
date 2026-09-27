import { describe, it, expect, vi } from 'vitest';
import { registerServiceWorker } from './registerServiceWorker';

function fakeContainer({ controlled = true, waiting = true } = {}) {
  const container = new EventTarget();
  container.controller = controlled ? {} : null;
  const registration = new EventTarget();
  registration.waiting = waiting ? { postMessage: vi.fn() } : null;
  registration.installing = null;
  registration.update = vi.fn(async () => {});
  container.register = vi.fn(async () => registration);
  return { container, registration };
}

describe('registerServiceWorker', () => {
  it('offers a waiting worker, and reloads only the tab whose user applied it', async () => {
    const { container, registration } = fakeContainer();
    const reload = vi.fn();
    const onUpdateReady = vi.fn();
    await registerServiceWorker({ container, onUpdateReady, reload });
    expect(onUpdateReady).toHaveBeenCalledTimes(1);

    // Another tab activated the new worker: this tab must NOT reload.
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled();

    // The user clicks Reload in this tab.
    onUpdateReady.mock.calls[0][0]();
    expect(registration.waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not offer an update on first install (page not yet controlled)', async () => {
    const { container } = fakeContainer({ controlled: false });
    const onUpdateReady = vi.fn();
    await registerServiceWorker({ container, onUpdateReady, reload: vi.fn() });
    expect(onUpdateReady).not.toHaveBeenCalled();
  });

  it('reloads directly when another tab already activated the update before this tab clicked Reload', async () => {
    const { container, registration } = fakeContainer();
    const reload = vi.fn();
    const onUpdateReady = vi.fn();
    await registerServiceWorker({ container, onUpdateReady, reload });

    // Another tab clicked Reload first: the waiting worker activates, then
    // this tab observes the controller change (the browser flips the
    // worker's state to 'activated' before firing controllerchange).
    registration.waiting.state = 'activated';
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled();

    // This tab's user now clicks Reload; the worker is already active, so reload directly.
    onUpdateReady.mock.calls[0][0]();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('offers a worker that was already installing when register() resolved', async () => {
    const { container, registration } = fakeContainer({ waiting: false });
    const installing = new EventTarget();
    installing.state = 'installing';
    installing.postMessage = vi.fn();
    registration.installing = installing;
    const onUpdateReady = vi.fn();
    await registerServiceWorker({ container, onUpdateReady, reload: vi.fn(), doc: new EventTarget() });
    expect(onUpdateReady).not.toHaveBeenCalled();

    installing.state = 'installed';
    installing.dispatchEvent(new Event('statechange'));
    expect(onUpdateReady).toHaveBeenCalledTimes(1);
    onUpdateReady.mock.calls[0][0]();
    expect(installing.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('checks for updates when the tab becomes visible, ignoring offline failures', async () => {
    const { container, registration } = fakeContainer({ waiting: false });
    registration.update = vi.fn(async () => { throw new Error('offline'); });
    const doc = new EventTarget();
    doc.visibilityState = 'hidden';
    await registerServiceWorker({ container, onUpdateReady: vi.fn(), reload: vi.fn(), doc, updateIntervalMs: 0 });

    doc.dispatchEvent(new Event('visibilitychange'));
    expect(registration.update).not.toHaveBeenCalled();

    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(registration.update).toHaveBeenCalledTimes(1);
    await Promise.resolve();
  });

  it('checks for updates on an interval for long-lived tabs', async () => {
    vi.useFakeTimers();
    try {
      const { container, registration } = fakeContainer({ waiting: false });
      await registerServiceWorker({ container, onUpdateReady: vi.fn(), reload: vi.fn(), doc: new EventTarget(), updateIntervalMs: 1000 });
      expect(registration.update).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2000);
      expect(registration.update).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
