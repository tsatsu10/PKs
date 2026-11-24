import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, Link, useParams } from 'react-router-dom';
import { forwardRef, useImperativeHandle } from 'react';
import { clear } from 'idb-keyval';
import { createTestQueryClient } from '../../test/queryTestUtils';
import { ToastProvider } from '../../components/ui/Toaster';

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

const ed = vi.hoisted(() => ({ focusEnd: null as unknown as ReturnType<typeof import('vitest').vi.fn> }));
vi.mock('./Editor', () => ({
  default: forwardRef(function FakeEditor(
    { initialMarkdown, onChange }: { initialMarkdown: string; onChange: (f: { content: string; content_json: unknown[] }) => void },
    ref,
  ) {
    useImperativeHandle(ref, () => ({ focusEnd: ed.focusEnd }));
    return (
      <div className="blocknote-editor-wrapper" data-testid="editor-frame">
        <textarea aria-label="Content" defaultValue={initialMarkdown} onChange={(e) => onChange({ content: e.target.value, content_json: [] })} />
      </div>
    );
  }),
}));
vi.mock('../../components/BlockNoteViewer', () => ({
  default: ({ content }: { content: string }) => <div data-testid="viewer">{content}</div>,
}));
vi.mock('../../lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('../../lib/notifications', () => ({ createNotification: vi.fn() }));
vi.mock('../../lib/webhooks', () => ({ deliverWebhookEvent: vi.fn() }));
vi.mock('../../lib/objectView', () => ({ touchObjectView: vi.fn() }));
vi.mock('../../lib/reportError', () => ({ reportError: vi.fn() }));
const dl = vi.hoisted(() => ({ downloadBlob: vi.fn(), printHtml: vi.fn(() => true) }));
vi.mock('../../lib/download', () => dl);

const cs = vi.hoisted(() => ({ failed: null as null | { error: unknown; retry: () => void } }));
vi.mock('../../data/createObject', async (orig) => {
  const real = await orig<typeof import('../../data/createObject')>();
  return {
    ...real,
    useCreateState: (id: string | undefined) => {
      const state = real.useCreateState(id);
      return cs.failed ? { status: 'failed' as const, ...cs.failed } : state;
    },
  };
});

import ObjectPage from './ObjectPage';
import { disposeAllSaveQueues } from './save/saveQueue';

const OBJ = {
  id: 'o1', user_id: 'owner', type: 'note', title: 'First', content: 'body', content_json: null, summary: 'S', key_points: [],
  is_deleted: false, revision: 3, current_version: 2, status: 'active', source: null, cover_url: null, due_at: null, remind_at: null,
  updated_at: '2026-11-01T00:00:00Z', created_at: '2026-11-01T00:00:00Z', is_pinned: false,
};
const OBJ2 = { ...OBJ, id: 'o2', title: 'Second' };
const VERSION = { id: 'v1', version: 1, title: 'Old', created_at: '2026-10-01T00:00:00Z' };

let myShare: unknown = null;
let detail: Record<string, unknown> = OBJ;
let override: ((call: Call) => Result | undefined) | null = null;

const has = (call: Call, m: string) => call.ops.some(([op]) => op === m);
const eqArg = (call: Call, col: string) => call.ops.find(([op, a]) => op === 'eq' && a[0] === col)?.[1][1];

function respond(call: Call): Result {
  const o = override?.(call);
  if (o) return o;
  if (call.table === 'knowledge_objects' && has(call, 'update')) {
    const patch = call.ops.find(([m]) => m === 'update')![1][0] as object;
    return { data: [{ ...detail, ...patch, revision: 4 }], error: null };
  }
  if (call.table === 'knowledge_objects' && has(call, 'maybeSingle')) {
    return { data: eqArg(call, 'id') === 'o2' ? OBJ2 : detail, error: null };
  }
  if (call.table === 'share_permissions' && has(call, 'maybeSingle')) return { data: myShare, error: null };
  if (call.table === 'knowledge_object_versions' && !has(call, 'maybeSingle')) return { data: [VERSION], error: null };
  return { data: [], error: null };
}

const updates = () => sb.current!.calls.filter((c) => c.table === 'knowledge_objects' && has(c, 'update'));
const rpcCalls = (name: string) => sb.current!.rpc.mock.calls.filter(([n]) => n === name).map(([, a]) => a as Record<string, unknown>);

function PageAtId() {
  const { id } = useParams();
  return <ObjectPage key={id} />;
}

function renderPage(client = createTestQueryClient()) {
  return render(
    <QueryClientProvider client={client}>
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

const titleBox = (opts?: { timeout: number }) => screen.findByRole('textbox', { name: 'Title' }, opts);
const heading = (name: string) => screen.findByRole('heading', { level: 1, name });
/** Fake only the timers (IndexedDB and React Query keep their real scheduling). */
const fakeTimers = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

beforeEach(async () => {
  await clear();
  auth.currentUser = 'owner';
  myShare = null;
  detail = OBJ;
  override = null;
  cs.failed = null;
  sessionStorage.clear();
  performance.clearMarks();
  sb.current!.calls.length = 0;
  sb.current!.respond = respond;
  sb.current!.rpc.mockReset();
  sb.current!.rpc.mockResolvedValue({ data: [], error: null });
  dl.downloadBlob.mockClear();
  ed.focusEnd = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
  disposeAllSaveQueues();
});

// The first test also pays for jsdom warm-up (about 1 s alone); under a fully parallel `npm test`
// it once ran past the 5 s default. Rendering commits only ~5 times, so this is load, not a loop.
describe('ObjectPage', { timeout: 15_000 }, () => {
  it('owner opens straight into editing: no Edit/Save/Cancel, a Title box, and the owner actions', async () => {
    renderPage();
    expect(await titleBox()).toHaveValue('First');
    for (const name of ['Pin', 'Duplicate', 'Share', 'Delete', 'Save version']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    for (const name of ['Edit', 'Save', 'Cancel']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.getByRole('searchbox', { name: 'Search objects to link' })).toBeInTheDocument();
  });

  it('a failed create shows a Retry bar and the editor stays usable', async () => {
    const retry = vi.fn();
    cs.failed = { error: { message: 'Failed to fetch' }, retry };
    renderPage();
    expect(await titleBox()).toBeEnabled();
    const bar = screen.getAllByRole('alert').find((el) => el.textContent?.includes("Couldn't create this object"))!;
    expect(bar).toHaveTextContent("Couldn't create this object: Couldn't reach the server.");
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('while a create is unfinished, object actions and side panels are inert; the editor is not', async () => {
    cs.failed = { error: { message: 'Failed to fetch' }, retry: vi.fn() };
    renderPage();
    expect((await titleBox()).closest('[inert]')).toBeNull();
    for (const name of ['Pin', 'Duplicate', 'Delete']) {
      expect(screen.getByRole('button', { name, hidden: true }).closest('[inert]')).not.toBeNull();
    }
    expect(screen.getByRole('searchbox', { name: 'Search objects to link', hidden: true }).closest('[inert]')).not.toBeNull();
  });

  it('no Retry bar when nothing is being created', async () => {
    renderPage();
    await titleBox();
    expect(screen.queryByText(/Couldn't create this object/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' }).closest('[inert]')).toBeNull();
  });

  it('editor also edits in place but sees no owner-only actions', async () => {
    auth.currentUser = 'ed';
    myShare = { id: 's', role: 'editor' };
    renderPage();
    expect(await titleBox()).toHaveValue('First');
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    for (const name of ['Pin', 'Delete', 'Share', 'Duplicate']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('link search offers only objects the user owns, for owner and editor alike', async () => {
    auth.currentUser = 'ed';
    myShare = { id: 's', role: 'editor' };
    sb.current!.rpc.mockImplementation((name: string) => Promise.resolve(
      name === 'search_knowledge_objects'
        ? { data: [{ id: 'mine', title: 'Mine', type: 'note', user_id: 'ed' }, { id: 'theirs', title: 'Theirs', type: 'note', user_id: 'owner' }], error: null }
        : name === 'suggest_linked_objects' ? { data: [{ id: 'o9', title: 'Nine', type: 'note' }], error: null } : { data: [], error: null },
    ));
    renderPage();
    await titleBox();
    const search = await screen.findByRole('searchbox', { name: 'Search objects to link' });
    fireEvent.change(search, { target: { value: 'm' } });
    expect(await screen.findByRole('link', { name: 'Mine' }, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Theirs' })).not.toBeInTheDocument();
    // The "Related you might link" card stays owner-only.
    expect(screen.queryByRole('link', { name: 'Nine' })).not.toBeInTheDocument();
  });

  it('viewer gets the read view: a heading, no Title box, no edit controls', async () => {
    auth.currentUser = 'v';
    myShare = { id: 's', role: 'viewer' };
    renderPage();
    await heading('First');
    await waitFor(() => expect(sb.current!.calls.some((c) => c.table === 'share_permissions')).toBe(true));
    expect(screen.queryByRole('textbox', { name: 'Title' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save version' })).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox', { name: 'Search objects to link' })).not.toBeInTheDocument();
  });

  it('typing saves itself 800 ms later, checking the revision', async () => {
    renderPage();
    const title = await titleBox();
    fakeTimers();
    fireEvent.change(title, { target: { value: 'New' } });
    expect(updates()).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(800));
    const [call] = updates();
    expect(call.ops).toContainEqual(['update', [{ title: 'New', slug: expect.stringMatching(/^new-/) }]]);
    expect(call.ops).toContainEqual(['eq', ['revision', 3]]);
    vi.useRealTimers(); // findBy polls with real timers
    expect(await screen.findByText('Saved ✓')).toBeInTheDocument();
  });

  it('a save that hits a newer revision shows the conflict bar', async () => {
    override = (call) => {
      if (call.table === 'knowledge_objects' && has(call, 'update')) return { data: [], error: null };
      if (call.table === 'knowledge_objects' && call.ops.some(([m, a]) => m === 'select' && a[0] === 'revision, user_id, is_deleted')) {
        return { data: { revision: 9, user_id: 'owner', is_deleted: false }, error: null };
      }
      return undefined;
    };
    renderPage();
    const title = await titleBox();
    fakeTimers();
    fireEvent.change(title, { target: { value: 'New' } });
    await act(() => vi.advanceTimersByTimeAsync(800));
    vi.useRealTimers();
    expect(await screen.findByText('This changed elsewhere.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep mine' })).toBeInTheDocument();
  });

  it('a legacy session draft is adopted', async () => {
    sessionStorage.setItem('pks-draft-o1', JSON.stringify({ title: 'Drafted', _baseRevision: 3 }));
    renderPage();
    await waitFor(async () => expect(await titleBox()).toHaveValue('Drafted'), { timeout: 5000 });
    expect(sessionStorage.getItem('pks-draft-o1')).toBeNull();
    // The queue took the draft as soon as it opened; its 800 ms debounce runs on real timers here.
    await waitFor(() => expect(updates()).toHaveLength(1), { timeout: 5000 });
    expect(updates()[0].ops).toContainEqual(['update', [expect.objectContaining({ title: 'Drafted' })]]);
    expect(updates()[0].ops).toContainEqual(['eq', ['revision', 3]]);
  });

  it('restore snapshots the current version first, then saves the old one', async () => {
    override = (call) => {
      if (call.table === 'knowledge_object_versions' && has(call, 'maybeSingle')) {
        return { data: { title: 'Old', content: 'x', content_json: null, summary: null, key_points: [] }, error: null };
      }
      return undefined;
    };
    renderPage();
    await titleBox();
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await screen.findByText('Restored to v1');
    expect(rpcCalls('snapshot_knowledge_object').at(-1)).toMatchObject({ p_object_id: 'o1', p_reason: 'Before restoring v1' });
    expect(updates().at(-1)!.ops).toContainEqual(['update', [expect.objectContaining({ title: 'Old', content: 'x' })]]);
  });

  it('Save version snapshots the current row', async () => {
    renderPage();
    await titleBox();
    fireEvent.click(screen.getByRole('button', { name: 'Save version' }));
    expect(await screen.findByText('Version saved')).toBeInTheDocument();
    expect(rpcCalls('snapshot_knowledge_object').at(-1)).toMatchObject({ p_object_id: 'o1', p_fields: null });
  });

  it('a new empty object focuses its title; an existing one focuses nothing', async () => {
    detail = { ...OBJ, title: '', content: '' };
    const first = renderPage();
    const title = await titleBox();
    await waitFor(() => expect(document.activeElement).toBe(title));
    first.unmount();
    disposeAllSaveQueues();
    detail = OBJ;
    renderPage();
    await titleBox();
    expect(document.activeElement).toBe(document.body);
  });

  it('clicking below the content puts the cursor in the editor', async () => {
    renderPage();
    const title = await titleBox();
    await screen.findByRole('textbox', { name: 'Content' });
    fireEvent.click(title);
    expect(ed.focusEnd).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Object content'));
    expect(ed.focusEnd).toHaveBeenCalledTimes(1);
    // The editor's frame below its last block counts as empty space too.
    fireEvent.click(screen.getByTestId('editor-frame'));
    expect(ed.focusEnd).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('textbox', { name: 'Content' }));
    expect(ed.focusEnd).toHaveBeenCalledTimes(2);
  });

  it('markdown export downloads a file named after the title', async () => {
    renderPage();
    await titleBox();
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
    await titleBox();
    expect(performance.getEntriesByName('pks:object-visible').length).toBe(1);
  });

  it('a stale cached copy is replaced by the fresh row before anything is typed', async () => {
    const client = createTestQueryClient();
    client.setQueryData(['object', 'o1', 'detail'], { ...OBJ, title: 'Cached', revision: 2 }, { updatedAt: 1 });
    detail = { ...OBJ, title: 'Fresh', revision: 5 };
    renderPage(client);
    await waitFor(async () => expect(await titleBox()).toHaveValue('Fresh'), { timeout: 5000 });
    fireEvent.change(await titleBox(), { target: { value: 'New' } });
    await waitFor(() => expect(updates()).toHaveLength(1), { timeout: 5000 });
    expect(updates()[0].ops).toContainEqual(['eq', ['revision', 5]]);
  });

  it('moving to another object resets the page', async () => {
    renderPage();
    expect(await titleBox()).toHaveValue('First');
    fireEvent.click(screen.getByRole('link', { name: 'go to o2' }));
    await waitFor(async () => expect(await titleBox()).toHaveValue('Second'));
  });
});
