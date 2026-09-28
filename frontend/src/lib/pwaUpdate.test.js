import { describe, it, expect, vi, beforeEach } from 'vitest';
import { markUpdateAvailable, isUpdateAvailable, subscribeUpdate, applyUpdate, resetUpdateStateForTests } from './pwaUpdate';

describe('pwaUpdate store', () => {
  beforeEach(() => resetUpdateStateForTests());

  it('notifies subscribers and applies only on request', () => {
    const listener = vi.fn();
    const apply = vi.fn();
    const unsubscribe = subscribeUpdate(listener);
    expect(isUpdateAvailable()).toBe(false);
    markUpdateAvailable(apply);
    expect(isUpdateAvailable()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
    applyUpdate();
    expect(apply).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
