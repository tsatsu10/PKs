import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabase';
import { logAudit } from '../../../lib/audit';
import { deliverWebhookEvent } from '../../../lib/webhooks';
import { useToast } from '../../../context/ToastContext';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, RUN_PROMPT_STORAGE_KEY } from '../../../constants';
import { getErrorMessage } from '../../../lib/errors';
import { useDashboardSearch, createEmptyFiltersOverride } from '../../../hooks/useDashboardSearch';
import { useTrailheads } from './useTrailheads';
import { usePulseMetrics } from './usePulseMetrics';
import { usePulseCelebration } from './usePulseCelebration';
import { useDashboardBulkActions } from './useDashboardBulkActions';
import { useDashboardKeyboard } from './useDashboardKeyboard';
import { loadViewMode, saveViewMode } from '../lib/viewMode';
import { buildStreamVirtualItems } from '../lib/streamBuckets';
import { buildFilterChips } from '../lib/filterChips';
import {
  DENSITY_KEY,
  SAVED_FILTERS_KEY,
  SEARCH_DEBOUNCE_MS,
  getCardColumns,
  loadSavedFilters,
} from '../lib/dashboardUtils';

/** All dashboard page state, effects, and handlers. */
export function useDashboardPage() {

  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const {
    objects,
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
    createDomainInline,
    createTagInline,
    page,
    totalPages,
    totalCount,
    pageSize,
    goToPage,
    hasActiveFilters,
    resumeObject,
  } = useDashboardSearch({ userId: user?.id ?? null });
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState(() => loadViewMode());
  const [listDensity, setListDensity] = useState(() => {
    try { return (localStorage.getItem(DENSITY_KEY) || 'comfortable'); } catch { return 'comfortable'; }
  });
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [savedFilters, setSavedFilters] = useState(() => loadSavedFilters());
  const [showSaveFilterModal, setShowSaveFilterModal] = useState(false);
  const [saveFilterName, setSaveFilterName] = useState('');
  const [showSavedFiltersDropdown, setShowSavedFiltersDropdown] = useState(false);
  const savedFiltersDropdownRef = useRef(null);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddContent, setQuickAddContent] = useState('');
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [searchParams] = useSearchParams();
  const qFromUrl = searchParams.get('q') ?? '';
  const searchInputRef = useRef(null);
  const quickAddInputRef = useRef(null);
  const listScrollRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const location = useLocation();
  const [cardColumns, setCardColumns] = useState(1);
  const [runPromptTemplate, setRunPromptTemplate] = useState(null);
  const [heroStats, setHeroStats] = useState(null);
  const [showActivityPanel, setShowActivityPanel] = useState(false);

  const { pendingObject, sparkObject } = useTrailheads({ userId: user?.id ?? null, resumeObject });
  const { values: pulseValues, targets: pulseTargets, loading: pulseLoading } = usePulseMetrics(user?.id ?? null);
  const runPromptSuffix = runPromptTemplate ? `?runPrompt=${runPromptTemplate.id}` : '';

  const bulk = useDashboardBulkActions({
    user,
    addToast,
    setError,
    objects,
    runSearch,
    searchQuery,
    typeFilter,
    statusFilter,
    domainFilter,
    tagFilter,
    dateFrom,
    dateTo,
    dueFrom,
    dueTo,
  });

  const streamItems = useMemo(
    () => (viewMode === 'stream' ? buildStreamVirtualItems(objects, listDensity) : []),
    [viewMode, objects, listDensity]
  );

  const listRowHeight = listDensity === 'compact' ? 56 : 72;
  const cardRowHeight = listDensity === 'compact' ? 252 : 318;
  const virtualizerCount = viewMode === 'card'
    ? Math.max(1, Math.ceil(objects.length / Math.max(cardColumns, 1)))
    : viewMode === 'stream'
      ? streamItems.length
      : objects.length;
  const listVirtualizer = useVirtualizer({
    count: virtualizerCount,
    getScrollElement: () => listScrollRef.current,
    estimateSize: (index) => {
      if (viewMode === 'card') return cardRowHeight;
      if (viewMode === 'stream') return streamItems[index]?.size ?? 48;
      return listRowHeight;
    },
    overscan: viewMode === 'card' ? 3 : 5,
  });

  useEffect(() => {
    if (viewMode !== 'card') return;
    const el = listScrollRef.current;
    if (!el) return;
    const update = () => setCardColumns(getCardColumns(el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewMode, loading, objects.length]);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return localStorage.getItem('pks-onboarding-dismissed') !== 'true'; } catch { return false; }
  });

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    supabase.rpc('get_dashboard_stats').then(({ data }) => {
      if (!cancelled && data) setHeroStats(data);
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  const filterChips = useMemo(
    () => buildFilterChips({
      typeFilter,
      statusFilter,
      domainFilter,
      tagFilter,
      dateFrom,
      dateTo,
      dueFrom,
      dueTo,
      domains,
      tags,
      setTypeFilter,
      setStatusFilter,
      setDomainFilter,
      setTagFilter,
      setDateFrom,
      setDateTo,
      setDueFrom,
      setDueTo,
      runSearch,
      searchQuery,
    }),
    [
      typeFilter,
      statusFilter,
      domainFilter,
      tagFilter,
      dateFrom,
      dateTo,
      dueFrom,
      dueTo,
      domains,
      tags,
      setTypeFilter,
      setStatusFilter,
      setDomainFilter,
      setTagFilter,
      setDateFrom,
      setDateTo,
      setDueFrom,
      setDueTo,
      runSearch,
      searchQuery,
    ]
  );

  const closeQuickAdd = useCallback(() => {
    setShowQuickAdd(false);
    setQuickAddTitle('');
    setQuickAddContent('');
  }, []);

  const clearBulkSelection = bulk.clearSelection;
  const handlePageChange = useCallback((nextPage) => {
    goToPage(nextPage);
    clearBulkSelection();
    listScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [goToPage, clearBulkSelection]);

  const keyboard = useDashboardKeyboard({
    navigate,
    location,
    showQuickAdd,
    setShowQuickAdd,
    closeQuickAdd,
    selectedIdsSize: bulk.selectedIds.size,
    clearSelection: bulk.clearSelection,
    searchInputRef,
    quickAddInputRef,
    listScrollRef,
    objects,
    listVirtualizer,
    viewMode,
    setViewMode,
    cardColumns,
    streamItems,
    page,
    totalPages,
    handlePageChange,
    resumeObject,
    pendingObject,
    sparkObject,
    runPromptSuffix,
  });

  // Sync search input from URL only when the URL query changes (e.g. navigation), not when user types
  useEffect(() => {
    setSearchQuery(qFromUrl);
  }, [qFromUrl, setSearchQuery]);

  const dueSoonFromParams = searchParams.get('due') === 'soon';
  const typeFromParams = searchParams.get('type') ?? '';
  const statusFromParams = searchParams.get('status') ?? '';
  const updatedFromParams = searchParams.get('updated') ?? '';

  useEffect(() => {
    if (!user?.id) return;
    const hasAnyParam = dueSoonFromParams || typeFromParams || statusFromParams || updatedFromParams;
    const today = new Date();
    let overrides;
    if (hasAnyParam) {
      if (dueSoonFromParams) {
        const in7 = new Date(today);
        in7.setDate(in7.getDate() + 7);
        const dueFromVal = today.toISOString().slice(0, 10);
        const dueToVal = in7.toISOString().slice(0, 10);
        setDueFrom(dueFromVal);
        setDueTo(dueToVal);
        overrides = {
          dueFrom: dueFromVal,
          dueTo: dueToVal,
          dateFrom: '',
          dateTo: '',
          typeFilter: typeFromParams || '',
          statusFilter: statusFromParams || '',
        };
      } else {
        setDueFrom('');
        setDueTo('');
        overrides = {
          dueFrom: '',
          dueTo: '',
          typeFilter: typeFromParams || '',
          statusFilter: statusFromParams || '',
        };
      }
      setTypeFilter(typeFromParams || '');
      setStatusFilter(statusFromParams || '');
      if (updatedFromParams === '7d') {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const dateFromVal = weekAgo.toISOString().slice(0, 10);
        const dateToVal = today.toISOString().slice(0, 10);
        setDateFrom(dateFromVal);
        setDateTo(dateToVal);
        overrides = { ...overrides, dateFrom: dateFromVal, dateTo: dateToVal };
      } else {
        setDateFrom('');
        setDateTo('');
        overrides = { ...overrides, dateFrom: '', dateTo: '' };
      }
      setShowFilters(true);
    } else {
      setTypeFilter('');
      setStatusFilter('');
      setDateFrom('');
      setDateTo('');
      setDueFrom('');
      setDueTo('');
      overrides = createEmptyFiltersOverride();
    }
    runSearch(0, null, overrides);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL-driven filter sync only
  }, [user?.id, dueSoonFromParams, typeFromParams, statusFromParams, updatedFromParams]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RUN_PROMPT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.id && parsed?.name) setRunPromptTemplate(parsed);
    } catch {
      sessionStorage.removeItem(RUN_PROMPT_STORAGE_KEY);
    }
  }, []);

  // Run search with URL query only when URL or user changes, not when user types (runSearch identity changes with searchQuery)
  useEffect(() => {
    if (user?.id && qFromUrl) runSearch(0, qFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only react to URL/user, not runSearch
  }, [user?.id, qFromUrl]);

  // Persist view mode and density
  useEffect(() => {
    saveViewMode(viewMode);
  }, [viewMode]);
  useEffect(() => {
    try { localStorage.setItem(DENSITY_KEY, listDensity); } catch { /* ignore */ }
  }, [listDensity]);

  // Debounced live search (skip first mount to avoid double run with hook)
  const searchDebounceInitialRef = useRef(true);
  useEffect(() => {
    if (!user?.id) return;
    if (searchDebounceInitialRef.current) {
      searchDebounceInitialRef.current = false;
      return;
    }
    const t = setTimeout(() => runSearch(0), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce searchQuery only; runSearch identity changes with filters
  }, [searchQuery, user?.id]);


  function dismissRunPromptBanner() {
    sessionStorage.removeItem(RUN_PROMPT_STORAGE_KEY);
    setRunPromptTemplate(null);
  }

  const handleTagFilterFromActivity = useCallback((tagId) => {
    setTagFilter(tagId);
    setShowFilters(true);
    runSearch(0, null, { tagFilter: tagId });
  }, [runSearch, setTagFilter]);


  function handleSearchSubmit(e) {
    e.preventDefault();
    runSearch(0);
  }

  async function handleQuickAddCreate(e) {
    e.preventDefault();
    const t = quickAddTitle.trim();
    const c = quickAddContent.trim();
    if (!t || !c) {
      addToast('error', 'Title and content are required');
      return;
    }
    setQuickAddSaving(true);
    try {
      const { data, error: err } = await supabase
        .from('knowledge_objects')
        .insert({
          user_id: user.id,
          type: 'note',
          title: t,
          content: c,
          summary: null,
          source: null,
        })
        .select('id')
        .single();
      if (err) throw err;
      logAudit(user.id, AUDIT_ACTIONS.OBJECT_CREATE, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, data.id, { title: t, type: 'note' });
      deliverWebhookEvent('object.created', { objectId: data.id, title: t, type: 'note' });
      addToast('success', 'Created');
      setShowQuickAdd(false);
      setQuickAddTitle('');
      setQuickAddContent('');
      runSearch(0);
      navigate(`/objects/${data.id}`);
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to create');
      addToast('error', msg);
      setError(msg);
    } finally {
      setQuickAddSaving(false);
    }
  }


  useEffect(() => {
    function onClickOutside(e) {
      if (savedFiltersDropdownRef.current && !savedFiltersDropdownRef.current.contains(e.target)) setShowSavedFiltersDropdown(false);
    }
    if (!showSavedFiltersDropdown) return;
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showSavedFiltersDropdown]);


  const dismissOnboarding = () => {
    try { localStorage.setItem('pks-onboarding-dismissed', 'true'); } catch (_e) { void _e; }
    setShowOnboarding(false);
  };

  useEffect(() => {
    try { localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(savedFilters)); } catch { /* ignore */ }
  }, [savedFilters]);

  function saveCurrentFilters() {
    const name = saveFilterName.trim() || 'Saved view';
    const next = {
      id: `saved-${Date.now()}`,
      name,
      filters: {
        searchQuery,
        typeFilter,
        statusFilter,
        domainFilter,
        tagFilter,
        dateFrom,
        dateTo,
        dueFrom,
        dueTo,
      },
    };
    setSavedFilters((prev) => [...prev, next]);
    setSaveFilterName('');
    setShowSaveFilterModal(false);
    addToast('success', `Saved "${name}"`);
  }

  function applySavedFilter(saved) {
    const f = saved.filters || {};
    const overrides = {
      searchQuery: f.searchQuery ?? '',
      typeFilter: f.typeFilter ?? '',
      statusFilter: f.statusFilter ?? '',
      domainFilter: f.domainFilter ?? '',
      tagFilter: f.tagFilter ?? '',
      dateFrom: f.dateFrom ?? '',
      dateTo: f.dateTo ?? '',
      dueFrom: f.dueFrom ?? '',
      dueTo: f.dueTo ?? '',
    };
    setSearchQuery(overrides.searchQuery);
    setTypeFilter(overrides.typeFilter);
    setStatusFilter(overrides.statusFilter);
    setDomainFilter(overrides.domainFilter);
    setTagFilter(overrides.tagFilter);
    setDateFrom(overrides.dateFrom);
    setDateTo(overrides.dateTo);
    setDueFrom(overrides.dueFrom);
    setDueTo(overrides.dueTo);
    setShowFilters(true);
    setShowSavedFiltersDropdown(false);
    runSearch(0, overrides.searchQuery, overrides);
  }

  function deleteSavedFilter(id) {
    setSavedFilters((prev) => prev.filter((s) => s.id !== id));
    setShowSavedFiltersDropdown(false);
    addToast('success', 'Saved filter removed');
  }

  // Single dismissible strip: run-prompt takes priority over onboarding
  const showBanner = runPromptTemplate || showOnboarding;
  const bannerKind = runPromptTemplate ? 'run-prompt' : 'onboarding';

  const { celebrateRing } = usePulseCelebration(
    pulseValues,
    pulseTargets,
    pulseLoading
  );

  return {
    user,
    navigate,
    location,
    loading,
    error,
    objects,
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
    createDomainInline,
    createTagInline,
    page,
    totalPages,
    totalCount,
    pageSize,
    hasActiveFilters,
    showFilters,
    setShowFilters,
    viewMode,
    setViewMode,
    listDensity,
    setListDensity,
    showQuickAdd,
    setShowQuickAdd,
    quickAddTitle,
    setQuickAddTitle,
    quickAddContent,
    setQuickAddContent,
    quickAddSaving,
    savedFilters,
    showSaveFilterModal,
    setShowSaveFilterModal,
    saveFilterName,
    setSaveFilterName,
    showSavedFiltersDropdown,
    setShowSavedFiltersDropdown,
    savedFiltersDropdownRef,
    searchInputRef,
    quickAddInputRef,
    listScrollRef,
    cardColumns,
    runPromptTemplate,
    heroStats,
    showActivityPanel,
    setShowActivityPanel,
    pendingObject,
    sparkObject,
    resumeObject,
    pulseValues,
    pulseTargets,
    pulseLoading,
    celebrateRing,
    runPromptSuffix,
    streamItems,
    listVirtualizer,
    filterChips,
    handlePageChange,
    dismissRunPromptBanner,
    closeQuickAdd,
    handleTagFilterFromActivity,
    handleSearchSubmit,
    handleQuickAddCreate,
    dismissOnboarding,
    saveCurrentFilters,
    applySavedFilter,
    deleteSavedFilter,
    showBanner,
    bannerKind,
    showOnboarding,
    ...bulk,
    ...keyboard,
  };
}
