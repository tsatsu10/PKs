import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePulseCelebration } from './usePulseCelebration';

describe('usePulseCelebration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not celebrate on initial load when already complete', () => {
    const { result, rerender } = renderHook(
      ({ values, targets, loading }) => usePulseCelebration(values, targets, loading),
      {
        initialProps: {
          values: { capture: 2, tend: 0, close: 0 },
          targets: { capture: 2, tend: 5, close: 1 },
          loading: true,
        },
      }
    );

    rerender({
      values: { capture: 2, tend: 0, close: 0 },
      targets: { capture: 2, tend: 5, close: 1 },
      loading: false,
    });

    expect(result.current.celebrateRing).toBeNull();
  });

  it('celebrates when a ring newly reaches its target', () => {
    const { result, rerender } = renderHook(
      ({ values, targets, loading }) => usePulseCelebration(values, targets, loading),
      {
        initialProps: {
          values: { capture: 1, tend: 0, close: 0 },
          targets: { capture: 2, tend: 5, close: 1 },
          loading: false,
        },
      }
    );

    rerender({
      values: { capture: 1, tend: 0, close: 0 },
      targets: { capture: 2, tend: 5, close: 1 },
      loading: false,
    });

    rerender({
      values: { capture: 2, tend: 0, close: 0 },
      targets: { capture: 2, tend: 5, close: 1 },
      loading: false,
    });

    expect(result.current.celebrateRing).toBe('capture');

    act(() => {
      vi.advanceTimersByTime(220);
    });

    expect(result.current.celebrateRing).toBeNull();
  });
});
