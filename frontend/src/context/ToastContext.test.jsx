import { useEffect } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider, useToast, UNDO_TTL_MS } from './ToastContext';

const ref = { current: null };
function Grab({ intoRef }) {
  const toast = useToast();
  useEffect(() => { intoRef.current = toast; });
  return null;
}
const mount = () => render(<ToastProvider><Grab intoRef={ref} /></ToastProvider>);
const api = new Proxy({}, { get: (_t, k) => ref.current[k] });

describe('ToastContext', () => {
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
    let id;
    act(() => { id = api.addToast('info', 'Hello'); });
    expect(typeof id).toBe('string');
    act(() => { api.dismiss(id); });
    expect(screen.queryByText('Hello')).not.toBeInTheDocument();
  });
});
