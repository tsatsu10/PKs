import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { createTestQueryClient } from '../test/queryTestUtils';
import { ToastProvider } from '../components/ui/Toaster';
import { holdNext } from '../features/object/testUtils';

const sb = vi.hoisted(() => ({ current: null }));
vi.mock('../lib/supabase', async () => {
  const { mockSupabase } = await import('../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));

import Trash from './Trash';

const ROWS = [{ id: 'o1', type: 'note', title: 'Gone', updated_at: '2026-11-01T00:00:00Z' }];

function renderTrash() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider><MemoryRouter><Trash /></MemoryRouter></ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  sb.current.calls.length = 0;
  sb.current.respond = (call) => (call.ops.some(([m]) => m === 'update') ? { data: [], error: null } : { data: ROWS, error: null });
});

describe('Trash restore', () => {
  it('removes the row at once, before the update finishes', async () => {
    renderTrash();
    const restore = await screen.findByRole('button', { name: 'Restore' });
    const d = holdNext(sb.current);
    fireEvent.click(restore);
    expect(screen.queryByText('Gone')).not.toBeInTheDocument();
    await act(async () => { d.resolve({ data: [], error: null }); });
  });

  it('puts the row back when the update fails', async () => {
    renderTrash();
    const restore = await screen.findByRole('button', { name: 'Restore' });
    const d = holdNext(sb.current);
    fireEvent.click(restore);
    await act(async () => { d.resolve({ data: null, error: { code: 'PGRST000', message: 'down' } }); });
    await waitFor(() => expect(screen.getByText('Gone')).toBeInTheDocument());
  });
});
