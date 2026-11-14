import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createTestQueryClient, wrapperFor } from '../test/queryTestUtils';

const sb = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import('../test/supabaseMock').mockSupabase> }));
vi.mock('../lib/supabase', async () => {
  const { mockSupabase } = await import('../test/supabaseMock');
  sb.current = mockSupabase();
  return { supabase: sb.current.client };
});

import { useDashboardStats, useDashboardActivity, useResumeObject, fetchObjectLinksBatch } from './dashboard';

describe('dashboard queries', () => {
  it('get_dashboard_stats runs once for several consumers', async () => {
    sb.current!.rpc.mockResolvedValue({ data: { total: 4 }, error: null });
    const wrapper = wrapperFor(createTestQueryClient());
    renderHook(() => useDashboardStats(true), { wrapper });
    const { result } = renderHook(() => useDashboardStats(true), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ total: 4 }));
    expect(sb.current!.rpc.mock.calls.filter(([n]) => n === 'get_dashboard_stats')).toHaveLength(1);
  });

  it('normalizes activity and errors instead of silently emptying', async () => {
    sb.current!.rpc.mockResolvedValue({ data: { trending_tags: [{ id: 't' }], recent_links: null }, error: null });
    const { result } = renderHook(() => useDashboardActivity(true), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.data).toEqual({ trendingTags: [{ id: 't' }], recentLinks: [] }));

    sb.current!.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST000', message: 'x' } });
    const failing = renderHook(() => useDashboardActivity(true), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(failing.result.current.error).toBeTruthy());
  });

  it('resume object is null when nothing was viewed', async () => {
    sb.current!.respond = () => ({ data: null, error: null });
    const { result } = renderHook(() => useResumeObject('u1'), { wrapper: wrapperFor(createTestQueryClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('links batch fills missing ids with empty entries', async () => {
    sb.current!.rpc.mockResolvedValue({ data: { a: { links: [{ id: 'l' }], total: 1 } }, error: null });
    expect(await fetchObjectLinksBatch(['a', 'b'])).toEqual({ a: { links: [{ id: 'l' }], total: 1 }, b: { links: [], total: 0 } });
  });
});
