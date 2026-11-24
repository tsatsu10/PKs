import { useEffect } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { ToastProvider, useToast, UNDO_TTL_MS } from './Toaster';

type ToastApi = ReturnType<typeof useToast>;
const ref: { current: ToastApi | null } = { current: null };
function Grab() {
  const toast = useToast();
  useEffect(() => { ref.current = toast; });
  return null;
}
const mount = () => render(<ToastProvider><Grab /></ToastProvider>);
const api = new Proxy({} as ToastApi, { get: (_t, k: keyof ToastApi) => ref.current![k] });

describe('Toaster', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('renders an action button that runs the action and dismisses the toast', () => {
    mount();
    const onClick = vi.fn();
    act(() => { api.addToast('success', 'Tag removed', { action: { label: 'Undo', onClick } }); });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Tag removed')).not.toBeInTheDocument();
  });

  it('keeps an undo toast for exactly UNDO_TTL_MS', () => {
    vi.useFakeTimers();
    mount();
    expect(UNDO_TTL_MS).toBe(6000);
    act(() => { api.addToast('success', 'Moved to Trash', { ttlMs: UNDO_TTL_MS }); });
    act(() => { vi.advanceTimersByTime(5999); });
    expect(screen.getByText('Moved to Trash')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByText('Moved to Trash')).not.toBeInTheDocument();
  });

  it('returns an id that dismiss accepts', () => {
    mount();
    let id = '';
    act(() => { id = api.addToast('info', 'Hello'); });
    expect(typeof id).toBe('string');
    act(() => { api.dismiss(id); });
    expect(screen.queryByText('Hello')).not.toBeInTheDocument();
  });

  it('pauses while hovered and resumes with the time that was left', () => {
    vi.useFakeTimers();
    mount();
    act(() => { api.addToast('success', 'Moved to Trash', { ttlMs: UNDO_TTL_MS }); });
    const toast = screen.getByText('Moved to Trash').closest('.ui-toast')!;
    act(() => { vi.advanceTimersByTime(4000); });
    fireEvent.mouseEnter(toast);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByText('Moved to Trash')).toBeInTheDocument();
    fireEvent.mouseLeave(toast);
    act(() => { vi.advanceTimersByTime(1999); });
    expect(screen.getByText('Moved to Trash')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByText('Moved to Trash')).not.toBeInTheDocument();
  });

  it('pauses while focus is inside, also after the pointer leaves', () => {
    vi.useFakeTimers();
    mount();
    act(() => { api.addToast('success', 'Tag removed', { ttlMs: UNDO_TTL_MS, action: { label: 'Undo', onClick: () => {} } }); });
    const undo = screen.getByRole('button', { name: 'Undo' });
    const toast = undo.closest('.ui-toast')!;
    fireEvent.mouseEnter(toast);
    act(() => { undo.focus(); });
    fireEvent.mouseLeave(toast);
    // Focus moving between the toast's own buttons keeps it paused.
    act(() => { screen.getByRole('button', { name: 'Dismiss notification' }).focus(); });
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByText('Tag removed')).toBeInTheDocument();
    act(() => { screen.getByRole('button', { name: 'Dismiss notification' }).blur(); });
    act(() => { vi.advanceTimersByTime(UNDO_TTL_MS); });
    expect(screen.queryByText('Tag removed')).not.toBeInTheDocument();
  });

  it('keeps error toasts until dismissed', () => {
    vi.useFakeTimers();
    mount();
    act(() => { api.addToast('error', "Couldn't save"); });
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByText("Couldn't save")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText("Couldn't save")).not.toBeInTheDocument();
  });

  it('still times out success and info toasts after 4 seconds', () => {
    vi.useFakeTimers();
    mount();
    act(() => { api.addToast('info', 'Copied'); });
    act(() => { vi.advanceTimersByTime(3999); });
    expect(screen.getByText('Copied')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
  });

  it('mounts empty live regions', () => {
    mount();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });

  it('puts errors in the alert region and others in the status region', () => {
    mount();
    act(() => {
      api.addToast('error', 'Save failed');
      api.addToast('success', 'Saved');
      api.addToast('info', 'Heads up');
    });
    const alert = screen.getByRole('alert');
    const status = screen.getByRole('status');
    expect(within(alert).getByText('Save failed')).toBeInTheDocument();
    expect(within(status).getByText('Saved')).toBeInTheDocument();
    expect(within(status).getByText('Heads up')).toBeInTheDocument();
    expect(within(status).queryByText('Save failed')).toBeNull();
    // No toast carries its own live role.
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('drops the oldest non-error toast past four', () => {
    mount();
    act(() => {
      api.addToast('error', 'E1');
      api.addToast('success', 'S1');
      api.addToast('success', 'S2');
      api.addToast('info', 'I1');
      api.addToast('info', 'I2');
    });
    expect(screen.queryByText('S1')).toBeNull();
    for (const m of ['E1', 'S2', 'I1', 'I2']) expect(screen.getByText(m)).toBeInTheDocument();
  });

  it('drops the oldest error when four errors are showing', () => {
    mount();
    act(() => {
      for (const m of ['E1', 'E2', 'E3', 'E4', 'E5']) api.addToast('error', m);
    });
    expect(screen.queryByText('E1')).toBeNull();
    for (const m of ['E2', 'E3', 'E4', 'E5']) expect(screen.getByText(m)).toBeInTheDocument();
  });

  it('keeps every undo toast, even with the same message', () => {
    mount();
    const undoA = vi.fn();
    const undoB = vi.fn();
    let a = '';
    let b = '';
    act(() => {
      a = api.addToast('success', 'Tag removed', { ttlMs: UNDO_TTL_MS, action: { label: 'Undo', onClick: undoA } });
      b = api.addToast('success', 'Tag removed', { ttlMs: UNDO_TTL_MS, action: { label: 'Undo', onClick: undoB } });
    });
    expect(b).not.toBe(a);
    const undos = screen.getAllByRole('button', { name: 'Undo' });
    expect(undos).toHaveLength(2);
    fireEvent.click(undos[1]);
    expect(undoB).toHaveBeenCalledTimes(1);
    expect(undoA).not.toHaveBeenCalled();
  });

  it('shows a new toast when four errors are already showing', () => {
    mount();
    act(() => {
      for (const m of ['E1', 'E2', 'E3', 'E4']) api.addToast('error', m);
      api.addToast('success', 'Moved to Trash', { ttlMs: UNDO_TTL_MS, action: { label: 'Undo', onClick: () => {} } });
    });
    expect(screen.getByText('Moved to Trash')).toBeInTheDocument();
    expect(screen.queryByText('E1')).toBeNull();
    for (const m of ['E2', 'E3', 'E4']) expect(screen.getByText(m)).toBeInTheDocument();
  });

  it('does not stack identical toasts', () => {
    vi.useFakeTimers();
    mount();
    let first = '';
    let second = '';
    act(() => { first = api.addToast('success', 'Saved'); });
    act(() => { vi.advanceTimersByTime(3000); });
    act(() => { second = api.addToast('success', 'Saved'); });
    expect(second).toBe(first);
    expect(screen.getAllByText('Saved')).toHaveLength(1);
    // The timer restarted: 3 s later it is still showing.
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText('Saved')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });
});

describe('Toaster duplicates', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('does not restart a paused toast on a duplicate', () => {
    vi.useFakeTimers();
    mount();
    act(() => { api.addToast('success', 'Saved'); });
    const toast = within(screen.getByRole('status')).getByText('Saved').closest('.ui-toast')!;
    fireEvent.mouseEnter(toast);
    act(() => { api.addToast('success', 'Saved'); });
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByText('Saved')).toBeInTheDocument();
    fireEvent.mouseLeave(toast);
    act(() => { vi.advanceTimersByTime(3999); });
    expect(screen.getByText('Saved')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });
});
