import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { hookWrapper, TEST_OBJECT } from '../testUtils';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../../../test/supabaseMock').mockSupabase> }));
vi.mock('../../../lib/supabase', async () => {
  const { mockSupabase } = await import('../../../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});

import { useTaxonomyActions } from './useTaxonomyActions';

function setup() {
  const setObjectDomains = vi.fn();
  const setObjectTags = vi.fn();
  const setError = vi.fn();
  const { result } = renderHook(() => useTaxonomyActions({
    object: TEST_OBJECT,
    allDomains: [{ id: 'd1', name: 'Work' }],
    allTags: [{ id: 't2', name: 'a' }],
    setObjectDomains, setObjectTags, setError,
  }), { wrapper: hookWrapper() });
  return { result, setObjectDomains, setObjectTags, setError };
}

beforeEach(() => {
  sb.current!.calls.length = 0;
  sb.current!.respond = () => ({ data: [], error: null });
});

describe('useTaxonomyActions', () => {
  it('addTag inserts the link row and adds the tag sorted by name', async () => {
    const { result, setObjectTags } = setup();
    await act(() => result.current.addTag('t2'));
    const insert = sb.current!.calls.find((c) => c.table === 'knowledge_object_tags');
    expect(insert?.ops).toContainEqual(['insert', [{ knowledge_object_id: 'o1', tag_id: 't2' }]]);
    const updater = setObjectTags.mock.calls[0][0] as (prev: unknown[]) => unknown[];
    expect(updater([{ id: 't1', name: 'b' }])).toEqual([{ id: 't2', name: 'a' }, { id: 't1', name: 'b' }]);
  });

  it('a failed removeDomain reports through setError', async () => {
    sb.current!.respond = () => ({ data: null, error: { code: 'PGRST000', message: 'down' } });
    const { result, setError, setObjectDomains } = setup();
    await act(() => result.current.removeDomain('d1'));
    expect(setError).toHaveBeenLastCalledWith(expect.stringMatching(/.+/));
    expect(setObjectDomains).not.toHaveBeenCalled();
  });
});
