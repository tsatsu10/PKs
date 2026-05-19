/**
 * Integration-style test: search flow with mocked Supabase.
 * Asserts that the dashboard search hook calls the correct RPC with expected params.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDashboardSearch } from './useDashboardSearch';

const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args) => mockRpc(...args),
    from: (table) => mockFrom(table),
  },
}));

function mockFromChain(resolvedData = []) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  chain.order.mockImplementation((col) => {
    if (col === 'name') {
      return Promise.resolve({ data: resolvedData, error: null });
    }
    return chain;
  });
  mockFrom.mockReturnValue(chain);
  return chain;
}

describe('useDashboardSearch (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockImplementation((fn) => {
      if (fn === 'count_knowledge_objects') {
        return Promise.resolve({ data: 0, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    });
    mockFromChain();
  });

  it('calls search_knowledge_objects with pagination when no query', async () => {
    renderHook(() => useDashboardSearch({ userId: 'user-1' }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalled();
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'search_knowledge_objects',
      expect.objectContaining({
        search_query: null,
        limit_n: 20,
        offset_n: 0,
      })
    );
  });

  it('calls search_knowledge_objects_with_snippets when query is set and runSearch called', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useDashboardSearch({ userId: 'user-1' }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalled();
    });
    mockRpc.mockClear();

    await act(async () => {
      result.current.setSearchQuery('test');
    });
    await act(async () => {
      result.current.runSearch(0);
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'search_knowledge_objects_with_snippets',
      expect.objectContaining({
        search_query: 'test',
        limit_n: 20,
        offset_n: 0,
      })
    );
  });

  it('passes type and domain filters to RPC', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useDashboardSearch({ userId: 'user-1' }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalled();
    });
    mockRpc.mockClear();

    await act(async () => {
      result.current.setTypeFilter('note');
      result.current.setDomainFilter('domain-uuid');
      result.current.runSearch(0, null, { typeFilter: 'note', domainFilter: 'domain-uuid' });
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'search_knowledge_objects',
      expect.objectContaining({
        type_filter: 'note',
        domain_id_f: 'domain-uuid',
      })
    );
  });

  it('goToPage fetches with correct offset', async () => {
    mockRpc.mockImplementation((fn) => {
      if (fn === 'count_knowledge_objects') {
        return Promise.resolve({ data: 40, error: null });
      }
      return Promise.resolve({ data: Array(20).fill({ id: 'x', title: 't' }), error: null });
    });
    const { result } = renderHook(() => useDashboardSearch({ userId: 'user-1' }));

    await waitFor(() => {
      expect(result.current.page).toBe(1);
    });
    mockRpc.mockClear();

    await act(async () => {
      result.current.goToPage(2);
    });

    await waitFor(() => {
      expect(result.current.page).toBe(2);
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'search_knowledge_objects',
      expect.objectContaining({ offset_n: 20, limit_n: 20 })
    );
  });
});
