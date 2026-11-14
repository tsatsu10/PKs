import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, Link, useParams } from 'react-router-dom';
import { createTestQueryClient } from '../../test/queryTestUtils';
import { ToastProvider } from '../../context/ToastContext';

type Call = { table: string; ops: Array<[string, unknown[]]> };
type Result = { data: unknown; error: unknown };

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../../test/supabaseMock').mockSupabase> }));
vi.mock('../../lib/supabase', async () => {
  const { mockSupabase } = await import('../../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});

const auth = vi.hoisted(() => ({ currentUser: 'owner' }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: auth.currentUser } }) }));

vi.mock('../../components/BlockNoteEditor', () => ({
  default: ({ initialValue, onChange }: { initialValue?: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Content" defaultValue={initialValue} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock('../../components/BlockNoteViewer', () => ({
  default: ({ content }: { content: string }) => <div data-testid="viewer">{content}</div>,
}));
vi.mock('../../lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('../../lib/notifications', () => ({ createNotification: vi.fn() }));
vi.mock('../../lib/webhooks', () => ({ deliverWebhookEvent: vi.fn() }));
vi.mock('../../lib/objectView', () => ({ touchObjectView: vi.fn() }));
const dl = vi.hoisted(() => ({ downloadBlob: vi.fn(), printHtml: vi.fn(() => true) }));
vi.mock('../../lib/download', () => dl);

import ObjectPage from './ObjectPage';

const OBJ = {
  id: 'o1', user_id: 'owner', type: 'note', title: 'First', content: 'body', summary: 'S', key_points: [],
  is_deleted: false, revision: 3, current_version: 2, status: 'active',
  updated_at: '2026-11-01T00:00:00Z', created_at: '2026-11-01T00:00:00Z', is_pinned: false,
};
const OBJ2 = { ...OBJ, id: 'o2', title: 'Second' };
const VERSION = { id: 'v1', version: 1, title: 'Old', created_at: '2026-10-01T00:00:00Z' };

let myShare: unknown = null;
let override: ((call: Call) => Result | undefined) | null = null;

const has = (call: Call, m: string) => call.ops.some(([op]) => op === m);
const eqArg = (call: Call, col: string) => call.ops.find(([op, a]) => op === 'eq' && a[0] === col)?.[1][1];

function respond(call: Call): Result {
  const o = override?.(call);
  if (o) return o;
  if (call.table === 'knowledge_objects' && has(call, 'update')) return { data: [{ ...OBJ, revision: 4 }], error: null };
  if (call.table === 'knowledge_objects' && has(call, 'maybeSingle')) {
    return { data: eqArg(call, 'id') === 'o2' ? OBJ2 : OBJ, error: null };
  }
  if (call.table === 'share_permissions' && has(call, 'maybeSingle')) return { data: myShare, error: null };
  if (call.table === 'knowledge_object_versions' && !has(call, 'maybeSingle')) return { data: [VERSION], error: null };
  return { data: [], error: null };
}

const updates = () => sb.current!.calls.filter((c) => c.table === 'knowledge_objects' && has(c, 'update'));

function PageAtId() {
  const { id } = useParams();
  return <ObjectPage key={id} />;
}

function renderPage() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/objects/o1']}>
          <Link to="/objects/o2">go to o2</Link>
          <Routes>
            <Route path="/objects/:id" element={<PageAtId />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

beforeEach(() => {
  auth.currentUser = 'owner';
  myShare = null;
  override = null;
  sessionStorage.clear();
  performance.clearMarks();
  sb.current!.calls.length = 0;
  sb.current!.respond = respond;
  sb.current!.rpc.mockResolvedValue({ data: [], error: null });
  dl.downloadBlob.mockClear();
});

// The first test also pays for jsdom warm-up (about 1 s alone); under a fully parallel `npm test`
// it once ran past the 5 s default. Rendering commits only ~5 times, so this is load, not a loop.
describe('ObjectPage', { timeout: 15_000 }, () => {
  it('owner sees pin, duplicate, share, edit, delete and link search', async () => {
    renderPage();
    await heading('First');
    for (const name of ['Pin', 'Duplicate', 'Share', 'Edit', 'Delete']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('searchbox', { name: 'Search objects to link' })).toBeInTheDocument();
  });

  it('editor sees Edit but not owner-only actions', async () => {
    auth.currentUser = 'ed';
    myShare = { id: 's', role: 'editor' };
    renderPage();
    await heading('First');
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument();
    for (const name of ['Pin', 'Delete', 'Share', 'Duplicate']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('viewer sees no edit controls', async () => {
    auth.currentUser = 'v';
    myShare = { id: 's', role: 'viewer' };
    renderPage();
    await heading('First');
    await waitFor(() => expect(sb.current!.calls.some((c) => c.table === 'share_permissions')).toBe(true));
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox', { name: 'Search objects to link' })).not.toBeInTheDocument();
  });

  it('save sends only changed fields and checks the revision', async () => {
    renderPage();
    await heading('First');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'New' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Changes saved');
    const [call] = updates();
    expect(call.ops).toContainEqual(['update', [{ title: 'New', slug: expect.stringMatching(/^new-/) }]]);
    expect(call.ops).toContainEqual(['eq', ['revision', 3]]);
  });

  it('a save that updates no rows reports a conflict', async () => {
    override = (call) => (call.table === 'knowledge_objects' && has(call, 'update') ? { data: [], error: null } : undefined);
    renderPage();
    await heading('First');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'New' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(screen.getAllByRole('alert').some((el) => el.textContent?.includes('changed elsewhere'))).toBe(true);
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('a stored draft reopens the editor', async () => {
    sessionStorage.setItem('pks-draft-o1', JSON.stringify({ title: 'Drafted', _baseRevision: 3 }));
    renderPage();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Drafted'));
    expect(await screen.findByText('Draft restored')).toBeInTheDocument();
  });

  it('restore version writes the snapshot guarded by current_version', async () => {
    override = (call) => {
      if (call.table === 'knowledge_object_versions' && has(call, 'maybeSingle')) return { data: { title: 'Old', content: 'x' }, error: null };
      if (call.table === 'knowledge_objects' && has(call, 'update')) return { data: [{ id: 'o1' }], error: null };
      return undefined;
    };
    renderPage();
    await heading('First');
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await screen.findByText('Restored to v1');
    expect(updates()[0].ops).toContainEqual(['eq', ['current_version', 2]]);
  });

  it('markdown export downloads a file named after the title', async () => {
    renderPage();
    await heading('First');
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    const buttons = screen.getAllByRole('button', { name: 'Export' });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(dl.downloadBlob).toHaveBeenCalledTimes(1));
    const [blob, name] = dl.downloadBlob.mock.calls[0] as unknown as [Blob, string];
    expect(blob).toBeInstanceOf(Blob);
    expect(name).toBe('First.md');
  });

  it('marks the object visible for the perf check', async () => {
    renderPage();
    await heading('First');
    expect(performance.getEntriesByName('pks:object-visible').length).toBe(1);
  });

  it('moving to another object resets the page', async () => {
    renderPage();
    await heading('First');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'go to o2' }));
    await heading('Second');
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});
