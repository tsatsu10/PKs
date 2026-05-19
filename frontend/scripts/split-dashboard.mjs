/**
 * One-off: split pages/Dashboard.jsx into hook + view + thin page.
 * Run: node frontend/scripts/split-dashboard.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardPath = path.join(__dirname, '../src/pages/Dashboard.jsx');
const src = fs.readFileSync(dashboardPath, 'utf8');

const hookStart = src.indexOf('export default function Dashboard() {');
const hookBodyStart = src.indexOf('{', hookStart) + 1;
const returnIdx = src.lastIndexOf('\n  return (');
const hookBody = src.slice(hookBodyStart, returnIdx).trimEnd();
const jsxBlock = src.slice(returnIdx, src.length - 2); // drop closing `}\n`

const utilsBlock = `/**
 * Dashboard page constants and helpers.
 */
export const CARD_COLS_BREAKPOINT_2 = 720;
export const CARD_COLS_BREAKPOINT_3 = 1100;
export const DENSITY_KEY = 'pks-dashboard-density';
export const SAVED_FILTERS_KEY = 'pks-saved-filters';
export const SEARCH_DEBOUNCE_MS = 300;

export function getCardColumns(width) {
  if (width >= CARD_COLS_BREAKPOINT_3) return 3;
  if (width >= CARD_COLS_BREAKPOINT_2) return 2;
  return 1;
}

export function loadSavedFilters() {
  try {
    const raw = localStorage.getItem(SAVED_FILTERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function resolveOwnedObjectIds(selectedIds, objectList, ownerId) {
  if (!ownerId || selectedIds.size === 0) return [];
  const owned = new Set(objectList.filter((o) => o.user_id === ownerId).map((o) => o.id));
  return Array.from(selectedIds).filter((id) => owned.has(id));
}
`;

const hookFile = `import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabase';
import { createNotification } from '../../../lib/notifications';
import { logAudit } from '../../../lib/audit';
import { deliverWebhookEvent } from '../../../lib/webhooks';
import { useToast } from '../../../context/ToastContext';
import { getExportIncludeFromTemplate, buildObjectMarkdown } from '../../../lib/export';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, RUN_PROMPT_STORAGE_KEY, OBJECT_TYPES, OBJECT_STATUSES } from '../../../constants';
import { getErrorMessage } from '../../../lib/errors';
import { useDashboardSearch, createEmptyFiltersOverride } from '../../../hooks/useDashboardSearch';
import { useTrailheads } from './useTrailheads';
import { usePulseMetrics } from './usePulseMetrics';
import { usePulseCelebration } from './usePulseCelebration';
import { loadViewMode, saveViewMode } from '../lib/viewMode';
import { buildStreamVirtualItems } from '../lib/streamBuckets';
import { buildFilterChips } from '../lib/filterChips';
import {
  DENSITY_KEY,
  SAVED_FILTERS_KEY,
  SEARCH_DEBOUNCE_MS,
  getCardColumns,
  loadSavedFilters,
  resolveOwnedObjectIds,
} from '../lib/dashboardUtils';

/** All dashboard page state, effects, and handlers. */
export function useDashboardPage() {
${hookBody}

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
    selectedIds,
    showExportModal,
    setShowExportModal,
    exportScope,
    setExportScope,
    exportFormat,
    setExportFormat,
    exportTemplate,
    setExportTemplate,
    exporting,
    showQuickAdd,
    setShowQuickAdd,
    showCommandPalette,
    setShowCommandPalette,
    commandPaletteQuery,
    setCommandPaletteQuery,
    commandPaletteSelected,
    setCommandPaletteSelected,
    commandPaletteInputRef,
    commandPaletteFilteredLengthRef,
    commandPaletteActionsRef,
    scrollProgress,
    savedFilters,
    showSaveFilterModal,
    setShowSaveFilterModal,
    saveFilterName,
    setSaveFilterName,
    showSavedFiltersDropdown,
    setShowSavedFiltersDropdown,
    savedFiltersDropdownRef,
    previousFocusRef,
    quickAddTitle,
    setQuickAddTitle,
    quickAddContent,
    setQuickAddContent,
    quickAddSaving,
    bulkModal,
    setBulkModal,
    bulkDomainId,
    setBulkDomainId,
    bulkTagId,
    setBulkTagId,
    bulkType,
    setBulkType,
    bulkStatus,
    setBulkStatus,
    bulkActionLoading,
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
    selectionMode,
    runPromptSuffix,
    streamItems,
    listVirtualizer,
    filterChips,
    handlePageChange,
    dismissRunPromptBanner,
    closeQuickAdd,
    handleTagFilterFromActivity,
    handleSearchSubmit,
    toggleSelect,
    selectAllOnPage,
    clearSelection,
    handleQuickAddCreate,
    handleExportSelected,
    bulkAddDomain,
    bulkAddTag,
    bulkRemoveDomain,
    bulkRemoveTag,
    bulkDelete,
    bulkChangeType,
    bulkSetStatus,
    dismissOnboarding,
    saveCurrentFilters,
    applySavedFilter,
    deleteSavedFilter,
    showBanner,
    bannerKind,
    showOnboarding,
  };
}
`;

// Inject celebration hook call - remove duplicate usePulseMetrics block issue
// The hook body already has usePulseMetrics - celebration is added after in hookFile

const viewFile = `import { Link } from 'react-router-dom';
import { SkeletonList } from '../../../components/Skeleton';
import DashboardFilterPanel from '../../../components/DashboardFilterPanel';
import DashboardQuickAddForm from '../../../components/DashboardQuickAddForm';
import DashboardHero from './Hero/DashboardHero';
import CommandBar from './Toolbar/CommandBar';
import ActiveFiltersStrip from './Toolbar/ActiveFiltersStrip';
import BulkActionRibbon from './Selection/BulkActionRibbon';
import TimelineRow from './Views/TimelineRow';
import StreamBucketHeader from './Views/StreamBucketHeader';
import TableViewRow from './Views/TableView';
import { LinkedObjectsProvider } from '../context/LinkedObjectsContext';
import ActivityPulse from './Sidebar/ActivityPulse';
import { DashboardEmptyFirstRun, DashboardEmptyNoResults } from './Empty/DashboardEmptyStates';
import DashboardObjectCard from '../../../components/DashboardObjectCard';
import DashboardPagination from '../../../components/DashboardPagination';
import DashboardModals from './DashboardModals';
import DashboardCommandPalette from './DashboardCommandPalette';

/** Dashboard page layout (presentational). */
export default function DashboardView(props) {
  const p = props;
${jsxBlock.replace('  return (', '  return (').replace(/^  /gm, '  ')}
}
`;

// Fix view - jsxBlock still has "return (" at start - need to strip "return (" and wrap properly
let jsxInner = jsxBlock.trim();
if (jsxInner.startsWith('return (')) {
  jsxInner = jsxInner.slice('return ('.length);
  if (jsxInner.endsWith(');')) jsxInner = jsxInner.slice(0, -2);
}

const viewFinal = `import { Link } from 'react-router-dom';
import { SkeletonList } from '../../../components/Skeleton';
import DashboardFilterPanel from '../../../components/DashboardFilterPanel';
import DashboardQuickAddForm from '../../../components/DashboardQuickAddForm';
import DashboardHero from './Hero/DashboardHero';
import CommandBar from './Toolbar/CommandBar';
import ActiveFiltersStrip from './Toolbar/ActiveFiltersStrip';
import BulkActionRibbon from './Selection/BulkActionRibbon';
import TimelineRow from './Views/TimelineRow';
import StreamBucketHeader from './Views/StreamBucketHeader';
import TableViewRow from './Views/TableView';
import { LinkedObjectsProvider } from '../context/LinkedObjectsContext';
import ActivityPulse from './Sidebar/ActivityPulse';
import { DashboardEmptyFirstRun, DashboardEmptyNoResults } from './Empty/DashboardEmptyStates';
import DashboardObjectCard from '../../../components/DashboardObjectCard';
import DashboardPagination from '../../../components/DashboardPagination';
import DashboardModals from './DashboardModals';
import DashboardCommandPalette from './DashboardCommandPalette';

/** Dashboard page layout (presentational). */
export default function DashboardView(p) {
  return (
${jsxInner.split('\n').map((line) => {
  let l = line;
  // Replace bare identifiers with p.*
  const replacements = [
    ['loading', 'p.loading'], ['error', 'p.error'], ['objects', 'p.objects'],
    ['user?.displayName', 'p.user?.displayName'], ['user?.id', 'p.user?.id'],
  ];
  return l;
}).join('\n')}
  );
}
`;

// Simpler approach: view receives single prop \`p\` but keep variable names via destructuring at top
const destructureKeys = `user, navigate, location, loading, error, objects, searchQuery, setSearchQuery,
    typeFilter, setTypeFilter, statusFilter, setStatusFilter, domainFilter, setDomainFilter,
    tagFilter, setTagFilter, dateFrom, setDateFrom, dateTo, setDateTo, dueFrom, setDueFrom,
    dueTo, setDueTo, runSearch, clearFilters, domains, tags, createDomainInline, createTagInline,
    page, totalPages, totalCount, pageSize, hasActiveFilters, showFilters, setShowFilters,
    viewMode, setViewMode, listDensity, setListDensity, selectedIds, showExportModal,
    setShowExportModal, exportScope, setExportScope, exportFormat, setExportFormat,
    exportTemplate, setExportTemplate, exporting, showQuickAdd, setShowQuickAdd,
    showCommandPalette, setShowCommandPalette, commandPaletteQuery, setCommandPaletteQuery,
    commandPaletteSelected, setCommandPaletteSelected, commandPaletteInputRef,
    commandPaletteFilteredLengthRef, commandPaletteActionsRef, scrollProgress, savedFilters,
    showSaveFilterModal, setShowSaveFilterModal, saveFilterName, setSaveFilterName,
    showSavedFiltersDropdown, setShowSavedFiltersDropdown, savedFiltersDropdownRef,
    previousFocusRef, quickAddTitle, setQuickAddTitle, quickAddContent, setQuickAddContent,
    quickAddSaving, bulkModal, setBulkModal, bulkDomainId, setBulkDomainId, bulkTagId,
    setBulkTagId, bulkType, setBulkType, bulkStatus, setBulkStatus, bulkActionLoading,
    searchInputRef, quickAddInputRef, listScrollRef, cardColumns, runPromptTemplate,
    heroStats, showActivityPanel, setShowActivityPanel, pendingObject, sparkObject,
    resumeObject, pulseValues, pulseTargets, pulseLoading, celebrateRing,
    selectionMode, runPromptSuffix, streamItems, listVirtualizer, filterChips, handlePageChange,
    dismissRunPromptBanner, closeQuickAdd, handleTagFilterFromActivity, handleSearchSubmit,
    toggleSelect, selectAllOnPage, clearSelection, handleQuickAddCreate, handleExportSelected,
    bulkAddDomain, bulkAddTag, bulkRemoveDomain, bulkRemoveTag, bulkDelete, bulkChangeType,
    bulkSetStatus, dismissOnboarding, saveCurrentFilters, applySavedFilter, deleteSavedFilter,
    showBanner, bannerKind, showOnboarding`;

const viewWithDestructure = `import { Link } from 'react-router-dom';
import { SkeletonList } from '../../../components/Skeleton';
import DashboardFilterPanel from '../../../components/DashboardFilterPanel';
import DashboardQuickAddForm from '../../../components/DashboardQuickAddForm';
import DashboardHero from './Hero/DashboardHero';
import CommandBar from './Toolbar/CommandBar';
import ActiveFiltersStrip from './Toolbar/ActiveFiltersStrip';
import BulkActionRibbon from './Selection/BulkActionRibbon';
import TimelineRow from './Views/TimelineRow';
import StreamBucketHeader from './Views/StreamBucketHeader';
import TableViewRow from './Views/TableView';
import { LinkedObjectsProvider } from '../context/LinkedObjectsContext';
import ActivityPulse from './Sidebar/ActivityPulse';
import { DashboardEmptyFirstRun, DashboardEmptyNoResults } from './Empty/DashboardEmptyStates';
import DashboardObjectCard from '../../../components/DashboardObjectCard';
import DashboardPagination from '../../../components/DashboardPagination';
import { OBJECT_TYPES, OBJECT_STATUSES } from '../../../constants';

export default function DashboardView(props) {
  const {
    ${destructureKeys}
  } = props;

  return (
${jsxInner.replace(
  '<DashboardHero\n          displayName={user?.displayName}',
  '<DashboardHero\n          displayName={user?.displayName}\n          celebrateRing={celebrateRing}'
)}
  );
}
`;

const pageFile = `import DashboardView from '../features/dashboard/components/DashboardView';
import { useDashboardPage } from '../features/dashboard/hooks/useDashboardPage';
import './Dashboard.css';

/** Dashboard route — thin orchestrator. */
export default function Dashboard() {
  const page = useDashboardPage();
  return <DashboardView {...page} />;
}
`;

// Remove modal and command palette blocks from view - extract to components
// For now keep inline in view; DashboardModals/CommandPalette are stubs if missing

const base = path.join(__dirname, '../src/features/dashboard');
fs.writeFileSync(path.join(base, 'lib/dashboardUtils.js'), utilsBlock);
fs.writeFileSync(path.join(base, 'hooks/useDashboardPage.js'), hookFile);
fs.writeFileSync(path.join(base, 'components/DashboardView.jsx'), viewWithDestructure);
fs.writeFileSync(dashboardPath, pageFile);

console.log('Split complete. Dashboard.jsx ->', pageFile.split('\\n').length, 'lines (page)');
console.log('Hook body lines:', hookBody.split('\\n').length);
console.log('View JSX lines:', jsxInner.split('\\n').length);
