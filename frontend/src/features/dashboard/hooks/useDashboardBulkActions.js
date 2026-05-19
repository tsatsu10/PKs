import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { createNotification } from '../../../lib/notifications';
import { logAudit } from '../../../lib/audit';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../../../constants';
import { getExportIncludeFromTemplate, buildObjectMarkdown } from '../../../lib/export';
import { getErrorMessage } from '../../../lib/errors';
import { resolveOwnedObjectIds } from '../lib/dashboardUtils';

/**
 * Dashboard selection, export, and bulk-action state/handlers.
 */
export function useDashboardBulkActions({
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
}) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportScope, setExportScope] = useState('selected');
  const [exportFormat, setExportFormat] = useState('md');
  const [exportTemplate, setExportTemplate] = useState('full');
  const [exporting, setExporting] = useState(false);
  const [bulkModal, setBulkModal] = useState(null);
  const [bulkDomainId, setBulkDomainId] = useState('');
  const [bulkTagId, setBulkTagId] = useState('');
  const [bulkType, setBulkType] = useState('note');
  const [bulkStatus, setBulkStatus] = useState('active');
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const modalPreviousFocusRef = useRef(/** @type {HTMLElement | null} */ (null));

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllOnPage = useCallback(() => {
    setSelectedIds(new Set(objects.filter((o) => o.user_id === user?.id).map((o) => o.id)));
  }, [objects, user?.id]);

  const getOwnedSelection = useCallback(() => {
    const ownedIds = resolveOwnedObjectIds(selectedIds, objects, user?.id);
    const skipped = selectedIds.size - ownedIds.length;
    return { ownedIds, skipped };
  }, [selectedIds, objects, user?.id]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const fetchFilteredIds = useCallback(async () => {
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
  }, [searchQuery, typeFilter, domainFilter, tagFilter, dateFrom, dateTo, statusFilter, dueFrom, dueTo]);

  const handleExportSelected = useCallback(async () => {
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
      await supabase.from('export_job_items').insert(
        ids.map((knowledge_object_id, i) => ({ export_job_id: jobId, knowledge_object_id, sort_order: i }))
      );

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
          zip.file(`${slug}.${ext}`, text);
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
  }, [
    addToast, setError, user?.id, exportScope, selectedIds, exportTemplate, exportFormat,
    fetchFilteredIds, clearSelection,
  ]);

  const anyModalOpen = showExportModal || bulkModal != null;

  useEffect(() => {
    if (anyModalOpen) {
      modalPreviousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setTimeout(() => {
        const first = document.querySelector(
          '.dashboard-modal-overlay .dashboard-modal select, .dashboard-modal-overlay .dashboard-modal button:not([disabled])'
        );
        if (first instanceof HTMLElement) first.focus();
      }, 0);
    } else {
      const prev = modalPreviousFocusRef.current;
      modalPreviousFocusRef.current = null;
      if (prev) setTimeout(() => prev.focus(), 0);
    }
  }, [anyModalOpen]);

  useEffect(() => {
    if (!anyModalOpen) return;
    function onKeyDown(e) {
      if (e.key !== 'Tab') return;
      const overlay = document.querySelector('.dashboard-modal-overlay');
      if (!overlay || !overlay.contains(document.activeElement)) return;
      const focusable = overlay.querySelectorAll(
        'a[href], button:not([disabled]), select, input, textarea, [tabindex]:not([tabindex="-1"])'
      );
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
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [anyModalOpen]);

  const runBulk = useCallback(async (fn) => {
    setBulkActionLoading(true);
    setError('');
    try {
      await fn();
    } finally {
      setBulkActionLoading(false);
    }
  }, [setError]);

  const bulkAddDomain = useCallback(async () => {
    const domainId = bulkDomainId;
    if (!domainId || selectedIds.size === 0) return;
    const { ownedIds, skipped } = getOwnedSelection();
    if (ownedIds.length === 0) {
      addToast('error', 'Bulk actions only apply to objects you own.');
      return;
    }
    await runBulk(async () => {
      const rows = ownedIds.map((knowledge_object_id) => ({ knowledge_object_id, domain_id: domainId }));
      const { error: err } = await supabase.from('knowledge_object_domains').upsert(rows, {
        onConflict: 'knowledge_object_id,domain_id',
        ignoreDuplicates: true,
      });
      if (err) throw err;
      const msg = skipped > 0
        ? `Domain added to ${ownedIds.length} object(s) (${skipped} shared object(s) skipped)`
        : `Domain added to ${ownedIds.length} object(s)`;
      addToast('success', msg);
      setBulkModal(null);
      setBulkDomainId('');
      clearSelection();
      runSearch(0);
    }).catch((err) => {
      const msg = getErrorMessage(err, 'Bulk add domain failed');
      setError(msg);
      addToast('error', msg);
    });
  }, [bulkDomainId, selectedIds.size, getOwnedSelection, addToast, runBulk, clearSelection, runSearch, setError]);

  const bulkAddTag = useCallback(async () => {
    const tagId = bulkTagId;
    if (!tagId || selectedIds.size === 0) return;
    const { ownedIds, skipped } = getOwnedSelection();
    if (ownedIds.length === 0) {
      addToast('error', 'Bulk actions only apply to objects you own.');
      return;
    }
    await runBulk(async () => {
      const rows = ownedIds.map((knowledge_object_id) => ({ knowledge_object_id, tag_id: tagId }));
      const { error: err } = await supabase.from('knowledge_object_tags').upsert(rows, {
        onConflict: 'knowledge_object_id,tag_id',
        ignoreDuplicates: true,
      });
      if (err) throw err;
      const msg = skipped > 0
        ? `Tag added to ${ownedIds.length} object(s) (${skipped} shared object(s) skipped)`
        : `Tag added to ${ownedIds.length} object(s)`;
      addToast('success', msg);
      setBulkModal(null);
      setBulkTagId('');
      clearSelection();
      runSearch(0);
    }).catch((err) => {
      const msg = getErrorMessage(err, 'Bulk add tag failed');
      setError(msg);
      addToast('error', msg);
    });
  }, [bulkTagId, selectedIds.size, getOwnedSelection, addToast, runBulk, clearSelection, runSearch, setError]);

  const bulkRemoveDomain = useCallback(async () => {
    const domainId = bulkDomainId;
    if (!domainId || selectedIds.size === 0) return;
    const { ownedIds, skipped } = getOwnedSelection();
    if (ownedIds.length === 0) {
      addToast('error', 'Bulk actions only apply to objects you own.');
      return;
    }
    await runBulk(async () => {
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
      clearSelection();
      runSearch(0);
    }).catch((err) => {
      const msg = getErrorMessage(err, 'Bulk remove domain failed');
      setError(msg);
      addToast('error', msg);
    });
  }, [bulkDomainId, selectedIds.size, getOwnedSelection, addToast, runBulk, clearSelection, runSearch, setError]);

  const bulkRemoveTag = useCallback(async () => {
    const tagId = bulkTagId;
    if (!tagId || selectedIds.size === 0) return;
    const { ownedIds, skipped } = getOwnedSelection();
    if (ownedIds.length === 0) {
      addToast('error', 'Bulk actions only apply to objects you own.');
      return;
    }
    await runBulk(async () => {
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
      clearSelection();
      runSearch(0);
    }).catch((err) => {
      const msg = getErrorMessage(err, 'Bulk remove tag failed');
      setError(msg);
      addToast('error', msg);
    });
  }, [bulkTagId, selectedIds.size, getOwnedSelection, addToast, runBulk, clearSelection, runSearch, setError]);

  const bulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const { ownedIds, skipped } = getOwnedSelection();
    if (ownedIds.length === 0) {
      addToast('error', 'Bulk actions only apply to objects you own.');
      return;
    }
    await runBulk(async () => {
      const { error: err } = await supabase.from('knowledge_objects').update({ is_deleted: true }).in('id', ownedIds);
      if (err) throw err;
      const msg = skipped > 0
        ? `${ownedIds.length} object(s) deleted (${skipped} shared object(s) skipped)`
        : `${ownedIds.length} object(s) deleted`;
      addToast('success', msg);
      setBulkModal(null);
      clearSelection();
      runSearch(0);
    }).catch((err) => {
      const msg = getErrorMessage(err, 'Bulk delete failed');
      setError(msg);
      addToast('error', msg);
    });
  }, [selectedIds.size, getOwnedSelection, addToast, runBulk, clearSelection, runSearch, setError]);

  const bulkChangeType = useCallback(async () => {
    if (selectedIds.size === 0 || !bulkType) return;
    const { ownedIds, skipped } = getOwnedSelection();
    if (ownedIds.length === 0) {
      addToast('error', 'Bulk actions only apply to objects you own.');
      return;
    }
    await runBulk(async () => {
      const { error: err } = await supabase.from('knowledge_objects').update({ type: bulkType }).in('id', ownedIds);
      if (err) throw err;
      const msg = skipped > 0
        ? `Type set to "${bulkType}" for ${ownedIds.length} object(s) (${skipped} shared skipped)`
        : `Type set to "${bulkType}" for ${ownedIds.length} object(s)`;
      addToast('success', msg);
      setBulkModal(null);
      clearSelection();
      runSearch(0);
    }).catch((err) => {
      const msg = getErrorMessage(err, 'Bulk change type failed');
      setError(msg);
      addToast('error', msg);
    });
  }, [selectedIds.size, bulkType, getOwnedSelection, addToast, runBulk, clearSelection, runSearch, setError]);

  const bulkSetStatus = useCallback(async () => {
    if (selectedIds.size === 0 || !bulkStatus) return;
    const { ownedIds, skipped } = getOwnedSelection();
    if (ownedIds.length === 0) {
      addToast('error', 'Bulk actions only apply to objects you own.');
      return;
    }
    await runBulk(async () => {
      const { error: err } = await supabase.from('knowledge_objects').update({ status: bulkStatus }).in('id', ownedIds);
      if (err) throw err;
      const msg = skipped > 0
        ? `Status set to "${bulkStatus}" for ${ownedIds.length} object(s) (${skipped} shared skipped)`
        : `Status set to "${bulkStatus}" for ${ownedIds.length} object(s)`;
      addToast('success', msg);
      setBulkModal(null);
      clearSelection();
      runSearch(0);
    }).catch((err) => {
      const msg = getErrorMessage(err, 'Bulk set status failed');
      setError(msg);
      addToast('error', msg);
    });
  }, [selectedIds.size, bulkStatus, getOwnedSelection, addToast, runBulk, clearSelection, runSearch, setError]);

  return {
    selectedIds,
    selectionMode: selectedIds.size > 0,
    showExportModal,
    setShowExportModal,
    exportScope,
    setExportScope,
    exportFormat,
    setExportFormat,
    exportTemplate,
    setExportTemplate,
    exporting,
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
    toggleSelect,
    selectAllOnPage,
    clearSelection,
    handleExportSelected,
    bulkAddDomain,
    bulkAddTag,
    bulkRemoveDomain,
    bulkRemoveTag,
    bulkDelete,
    bulkChangeType,
    bulkSetStatus,
  };
}
