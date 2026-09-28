import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import UpdatePrompt from './UpdatePrompt';
import { markUpdateAvailable, resetUpdateStateForTests } from '../lib/pwaUpdate';

describe('UpdatePrompt', () => {
  beforeEach(() => resetUpdateStateForTests());

  it('stays hidden until an update is available, then reloads on click', () => {
    const apply = vi.fn();
    render(<UpdatePrompt />);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => markUpdateAvailable(apply));
    expect(screen.getByRole('status')).toHaveTextContent('A new version of PKS is available');
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('can be dismissed', () => {
    render(<UpdatePrompt />);
    act(() => markUpdateAvailable(vi.fn()));
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
