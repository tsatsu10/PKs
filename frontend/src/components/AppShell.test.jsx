import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, cleanup, render, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { renderWithClient, wrapperFor, createTestQueryClient } from '../test/queryTestUtils';
import { stubMatchMedia } from '../test/matchMedia';
import { modKey } from '../lib/keyboardMap';

const sb = vi.hoisted(() => ({ current: null }));
vi.mock('../lib/supabase', async () => {
  const { mockSupabase } = await import('../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'me@example.com' }, logout: () => {} }) }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ resolvedTheme: 'dark', cycleTheme: () => {} }) }));

import ShortcutsModal from './ShortcutsModal';
import NotificationCenter from './NotificationCenter';
import AppLayout from './AppLayout';

let root;
beforeEach(() => {
  root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
  stubMatchMedia(() => false);
  // The unread count is a head request; the list is a normal select.
  sb.current.respond = (call) => (call.ops.some(([m, a]) => m === 'select' && a[1]?.head)
    ? { data: null, error: null, count: 3 }
    : { data: [{ id: 'n1', title: 'Reminder', body: 'Review notes', created_at: new Date().toISOString(), read_at: null }], error: null });
});
afterEach(() => {
  cleanup();
  root.remove();
  vi.restoreAllMocks();
});

describe('ShortcutsModal', () => {
  it('opens shortcuts as a dialog and closes on Escape', () => {
    const onClose = vi.fn();
    render(<ShortcutsModal open onClose={onClose} />, { container: root });
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText('Keyboard shortcuts help')).toBeInTheDocument();
    expect(dialog.querySelectorAll('kbd').length).toBeGreaterThan(5);
    // A real modal: the page behind is inert and focus is inside the dialog.
    expect(root.hasAttribute('inert')).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(within(dialog).getByRole('button', { name: 'Close' }).querySelector('svg')).not.toBeNull();
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when closed', () => {
    render(<ShortcutsModal open={false} onClose={() => {}} />, { container: root });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('NotificationCenter', () => {
  const mount = () => render(<MemoryRouter><NotificationCenter /></MemoryRouter>, { container: root, wrapper: wrapperFor(createTestQueryClient()) });

  it('announces the unread count in the bell label', async () => {
    mount();
    expect(await screen.findByRole('button', { name: 'Notifications, 3 unread' })).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('opens as a dialog and closes on Escape with focus back on the bell', async () => {
    mount();
    const bell = await screen.findByRole('button', { name: 'Notifications, 3 unread' });
    bell.focus();
    fireEvent.click(bell);
    const dialog = screen.getByRole('dialog', { name: 'Notifications' });
    expect(await within(dialog).findByText('Reminder')).toBeInTheDocument();
    expect(root.hasAttribute('inert')).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(bell.querySelector('svg')).not.toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Mark all read' })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(bell));
  });
});

describe('AppLayout hints (M11)', () => {
  it('shows the platform modifier in the command hint', async () => {
    renderWithClient(<MemoryRouter initialEntries={['/settings']}><AppLayout><p>Page</p></AppLayout></MemoryRouter>);
    const hint = screen.getByRole('button', { name: /Search or jump/ });
    expect(hint).toHaveTextContent(modKey);
    expect(hint).toHaveTextContent('K');
    if (modKey !== '⌘') expect(document.body.textContent).not.toContain('⌘');
    expect(screen.getByRole('button', { name: 'Command palette' })).toHaveAttribute('title', `Command palette (${modKey}+K)`);
    await screen.findByRole('button', { name: /^Notifications/ });
  });
});
