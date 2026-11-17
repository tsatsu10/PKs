import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ToastProvider } from '../../components/ui/Toaster';
import ConflictBar from './ConflictBar';
import type { SaveQueue } from './save/saveQueue';

vi.mock('../../lib/reportError', () => ({ reportError: vi.fn() }));

function fakeQueue(over: Partial<SaveQueue> = {}) {
  return { keepMine: vi.fn(async () => {}), loadTheirs: vi.fn(async () => {}), ...over } as unknown as SaveQueue;
}
const renderBar = (queue: SaveQueue, onLoaded = vi.fn()) =>
  render(<ToastProvider><ConflictBar queue={queue} onLoaded={onLoaded} /></ToastProvider>);

describe('ConflictBar', () => {
  it('Keep mine and Load theirs call the queue; Load theirs confirms with a toast', async () => {
    const queue = fakeQueue();
    const onLoaded = vi.fn();
    renderBar(queue, onLoaded);
    expect(screen.getByText('This changed elsewhere.')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Keep mine' })); });
    expect(queue.keepMine).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Load theirs' })); });
    expect(queue.loadTheirs).toHaveBeenCalledTimes(1);
    expect(onLoaded).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Your version was saved to history')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View their version in History' })).toBeInTheDocument();
  });

  it('disables both buttons while one runs', async () => {
    let finish = () => {};
    const queue = fakeQueue({ keepMine: vi.fn(() => new Promise<void>((r) => { finish = r; })) });
    renderBar(queue);
    fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
    expect(screen.getByRole('button', { name: 'Keep mine' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Load theirs' })).toBeDisabled();
    await act(async () => { finish(); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Load theirs' })).toBeEnabled());
  });

  it('a failure shows an error toast and keeps the bar', async () => {
    const queue = fakeQueue({ keepMine: vi.fn(async () => { throw { message: 'Failed to fetch' }; }) });
    renderBar(queue);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Keep mine' })); });
    expect(await screen.findByText(/reach the server/)).toBeInTheDocument();
    expect(screen.getByText('This changed elsewhere.')).toBeInTheDocument();
  });
});
