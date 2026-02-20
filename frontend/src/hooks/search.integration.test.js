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
    order: vi.fn().mockResolvedValue({ data: resolvedData }),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

describe('useDashboardSearch (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: [], error: null });
    mockFromChain();
  });

  it('calls search_knowledge_objects with pagination when no query', async () => {
    const { result } = renderHook(() => useDashboardSearch({ userId: 'user-1' }));

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
    });
    await act(async () => {
      result.current.runSearch(0);
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'search_knowledge_objects',
      expect.objectContaining({
        type_filter: 'note',
        domain_id_f: 'domain-uuid',
      })
    );
  });
});
