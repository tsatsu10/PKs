import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { measureSearchStart, measureSearchEnd } from '../lib/performance';
import { getErrorMessage } from '../lib/errors';
import { deferAfterPaint } from '../lib/defer';

export const PAGE_SIZE = 20;

/** All filter fields for synchronous search (avoids stale closure after setState). */
export function createEmptyFiltersOverride() {
  return {
    searchQuery: '',
    typeFilter: '',
    statusFilter: '',
    domainFilter: '',
    tagFilter: '',
    dateFrom: '',
    dateTo: '',
    dueFrom: '',
    dueTo: '',
  };
}

function pickFilter(key, filtersOverride, stateValue) {
  if (filtersOverride != null && key in filtersOverride) {
    const v = filtersOverride[key];
    return v ? v : null;
  }
  return stateValue || null;
}

/** Build RPC filter args from optional override + current state. */
export function resolveSearchRpcFilters(filtersOverride, state) {
  return {
    q: pickQuery(null, filtersOverride, state.searchQuery),
    typeF: pickFilter('typeFilter', filtersOverride, state.typeFilter),
    domF: pickFilter('domainFilter', filtersOverride, state.domainFilter),
    tagF: pickFilter('tagFilter', filtersOverride, state.tagFilter),
    statusF: pickFilter('statusFilter', filtersOverride, state.statusFilter),
    dateFromF: pickFilter('dateFrom', filtersOverride, state.dateFrom),
    dateToF: pickFilter('dateTo', filtersOverride, state.dateTo),
    dueFromF: pickFilter('dueFrom', filtersOverride, state.dueFrom),
    dueToF: pickFilter('dueTo', filtersOverride, state.dueTo),
  };
}

function pickQuery(queryOverride, filtersOverride, searchQuery) {
  if (queryOverride !== null && queryOverride !== undefined) {
    return String(queryOverride).trim();
  }
  if (filtersOverride != null && 'searchQuery' in filtersOverride) {
    return String(filtersOverride.searchQuery ?? '').trim();
  }
  return searchQuery.trim();
}

/**
 * Hook for dashboard object list: search, filters, and page-based pagination.
 * @param {{ userId: string | null }} options
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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [domains, setDomains] = useState([]);
  const [tags, setTags] = useState([]);

  const runSearch = useCallback(
    async (nextOffset = 0, queryOverride = null, filtersOverride = null) => {
      if (!userId) return;
      const isNewQuery = nextOffset === 0;
      const q = pickQuery(queryOverride, filtersOverride, searchQuery);
      const typeF = pickFilter('typeFilter', filtersOverride, typeFilter);
      const domF = pickFilter('domainFilter', filtersOverride, domainFilter);
      const tagF = pickFilter('tagFilter', filtersOverride, tagFilter);
      const statusF = pickFilter('statusFilter', filtersOverride, statusFilter);
      const dateFromF = pickFilter('dateFrom', filtersOverride, dateFrom);
      const dateToF = pickFilter('dateTo', filtersOverride, dateTo);
      const dueFromF = pickFilter('dueFrom', filtersOverride, dueFrom);
      const dueToF = pickFilter('dueTo', filtersOverride, dueTo);
      setLoading(true);
      setError('');
      measureSearchStart();
      try {
        const rpcName = q ? 'search_knowledge_objects_with_snippets' : 'search_knowledge_objects';
        const { data, error: err } = await supabase.rpc(rpcName, {
          search_query: q || null,
          type_filter: typeF,
          domain_id_f: domF,
          tag_id_f: tagF,
          date_from_f: dateFromF ? `${dateFromF}T00:00:00Z` : null,
          date_to_f: dateToF ? `${dateToF}T23:59:59Z` : null,
          status_filter: statusF,
          due_from_f: dueFromF ? `${dueFromF}T00:00:00Z` : null,
          due_to_f: dueToF ? `${dueToF}T23:59:59Z` : null,
          limit_n: PAGE_SIZE,
          offset_n: nextOffset,
        });
        if (err) throw err;
        const list = data || [];
        const currentPage = Math.floor(nextOffset / PAGE_SIZE) + 1;
        setObjects(list);
        setPage(currentPage);
        if (list.length < PAGE_SIZE) {
          setTotalPages(currentPage);
        } else if (isNewQuery) {
          setTotalPages(2);
        } else {
          setTotalPages((prev) => Math.max(prev, currentPage + 1));
        }
      } catch (e) {
        setError(getErrorMessage(e, 'Search failed'));
        if (isNewQuery) setObjects([]);
      } finally {
        measureSearchEnd();
        setLoading(false);
      }
    },
    [userId, searchQuery, typeFilter, statusFilter, domainFilter, tagFilter, dateFrom, dateTo, dueFrom, dueTo]
  );

  const goToPage = useCallback(
    (targetPage) => {
      const p = Math.max(1, Math.floor(targetPage));
      runSearch((p - 1) * PAGE_SIZE);
    },
    [runSearch]
  );

  useEffect(() => {
    if (!userId) return;
    runSearch(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only when user becomes available
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const cancelDefer = deferAfterPaint(() => {
      (async () => {
        const [dRes, tRes] = await Promise.all([
          supabase.from('domains').select('id, name').eq('user_id', userId).order('name'),
          supabase.from('tags').select('id, name').eq('user_id', userId).order('name'),
        ]);
        if (!cancelled) {
          setDomains(dRes.data || []);
          setTags(tRes.data || []);
        }
      })();
    });
    return () => {
      cancelled = true;
      cancelDefer();
    };
  }, [userId]);

  const clearFilters = useCallback(() => {
    const empty = createEmptyFiltersOverride();
    setSearchQuery('');
    setTypeFilter('');
    setStatusFilter('');
    setDomainFilter('');
    setTagFilter('');
    setDateFrom('');
    setDateTo('');
    setDueFrom('');
    setDueTo('');
    runSearch(0, '', empty);
  }, [runSearch]);

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
    page,
    totalPages,
    pageSize: PAGE_SIZE,
    goToPage,
    hasActiveFilters,
    createEmptyFiltersOverride,
  };
}
