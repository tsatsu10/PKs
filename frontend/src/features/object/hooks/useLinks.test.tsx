import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, screen, fireEvent, waitFor } from '@testing-library/react';
import { hookWrapper, TEST_OBJECT, holdNext } from '../testUtils';
import { createTestQueryClient } from '../../../test/queryTestUtils';
import { qk } from '../../../data/keys';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../../../test/supabaseMock').mockSupabase> }));
vi.mock('../../../lib/supabase', async () => {
  const { mockSupabase } = await import('../../../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});

import { useLinks } from './useLinks';

const TARGET = { id: 'o2', title: 'Two', type: 'note' };
const OUT = { id: 'e1', to_object_id: 'o2', relationship_type: 'references', target: TARGET };
const IN = { id: 'e2', from_object_id: 'o3', relationship_type: 'supports', source: { id: 'o3', title: 'Three', type: 'note' } };
type Links = { outgoing: Array<{ id: string; to_object_id: string }>; incoming: Array<{ id: string }> };

function setup(client = createTestQueryClient()) {
  client.setQueryData(qk.object.links('o1'), { outgoing: [OUT], incoming: [IN] });
  const setError = vi.fn();
  const r = renderHook(() => useLinks({
    object: TEST_OBJECT, userId: 'owner', otherObjects: [TARGET, { id: 'o4', title: 'Four', type: 'note' }], setError,
  }), { wrapper: hookWrapper(client) });
  const links = () => client.getQueryData(qk.object.links('o1')) as Links;
  return { ...r, links, setError };
}
const OK = { data: [], error: null };
const DOWN = { data: null, error: { code: 'PGRST000', message: 'down' } };

beforeEach(() => {
  sb.current!.calls.length = 0;
  sb.current!.respond = () => ({ data: [], error: null });
  sb.current!.rpc.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('useLinks', () => {
  it('search closes on Escape and on an outside click', () => {
    const { result } = setup();
    const container = document.createElement('div');
    document.body.appendChild(container);
    result.current.search.containerRef.current = container;
    act(() => result.current.search.setOpen(true));
    act(() => { container.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(result.current.search.open).toBe(true);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(result.current.search.open).toBe(false);
    act(() => result.current.search.setOpen(true));
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(result.current.search.open).toBe(false);
  });

  it('search waits 300 ms and offers only own objects other than this one', async () => {
    vi.useFakeTimers();
    sb.current!.rpc.mockResolvedValue({ data: [{ id: 'o1', user_id: 'owner' }, { id: 'o9', user_id: 'owner' }, { id: 'o7', user_id: 'someone' }], error: null });
    const { result } = setup();
    act(() => result.current.search.setQuery('fo'));
    await act(async () => { vi.advanceTimersByTime(299); });
    expect(sb.current!.rpc).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); });
    await act(async () => { await Promise.resolve(); });
    expect(sb.current!.rpc).toHaveBeenCalledWith('search_knowledge_objects', expect.objectContaining({ search_query: 'fo' }));
    expect(result.current.search.results).toEqual([{ id: 'o9', user_id: 'owner' }]);
  });

  it('removeLink drops an outgoing link at once and Undo re-creates the same edge', async () => {
    const { result, links } = setup();
    const d = holdNext(sb.current!);
    let p!: Promise<void>;
    act(() => { p = result.current.removeLink('e1', true); });
    expect(links().outgoing).toEqual([]);
    await act(async () => { d.resolve(OK); await p; });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(links().outgoing.map((l) => l.to_object_id)).toEqual(['o2']));
    const reinsert = sb.current!.calls.filter((c) => c.table === 'link_edges').at(-1);
    expect(reinsert?.ops).toContainEqual(['insert', [{ from_object_id: 'o1', to_object_id: 'o2', relationship_type: 'references' }]]);
  });

  it('removing an incoming link and undoing it re-creates the edge in its direction', async () => {
    const { result, links } = setup();
    await act(() => result.current.removeLink('e2', false));
    expect(links().incoming).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(links().incoming).toHaveLength(1));
    const reinsert = sb.current!.calls.filter((c) => c.table === 'link_edges').at(-1);
    expect(reinsert?.ops).toContainEqual(['insert', [{ from_object_id: 'o3', to_object_id: 'o1', relationship_type: 'supports' }]]);
  });

  it('a failed removeLink restores the link and withdraws the Undo', async () => {
    const { result, links, setError } = setup();
    const d = holdNext(sb.current!);
    let p!: Promise<void>;
    act(() => { p = result.current.removeLink('e1', true); });
    await act(async () => { d.resolve(DOWN); await p; });
    expect(links().outgoing.map((l) => l.id)).toEqual(['e1']);
    expect(setError).toHaveBeenLastCalledWith(expect.stringMatching(/.+/));
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('addLink shows the link at once and takes it away if the insert fails', async () => {
    const { result, links } = setup();
    const d = holdNext(sb.current!);
    let p!: Promise<void>;
    act(() => { p = result.current.addLink('o4'); });
    expect(links().outgoing.map((l) => l.to_object_id)).toEqual(['o2', 'o4']);
    expect(links().outgoing[1].id).toMatch(/^tmp:/);
    await act(async () => { d.resolve(DOWN); await p; });
    expect(links().outgoing.map((l) => l.to_object_id)).toEqual(['o2']);
  });
});
