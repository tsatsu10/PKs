import { describe, it, expect, vi } from 'vitest';
import { registerServiceWorker } from './registerServiceWorker';

function fakeContainer({ controlled = true, waiting = true } = {}) {
  const container = new EventTarget();
  container.controller = controlled ? {} : null;
  const registration = new EventTarget();
  registration.waiting = waiting ? { postMessage: vi.fn() } : null;
  registration.installing = null;
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
});
