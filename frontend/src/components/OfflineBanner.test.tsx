import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import OfflineBanner from './OfflineBanner';

afterEach(() => { vi.useRealTimers(); act(() => onlineManager.setOnline(true)); });

describe('OfflineBanner', () => {
  it('shows offline, then back online briefly, then nothing', () => {
    vi.useFakeTimers();
    render(<OfflineBanner />);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => onlineManager.setOnline(false));
    expect(screen.getByRole('status')).toHaveTextContent("You're offline. Showing saved data.");
    act(() => onlineManager.setOnline(true));
    expect(screen.getByRole('status')).toHaveTextContent('Back online.');
    act(() => vi.advanceTimersByTime(3001));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
