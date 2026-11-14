import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { renderWithClient } from '../test/queryTestUtils';

const sb = vi.hoisted(() => ({ current: null }));
vi.mock('../lib/supabase', async () => {
  const { mockSupabase } = await import('../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import NotificationCenter from './NotificationCenter';

describe('NotificationCenter', () => {
  it('shows an error with Retry when the list fails instead of "no notifications"', async () => {
    sb.current.respond = (call) => (call.ops.some(([m, a]) => m === 'select' && a[1]?.head)
      ? { data: null, error: null, count: 2 }
      : { data: null, error: { code: 'PGRST000', message: 'down' } });
    renderWithClient(<MemoryRouter><NotificationCenter /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load notifications."));
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
