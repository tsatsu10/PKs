import { useState, useEffect, useRef } from 'react';

/**
 * Dashboard keyboard shortcuts, command palette, and scroll progress.
 */
export function useDashboardKeyboard({
  navigate,
  location,
  showQuickAdd,
  setShowQuickAdd,
  closeQuickAdd,
  selectedIdsSize,
  clearSelection,
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
}) {
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
  const [commandPaletteSelected, setCommandPaletteSelected] = useState(0);
  const commandPaletteInputRef = useRef(null);
  const commandPaletteFilteredLengthRef = useRef(0);
  const commandPaletteActionsRef = useRef([]);
  const [scrollProgress, setScrollProgress] = useState(0);
  const previousFocusRef = useRef(/** @type {HTMLElement | null} */ (null));

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
      let scrollRow;
      if (viewMode === 'card') {
        scrollRow = Math.floor(nextIndex / Math.max(cardColumns, 1));
      } else if (viewMode === 'stream') {
        scrollRow = streamItems.findIndex((it) => it.kind === 'row' && it.navIndex === nextIndex);
        if (scrollRow < 0) return;
      } else {
        scrollRow = nextIndex;
      }
      listVirtualizer.scrollToIndex(scrollRow, { align: 'start', behavior: 'auto' });
      setTimeout(() => {
        const rowEl = listEl.querySelector(`[data-object-index="${nextIndex}"]`);
        const link = rowEl?.querySelector?.('.object-card, .timeline-row, .table-view-row');
        const toFocus = link instanceof HTMLElement ? link : rowEl;
        if (toFocus instanceof HTMLElement) toFocus.focus();
      }, 50);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [objects.length, listVirtualizer, viewMode, cardColumns, streamItems, listScrollRef]);

  useEffect(() => {
    function onKeyDown(e) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.metaKey || e.ctrlKey) && e.key === '[' && totalPages > 1 && page > 1) {
        e.preventDefault();
        handlePageChange(page - 1);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ']' && totalPages > 1 && page < totalPages) {
        e.preventDefault();
        handlePageChange(page + 1);
        return;
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === '1') { setViewMode('stream'); e.preventDefault(); return; }
        if (e.key === '2') { setViewMode('card'); e.preventDefault(); return; }
        if (e.key === '3') { setViewMode('table'); e.preventDefault(); return; }
      }

      if (e.altKey) {
        const trail = [resumeObject, pendingObject, sparkObject];
        const idx = e.key === '1' ? 0 : e.key === '2' ? 1 : e.key === '3' ? 2 : -1;
        if (idx >= 0 && trail[idx]) {
          e.preventDefault();
          navigate(`/objects/${trail[idx].id}${runPromptSuffix}`);
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [
    page,
    totalPages,
    handlePageChange,
    resumeObject,
    pendingObject,
    sparkObject,
    navigate,
    runPromptSuffix,
    setViewMode,
  ]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        if (showQuickAdd) {
          e.preventDefault();
          closeQuickAdd();
          return;
        }
        if (selectedIdsSize > 0 && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) {
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
  }, [location.pathname, showQuickAdd, setShowQuickAdd, closeQuickAdd, selectedIdsSize, clearSelection, quickAddInputRef, searchInputRef]);

  return {
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
    previousFocusRef,
  };
}
