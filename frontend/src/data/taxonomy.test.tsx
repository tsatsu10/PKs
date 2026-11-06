import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createTestQueryClient, wrapperFor } from '../test/queryTestUtils';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../test/supabaseMock').mockSupabase> }));
vi.mock('../lib/supabase', async () => {
  const { mockSupabase } = await import('../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});

import { useTaxonomy, upsertTaxonomyEntity } from './taxonomy';
import { qk } from './keys';

describe('useTaxonomy', () => {
  it('loads domains and tags once for any number of consumers, ordered by name then id', async () => {
    sb.current!.respond = (call) => ({ data: call.table === 'domains' ? [{ id: 'd1', name: 'Work' }] : [{ id: 't1', name: 'ai' }], error: null });
    const client = createTestQueryClient();
    const wrapper = wrapperFor(client);
    const a = renderHook(() => useTaxonomy('u1'), { wrapper });
    renderHook(() => useTaxonomy('u1'), { wrapper });
    await waitFor(() => expect(a.result.current.isPending).toBe(false));
    expect(a.result.current.domains).toEqual([{ id: 'd1', name: 'Work' }]);
    expect(sb.current!.calls.filter((c) => c.table === 'domains')).toHaveLength(1);
    const ops = sb.current!.calls.find((c) => c.table === 'tags')!.ops.map(([m, args]) => `${m}:${args[0]}`);
    expect(ops).toEqual(['select:id, name', 'eq:user_id', 'order:name', 'order:id', 'range:0']);
  });

  it('surfaces errors instead of an empty list', async () => {
    sb.current!.respond = () => ({ data: null, error: { code: 'PGRST000', message: 'down' } });
    const { result } = renderHook(() => useTaxonomy('u1'), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.error).toBeTruthy());
  });

  it('upsertTaxonomyEntity keeps the cached list sorted', () => {
    const client = createTestQueryClient();
    client.setQueryData(qk.taxonomy.tags(), [{ id: 'b', name: 'beta' }]);
    upsertTaxonomyEntity('tags', { id: 'a', name: 'alpha' }, client);
    expect(client.getQueryData(qk.taxonomy.tags())).toEqual([{ id: 'a', name: 'alpha' }, { id: 'b', name: 'beta' }]);
  });
});
