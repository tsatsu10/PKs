import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { SkeletonList } from '../components/Skeleton';
import { OBJECT_TYPE_ICONS, OBJECT_TYPES, OBJECT_STATUSES, formatObjectTypeLabel } from '../constants';
import { createNotification } from '../lib/notifications';
import { logAudit } from '../lib/audit';
import { deliverWebhookEvent } from '../lib/webhooks';
import { useToast } from '../context/ToastContext';
import { getExportIncludeFromTemplate, buildObjectMarkdown } from '../lib/export';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, RUN_PROMPT_STORAGE_KEY } from '../constants';
import { useDashboardSearch, createEmptyFiltersOverride } from '../hooks/useDashboardSearch';
import DashboardFilterPanel from '../components/DashboardFilterPanel';
import DashboardQuickAddForm from '../components/DashboardQuickAddForm';
import DashboardStats from '../components/DashboardStats';
import DashboardObjectCard from '../components/DashboardObjectCard';
import DashboardPagination from '../components/DashboardPagination';
import { getErrorMessage } from '../lib/errors';
import './Dashboard.css';

const VIEW_MODE_KEY = 'pks-dashboard-view';
const CARD_COLS_BREAKPOINT_2 = 720;
const CARD_COLS_BREAKPOINT_3 = 1100;

function getCardColumns(width) {
  if (width >= CARD_COLS_BREAKPOINT_3) return 3;
  if (width >= CARD_COLS_BREAKPOINT_2) return 2;
  return 1;
}
const DENSITY_KEY = 'pks-dashboard-density';
const SAVED_FILTERS_KEY = 'pks-saved-filters';
const SEARCH_DEBOUNCE_MS = 300;

function loadSavedFilters() {
  try {
    const raw = localStorage.getItem(SAVED_FILTERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Selected object IDs the user owns (RLS bulk ops require ownership, not shared access). */
function resolveOwnedObjectIds(selectedIds, objectList, ownerId) {
  if (!ownerId || selectedIds.size === 0) return [];
  const owned = new Set(objectList.filter((o) => o.user_id === ownerId).map((o) => o.id));
  return Array.from(selectedIds).filter((id) => owned.has(id));
}

export default function Dashboard() {
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
    page,
    totalPages,
    pageSize,
    goToPage,
    hasActiveFilters,
  } = useDashboardSearch({ userId: user?.id ?? null });
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState(() => {
    try { return (localStorage.getItem(VIEW_MODE_KEY) || 'list'); } catch { return 'list'; }
  });
  const [listDensity, setListDensity] = useState(() => {
    try { return (localStorage.getItem(DENSITY_KEY) || 'comfortable'); } catch { return 'comfortable'; }
  });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportScope, setExportScope] = useState('selected'); // 'selected' | 'filtered'
  const [exportFormat, setExportFormat] = useState('md');
  const [exportTemplate, setExportTemplate] = useState('full');
  const [exporting, setExporting] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
  const [commandPaletteSelected, setCommandPaletteSelected] = useState(0);
  const commandPaletteInputRef = useRef(null);
  const commandPaletteFilteredLengthRef = useRef(0);
  const commandPaletteActionsRef = useRef([]);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [savedFilters, setSavedFilters] = useState(() => loadSavedFilters());
  const [showSaveFilterModal, setShowSaveFilterModal] = useState(false);
  const [saveFilterName, setSaveFilterName] = useState('');
  const [showSavedFiltersDropdown, setShowSavedFiltersDropdown] = useState(false);
  const savedFiltersDropdownRef = useRef(null);
  const previousFocusRef = useRef(/** @type {HTMLElement | null} */ (null));
  const modalPreviousFocusRef = useRef(/** @type {HTMLElement | null} */ (null));
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddContent, setQuickAddContent] = useState('');
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [bulkModal, setBulkModal] = useState(null); // 'add_domain' | 'add_tag' | 'remove_domain' | 'remove_tag' | 'delete' | 'change_type' | 'set_status'
  const [bulkDomainId, setBulkDomainId] = useState('');
  const [bulkTagId, setBulkTagId] = useState('');
  const [bulkType, setBulkType] = useState('note');
  const [bulkStatus, setBulkStatus] = useState('active');
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const qFromUrl = searchParams.get('q') ?? '';
  const searchInputRef = useRef(null);
  const quickAddInputRef = useRef(null);
  const bulkMenuRef = useRef(null);
  const listScrollRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const location = useLocation();
  const [cardColumns, setCardColumns] = useState(1);

  const listRowHeight = listDensity === 'compact' ? 56 : 72;
  const cardRowHeight = listDensity === 'compact' ? 252 : 318;
  const virtualizerCount = viewMode === 'card'
    ? Math.max(1, Math.ceil(objects.length / Math.max(cardColumns, 1)))
    : objects.length;
  const listVirtualizer = useVirtualizer({
    count: virtualizerCount,
    getScrollElement: () => listScrollRef.current,
    estimateSize: () => (viewMode === 'card' ? cardRowHeight : listRowHeight),
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
  const [runPromptTemplate, setRunPromptTemplate] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return localStorage.getItem('pks-onboarding-dismissed') !== 'true'; } catch { return false; }
  });
  const [heroStats, setHeroStats] = useState(null);

  const handlePageChange = useCallback((nextPage) => {
    goToPage(nextPage);
    setSelectedIds(new Set());
    listScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [goToPage]);

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

  // Persist list/card view and density
  useEffect(() => {
    try { localStorage.setItem(VIEW_MODE_KEY, viewMode); } catch { /* ignore */ }
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

  // Command palette: Cmd/Ctrl+K — store focus for restore
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const willOpen = !showCommandPalette;
        if (willOpen) previousFocusRef.current = document.activeElement;
        setShowCommandPalette((v) => !v);
        setCommandPaletteQuery('');
        if (willOpen) setTimeout(() => commandPaletteInputRef.current?.focus(), 0);
        else setTimeout(() => previousFocusRef.current?.focus(), 0);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showCommandPalette]);
  // Scroll progress (window) for list area feedback
  useEffect(() => {
    function onScroll() {
      const winScroll = document.documentElement.scrollTop || document.body.scrollTop;
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      setScrollProgress(height > 0 ? (winScroll / height) * 100 : 0);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!showCommandPalette) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        setShowCommandPalette(false);
        setTimeout(() => previousFocusRef.current?.focus(), 0);
        e.preventDefault();
        return;
      }
      const n = commandPaletteFilteredLengthRef.current;
      if (e.key === 'ArrowDown') {
        setCommandPaletteSelected((prev) => Math.min(prev + 1, n - 1));
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowUp') {
        setCommandPaletteSelected((prev) => Math.max(prev - 1, 0));
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter') {
        const actions = commandPaletteActionsRef.current;
        const idx = Math.min(commandPaletteSelected, Math.max(0, actions.length - 1));
        if (actions[idx]) actions[idx].run();
        e.preventDefault();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showCommandPalette, commandPaletteSelected]);

  function dismissRunPromptBanner() {
    sessionStorage.removeItem(RUN_PROMPT_STORAGE_KEY);
    setRunPromptTemplate(null);
  }

  const closeQuickAdd = useCallback(() => {
    setShowQuickAdd(false);
    setQuickAddTitle('');
    setQuickAddContent('');
  }, []);

  // List keyboard nav: J/K and ↑/↓ move focus through items, Enter opens (default link behavior)
  useEffect(() => {
    function onKeyDown(e) {
      const listEl = listScrollRef.current;
      if (!listEl || !objects.length) return;
      if (!listEl.contains(document.activeElement)) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const key = e.key;
      const isDown = key === 'j' || key === 'J' || key === 'ArrowDown';
      const isUp = key === 'k' || key === 'K' || key === 'ArrowUp';
      if (!isDown && !isUp) return;
      e.preventDefault();
      const row = document.activeElement?.closest?.('[data-object-index]');
      const current = row ? parseInt(row.getAttribute('data-object-index') ?? '-1', 10) : -1;
      const nextIndex = isDown ? Math.min(current + 1, objects.length - 1) : Math.max(0, current - 1);
      if (nextIndex === current && current >= 0) return;
      const scrollRow = viewMode === 'card'
        ? Math.floor(nextIndex / Math.max(cardColumns, 1))
        : nextIndex;
      listVirtualizer.scrollToIndex(scrollRow, { align: 'start', behavior: 'auto' });
      setTimeout(() => {
        const row = listEl.querySelector(`[data-object-index="${nextIndex}"]`);
        const link = row?.querySelector?.('.object-card, .object-list-link');
        const toFocus = link instanceof HTMLElement ? link : row;
        if (toFocus instanceof HTMLElement) toFocus.focus();
      }, 50);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [objects.length, listVirtualizer, viewMode, cardColumns]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        if (showQuickAdd) {
          e.preventDefault();
          closeQuickAdd();
          return;
        }
        if (selectedIds.size > 0 && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) {
          e.preventDefault();
          clearSelection();
          return;
        }
      }
      if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) {
        e.preventDefault();
        if (location.pathname === '/') {
          setShowQuickAdd(true);
          setTimeout(() => quickAddInputRef.current?.focus(), 0);
        } else {
          searchInputRef.current?.focus();
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [location.pathname, showQuickAdd, closeQuickAdd, selectedIds.size]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    runSearch(0);
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllOnPage() {
    setSelectedIds(new Set(objects.filter((o) => o.user_id === user?.id).map((o) => o.id)));
  }

  function getOwnedSelection() {
    const ownedIds = resolveOwnedObjectIds(selectedIds, objects, user?.id);
    const skipped = selectedIds.size - ownedIds.length;
    return { ownedIds, skipped };
  }

  function clearSelection() {
    setSelectedIds(new Set());
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

  async function fetchFilteredIds() {
    const ids = [];
    const limit = 100;
    let offset = 0;
    const rpcName = searchQuery?.trim() ? 'search_knowledge_objects_with_snippets' : 'search_knowledge_objects';
    while (true) {
      const { data, error: err } = await supabase.rpc(rpcName, {
        search_query: searchQuery?.trim() || null,
        type_filter: typeFilter || null,
        domain_id_f: domainFilter || null,
        tag_id_f: tagFilter || null,
        date_from_f: dateFrom ? `${dateFrom}T00:00:00Z` : null,
        date_to_f: dateTo ? `${dateTo}T23:59:59Z` : null,
        status_filter: statusFilter || null,
        due_from_f: dueFrom ? `${dueFrom}T00:00:00Z` : null,
        due_to_f: dueTo ? `${dueTo}T23:59:59Z` : null,
        limit_n: limit,
        offset_n: offset,
      });
      if (err || !data?.length) break;
      ids.push(...data.map((o) => o.id));
      if (data.length < limit) break;
      offset += limit;
    }
    return ids;
  }

  async function handleExportSelected() {
    setExporting(true);
    setError('');
    let jobId = null;
    try {
      const ids = exportScope === 'filtered'
        ? await fetchFilteredIds()
        : Array.from(selectedIds);
      if (ids.length === 0) {
        addToast('error', exportScope === 'filtered' ? 'No objects match current filters' : 'Select at least one object');
        setExporting(false);
        return;
      }
      const include = getExportIncludeFromTemplate(exportTemplate, { includeLinks: false });
      const { data: job, error: jobErr } = await supabase.from('export_jobs').insert({
        user_id: user.id,
        knowledge_object_id: null,
        format: exportFormat,
        template: exportTemplate,
        include_content: include.content,
        include_summary: include.summary,
        include_key_points: include.key_points,
        include_tags: include.tags,
        include_domains: include.domains,
        include_links: false,
        filename: `export-${ids.length}-objects.zip`,
        status: 'processing',
      }).select('id').single();
      if (jobErr) throw jobErr;
      jobId = job?.id;
      await supabase.from('export_job_items').insert(ids.map((knowledge_object_id, i) => ({ export_job_id: jobId, knowledge_object_id, sort_order: i })));

      const { data: objs, error: objsErr } = await supabase.from('knowledge_objects').select('*').in('id', ids);
      if (objsErr) throw objsErr;
      if (!objs?.length) throw new Error('No objects found');
      const objMap = Object.fromEntries(objs.map((o) => [o.id, o]));
      const [kodRes, kotRes] = await Promise.all([
        supabase.from('knowledge_object_domains').select('knowledge_object_id, domain_id, domains(id, name)').in('knowledge_object_id', ids),
        supabase.from('knowledge_object_tags').select('knowledge_object_id, tag_id, tags(id, name)').in('knowledge_object_id', ids),
      ]);
      const domainsByObj = {};
      (kodRes.data || []).forEach((r) => {
        if (!domainsByObj[r.knowledge_object_id]) domainsByObj[r.knowledge_object_id] = [];
        if (r.domains) domainsByObj[r.knowledge_object_id].push(r.domains);
      });
      const tagsByObj = {};
      (kotRes.data || []).forEach((r) => {
        if (!tagsByObj[r.knowledge_object_id]) tagsByObj[r.knowledge_object_id] = [];
        if (r.tags) tagsByObj[r.knowledge_object_id].push(r.tags);
      });
      ids.forEach((id) => {
        if (objMap[id]) {
          objMap[id].domains = domainsByObj[id] || [];
          objMap[id].tags = tagsByObj[id] || [];
        }
      });

      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const ZIP_CHUNK = 20;
      for (let i = 0; i < ids.length; i += ZIP_CHUNK) {
        const chunk = ids.slice(i, i + ZIP_CHUNK);
        for (const id of chunk) {
          const obj = objMap[id];
          if (!obj) continue;
          const slug = obj.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 50);
          const ext = exportFormat === 'txt' ? 'txt' : 'md';
          const text = buildObjectMarkdown(obj, include, { asPlainText: exportFormat === 'txt' });
          zip.file(slug + '.' + ext, text);
        }
        if (i + ZIP_CHUNK < ids.length) await new Promise((r) => setTimeout(r, 0));
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `pks-export-${ids.length}-objects.zip`;
      a.click();
      URL.revokeObjectURL(a.href);

      await supabase.from('export_jobs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', jobId);
      createNotification(user.id, 'export_completed', 'Bundle export completed', `${ids.length} objects exported as ZIP`, {});
      logAudit(user.id, AUDIT_ACTIONS.EXPORT_RUN, AUDIT_ENTITY_TYPES.EXPORT_JOB, jobId, { objectCount: ids.length, format: exportFormat });
      addToast('success', `Exported ${ids.length} objects`);
      setShowExportModal(false);
      if (exportScope === 'selected') clearSelection();
    } catch (err) {
      const msg = getErrorMessage(err, 'Export failed');
      if (jobId) await supabase.from('export_jobs').update({ status: 'failed', error_message: msg }).eq('id', jobId);
      setError(msg);
      addToast('error', msg);
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    function onClickOutside(e) {
      if (bulkMenuRef.current && !bulkMenuRef.current.contains(e.target)) setShowBulkMenu(false);
      if (savedFiltersDropdownRef.current && !savedFiltersDropdownRef.current.contains(e.target)) setShowSavedFiltersDropdown(false);
    }
    if (!showBulkMenu && !showSavedFiltersDropdown) return;
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showBulkMenu, showSavedFiltersDropdown]);

  // Focus trap/restore for modals (export + bulk)
  const anyModalOpen = showExportModal || bulkModal != null;
  useEffect(() => {
    if (anyModalOpen) {
      modalPreviousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setTimeout(() => {
        const first = document.querySelector('.dashboard-modal-overlay .dashboard-modal select, .dashboard-modal-overlay .dashboard-modal button:not([disabled])');
        if (first instanceof HTMLElement) first.focus();
      }, 0);
    } else {
      const prev = modalPreviousFocusRef.current;
      modalPreviousFocusRef.current = null;
      if (prev) setTimeout(() => prev.focus(), 0);
    }
  }, [anyModalOpen]);

  // Focus trap: Tab cycles only inside the open modal
  useEffect(() => {
    if (!anyModalOpen) return;
    function onKeyDown(e) {
      if (e.key !== 'Tab') return;
      const overlay = document.querySelector('.dashboard-modal-overlay');
      if (!overlay || !overlay.contains(document.activeElement)) return;
      const focusable = overlay.querySelectorAll('a[href], button:not([disabled]), select, input, textarea, [tabindex]:not([tabindex="-1"])');
      const list = Array.from(focusable).filter((el) => el instanceof HTMLElement && el.offsetParent != null);
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [anyModalOpen]);

  async function bulkAddDomain() {
    const domainId = bulkDomainId;
    if (!domainId || selectedIds.size === 0) return;
    const { ownedIds, skipped } = getOwnedSelection();
    if (ownedIds.length === 0) {
      addToast('error', 'Bulk actions only apply to objects you own.');
      return;
    }
    setBulkActionLoading(true);
    setError('');
    try {
      const rows = ownedIds.map((knowledge_object_id) => ({ knowledge_object_id, domain_id: domainId }));
      const { error: err } = await supabase.from('knowledge_object_domains').upsert(rows, { onConflict: 'knowledge_object_id,domain_id', ignoreDuplicates: true });
      if (err) throw err;
      const msg = skipped > 0
        ? `Domain added to ${ownedIds.length} object(s) (${skipped} shared object(s) skipped)`
        : `Domain added to ${ownedIds.length} object(s)`;
      addToast('success', msg);
      setBulkModal(null);
      setBulkDomainId('');
      setShowBulkMenu(false);
      clearSelection();
      runSearch(0);
    } catch (err) {
      const msg = getErrorMessage(err, 'Bulk add domain failed');
      setError(msg);
      addToast('error', msg);
    } finally {
      setBulkActionLoading(false);
    }
  }

  async function bulkAddTag() {
    const tagId = bulkTagId;
    if (!tagId || selectedIds.size === 0) return;
    const { ownedIds, skipped } = getOwnedSelection();
    if (ownedIds.length === 0) {
      addToast('error', 'Bulk actions only apply to objects you own.');
      return;
    }
    setBulkActionLoading(true);
    setError('');
    try {
      const rows = ownedIds.map((knowledge_object_id) => ({ knowledge_object_id, tag_id: tagId }));
      const { error: err } = await supabase.from('knowledge_object_tags').upsert(rows, { onConflict: 'knowledge_object_id,tag_id', ignoreDuplicates: true });
      if (err) throw err;
      const msg = skipped > 0
        ? `Tag added to ${ownedIds.length} object(s) (${skipped} shared object(s) skipped)`
        : `Tag added to ${ownedIds.length} object(s)`;
      addToast('success', msg);
      setBulkModal(null);
      setBulkTagId('');
      setShowBulkMenu(false);
      clearSelection();
      runSearch(0);
    } catch (err) {
      const msg = getErrorMessage(err, 'Bulk add tag failed');
      setError(msg);
      addToast('error', msg);
    } finally {
      setBulkActionLoading(false);
    }
  }

  async function bulkRemoveDomain() {
    const domainId = bulkDomainId;
    if (!domainId || selectedIds.size === 0) return;
    const { ownedIds, skipped } = getOwnedSelection();
    if (ownedIds.length === 0) {
      addToast('error', 'Bulk actions only apply to objects you own.');
      return;
    }
    setBulkActionLoading(true);
    setError('');
    try {
      const { error: err } = await supabase
        .from('knowledge_object_domains')
        .delete()
        .in('knowledge_object_id', ownedIds)
        .eq('domain_id', domainId);
      if (err) throw err;
      const msg = skipped > 0
        ? `Domain removed from ${ownedIds.length} object(s) (${skipped} shared object(s) skipped)`
        : `Domain removed from ${ownedIds.length} object(s)`;
      addToast('success', msg);
      setBulkModal(null);
      setBulkDomainId('');
      setShowBulkMenu(false);
      clearSelection();
      runSearch(0);
    } catch (err) {
      const msg = getErrorMessage(err, 'Bulk remove domain failed');
      setError(msg);
      addToast('error', msg);
    } finally {
      setBulkActionLoading(false);
    }
  }

  async function bulkRemoveTag() {
    const tagId = bulkTagId;
    if (!tagId || selectedIds.size === 0) return;
    const { ownedIds, skipped } = getOwnedSelection();
    if (ownedIds.length === 0) {
      addToast('error', 'Bulk actions only apply to objects you own.');
      return;
    }
    setBulkActionLoading(true);
    setError('');
    try {
      const { error: err } = await supabase
        .from('knowledge_object_tags')
        .delete()
        .in('knowledge_object_id', ownedIds)
        .eq('tag_id', tagId);
      if (err) throw err;
      const msg = skipped > 0
        ? `Tag removed from ${ownedIds.length} object(s) (${skipped} shared object(s) skipped)`
        : `Tag removed from ${ownedIds.length} object(s)`;
      addToast('success', msg);
      setBulkModal(null);
      setBulkTagId('');
      setShowBulkMenu(false);
      clearSelection();
      runSearch(0);
    } catch (err) {
      const msg = getErrorMessage(err, 'Bulk remove tag failed');
      setError(msg);
      addToast('error', msg);
    } finally {
      setBulkActionLoading(false);
    }
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    const { ownedIds, skipped } = getOwnedSelection();
    if (ownedIds.length === 0) {
      addToast('error', 'Bulk actions only apply to objects you own.');
      return;
    }
    setBulkActionLoading(true);
    setError('');
    try {
      const { error: err } = await supabase
        .from('knowledge_objects')
        .update({ is_deleted: true })
        .in('id', ownedIds);
      if (err) throw err;
      const msg = skipped > 0
        ? `${ownedIds.length} object(s) deleted (${skipped} shared object(s) skipped)`
        : `${ownedIds.length} object(s) deleted`;
      addToast('success', msg);
      setBulkModal(null);
      setShowBulkMenu(false);
      clearSelection();
      runSearch(0);
    } catch (err) {
      const msg = getErrorMessage(err, 'Bulk delete failed');
      setError(msg);
      addToast('error', msg);
    } finally {
      setBulkActionLoading(false);
    }
  }

  async function bulkChangeType() {
    if (selectedIds.size === 0 || !bulkType) return;
    const { ownedIds, skipped } = getOwnedSelection();
    if (ownedIds.length === 0) {
      addToast('error', 'Bulk actions only apply to objects you own.');
      return;
    }
    setBulkActionLoading(true);
    setError('');
    try {
      const { error: err } = await supabase
        .from('knowledge_objects')
        .update({ type: bulkType })
        .in('id', ownedIds);
      if (err) throw err;
      const msg = skipped > 0
        ? `Type set to "${bulkType}" for ${ownedIds.length} object(s) (${skipped} shared skipped)`
        : `Type set to "${bulkType}" for ${ownedIds.length} object(s)`;
      addToast('success', msg);
      setBulkModal(null);
      setShowBulkMenu(false);
      clearSelection();
      runSearch(0);
    } catch (err) {
      const msg = getErrorMessage(err, 'Bulk change type failed');
      setError(msg);
      addToast('error', msg);
    } finally {
      setBulkActionLoading(false);
    }
  }

  async function bulkSetStatus() {
    if (selectedIds.size === 0 || !bulkStatus) return;
    const { ownedIds, skipped } = getOwnedSelection();
    if (ownedIds.length === 0) {
      addToast('error', 'Bulk actions only apply to objects you own.');
      return;
    }
    setBulkActionLoading(true);
    setError('');
    try {
      const { error: err } = await supabase
        .from('knowledge_objects')
        .update({ status: bulkStatus })
        .in('id', ownedIds);
      if (err) throw err;
      const msg = skipped > 0
        ? `Status set to "${bulkStatus}" for ${ownedIds.length} object(s) (${skipped} shared skipped)`
        : `Status set to "${bulkStatus}" for ${ownedIds.length} object(s)`;
      addToast('success', msg);
      setBulkModal(null);
      setShowBulkMenu(false);
      clearSelection();
      runSearch(0);
    } catch (err) {
      const msg = getErrorMessage(err, 'Bulk set status failed');
      setError(msg);
      addToast('error', msg);
    } finally {
      setBulkActionLoading(false);
    }
  }

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

  // Active filter summary for display
  const filterSummaryParts = [];
  if (typeFilter) filterSummaryParts.push(`Type: ${formatObjectTypeLabel(typeFilter)}`);
  if (statusFilter) filterSummaryParts.push(`Status: ${statusFilter}`);
  if (domainFilter) {
    const d = domains.find((x) => x.id === domainFilter);
    if (d) filterSummaryParts.push(`Domain: ${d.name}`);
  }
  if (tagFilter) {
    const t = tags.find((x) => x.id === tagFilter);
    if (t) filterSummaryParts.push(`Tag: ${t.name}`);
  }
  if (dateFrom || dateTo) filterSummaryParts.push('Updated: custom range');
  if (dueFrom || dueTo) filterSummaryParts.push('Due: custom range');
  const filterSummaryText = filterSummaryParts.join(' · ');

  return (
    <div className="dashboard">
      <div className="dashboard-main" aria-busy={loading} aria-live="polite" aria-label="Dashboard">
        <a href="#dashboard-object-list" className="dashboard-skip-link">Skip to object list</a>
        <div className="dashboard-scroll-progress" role="presentation" aria-hidden="true">
          <div className="dashboard-scroll-progress-bar" style={{ width: `${scrollProgress}%` }} />
        </div>
        <div className="dashboard-layout">
          <div className="dashboard-main-col">
        {/* Hero / welcome strip — 5-second test: status + next action */}
        <section className="dashboard-hero" aria-label="Welcome">
          <p className="dashboard-hero-greeting">
            {getGreeting()}{user?.displayName ? `, ${user.displayName}` : ''}
          </p>
          <p className="dashboard-hero-context">
            {heroStats
              ? (() => {
                  const total = heroStats.total ?? 0;
                  const due7 = heroStats.due_next_7_days ?? 0;
                  const updated7 = heroStats.updated_last_7_days ?? 0;
                  if (total === 0) return 'Your knowledge base — create your first object to get started.';
                  const parts = [];
                  if (total > 0) parts.push(`${total} object${total !== 1 ? 's' : ''}`);
                  if (due7 > 0) parts.push(`${due7} due this week`);
                  if (updated7 > 0 && due7 === 0) parts.push(`${updated7} updated in the last 7 days`);
                  return parts.length ? parts.join(' · ') : 'Your knowledge base';
                })()
              : 'Your knowledge base'}
          </p>
          {heroStats && (heroStats.due_next_7_days ?? 0) > 0 && (
            <p className="dashboard-hero-next">
              <Link to="/?due=soon" className="dashboard-hero-next-link">View {heroStats.due_next_7_days} due soon →</Link>
            </p>
          )}
        </section>

        {/* Single dismissible banner: run-prompt or onboarding */}
        {showBanner && (
          <div className="dashboard-banner" role="region" aria-label={bannerKind === 'run-prompt' ? 'Run prompt' : 'Getting started'}>
            {bannerKind === 'run-prompt' ? (
              <>
                <span className="dashboard-banner-text">
                  Run prompt: <strong>{runPromptTemplate.name}</strong>. Open an object to run this prompt.
                </span>
                <button type="button" className="btn btn-ghost btn-small" onClick={dismissRunPromptBanner} aria-label="Dismiss">Dismiss</button>
              </>
            ) : (
              <>
                <h3 className="dashboard-banner-title">Getting started</h3>
                <ol className="dashboard-banner-steps">
                  <li><Link to="/objects/new">Create your first object</Link> — a note or reference.</li>
                  <li><Link to="/settings">Add a domain or tag</Link> in Settings to organize later.</li>
                  <li><Link to="/quick">Try Quick capture</Link> to capture a thought in seconds.</li>
                </ol>
                <button type="button" className="btn btn-secondary btn-small" onClick={dismissOnboarding}>Got it</button>
              </>
            )}
          </div>
        )}

        <DashboardStats userId={user?.id ?? null} onStats={setHeroStats} />

        {/* Continue where you left off */}
        {!loading && objects.length > 0 && (
          <div className="dashboard-focus">
            <Link to={`/objects/${objects[0].id}`} className="dashboard-focus-link">
              Continue where you left off: <strong>{objects[0].title}</strong>
            </Link>
          </div>
        )}

        {/* Suggested next step when few objects and no domains */}
        {heroStats && (heroStats.total ?? 0) <= 5 && domains.length === 0 && (heroStats.total ?? 0) > 0 && (
          <p className="dashboard-suggested-next">
            <Link to="/settings">Add domains in Settings</Link> to organize by topic.
          </p>
        )}

        {/* Mobile-only: Due soon + Recent (sidebar is hidden below 1024px) */}
        <div className="dashboard-mobile-quick-links" aria-label="Quick links">
          {heroStats && (heroStats.due_next_7_days ?? 0) > 0 && (
            <div className="dashboard-mobile-quick-links-card">
              <Link to="/?due=soon" className="dashboard-mobile-quick-links-link">Due soon ({heroStats.due_next_7_days}) →</Link>
            </div>
          )}
          {!loading && objects.length > 0 && (
            <div className="dashboard-mobile-quick-links-card">
              <span className="dashboard-mobile-quick-links-label">Recent</span>
              <ul className="dashboard-mobile-quick-links-list">
                {objects.slice(0, 3).map((o) => (
                  <li key={o.id}><Link to={`/objects/${o.id}`} className="dashboard-mobile-quick-links-link">{o.title}</Link></li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <section className="dashboard-actions">
          <h2 className="dashboard-actions-heading">
            Knowledge objects
            {!loading && (
              <span className="dashboard-result-count" aria-live="polite">
                {objects.length === 0
                  ? ' — No results'
                  : totalPages > 1
                    ? ` — Page ${page} of ${totalPages}${page < totalPages ? '+' : ''}`
                    : ` — ${objects.length} object${objects.length !== 1 ? 's' : ''}`}
              </span>
            )}
          </h2>
          <div className="dashboard-actions-right">
            {selectedIds.size > 0 && (
              <span className="dashboard-selection-actions">
                <span className="muted">{selectedIds.size} selected</span>
                <div className="dashboard-bulk-dropdown" ref={bulkMenuRef}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowBulkMenu((v) => !v)}
                    aria-expanded={showBulkMenu}
                    aria-haspopup="true"
                  >
                    Bulk actions
                  </button>
                  {showBulkMenu && (
                    <div className="dashboard-bulk-menu" role="menu">
                      <button type="button" className="dashboard-bulk-menu-item" role="menuitem" onClick={() => { setBulkModal('add_domain'); setBulkDomainId(domains[0]?.id ?? ''); setShowBulkMenu(false); }}>Add domain…</button>
                      <button type="button" className="dashboard-bulk-menu-item" role="menuitem" onClick={() => { setBulkModal('add_tag'); setBulkTagId(tags[0]?.id ?? ''); setShowBulkMenu(false); }}>Add tag…</button>
                      <button type="button" className="dashboard-bulk-menu-item" role="menuitem" onClick={() => { setBulkModal('remove_domain'); setBulkDomainId(domains[0]?.id ?? ''); setShowBulkMenu(false); }}>Remove domain…</button>
                      <button type="button" className="dashboard-bulk-menu-item" role="menuitem" onClick={() => { setBulkModal('remove_tag'); setBulkTagId(tags[0]?.id ?? ''); setShowBulkMenu(false); }}>Remove tag…</button>
                      <button type="button" className="dashboard-bulk-menu-item" role="menuitem" onClick={() => { setBulkModal('change_type'); setBulkType('note'); setShowBulkMenu(false); }}>Change type…</button>
                      <button type="button" className="dashboard-bulk-menu-item" role="menuitem" onClick={() => { setBulkModal('set_status'); setBulkStatus('active'); setShowBulkMenu(false); }}>Set status…</button>
                      <button type="button" className="dashboard-bulk-menu-item dashboard-bulk-menu-item-danger" role="menuitem" onClick={() => { setBulkModal('delete'); setShowBulkMenu(false); }}>Delete selected</button>
                    </div>
                  )}
                </div>
                <button type="button" className="btn btn-secondary" onClick={selectAllOnPage}>Select all on page</button>
                <button type="button" className="btn btn-secondary" onClick={clearSelection}>Clear</button>
              </span>
            )}
            <div className="view-toggle" role="group" aria-label="View mode">
              <button type="button" className={`btn btn-secondary btn-icon ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} title="List view">≡</button>
              <button type="button" className={`btn btn-secondary btn-icon ${viewMode === 'card' ? 'active' : ''}`} onClick={() => setViewMode('card')} aria-pressed={viewMode === 'card'} title="Card view">▦</button>
            </div>
            <div className="dashboard-actions-cta">
              <Link to="/objects/new" className="btn btn-primary dashboard-cta-primary">New object</Link>
              <Link to="/quick" className="btn btn-secondary dashboard-cta-secondary">Quick capture</Link>
            </div>
            <div className="density-toggle" role="group" aria-label="List density">
              <button type="button" className={`btn btn-secondary btn-icon ${listDensity === 'compact' ? 'active' : ''}`} onClick={() => setListDensity('compact')} aria-pressed={listDensity === 'compact'} title="Compact rows">Compact</button>
              <button type="button" className={`btn btn-secondary btn-icon ${listDensity === 'comfortable' ? 'active' : ''}`} onClick={() => setListDensity('comfortable')} aria-pressed={listDensity === 'comfortable'} title="Comfortable rows">Comfy</button>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => { setShowExportModal(true); setExportScope(selectedIds.size > 0 ? 'selected' : 'filtered'); }}>
              Export
            </button>
          </div>
        </section>

        <div className="dashboard-search-sticky">
          <form onSubmit={handleSearchSubmit} className="search-bar">
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search objects… (/)"
              className="search-input"
              aria-label="Search"
            />
            <button type="submit" className="btn btn-primary">Search</button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowFilters((s) => !s)}
              aria-expanded={showFilters}
            >
              {showFilters ? 'Hide filters' : 'More filters'}
            </button>
          </form>

          <div className="dashboard-filter-presets" aria-label="Filter presets">
            <button
              type="button"
              className={`quick-filter-pill ${dueFrom && dueTo ? 'active' : ''}`}
              onClick={() => {
                const today = new Date();
                const in7 = new Date(today);
                in7.setDate(in7.getDate() + 7);
                const dueFromVal = today.toISOString().slice(0, 10);
                const dueToVal = in7.toISOString().slice(0, 10);
                setDueFrom(dueFromVal);
                setDueTo(dueToVal);
                setDateFrom('');
                setDateTo('');
                runSearch(0, null, { dueFrom: dueFromVal, dueTo: dueToVal, dateFrom: '', dateTo: '' });
                setShowFilters(true);
              }}
            >
              Due soon
            </button>
            <button
              type="button"
              className={`quick-filter-pill ${dateFrom && dateTo && !dueFrom && !dueTo ? 'active' : ''}`}
              onClick={() => {
                const today = new Date();
                const weekAgo = new Date(today);
                weekAgo.setDate(weekAgo.getDate() - 7);
                const dateFromVal = weekAgo.toISOString().slice(0, 10);
                const dateToVal = today.toISOString().slice(0, 10);
                setDateFrom(dateFromVal);
                setDateTo(dateToVal);
                setDueFrom('');
                setDueTo('');
                runSearch(0, null, { dateFrom: dateFromVal, dateTo: dateToVal, dueFrom: '', dueTo: '' });
                setShowFilters(true);
              }}
            >
              Recent (7d)
            </button>
            {hasActiveFilters && (
              <button type="button" className="quick-filter-pill dashboard-filter-preset-clear" onClick={clearFilters}>
                Clear filters
              </button>
            )}
            {savedFilters.length > 0 && (
              <div className="dashboard-saved-filters" ref={savedFiltersDropdownRef}>
                <button
                  type="button"
                  className="quick-filter-pill"
                  onClick={() => setShowSavedFiltersDropdown((v) => !v)}
                  aria-expanded={showSavedFiltersDropdown}
                  aria-haspopup="true"
                >
                  Saved ({savedFilters.length})
                </button>
                {showSavedFiltersDropdown && (
                  <div className="dashboard-saved-filters-dropdown" role="menu">
                    {savedFilters.map((s) => (
                      <div key={s.id} className="dashboard-saved-filters-item">
                        <button type="button" className="dashboard-saved-filters-apply" role="menuitem" onClick={() => applySavedFilter(s)}>
                          {s.name}
                        </button>
                        <button type="button" className="dashboard-saved-filters-delete" aria-label={`Delete ${s.name}`} onClick={() => deleteSavedFilter(s.id)}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button type="button" className="quick-filter-pill" onClick={() => { setSaveFilterName(''); setShowSaveFilterModal(true); }}>
              Save current
            </button>
          </div>

          {showSaveFilterModal && (
            <div className="dashboard-save-filter-inline">
              <input
                type="text"
                className="dashboard-save-filter-input"
                value={saveFilterName}
                onChange={(e) => setSaveFilterName(e.target.value)}
                placeholder="Name this view"
                aria-label="Name for saved filters"
                onKeyDown={(e) => { if (e.key === 'Enter') saveCurrentFilters(); if (e.key === 'Escape') setShowSaveFilterModal(false); }}
              />
              <button type="button" className="btn btn-primary btn-small" onClick={saveCurrentFilters}>Save</button>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => { setShowSaveFilterModal(false); setSaveFilterName(''); }}>Cancel</button>
            </div>
          )}

          {hasActiveFilters && filterSummaryText && (
            <div className="dashboard-filter-summary">
              <span className="dashboard-filter-summary-text">{filterSummaryText}</span>
              <button type="button" className="btn btn-ghost btn-small" onClick={clearFilters}>
                Clear all
              </button>
            </div>
          )}

          {domains.length > 0 && (
            <nav className="dashboard-quick-filters" aria-label="Filter by domain">
              <button
                type="button"
                className={`quick-filter-pill ${!domainFilter ? 'active' : ''}`}
                onClick={() => { setDomainFilter(''); runSearch(0, null, { domainFilter: '' }); }}
              >
                All
              </button>
              {domains.slice(0, 8).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`quick-filter-pill ${domainFilter === d.id ? 'active' : ''}`}
                  onClick={() => { setDomainFilter(d.id); runSearch(0, null, { domainFilter: d.id }); }}
                >
                  {d.name}
                </button>
              ))}
            </nav>
          )}
        </div>

        {showFilters && (
          <DashboardFilterPanel
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            domainFilter={domainFilter}
            setDomainFilter={setDomainFilter}
            tagFilter={tagFilter}
            setTagFilter={setTagFilter}
            dateFrom={dateFrom}
            setDateFrom={setDateFrom}
            dateTo={dateTo}
            setDateTo={setDateTo}
            dueFrom={dueFrom}
            setDueFrom={setDueFrom}
            dueTo={dueTo}
            setDueTo={setDueTo}
            domains={domains}
            tags={tags}
            onApply={() => runSearch(0, null, {
              searchQuery,
              typeFilter,
              statusFilter,
              domainFilter,
              tagFilter,
              dateFrom,
              dateTo,
              dueFrom,
              dueTo,
            })}
            onClear={clearFilters}
          />
        )}

        {!showQuickAdd ? (
          <button
            type="button"
            className="dashboard-quick-add-trigger"
            onClick={() => { setShowQuickAdd(true); setTimeout(() => quickAddInputRef.current?.focus(), 0); }}
            aria-label="Add new object (or press /)"
          >
            <span className="dashboard-quick-add-icon">+</span>
            <span className="dashboard-quick-add-label">Add new object</span>
            <span className="dashboard-quick-add-hint">or press /</span>
          </button>
        ) : (
          <DashboardQuickAddForm
            title={quickAddTitle}
            content={quickAddContent}
            onTitleChange={setQuickAddTitle}
            onContentChange={setQuickAddContent}
            onSubmit={handleQuickAddCreate}
            onCancel={closeQuickAdd}
            saving={quickAddSaving}
            inputRef={quickAddInputRef}
          />
        )}

        {/* FAB on mobile for quick add */}
        {!showQuickAdd && (
          <button
            type="button"
            className="dashboard-fab"
            onClick={() => { setShowQuickAdd(true); setTimeout(() => quickAddInputRef.current?.focus(), 0); }}
            aria-label="Add new object"
          >
            +
          </button>
        )}

        {error && (
          <div className="dashboard-error" role="alert" aria-live="assertive">
            {error}
          </div>
        )}
        {loading ? (
          <SkeletonList lines={8} />
        ) : objects.length === 0 ? (
          <section className="dashboard-empty empty-state" aria-label="No results">
            {hasActiveFilters ? (
              <>
                <p className="empty-state-desc">No objects match. Try different search terms or clear filters.</p>
                <button type="button" className="btn btn-primary" onClick={clearFilters}>Clear filters</button>
              </>
            ) : (
              <>
                <p className="empty-state-title">No objects yet</p>
                <p className="empty-state-desc">Notes, references, and more — all in one place. Create your first to get started.</p>
                <Link to="/objects/new" className="btn btn-primary">Create your first object — takes less than a minute</Link>
              </>
            )}
          </section>
        ) : (
          <>
            {objects.length > 0 && (totalPages > 1 || page > 1) && (
              <DashboardPagination
                page={page}
                totalPages={totalPages}
                pageSize={pageSize}
                itemCount={objects.length}
                loading={loading}
                onPageChange={handlePageChange}
              />
            )}
            <div id="dashboard-object-list" ref={listScrollRef} className={`dashboard-object-list-scroll dashboard-density-${listDensity}${viewMode === 'card' ? ' dashboard-object-list-scroll--card' : ''}`} style={{ maxHeight: 'calc(100vh - 280px)', overflow: 'auto' }} role="list" aria-label="Knowledge objects" tabIndex={-1}>
              <div style={{ height: `${listVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                {listVirtualizer.getVirtualItems().map((virtualRow) => {
                  if (viewMode === 'card') {
                    const rowIndex = virtualRow.index;
                    const startIdx = rowIndex * cardColumns;
                    const rowObjects = objects.slice(startIdx, startIdx + cardColumns);
                    const objectLink = (id) => `/objects/${id}${runPromptTemplate ? `?runPrompt=${runPromptTemplate.id}` : ''}`;
                    return (
                      <div
                        key={`card-row-${rowIndex}`}
                        className="object-card-grid-row-wrap"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <div
                          className="object-card-grid-row"
                          style={{ gridTemplateColumns: `repeat(${cardColumns}, minmax(0, 1fr))` }}
                        >
                          {rowObjects.map((rowObj, colIdx) => (
                            <DashboardObjectCard
                              key={rowObj.id}
                              obj={rowObj}
                              to={objectLink(rowObj.id)}
                              selected={selectedIds.has(rowObj.id)}
                              onToggleSelect={toggleSelect}
                              animationDelay={Math.min(startIdx + colIdx, 12) * 25}
                              compact={listDensity === 'compact'}
                              objectIndex={startIdx + colIdx}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  }

                  const obj = objects[virtualRow.index];
                  return (
                    <div
                      key={obj.id}
                      data-object-index={virtualRow.index}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div className="object-list-item-with-checkbox" role="listitem" style={{ animationDelay: `${Math.min(virtualRow.index, 12) * 25}ms` }}>
                          <label className="object-list-checkbox">
                            <input type="checkbox" checked={selectedIds.has(obj.id)} onChange={() => toggleSelect(obj.id)} onClick={(e) => e.stopPropagation()} aria-label={`Select ${obj.title}`} />
                          </label>
                          <Link to={`/objects/${obj.id}${runPromptTemplate ? `?runPrompt=${runPromptTemplate.id}` : ''}`} className="object-list-link" aria-label={`${obj.title}, ${formatObjectTypeLabel(obj.type)}, version ${obj.current_version}`} data-object-index={virtualRow.index}>
                            <span className="object-list-type" title={formatObjectTypeLabel(obj.type)}>
                              <span className="object-list-type-icon" aria-hidden="true">{OBJECT_TYPE_ICONS[obj.type] ?? '📄'}</span>
                              {formatObjectTypeLabel(obj.type)}
                            </span>
                            <span className="object-list-title">{obj.is_pinned && <span className="object-pin-icon" aria-label="Pinned">📌</span>}{obj.title}</span>
                            {(obj.snippet || obj.summary) && <span className="object-list-summary">{obj.snippet || obj.summary}</span>}
                            <span className="object-list-meta">v{obj.current_version} · {new Date(obj.updated_at).toLocaleDateString()}</span>
                          </Link>
                        </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {objects.length > 0 && (
              <DashboardPagination
                page={page}
                totalPages={totalPages}
                pageSize={pageSize}
                itemCount={objects.length}
                loading={loading}
                onPageChange={handlePageChange}
              />
            )}
          </>
        )}
          </div>
          <aside className="dashboard-sidebar" aria-label="Quick links">
            {heroStats && (heroStats.due_next_7_days ?? 0) > 0 && (
              <div className="dashboard-sidebar-card">
                <h3 className="dashboard-sidebar-title">Due soon</h3>
                <p className="dashboard-sidebar-meta">{heroStats.due_next_7_days} due in next 7 days</p>
                <Link to="/?due=soon" className="dashboard-sidebar-link">View all →</Link>
              </div>
            )}
            <div className="dashboard-sidebar-card">
              <h3 className="dashboard-sidebar-title">Recent</h3>
              {!loading && objects.length > 0 ? (
                <ul className="dashboard-sidebar-list">
                  {objects.slice(0, 5).map((o) => (
                    <li key={o.id}>
                      <Link to={`/objects/${o.id}`} className="dashboard-sidebar-link">{o.title}</Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dashboard-sidebar-muted">No recent items</p>
              )}
            </div>
          </aside>
        </div>

        {/* Command palette (Cmd/Ctrl+K) */}
        {showCommandPalette && (
          <div
            className="dashboard-command-palette-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            onClick={(e) => e.target === e.currentTarget && setShowCommandPalette(false)}
          >
            <div className="dashboard-command-palette" onClick={(e) => e.stopPropagation()}>
              <input
                ref={commandPaletteInputRef}
                type="text"
                className="dashboard-command-palette-input"
                value={commandPaletteQuery}
                onChange={(e) => { setCommandPaletteQuery(e.target.value); setCommandPaletteSelected(0); }}
                placeholder="Search or run action…"
                aria-label="Command palette search"
                autoComplete="off"
              />
              <ul className="dashboard-command-palette-list" role="listbox">
                {(() => {
                  const q = commandPaletteQuery.trim().toLowerCase();
                  const actions = [
                    { id: 'new', label: 'New object', run: () => { setShowCommandPalette(false); navigate('/objects/new'); } },
                    { id: 'quick', label: 'Quick capture', run: () => { setShowCommandPalette(false); navigate('/quick'); } },
                    { id: 'due', label: 'Due soon', run: () => { setShowCommandPalette(false); navigate('/?due=soon'); } },
                    { id: 'settings', label: 'Settings', run: () => { setShowCommandPalette(false); navigate('/settings'); } },
                    ...objects.slice(0, 5).map((o) => ({ id: o.id, label: o.title, run: () => { setShowCommandPalette(false); navigate(`/objects/${o.id}`); } })),
                  ];
                  const filtered = q ? actions.filter((a) => a.label.toLowerCase().includes(q)) : actions;
                  commandPaletteFilteredLengthRef.current = filtered.length;
                  commandPaletteActionsRef.current = filtered;
                  const selected = Math.min(commandPaletteSelected, Math.max(0, filtered.length - 1));
                  return filtered.map((a, i) => (
                    <li key={a.id} role="option" aria-selected={i === selected}>
                      <button
                        type="button"
                        className={`dashboard-command-palette-item ${i === selected ? 'selected' : ''}`}
                        onMouseEnter={() => setCommandPaletteSelected(i)}
                        onClick={() => a.run()}
                      >
                        {a.label}
                      </button>
                    </li>
                  ));
                })()}
              </ul>
              <p className="dashboard-command-palette-hint">↑↓ navigate · Enter run · Esc close</p>
            </div>
          </div>
        )}

        {showExportModal && (
          <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="export-modal-title">
            <div className="dashboard-modal">
              <h2 id="export-modal-title">
                {exportScope === 'filtered' ? 'Export filtered results' : `Export ${selectedIds.size} selected`}
              </h2>
              <p className="muted">Download as a ZIP with one file per object.</p>
              <label className="dashboard-export-scope">
                <span>Scope</span>
                <select value={exportScope} onChange={(e) => setExportScope(e.target.value)} aria-label="Export scope">
                  <option value="selected">Selected ({selectedIds.size})</option>
                  <option value="filtered">All matching current filters</option>
                </select>
              </label>
              <label>
                Format
                <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}>
                  <option value="txt">TXT</option>
                  <option value="md">Markdown</option>
                </select>
              </label>
              <label>
                Template
                <select value={exportTemplate} onChange={(e) => setExportTemplate(e.target.value)}>
                  <option value="raw">Raw (content only)</option>
                  <option value="brief">Brief (summary + key points)</option>
                  <option value="full">Full</option>
                  <option value="stakeholder">Stakeholder</option>
                </select>
              </label>
              <div className="dashboard-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowExportModal(false)} disabled={exporting}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={handleExportSelected} disabled={exporting}>
                  {exporting ? 'Exporting…' : 'Export ZIP'}
                </button>
              </div>
            </div>
          </div>
        )}

        {bulkModal === 'add_domain' && (
          <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bulk-add-domain-title">
            <div className="dashboard-modal">
              <h2 id="bulk-add-domain-title">Add domain to {selectedIds.size} object(s)</h2>
              <label>
                Domain
                <select value={bulkDomainId} onChange={(e) => setBulkDomainId(e.target.value)}>
                  <option value="">Select domain</option>
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </label>
              {domains.length === 0 && <p className="muted">Create domains in Settings first.</p>}
              <div className="dashboard-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setBulkModal(null); setBulkDomainId(''); }} disabled={bulkActionLoading}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={bulkAddDomain} disabled={bulkActionLoading || !bulkDomainId || domains.length === 0}>
                  {bulkActionLoading ? 'Adding…' : 'Add domain'}
                </button>
              </div>
            </div>
          </div>
        )}

        {bulkModal === 'add_tag' && (
          <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bulk-add-tag-title">
            <div className="dashboard-modal">
              <h2 id="bulk-add-tag-title">Add tag to {selectedIds.size} object(s)</h2>
              <label>
                Tag
                <select value={bulkTagId} onChange={(e) => setBulkTagId(e.target.value)}>
                  <option value="">Select tag</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
              {tags.length === 0 && <p className="muted">Create tags in Settings first.</p>}
              <div className="dashboard-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setBulkModal(null); setBulkTagId(''); }} disabled={bulkActionLoading}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={bulkAddTag} disabled={bulkActionLoading || !bulkTagId || tags.length === 0}>
                  {bulkActionLoading ? 'Adding…' : 'Add tag'}
                </button>
              </div>
            </div>
          </div>
        )}

        {bulkModal === 'remove_domain' && (
          <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bulk-remove-domain-title">
            <div className="dashboard-modal">
              <h2 id="bulk-remove-domain-title">Remove domain from {selectedIds.size} object(s)</h2>
              <label>
                Domain
                <select value={bulkDomainId} onChange={(e) => setBulkDomainId(e.target.value)}>
                  <option value="">Select domain</option>
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </label>
              <div className="dashboard-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setBulkModal(null); setBulkDomainId(''); }} disabled={bulkActionLoading}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={bulkRemoveDomain} disabled={bulkActionLoading || !bulkDomainId}>
                  {bulkActionLoading ? 'Removing…' : 'Remove domain'}
                </button>
              </div>
            </div>
          </div>
        )}

        {bulkModal === 'remove_tag' && (
          <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bulk-remove-tag-title">
            <div className="dashboard-modal">
              <h2 id="bulk-remove-tag-title">Remove tag from {selectedIds.size} object(s)</h2>
              <label>
                Tag
                <select value={bulkTagId} onChange={(e) => setBulkTagId(e.target.value)}>
                  <option value="">Select tag</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
              <div className="dashboard-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setBulkModal(null); setBulkTagId(''); }} disabled={bulkActionLoading}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={bulkRemoveTag} disabled={bulkActionLoading || !bulkTagId}>
                  {bulkActionLoading ? 'Removing…' : 'Remove tag'}
                </button>
              </div>
            </div>
          </div>
        )}

        {bulkModal === 'delete' && (
          <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bulk-delete-title">
            <div className="dashboard-modal">
              <h2 id="bulk-delete-title">Delete {selectedIds.size} object(s)?</h2>
              <p className="muted">Objects will be moved to trash (soft delete). This action cannot be undone from this screen.</p>
              <div className="dashboard-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setBulkModal(null)} disabled={bulkActionLoading}>Cancel</button>
                <button type="button" className="btn btn-danger" onClick={bulkDelete} disabled={bulkActionLoading}>
                  {bulkActionLoading ? 'Deleting…' : 'Delete selected'}
                </button>
              </div>
            </div>
          </div>
        )}

        {bulkModal === 'change_type' && (
          <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bulk-change-type-title">
            <div className="dashboard-modal">
              <h2 id="bulk-change-type-title">Change type for {selectedIds.size} object(s)</h2>
              <label className="dashboard-modal-label">
                Type
                <select value={bulkType} onChange={(e) => setBulkType(e.target.value)}>
                  {OBJECT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
              <div className="dashboard-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setBulkModal(null); setBulkType('note'); }} disabled={bulkActionLoading}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={bulkChangeType} disabled={bulkActionLoading}>
                  {bulkActionLoading ? 'Updating…' : 'Change type'}
                </button>
              </div>
            </div>
          </div>
        )}

        {bulkModal === 'set_status' && (
          <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bulk-set-status-title">
            <div className="dashboard-modal">
              <h2 id="bulk-set-status-title">Set status for {selectedIds.size} object(s)</h2>
              <label className="dashboard-modal-label">
                Status
                <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
                  {OBJECT_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <div className="dashboard-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setBulkModal(null); setBulkStatus('active'); }} disabled={bulkActionLoading}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={bulkSetStatus} disabled={bulkActionLoading}>
                  {bulkActionLoading ? 'Updating…' : 'Set status'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
