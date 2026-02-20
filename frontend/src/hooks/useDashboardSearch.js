import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { measureSearchStart, measureSearchEnd } from '../lib/performance';

const PAGE_SIZE = 20;

/**
 * Hook for dashboard object list: search, filters, pagination, and domains/tags for filters.
 * @param {{ userId: string | null }} options
 * @returns Search state, filter state, runSearch, clearFilters, domains, tags, load more.
 */
export function useDashboardSearch({ userId }) {
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [domains, setDomains] = useState([]);
  const [tags, setTags] = useState([]);

  const runSearch = useCallback(
    async (nextOffset = 0, queryOverride = null, filtersOverride = null) => {
      if (!userId) return;
      const isLoadMore = nextOffset > 0;
      const q =
        queryOverride !== null && queryOverride !== undefined
          ? String(queryOverride).trim()
          : searchQuery.trim();
      const dom =
        filtersOverride && 'domain_id_f' in filtersOverride
          ? filtersOverride.domain_id_f
          : domainFilter;
      if (!isLoadMore) setLoading(true);
      else setLoadingMore(true);
      setError('');
      measureSearchStart();
      try {
        const rpcName = q ? 'search_knowledge_objects_with_snippets' : 'search_knowledge_objects';
        const { data, error: err } = await supabase.rpc(rpcName, {
          search_query: q || null,
          type_filter: typeFilter || null,
          domain_id_f: dom || null,
          tag_id_f: tagFilter || null,
          date_from_f: dateFrom ? `${dateFrom}T00:00:00Z` : null,
          date_to_f: dateTo ? `${dateTo}T23:59:59Z` : null,
          status_filter: statusFilter || null,
          due_from_f: dueFrom ? `${dueFrom}T00:00:00Z` : null,
          due_to_f: dueTo ? `${dueTo}T23:59:59Z` : null,
          limit_n: PAGE_SIZE,
          offset_n: nextOffset,
        });
        if (err) throw err;
        const list = data || [];
        if (isLoadMore) {
          setObjects((prev) => [...prev, ...list]);
        } else {
          setObjects(list);
        }
        setHasMore(list.length === PAGE_SIZE);
        setOffset(nextOffset + list.length);
      } catch (e) {
        setError(
          e?.message ?? e?.error_description ?? (typeof e === 'string' ? e : 'Search failed')
        );
        if (!isLoadMore) setObjects([]);
      } finally {
        measureSearchEnd();
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [userId, searchQuery, typeFilter, statusFilter, domainFilter, tagFilter, dateFrom, dateTo, dueFrom, dueTo]
  );

  useEffect(() => {
    if (!userId) return;
    runSearch(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only when user becomes available
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const [dRes, tRes] = await Promise.all([
        supabase.from('domains').select('id, name').eq('user_id', userId).order('name'),
        supabase.from('tags').select('id, name').eq('user_id', userId).order('name'),
      ]);
      setDomains(dRes.data || []);
      setTags(tRes.data || []);
    })();
  }, [userId]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setTypeFilter('');
    setStatusFilter('');
    setDomainFilter('');
    setTagFilter('');
    setDateFrom('');
    setDateTo('');
    setDueFrom('');
    setDueTo('');
    runSearch(0);
  }, [runSearch]);

  const handleLoadMore = useCallback(() => {
    runSearch(offset);
  }, [runSearch, offset]);

  const hasActiveFilters = Boolean(
    searchQuery.trim()
    || typeFilter
    || statusFilter
    || domainFilter
    || tagFilter
    || dateFrom
    || dateTo
    || dueFrom
    || dueTo
  );

  return {
    objects,
    setObjects,
    loading,
    error,
    setError,
    searchQuery,
    setSearchQuery,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    domainFilter,
    setDomainFilter,
    tagFilter,
    setTagFilter,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    dueFrom,
    setDueFrom,
    dueTo,
    setDueTo,
    runSearch,
    clearFilters,
    domains,
    tags,
    offset,
    hasMore,
    loadingMore,
    handleLoadMore,
    hasActiveFilters,
  };
}
