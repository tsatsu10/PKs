import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { getErrorMessage } from '../lib/errors';
import { deferAfterPaint } from '../lib/defer';
import { createDomain, createTag } from '../lib/entities';
import { useTaxonomy, upsertTaxonomyEntity, invalidateTaxonomy } from '../data/taxonomy';
import { useObjectsPage, useObjectsCount } from '../data/objects';
import { qk } from '../data/keys';

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

export { buildRpcPayload };

/**
 * Hook for dashboard object list: search, filters, and page-based pagination.
 * The list itself lives in the query cache (`useObjectsPage` / `useObjectsCount`), so
 * identical searches share one request (B11) and rows stay on screen while a new
 * filter page loads (U9).
 * @param {{ userId: string | null }} options
 */
export function useDashboardSearch({ userId }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [resumeObject, setResumeObject] = useState(null);
  // Filters of the last search that actually ran; paging and export reuse these, so
  // unapplied edits in the filter panel don't leak into page 2 or "export all matching".
  const [appliedRpcPayload, setAppliedRpcPayload] = useState(null);
  const [offset, setOffset] = useState(0);
  const [actionError, setError] = useState('');

  const filterState = useMemo(
    () => ({
      searchQuery,
      typeFilter,
      statusFilter,
      domainFilter,
      tagFilter,
      dateFrom,
      dateTo,
      dueFrom,
      dueTo,
    }),
    [searchQuery, typeFilter, statusFilter, domainFilter, tagFilter, dateFrom, dateTo, dueFrom, dueTo]
  );

  const queryClient = useQueryClient();
  const { domains, tags } = useTaxonomy(userId);

  const pageQ = useObjectsPage(userId ? appliedRpcPayload : null, offset);
  const countQ = useObjectsCount(userId ? appliedRpcPayload : null);

  const objects = pageQ.data ?? [];
  const totalCount = countQ.data ?? null;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = totalCount != null
    ? Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
    : objects.length < PAGE_SIZE
      ? page
      : page + 1;
  // First load only; filter changes keep the previous rows on screen (U9).
  const loading = pageQ.isPending;
  const error = actionError || (pageQ.error ? getErrorMessage(pageQ.error, 'Search failed') : '');

  const refreshTaxonomy = useCallback(() => invalidateTaxonomy(queryClient), [queryClient]);
  const refreshDomains = refreshTaxonomy;
  const refreshTags = refreshTaxonomy;

  const createDomainInline = useCallback(async (name) => {
    const created = await createDomain(name);
    upsertTaxonomyEntity('domains', created, queryClient);
    return created;
  }, [queryClient]);

  const createTagInline = useCallback(async (name) => {
    const created = await createTag(name);
    upsertTaxonomyEntity('tags', created, queryClient);
    return created;
  }, [queryClient]);

  const runSearch = useCallback(
    (nextOffset = 0, queryOverride = null, filtersOverride = null) => {
      if (!userId) return;
      const hasOverride = queryOverride != null || filtersOverride != null;
      if (nextOffset === 0 || hasOverride || !appliedRpcPayload) {
        setAppliedRpcPayload(
          buildRpcPayload(resolveSearchRpcFilters(filtersOverride, filterState, queryOverride))
        );
      }
      setOffset(nextOffset);
      setError('');
    },
    [userId, filterState, appliedRpcPayload]
  );

  const setObjects = useCallback(
    (updater) => {
      queryClient.setQueryData(qk.objects.page(appliedRpcPayload, offset), (prev = []) =>
        (typeof updater === 'function' ? updater(prev) : updater));
    },
    [appliedRpcPayload, offset, queryClient]
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
    appliedRpcPayload,
    retry: () => pageQ.refetch(),
    listError: pageQ.error,
  };
}
