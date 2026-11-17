import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { createTestQueryClient } from '../test/queryTestUtils';
import { ToastProvider } from '../components/ui/Toaster';
import { deferred } from '../features/object/testUtils';

const sb = vi.hoisted(() => ({ current: null }));
vi.mock('../lib/supabase', async () => {
  const { mockSupabase } = await import('../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('../components/BlockNoteEditor', () => ({
  default: ({ value, onChange }) => <textarea aria-label="Body" value={value} onChange={(e) => onChange(e.target.value)} />,
}));
const side = vi.hoisted(() => ({ logAudit: vi.fn(), deliverWebhookEvent: vi.fn(), createNotification: vi.fn() }));
vi.mock('../lib/audit', () => ({ logAudit: side.logAudit }));
vi.mock('../lib/webhooks', () => ({ deliverWebhookEvent: side.deliverWebhookEvent }));
vi.mock('../lib/notifications', () => ({ createNotification: side.createNotification }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));

import QuickCapture from './QuickCapture';

const OK = { data: [], error: null };
const isObjectInsert = (call) => call.table === 'knowledge_objects' && call.ops.some(([m]) => m === 'insert');

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  sb.current.calls.length = 0;
  navigate.mockReset();
  Object.values(side).forEach((f) => f.mockReset());
});

describe('QuickCapture', () => {
  it('opens the captured note before the insert finishes; the audit waits for it', async () => {
    const insert = deferred();
    sb.current.respond = (call) => (isObjectInsert(call) ? insert.promise : OK);
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ToastProvider><MemoryRouter><QuickCapture /></MemoryRouter></ToastProvider>
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByPlaceholderText('Short title'), { target: { value: 'Thought' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Body' }), { target: { value: 'details' } });
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    const [path] = navigate.mock.calls[0];
    expect(path).toMatch(/^\/objects\/[0-9a-f-]{36}$/);
    const id = path.split('/').pop();
    const sent = sb.current.calls.find(isObjectInsert).ops.find(([m]) => m === 'insert')[1][0];
    expect(sent).toMatchObject({ id, user_id: 'owner', type: 'note', title: 'Thought', content: 'details' });
    expect(side.logAudit).not.toHaveBeenCalled();
    await act(async () => { insert.resolve(OK); await Promise.resolve(); });
    await waitFor(() => expect(side.logAudit).toHaveBeenCalledWith('owner', expect.anything(), expect.anything(), id, expect.objectContaining({ title: 'Thought' })));
    expect(side.createNotification).toHaveBeenCalled();
  });
});
