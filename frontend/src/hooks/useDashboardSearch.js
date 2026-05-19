import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { measureSearchStart, measureSearchEnd } from '../lib/performance';
import { getErrorMessage } from '../lib/errors';
import { deferAfterPaint } from '../lib/defer';
import { createDomain, createTag } from '../lib/entities';

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
export function resolveSearchRpcFilters(filtersOverride, state, queryOverride = null) {
  return {
    q: pickQuery(queryOverride, filtersOverride, state.searchQuery),
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

function buildRpcPayload(filters) {
  return {
    search_query: filters.q || null,
    type_filter: filters.typeF,
    domain_id_f: filters.domF,
    tag_id_f: filters.tagF,
    date_from_f: filters.dateFromF ? `${filters.dateFromF}T00:00:00Z` : null,
    date_to_f: filters.dateToF ? `${filters.dateToF}T23:59:59Z` : null,
    status_filter: filters.statusF,
    due_from_f: filters.dueFromF ? `${filters.dueFromF}T00:00:00Z` : null,
    due_to_f: filters.dueToF ? `${filters.dueToF}T23:59:59Z` : null,
  };
}

function mergeEntityList(prev, item) {
  if (prev.some((e) => e.id === item.id)) {
    return prev.map((e) => (e.id === item.id ? item : e));
  }
  return [...prev, item].sort((a, b) => a.name.localeCompare(b.name));
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
  const [totalCount, setTotalCount] = useState(null);
  const [domains, setDomains] = useState([]);
  const [tags, setTags] = useState([]);
  const [resumeObject, setResumeObject] = useState(null);

  const filterState = {
    searchQuery,
    typeFilter,
    statusFilter,
    domainFilter,
    tagFilter,
    dateFrom,
    dateTo,
    dueFrom,
    dueTo,
  };

  const refreshDomains = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('domains').select('id, name').eq('user_id', userId).order('name');
    setDomains(data || []);
  }, [userId]);

  const refreshTags = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('tags').select('id, name').eq('user_id', userId).order('name');
    setTags(data || []);
  }, [userId]);

  const createDomainInline = useCallback(async (name) => {
    const created = await createDomain(name);
    setDomains((prev) => mergeEntityList(prev, created));
    return created;
  }, []);

  const createTagInline = useCallback(async (name) => {
    const created = await createTag(name);
    setTags((prev) => mergeEntityList(prev, created));
    return created;
  }, []);

  const runSearch = useCallback(
    async (nextOffset = 0, queryOverride = null, filtersOverride = null) => {
      if (!userId) return;
      const isNewQuery = nextOffset === 0;
      const filters = resolveSearchRpcFilters(filtersOverride, filterState, queryOverride);
      const rpcPayload = buildRpcPayload(filters);
      setLoading(true);
      setError('');
      measureSearchStart();
      try {
        const rpcName = filters.q ? 'search_knowledge_objects_with_snippets' : 'search_knowledge_objects';
        const searchPromise = supabase.rpc(rpcName, {
          ...rpcPayload,
          limit_n: PAGE_SIZE,
          offset_n: nextOffset,
        });
        const countPromise = supabase.rpc('count_knowledge_objects', rpcPayload);
        const [{ data, error: err }, countRes] = await Promise.all([searchPromise, countPromise]);
        if (err) throw err;
        const list = data || [];
        const currentPage = Math.floor(nextOffset / PAGE_SIZE) + 1;
        setObjects(list);
        setPage(currentPage);

        if (!countRes.error && countRes.data != null) {
          const count = Number(countRes.data);
          if (Number.isFinite(count)) {
            setTotalCount(count);
            setTotalPages(Math.max(1, Math.ceil(count / PAGE_SIZE)));
          } else {
            setTotalCount(null);
            applyEstimatedPages();
          }
        } else {
          setTotalCount(null);
          applyEstimatedPages();
        }

        function applyEstimatedPages() {
          if (list.length < PAGE_SIZE) {
            setTotalPages(currentPage);
          } else if (isNewQuery) {
            setTotalPages(2);
          } else {
            setTotalPages((prev) => Math.max(prev, currentPage + 1));
          }
        }
      } catch (e) {
        setError(getErrorMessage(e, 'Search failed'));
        if (isNewQuery) {
          setObjects([]);
          setTotalCount(null);
        }
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
      if (totalCount != null) {
        const maxPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
        runSearch((Math.min(p, maxPage) - 1) * PAGE_SIZE);
        return;
      }
      runSearch((p - 1) * PAGE_SIZE);
    },
    [runSearch, totalCount]
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

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const cancelDefer = deferAfterPaint(() => {
      (async () => {
        const { data, error: resumeErr } = await supabase
          .from('knowledge_objects')
          .select('id, title, last_viewed_at')
          .eq('user_id', userId)
          .eq('is_deleted', false)
          .not('last_viewed_at', 'is', null)
          .order('last_viewed_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!cancelled && !resumeErr && data) {
          setResumeObject({ id: data.id, title: data.title });
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
    refreshDomains,
    refreshTags,
    createDomainInline,
    createTagInline,
    page,
    totalPages,
    totalCount,
    pageSize: PAGE_SIZE,
    goToPage,
    hasActiveFilters,
    resumeObject,
    createEmptyFiltersOverride,
    filterState,
  };
}
