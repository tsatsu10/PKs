import { describe, it, expect, vi, beforeEach } from 'vitest';
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

import { useTaxonomyActions } from './useTaxonomyActions';

type R = { data: unknown; error: unknown };
const OK: R = { data: [], error: null };
const DOWN: R = { data: null, error: { code: 'PGRST000', message: 'down' } };

function setup() {
  const client = createTestQueryClient();
  client.setQueryData(qk.object.tags('o1'), [{ id: 't1', name: 'b' }, { id: 't2', name: 'a' }]);
  client.setQueryData(qk.object.domains('o1'), [{ id: 'd1', name: 'Work' }]);
  const setError = vi.fn();
  const { result } = renderHook(() => useTaxonomyActions({
    object: TEST_OBJECT,
    allDomains: [{ id: 'd1', name: 'Work' }, { id: 'd2', name: 'Home' }],
    allTags: [{ id: 't1', name: 'b' }, { id: 't2', name: 'a' }, { id: 't3', name: 'c' }],
    setError,
  }), { wrapper: hookWrapper(client) });
  const tags = () => (client.getQueryData(qk.object.tags('o1')) as Array<{ id: string }>).map((t) => t.id);
  const domains = () => (client.getQueryData(qk.object.domains('o1')) as Array<{ id: string }>).map((d) => d.id);
  return { result, client, setError, tags, domains };
}

beforeEach(() => {
  sb.current!.calls.length = 0;
  sb.current!.respond = () => OK;
});

describe('useTaxonomyActions', () => {
  it('removeTag drops the tag at once, offers Undo, and Undo re-adds it', async () => {
    const { result, tags } = setup();
    const d = holdNext(sb.current!);
    let p!: Promise<void>;
    act(() => { p = result.current.removeTag('t2'); });
    expect(tags()).toEqual(['t1']);
    expect(screen.getByText('Tag removed')).toBeInTheDocument();
    await act(async () => { d.resolve(OK); await p; });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(tags()).toEqual(['t2', 't1']));
    const reinsert = sb.current!.calls.filter((c) => c.table === 'knowledge_object_tags').at(-1);
    expect(reinsert?.ops).toContainEqual(['insert', [{ knowledge_object_id: 'o1', tag_id: 't2' }]]);
  });

  it('a failed removeTag puts the tag back, reports it, and withdraws the Undo', async () => {
    const { result, tags, setError } = setup();
    const d = holdNext(sb.current!);
    let p!: Promise<void>;
    act(() => { p = result.current.removeTag('t2'); });
    await act(async () => { d.resolve(DOWN); await p; });
    expect(tags()).toEqual(['t1', 't2']);
    expect(setError).toHaveBeenLastCalledWith(expect.stringMatching(/.+/));
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('addTag shows the tag sorted by name at once and removes it if the insert fails', async () => {
    const { result, tags } = setup();
    const d = holdNext(sb.current!);
    let p!: Promise<void>;
    act(() => { p = result.current.addTag('t3'); });
    expect(tags()).toEqual(['t2', 't1', 't3']);
    await act(async () => { d.resolve(DOWN); await p; });
    expect(tags()).toEqual(['t1', 't2']);
  });

  it('removeDomain is optimistic with Undo too', async () => {
    const { result, domains } = setup();
    const d = holdNext(sb.current!);
    let p!: Promise<void>;
    act(() => { p = result.current.removeDomain('d1'); });
    expect(domains()).toEqual([]);
    await act(async () => { d.resolve(OK); await p; });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(domains()).toEqual(['d1']));
  });
});
