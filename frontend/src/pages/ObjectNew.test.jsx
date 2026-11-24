import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { stubMatchMedia } from '../test/matchMedia';
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

import ObjectNew from './ObjectNew';
import { getDraft, DRAFT_KEYS, DRAFT_OWNER_KEY } from '../lib/draftStorage';
import { qk } from '../data/keys';

const OK = { data: [], error: null };
const isObjectInsert = (call) => call.table === 'knowledge_objects' && call.ops.some(([m]) => m === 'insert');

function renderNew(client = createTestQueryClient()) {
  render(
    <QueryClientProvider client={client}>
      <ToastProvider><MemoryRouter><ObjectNew /></MemoryRouter></ToastProvider>
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  sb.current.calls.length = 0;
  sb.current.respond = () => OK;
  navigate.mockReset();
  Object.values(side).forEach((f) => f.mockReset());
});

describe('ObjectNew', () => {
  it('opens the new object before the insert finishes; the audit waits for it', async () => {
    const insert = deferred();
    sb.current.respond = (call) => (isObjectInsert(call) ? insert.promise : OK);
    const client = renderNew();
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Fresh idea' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    const [path, opts] = navigate.mock.calls[0];
    expect(path).toMatch(/^\/objects\/[0-9a-f-]{36}$/);
    expect(opts).toEqual({ replace: true });
    const id = path.split('/').pop();
    expect(client.getQueryData(qk.object.detail(id))).toMatchObject({ id, title: 'Fresh idea', user_id: 'owner' });
    const sent = sb.current.calls.find(isObjectInsert).ops.find(([m]) => m === 'insert')[1][0];
    expect(sent).toMatchObject({ id, user_id: 'owner', title: 'Fresh idea', type: 'note' });
    expect(sent.slug).toMatch(/^fresh-idea-/);
    expect(side.logAudit).not.toHaveBeenCalled();
    await act(async () => { insert.resolve(OK); await Promise.resolve(); });
    await waitFor(() => expect(side.logAudit).toHaveBeenCalledWith('owner', expect.anything(), expect.anything(), id, expect.objectContaining({ title: 'Fresh idea' })));
    expect(side.deliverWebhookEvent).toHaveBeenCalledWith('object.created', expect.objectContaining({ objectId: id }));
    expect(side.createNotification).toHaveBeenCalled();
  });

  it('keeps the form draft until the insert lands, and keeps it if the insert fails', async () => {
    const DOWN = { data: null, error: { code: 'PGRST000', message: 'down' } };
    const first = deferred();
    sb.current.respond = (call) => (isObjectInsert(call) ? first.promise : OK);
    sessionStorage.setItem(DRAFT_OWNER_KEY, 'owner');
    renderNew();
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Keep me' } });
    await waitFor(() => expect(getDraft(DRAFT_KEYS.new)?.form?.title).toBe('Keep me'));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(getDraft(DRAFT_KEYS.new)?.form?.title).toBe('Keep me');
    await act(async () => { first.resolve(DOWN); await Promise.resolve(); });
    expect(getDraft(DRAFT_KEYS.new)?.form?.title).toBe('Keep me');
  });

  it('clears the form draft once the insert lands', async () => {
    sessionStorage.setItem(DRAFT_OWNER_KEY, 'owner');
    renderNew();
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Done' } });
    await waitFor(() => expect(getDraft(DRAFT_KEYS.new)?.form?.title).toBe('Done'));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(side.logAudit).toHaveBeenCalled());
    expect(getDraft(DRAFT_KEYS.new)).toBeFalsy();
  });
});

describe('ObjectNew form (A6, M10, A11)', () => {
  const withTaxonomy = () => {
    sb.current.respond = (call) => {
      if (call.table === 'domains') return { data: [{ id: 'd1', name: 'Work' }, { id: 'd2', name: 'Home' }], error: null };
      if (call.table === 'tags') return { data: [{ id: 't1', name: 'urgent' }], error: null };
      return OK;
    };
  };
  const narrow = () => stubMatchMedia((q) => q.includes('max-width: 768px'));

  afterEach(() => { vi.restoreAllMocks(); });

  it('adds a domain only on Enter', async () => {
    withTaxonomy();
    renderNew();
    const input = await screen.findByRole('combobox', { name: 'Add domain' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.queryByRole('button', { name: /^Remove domain/ })).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Remove domain Work' })).toBeInTheDocument();
  });

  it('names chip removes and removes the chip', async () => {
    withTaxonomy();
    renderNew();
    const input = await screen.findByRole('combobox', { name: 'Add tag' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag urgent' }));
    expect(screen.queryByRole('button', { name: 'Remove tag urgent' })).not.toBeInTheDocument();
  });

  it.each([['wide', () => stubMatchMedia(() => false)], ['narrow', narrow]])('has exactly one submit button on %s screens', (_name, stub) => {
    stub();
    renderNew();
    expect(screen.getAllByRole('button', { name: 'Create' })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Cancel' })).toHaveLength(1);
  });

  it('puts the submit bar after the properties on narrow screens', () => {
    narrow();
    renderNew();
    const submit = screen.getByRole('button', { name: 'Create' });
    const lastProperty = screen.getByLabelText('Source');
    expect(lastProperty.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps submit in the header on wide screens', () => {
    stubMatchMedia(() => false);
    renderNew();
    const submit = screen.getByRole('button', { name: 'Create' });
    const title = screen.getByRole('textbox', { name: 'Title' });
    expect(submit.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("asks for a bookmark URL right under the title", () => {
    stubMatchMedia(() => false);
    renderNew();
    expect(screen.queryByLabelText('Bookmark URL')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'bookmark' } });
    const url = screen.getByLabelText('Bookmark URL');
    expect(url).toHaveAttribute('type', 'url');
    const title = screen.getByRole('textbox', { name: 'Title' });
    const body = screen.getByLabelText('Body');
    expect(title.compareDocumentPosition(url) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(url.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.change(url, { target: { value: 'https://example.com' } });
    expect(screen.getByLabelText('URL')).toHaveValue('https://example.com');
  });
});
