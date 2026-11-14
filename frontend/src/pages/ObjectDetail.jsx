import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { isTypingTarget } from '../lib/keyboard';
import { createNotification } from '../lib/notifications';
import { logAudit } from '../lib/audit';
import { deliverWebhookEvent } from '../lib/webhooks';
import {
  getExportIncludeFromTemplate, EXPORT_FORMAT_LABELS, safeFileBase,
  buildObjectExportText, buildObjectExportHtml, buildObjectExportJson, buildObjectExportDocxBlob,
} from '../lib/export';
import { FILES_BUCKET, getStoragePath } from '../lib/storage';
import { objectToEditForm, buildObjectPatch, draftFromForm, formFromDraft } from '../lib/objectForm';
import { setDraft, clearDraft, DRAFT_KEYS } from '../lib/draftStorage';
import { useToast } from '../context/ToastContext';
import { SkeletonDetail } from '../components/Skeleton';
import Breadcrumbs from '../components/Breadcrumbs';
import BlockNoteEditor from '../components/BlockNoteEditor';
import BlockNoteViewer from '../components/BlockNoteViewer';
import { OBJECT_STATUSES, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, RUN_PROMPT_STORAGE_KEY, DEFAULT_AI_MODEL, formatObjectTypeLabel } from '../constants';
import TypeMark from '../components/TypeMark';
import { getDeepSeekErrorMessage } from '../lib/deepseekKey';
import { resolveRunSelection, modelForProvider, isServerSelection } from '../lib/aiProviders';
import { getErrorMessage } from '../lib/errors';
import { reportError } from '../lib/reportError';
import { useNotifyError } from '../lib/useNotifyError';
import { downloadBlob, printHtml } from '../lib/download';
import { markdownToHtml } from '../lib/markdown';
import { touchObjectView } from '../lib/objectView';
import { useObjectDetail } from '../hooks/useObjectDetail';
import { fetchObjectRow, fetchVersionSnapshot, fetchShares, searchLinkTargets, invalidateObjectVersions, invalidateObject } from '../data/objectDetail';
import { setObjectInLists, invalidateObjectLists } from '../data/objects';
import { useAiProviders } from '../data/settings';
import { usePrefetchObject } from '../data/usePrefetchObject';
import QueryError from '../components/QueryError';
import ObjectDetailSharePanel from '../components/ObjectDetailSharePanel';
import ObjectDetailExportPanel from '../components/ObjectDetailExportPanel';
import ObjectDetailRunPromptPanel from '../components/ObjectDetailRunPromptPanel';
import './ObjectDetail.css';

export default function ObjectDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const runPromptFromUrl = searchParams.get('runPrompt');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();
  const {
    object,
    setObject,
    loading,
    error,
    setError,
    reload,
    draft,
    versions,
    objectDomains,
    setObjectDomains,
    objectTags,
    setObjectTags,
    allDomains,
    allTags,
    outgoingLinks,
    setOutgoingLinks,
    incomingLinks,
    setIncomingLinks,
    otherObjects,
    attachedFiles,
    setAttachedFiles,
    promptTemplates,
    promptRuns,
    setPromptRuns,
    suggestedTags,
    suggestedLinkedObjects,
    myShare,
    panelErrors,
    retryPanel,
  } = useObjectDetail({ id, userId: user?.id ?? undefined });
  const notifyError = useNotifyError();
  const prefetch = usePrefetchObject();

  const [uploading, setUploading] = useState(false);
  const [runTemplateId, setRunTemplateId] = useState('');
  const [runPromptText, setRunPromptText] = useState('');
  const [runAiModel, setRunAiModel] = useState(DEFAULT_AI_MODEL);
  const [runAiProviderId, setRunAiProviderId] = useState(null);
  const providersQ = useAiProviders(user?.id ?? null);
  const aiProviders = useMemo(() => providersQ.data ?? [], [providersQ.data]);
  const [runPromptSource, setRunPromptSource] = useState('bank');
  const [runPromptEditFromBank, setRunPromptEditFromBank] = useState(false);
  const [runOutput, setRunOutput] = useState('');
  const [lastRun, setLastRun] = useState(null);
  const [showRunPanel, setShowRunPanel] = useState(false);
  const [savingRun, setSavingRun] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [runContextOpen, setRunContextOpen] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [exportFormat, setExportFormat] = useState('md');
  const [exportTemplate, setExportTemplate] = useState('full');
  const [exportInclude, setExportInclude] = useState({ content: true, summary: true, key_points: true, tags: true, domains: true, links: true });
  const [pinning, setPinning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', content: '', summary: '', source: '', status: 'active', due_at: '', remind_at: '', cover_url: '' });
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [shares, setShares] = useState([]);
  const [shareEmail, setShareEmail] = useState('');
  const [shareRole, setShareRole] = useState('viewer');
  const [sharing, setSharing] = useState(false);
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const [linkSearchResults, setLinkSearchResults] = useState([]);
  const [linkSearchOpen, setLinkSearchOpen] = useState(false);
  const editInitialContentRef = useRef('');
  // Revision the current edit is based on; used for the optimistic-concurrency check on save.
  const editBaseRevisionRef = useRef(null);
  const linkSearchRef = useRef(null);

  useEffect(() => {
    if (!object?.id || !user?.id || object.user_id !== user.id) return;
    touchObjectView(object.id);
  }, [object?.id, object?.user_id, user?.id]);

  useEffect(() => {
    if (!object || editing) return;
    setEditForm(objectToEditForm(object));
  }, [object, editing]);

  // Owner perf check (hand-off): measure from open to first visible content per object id.
  const visibleMarkedRef = useRef(null);
  useEffect(() => {
    if (!object?.id || visibleMarkedRef.current === object.id) return;
    visibleMarkedRef.current = object.id;
    performance.mark('pks:object-visible');
  }, [object?.id]);

  const draftAppliedRef = useRef(false);
  useEffect(() => {
    if (!object || !id || draftAppliedRef.current) return;
    const d = draft && (draft.title !== undefined || draft.content !== undefined || draft.summary !== undefined) ? draft : null;
    if (!d) return;
    draftAppliedRef.current = true;
    const restored = formFromDraft(d, object);
    editInitialContentRef.current = restored.form.content;
    editBaseRevisionRef.current = restored.baseRevision;
    setEditForm(restored.form);
    setEditing(true);
    addToast('success', 'Draft restored');
  }, [object, id, draft, addToast]);
  useEffect(() => {
    if (!id) draftAppliedRef.current = false;
  }, [id]);

  // Warn before closing or reloading the tab mid-edit (drafts cover in-app navigation).
  useEffect(() => {
    if (!editing) return;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [editing]);

  const editDraftTimerRef = useRef(null);
  useEffect(() => {
    if (!id || !editing) return;
    if (editDraftTimerRef.current) clearTimeout(editDraftTimerRef.current);
    editDraftTimerRef.current = setTimeout(() => {
      setDraft(DRAFT_KEYS.object(id), draftFromForm(editForm, editBaseRevisionRef.current));
    }, 500);
    return () => { if (editDraftTimerRef.current) clearTimeout(editDraftTimerRef.current); };
  }, [id, editing, editForm]);

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'R') {
        if (isTypingTarget(document.activeElement)) return;
        e.preventDefault();
        if (!object || !promptTemplates?.length) return;
        const applicable = promptTemplates.filter(
          (t) => !(t.applies_to_types && t.applies_to_types.length) || (t.applies_to_types || []).includes(object.type)
        );
        if (!applicable.length) return;
        setShowRunPanel(true);
        setRunTemplateId((current) => current || applicable[0].id);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [object, promptTemplates, runTemplateId]);

  useEffect(() => {
    if (!showRunPanel || runPromptSource !== 'bank' || !runTemplateId || runPromptEditFromBank) return;
    const template = promptTemplates.find((t) => t.id === runTemplateId);
    if (template?.prompt_text != null) setRunPromptText(template.prompt_text);
  }, [showRunPanel, runPromptSource, runTemplateId, runPromptEditFromBank, promptTemplates]);

  // Clear provider selection if the selected provider was removed (e.g. in another tab)
  useEffect(() => {
    if (!isServerSelection(runAiProviderId) && aiProviders.length > 0 && !aiProviders.some((p) => p.id === runAiProviderId)) {
      setRunAiProviderId(null);
    }
  }, [runAiProviderId, aiProviders]);

  useEffect(() => {
    if (!runPromptFromUrl || !object || !promptTemplates?.length) return;
    const template = promptTemplates.find((t) => t.id === runPromptFromUrl);
    if (!template) return;
    const applicable = !(template.applies_to_types && template.applies_to_types.length) ||
      (template.applies_to_types || []).includes(object.type);
    if (!applicable) return;
    setRunTemplateId(runPromptFromUrl);
    setShowRunPanel(true);
    try {
      sessionStorage.removeItem(RUN_PROMPT_STORAGE_KEY);
    } catch (_e) { void _e; }
    setSearchParams((prev) => {
      prev = new URLSearchParams(prev);
      prev.delete('runPrompt');
      return prev;
    }, { replace: true });
  }, [runPromptFromUrl, object, promptTemplates, setSearchParams]);

  useEffect(() => {
    if (!linkSearchQuery.trim() || !user?.id || !object?.id) {
      setLinkSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const list = (await searchLinkTargets(linkSearchQuery.trim())).filter((o) => o.id !== object.id);
        setLinkSearchResults(list);
      } catch {
        setLinkSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [linkSearchQuery, user?.id, object?.id]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') setLinkSearchOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    function onClickOutside(e) {
      if (linkSearchRef.current && !linkSearchRef.current.contains(e.target)) setLinkSearchOpen(false);
    }
    if (!linkSearchOpen) return;
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [linkSearchOpen]);

  const handleContentChange = useCallback((val) => {
    setEditForm((f) => ({ ...f, content: val ?? '' }));
  }, []);

  async function handleSave() {
    if (!object) return;
    setSaving(true);
    setError('');
    try {
      const patch = buildObjectPatch(object, editForm, { isOwner });
      if (Object.keys(patch).length === 0) {
        setEditing(false);
        clearDraft(DRAFT_KEYS.object(object.id));
        return;
      }
      // Optimistic concurrency: revision bumps on every edit (views and pins
      // excluded), so any change made elsewhere since this edit began is caught.
      const query = supabase
        .from('knowledge_objects')
        .update(patch)
        .eq('id', object.id)
        .eq('revision', editBaseRevisionRef.current ?? object.revision);
      const OBJECT_ROW_COLS = 'id, user_id, type, title, content, source, summary, key_points, is_deleted, current_version, created_at, updated_at, is_pinned, status, slug, cover_url, due_at, remind_at, revision';
      const { data: updatedRows, error: err } = await query.select(OBJECT_ROW_COLS);
      if (err) throw err;
      if (!updatedRows || updatedRows.length === 0) {
        // Refresh this tab's copy so Cancel then Edit starts from the latest
        // version. Stay in edit mode: the effect that resets editForm skips
        // while editing, and the draft stays until the user cancels.
        try {
          const fresh = await fetchObjectRow(object.id);
          if (fresh) setObject((o) => ({ ...o, ...fresh }));
        } catch (_e) { void _e; }
        const msg = 'This object was changed elsewhere (another tab or device). Your text is still in the editor — copy it, click Cancel, then Edit again and paste it back.';
        setError(msg);
        addToast('error', msg);
        return;
      }
      // Merge the full saved row so a stale tab also picks up other tabs' changes.
      setObject((o) => ({ ...o, ...updatedRows[0] }));
      setEditing(false);
      clearDraft(DRAFT_KEYS.object(object.id));
      addToast('success', 'Changes saved');
      logAudit(user.id, AUDIT_ACTIONS.OBJECT_UPDATE, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, object.id, { title: editForm.title.trim() });
      invalidateObjectVersions(object.id);
      invalidateObjectLists();
    } catch (err) {
      setError(notifyError(err, 'Update failed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleRestoreVersion(ver) {
    if (!object || !user || !ver?.id) return;
    setRestoringVersion(ver.id);
    setError('');
    try {
      // Read the snapshot fresh so a partially-loaded version list can never restore blanks.
      const snap = await fetchVersionSnapshot(ver.id);
      const { data: restoredRows, error: err } = await supabase
        .from('knowledge_objects')
        .update({
          title: snap.title,
          content: snap.content ?? null,
          summary: snap.summary ?? null,
          key_points: snap.key_points ?? [],
        })
        .eq('id', object.id)
        .eq('user_id', user.id)
        .eq('current_version', object.current_version)
        .select('id');
      if (err) throw err;
      if (!restoredRows || restoredRows.length === 0) {
        throw new Error('This object was changed elsewhere. Reload to get the latest version, then restore again.');
      }
      addToast('success', `Restored to v${ver.version}`);
      reload();
      invalidateObjectLists();
    } catch (err) {
      setError(notifyError(err, 'Restore failed'));
    } finally {
      setRestoringVersion(null);
    }
  }

  async function handleDuplicate() {
    if (!object || !user) return;
    setDuplicating(true);
    setError('');
    try {
      const title = `Copy of ${object.title}`.slice(0, 500);
      const { data: newObj, error: insErr } = await supabase
        .from('knowledge_objects')
        .insert({
          user_id: user.id,
          type: object.type,
          title,
          source: object.source || null,
          content: object.content || null,
          summary: object.summary || null,
          key_points: object.key_points ?? [],
          status: object.status || 'active',
          due_at: object.due_at || null,
          remind_at: object.remind_at || null,
          cover_url: object.cover_url || null,
        })
        .select('id')
        .single();
      if (insErr) throw insErr;
      const newId = newObj.id;
      if (objectDomains.length) {
        await supabase.from('knowledge_object_domains').insert(
          objectDomains.map((d) => ({ knowledge_object_id: newId, domain_id: d.id }))
        );
      }
      if (objectTags.length) {
        await supabase.from('knowledge_object_tags').insert(
          objectTags.map((t) => ({ knowledge_object_id: newId, tag_id: t.id }))
        );
      }
      logAudit(user.id, AUDIT_ACTIONS.OBJECT_CREATE, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, newId, { title, duplicated_from: object.id });
      addToast('success', 'Object duplicated');
      await invalidateObjectLists();
      navigate(`/objects/${newId}`);
    } catch (err) {
      setError(notifyError(err, 'Duplicate failed'));
    } finally {
      setDuplicating(false);
    }
  }

  async function handleDelete() {
    if (!object || !window.confirm('Move this object to Trash? You can restore it from Trash later.')) return;
    setDeleting(true);
    setError('');
    try {
      const { error: err } = await supabase
        .from('knowledge_objects')
        .update({ is_deleted: true })
        .eq('id', object.id)
        .eq('user_id', user.id);
      if (err) throw err;
      logAudit(user.id, AUDIT_ACTIONS.OBJECT_DELETE, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, object.id, { title: object.title });
      addToast('success', 'Moved to Trash');
      setObjectInLists(object.id, null);
      await invalidateObjectLists();
      navigate('/', { replace: true });
    } catch (err) {
      setError(notifyError(err, 'Delete failed'));
    } finally {
      setDeleting(false);
    }
  }

  async function handleTogglePin() {
    if (!object || !user) return;
    setPinning(true);
    setError('');
    try {
      const { error: e } = await supabase
        .from('knowledge_objects')
        .update({ is_pinned: !object.is_pinned })
        .eq('id', object.id)
        .eq('user_id', user.id);
      if (e) throw e;
      setObject((o) => ({ ...o, is_pinned: !o.is_pinned }));
      setObjectInLists(object.id, { is_pinned: !object.is_pinned });
    } catch (err) {
      setError(notifyError(err, 'Failed to update pin'));
    } finally {
      setPinning(false);
    }
  }

  async function addDomain(domainId) {
    if (!object) return;
    setError('');
    try {
      const { error: err } = await supabase.from('knowledge_object_domains').insert({ knowledge_object_id: object.id, domain_id: domainId });
      if (err) throw err;
      const d = allDomains.find((x) => x.id === domainId);
      if (d) setObjectDomains((prev) => [...prev, d].sort((a, b) => a.name.localeCompare(b.name)));
      invalidateObjectLists();
    } catch (err) {
      setError(notifyError(err, 'Failed to add domain'));
    }
  }

  async function removeDomain(domainId) {
    if (!object) return;
    setError('');
    try {
      const { error: err } = await supabase.from('knowledge_object_domains').delete().eq('knowledge_object_id', object.id).eq('domain_id', domainId);
      if (err) throw err;
      setObjectDomains((prev) => prev.filter((d) => d.id !== domainId));
      invalidateObjectLists();
    } catch (err) {
      setError(notifyError(err, 'Failed to remove domain'));
    }
  }

  async function addTag(tagId) {
    if (!object) return;
    setError('');
    try {
      const { error: err } = await supabase.from('knowledge_object_tags').insert({ knowledge_object_id: object.id, tag_id: tagId });
      if (err) throw err;
      const t = allTags.find((x) => x.id === tagId);
      if (t) setObjectTags((prev) => [...prev, t].sort((a, b) => a.name.localeCompare(b.name)));
      invalidateObjectLists();
    } catch (err) {
      setError(notifyError(err, 'Failed to add tag'));
    }
  }

  async function removeTag(tagId) {
    if (!object) return;
    setError('');
    try {
      const { error: err } = await supabase.from('knowledge_object_tags').delete().eq('knowledge_object_id', object.id).eq('tag_id', tagId);
      if (err) throw err;
      setObjectTags((prev) => prev.filter((t) => t.id !== tagId));
      invalidateObjectLists();
    } catch (err) {
      setError(notifyError(err, 'Failed to remove tag'));
    }
  }

  async function addLink(toObjectId, relationshipType = 'references') {
    if (!object || !toObjectId) return;
    setError('');
    try {
      const { data, error: err } = await supabase.from('link_edges').insert({
        from_object_id: object.id,
        to_object_id: toObjectId,
        relationship_type: relationshipType,
      }).select('id, to_object_id, relationship_type').single();
      if (err) throw err;
      const target = otherObjects.find((o) => o.id === toObjectId);
      setOutgoingLinks((prev) => [...prev, { id: data.id, to_object_id: data.to_object_id, relationship_type: data.relationship_type, target: target || { id: toObjectId, title: '…', type: '' } }]);
      invalidateObject(toObjectId);
      invalidateObjectLists();
    } catch (err) {
      setError(notifyError(err, 'Failed to add link'));
    }
  }

  async function removeLink(edgeId, isOutgoing) {
    if (!object) return;
    setError('');
    try {
      const { error: err } = await supabase.from('link_edges').delete().eq('id', edgeId);
      if (err) throw err;
      const edge = (isOutgoing ? outgoingLinks : incomingLinks).find((l) => l.id === edgeId);
      const otherId = isOutgoing ? edge?.to_object_id : edge?.from_object_id;
      if (isOutgoing) setOutgoingLinks((prev) => prev.filter((l) => l.id !== edgeId));
      else setIncomingLinks((prev) => prev.filter((l) => l.id !== edgeId));
      if (otherId) invalidateObject(otherId);
      invalidateObjectLists();
    } catch (err) {
      setError(notifyError(err, 'Failed to remove link'));
    }
  }

  async function handleFileAttach(e) {
    const file = e.target.files?.[0];
    if (!file || !object) return;
    e.target.value = '';
    setError('');
    setUploading(true);
    try {
      const { data: fileRow, error: insertErr } = await supabase.from('files').insert({
        user_id: user.id,
        filename: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
      }).select('id').single();
      if (insertErr) throw insertErr;
      const path = getStoragePath(user.id, fileRow.id, file.name);
      const { error: uploadErr } = await supabase.storage.from(FILES_BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      if (uploadErr) {
        await supabase.from('files').delete().eq('id', fileRow.id);
        throw uploadErr;
      }
      await supabase.from('files').update({ storage_key: path }).eq('id', fileRow.id);
      const { error: linkErr } = await supabase.from('knowledge_object_files').insert({ knowledge_object_id: object.id, file_id: fileRow.id });
      if (linkErr) throw linkErr;
      setAttachedFiles((prev) => [...prev, { id: fileRow.id, filename: file.name, mime_type: file.type, size_bytes: file.size }]);
      invalidateObjectLists();
    } catch (err) {
      setError(notifyError(err, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(f) {
    setError('');
    try {
      const path = f.storage_key || getStoragePath(user.id, f.id, f.filename);
      const { data, error: err } = await supabase.storage.from(FILES_BUCKET).createSignedUrl(path, 60);
      if (err) throw err;
      if (data?.signedUrl) window.open(data.signedUrl, '_blank');
    } catch (err) {
      setError(getErrorMessage(err, 'Download failed'));
    }
  }

  async function handleDetachFile(fileId) {
    if (!object) return;
    setError('');
    try {
      const { error: err } = await supabase.from('knowledge_object_files').delete().eq('knowledge_object_id', object.id).eq('file_id', fileId);
      if (err) throw err;
      setAttachedFiles((prev) => prev.filter((x) => x.id !== fileId));
      invalidateObjectLists();
    } catch (err) {
      setError(notifyError(err, 'Failed to remove attachment'));
    }
  }

  const applicableTemplates = promptTemplates.filter(
    (t) => !(t.applies_to_types && t.applies_to_types.length) || (t.applies_to_types || []).includes(object?.type)
  );

  function handleRunPrompt() {
    if (!object) return;
    setError('');
    setShowRunPanel(true);
    setRunOutput('');
    if (runPromptSource === 'bank' && runTemplateId) {
      const template = promptTemplates.find((t) => t.id === runTemplateId);
      if (template?.prompt_text != null) setRunPromptText(template.prompt_text);
      setRunPromptEditFromBank(false);
    }
    if (runPromptSource === 'custom') setRunPromptText('');
  }

  async function handleGenerateWithAI() {
    if (!object) return;
    const promptToUse = runPromptText.trim();
    if (!promptToUse) {
      setError('Enter a prompt or select one from the Prompt Bank.');
      return;
    }
    setError('');
    setGeneratingAI(true);
    try {
      const { provider, userProviderId } = resolveRunSelection(runAiProviderId, aiProviders);
      const { data, error: fnErr } = await supabase.functions.invoke('run-prompt', {
        body: {
          promptText: promptToUse,
          object_id: object.id,
          prompt_template_id: runTemplateId || undefined,
          provider,
          model: modelForProvider(provider, runAiModel || DEFAULT_AI_MODEL, !userProviderId),
          user_provider_id: userProviderId || undefined,
        },
      });
      if (fnErr) {
        let msg = getErrorMessage(fnErr, 'AI request failed');
        const genericMsg = /non-2xx|Edge Function returned|Function failed/i.test(msg);
        try {
          const ctx = fnErr?.context;
          if (ctx) {
            const body = typeof ctx.json === 'function'
              ? await ctx.json()
              : typeof ctx.text === 'function'
                ? JSON.parse(await ctx.text())
                : null;
            if (body && typeof body === 'object') {
              if (body.run) {
                setPromptRuns((prev) => [{ id: body.run.id, prompt_template_id: runTemplateId || null, status: 'failed', output: body.error || null, created_at: body.run.created_at }, ...prev]);
              }
              if (body.code === 'RATE_LIMITED') {
                const sec = typeof body.retryAfter === 'number' ? body.retryAfter : 60;
                msg = `Too many requests. Try again in ${sec} second${sec !== 1 ? 's' : ''}.`;
              } else {
                msg =
                  body.hint ||
                  getDeepSeekErrorMessage(
                    body.code,
                    body.error || body.detail || (genericMsg ? 'AI request failed. Check Settings → AI API keys or Edge Function secrets.' : msg)
                  );
              }
            }
          }
        } catch {
          /* response body parse failed, use existing msg */
        }
        if (genericMsg && msg === getErrorMessage(fnErr, '')) {
          msg = 'AI request failed. Check your API key in Settings → AI API keys, or server secrets for default provider.';
        }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.hint || data.error);
      const outputText = data?.output ?? '';
      setRunOutput(outputText);
      setLastRun(data?.run ?? null);
      if (data?.run) {
        setPromptRuns((prev) => [{ id: data.run.id, prompt_template_id: runTemplateId || null, status: 'completed', output: outputText, created_at: data.run.created_at }, ...prev]);
      }
      if (data?.truncated) addToast('info', 'This object is long, so only its first 50,000 characters were sent to the AI.');
      if (data?.output_truncated) addToast('info', 'The AI hit its length limit, so this answer may be cut off.');
    } catch (err) {
      const msg = getErrorMessage(err, 'AI generation failed.');
      setError(notifyError(err, { message: msg }));
    } finally {
      setGeneratingAI(false);
    }
  }

  async function handleSaveRun() {
    if (!object) return;
    // The server records the run; with no run row back there is nothing saved, so don't claim otherwise.
    // Keep the panel open so the output can still be copied.
    if (!lastRun?.id) {
      setError("This run couldn't be recorded. Copy the output if you need it, then try again.");
      return;
    }
    setError('');
    setSavingRun(true);
    try {
      setShowRunPanel(false);
      setRunOutput('');
      setLastRun(null);
      setRunPromptText('');
      setRunTemplateId('');
      createNotification(user.id, 'prompt_completed', 'Prompt run saved', `Run saved for "${object.title.slice(0, 50)}${object.title.length > 50 ? '…' : ''}"`, { type: 'knowledge_object', id: object.id });
      logAudit(user.id, AUDIT_ACTIONS.PROMPT_RUN, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, object.id, { prompt_template_id: runTemplateId || null });
      deliverWebhookEvent('prompt_run.completed', { objectId: object.id, objectTitle: object.title, promptTemplateId: runTemplateId || null });
    } catch (e) {
      setError(notifyError(e, 'Failed to save run'));
    } finally {
      setSavingRun(false);
    }
  }

  async function handleSaveOutputAsObject() {
    if (!object || !runOutput.trim()) return;
    setError('');
    setSavingRun(true);
    try {
      const template = promptTemplates.find((t) => t.id === runTemplateId);
      const title = template ? `${template.name} — ${object.title}` : `Prompt output — ${object.title}`;
      if (!lastRun?.id) throw new Error('Generate an output first.');
      const { data: newId, error: saveErr } = await supabase.rpc('save_prompt_output_as_object', {
        p_run_id: lastRun.id,
        p_title: title,
        p_content: runOutput.trim(),
      });
      if (saveErr) throw saveErr;
      const newObj = { id: newId };
      setShowRunPanel(false);
      setRunOutput('');
      setLastRun(null);
      setRunTemplateId('');
      setRunPromptText('');
      createNotification(user.id, 'prompt_completed', 'Prompt saved as new object', `Created "${title.slice(0, 60)}${title.length > 60 ? '…' : ''}"`, { type: 'knowledge_object', id: newObj.id });
      logAudit(user.id, AUDIT_ACTIONS.PROMPT_RUN, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, object.id, { prompt_template_id: runTemplateId || null, created_object_id: newObj.id });
      deliverWebhookEvent('prompt_run.completed', { objectId: object.id, createdObjectId: newObj.id, promptTemplateId: runTemplateId || null });
      await invalidateObjectLists();
      navigate(`/objects/${newObj.id}`);
    } catch (e) {
      setError(notifyError(e, 'Failed to save as object'));
    } finally {
      setSavingRun(false);
    }
  }

  function applyExportTemplate(template) {
    setExportInclude(getExportIncludeFromTemplate(template, { includeLinks: true }));
  }

  async function handleExport(jobOverrides) {
    const exportCtx = { object, domains: objectDomains, tags: objectTags, outgoing: outgoingLinks, incoming: incomingLinks };
    const fmt = jobOverrides?.format ?? exportFormat;
    const inc = jobOverrides?.include ?? exportInclude;
    const slug = safeFileBase(object.title, 50);
    const ext = fmt === 'pdf' ? 'pdf' : fmt === 'docx' ? 'docx' : fmt;
    const suggestedFilename = `${slug}.${ext}`;
    try {
      if (fmt === 'txt') {
        const blob = new Blob([buildObjectExportText(exportCtx, false, inc)], { type: 'text/plain;charset=utf-8' });
        downloadBlob(blob, suggestedFilename);
      } else if (fmt === 'md') {
        const blob = new Blob([buildObjectExportText(exportCtx, true, inc)], { type: 'text/markdown;charset=utf-8' });
        downloadBlob(blob, suggestedFilename);
      } else if (fmt === 'html') {
        const blob = new Blob([buildObjectExportHtml(exportCtx, inc, markdownToHtml)], { type: 'text/html;charset=utf-8' });
        downloadBlob(blob, suggestedFilename);
      } else if (fmt === 'json') {
        const blob = new Blob([buildObjectExportJson(exportCtx, inc)], { type: 'application/json;charset=utf-8' });
        downloadBlob(blob, suggestedFilename);
      } else if (fmt === 'docx') {
        const blob = await buildObjectExportDocxBlob(exportCtx, inc);
        if (blob) downloadBlob(blob, suggestedFilename);
      } else {
        if (!printHtml(buildObjectExportHtml(exportCtx, inc, markdownToHtml))) {
          throw new Error('Your browser blocked the print window. Allow pop-ups for this site, then try again.');
        }
      }

      const formatLabel = EXPORT_FORMAT_LABELS[fmt] || fmt;
      if (fmt !== 'pdf') {
        createNotification(user.id, 'export_completed', 'Export completed', `"${object.title.slice(0, 50)}${object.title.length > 50 ? '…' : ''}" as ${formatLabel}`, { type: 'knowledge_object', id: object.id });
        deliverWebhookEvent('export.completed', { objectId: object.id, title: object.title, format: fmt });
      }
      logAudit(user.id, AUDIT_ACTIONS.EXPORT_RUN, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, object.id, { format: fmt, title: object.title });
      addToast('success', fmt === 'pdf' ? 'Print dialog opened: choose "Save as PDF"' : `Export downloaded as ${formatLabel}`);
      setShowExportPanel(false);
    } catch (err) {
      const msg = getErrorMessage(err, 'Export failed');
      setError(msg);
      addToast('error', msg);
    }
  }

  const availableDomains = allDomains.filter((d) => !objectDomains.some((od) => od.id === d.id));
  const availableTags = allTags.filter((t) => !objectTags.some((ot) => ot.id === t.id));
  const availableToLink = otherObjects.filter((o) => !outgoingLinks.some((l) => l.to_object_id === o.id));

  const isOwner = object?.user_id === user?.id;
  const canEdit = isOwner || myShare?.role === 'editor';

  async function loadShares() {
    if (!object?.id || !user?.id) return;
    try {
      setShares(await fetchShares(object.id));
    } catch (e) {
      reportError(e);
      setShares([]);
      setError(getErrorMessage(e, 'Failed to load shares'));
    }
  }

  function isValidEmail(str) {
    const s = typeof str === 'string' ? str.trim() : '';
    if (!s) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  async function handleAddShare(e) {
    e.preventDefault();
    if (!object || !shareEmail.trim()) return;
    if (!isValidEmail(shareEmail.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    setSharing(true);
    setError('');
    try {
      const email = shareEmail.trim();
      const { error: rpcErr } = await supabase.rpc('share_object_by_email', {
        p_object_id: object.id,
        p_email: email,
        p_role: shareRole,
      });
      if (rpcErr) throw rpcErr;
      await loadShares();
      setShareEmail('');
      addToast('success', `Shared with ${email}. If they don't have a verified PKS account yet, they'll get access when they sign up.`);
    } catch (err) {
      const msg = notifyError(err, 'Failed to share');
      setError(msg);
    } finally {
      setSharing(false);
    }
  }

  async function handleRevokeShare(shareId) {
    if (!object) return;
    setError('');
    try {
      const { error: err } = shareId.startsWith('invite:')
        ? await supabase.from('share_invites').delete().eq('id', shareId.slice('invite:'.length)).eq('knowledge_object_id', object.id)
        : await supabase.from('share_permissions').delete().eq('id', shareId).eq('knowledge_object_id', object.id);
      if (err) throw err;
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (err) {
      setError(notifyError(err, 'Failed to revoke'));
    }
  }

  if (loading) return <div className="object-detail loading" ><p className="sr-only" role="status" aria-live="polite">Loading…</p><SkeletonDetail /></div>;
  if (error && !object) return <div className="object-detail" ><p className="detail-error" role="alert">{error}</p><Link to="/">Back to Dashboard</Link></div>;
  if (!object) return null;

  return (
    <div className="object-detail" >
      <header className="object-detail-header">
        <div className="object-detail-header-left">
          <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: object.title || 'Object' }]} />
        </div>
        {canEdit && (
          <div className="detail-header-link-search" ref={linkSearchRef}>
            <input
              type="search"
              value={linkSearchQuery}
              onChange={(e) => { setLinkSearchQuery(e.target.value); setLinkSearchOpen(true); }}
              onFocus={() => setLinkSearchOpen(true)}
              placeholder="Search to link…"
              className="detail-link-search-input"
              aria-label="Search objects to link"
              aria-expanded={linkSearchOpen && linkSearchResults.length > 0}
            />
            {linkSearchOpen && (linkSearchQuery.trim() || linkSearchResults.length > 0) && (
              <div className="detail-link-search-dropdown" role="listbox">
                {linkSearchResults.length === 0 ? (
                  <p className="detail-link-search-empty">{linkSearchQuery.trim() ? 'No objects found' : 'Type to search'}</p>
                ) : (
                  linkSearchResults.map((o) => (
                    <div key={o.id} className="detail-link-search-item">
                      <Link to={`/objects/${o.id}`} className="detail-link-search-title" onClick={() => setLinkSearchOpen(false)} {...prefetch(o.id)}>{o.title}</Link>
                      <span className="detail-link-search-type">{formatObjectTypeLabel(o.type)}</span>
                      {!outgoingLinks.some((l) => l.to_object_id === o.id) ? (
                        <button type="button" className="btn btn-primary btn-small" onClick={() => { addLink(o.id); setLinkSearchOpen(false); setLinkSearchQuery(''); }}>Link</button>
                      ) : (
                        <span className="detail-link-search-linked">Linked</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
        <div className="detail-actions">
          {isOwner && (
            <button type="button" className={`btn btn-secondary ${object.is_pinned ? 'active' : ''}`} onClick={handleTogglePin} disabled={pinning} title={object.is_pinned ? 'Unpin from top' : 'Pin to top'} aria-label={object.is_pinned ? 'Unpin' : 'Pin'}>
              {object.is_pinned ? '📌 Unpin' : 'Pin'}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => setShowExportPanel((v) => !v)}>Export</button>
          {isOwner && (
            <button type="button" className="btn btn-secondary" onClick={handleDuplicate} disabled={duplicating} title="Duplicate (copy domains and tags)">{duplicating ? 'Duplicating…' : 'Duplicate'}</button>
          )}
          {isOwner && (
            <button type="button" className="btn btn-secondary" onClick={() => { setShowSharePanel((v) => !v); if (!showSharePanel) loadShares(); }}>Share</button>
          )}
          {!editing ? (
            <>
              {canEdit && <button type="button" className="btn btn-secondary" onClick={() => { editInitialContentRef.current = editForm.content ?? ''; editBaseRevisionRef.current = object.revision; setEditing(true); }}>Edit</button>}
              {isOwner && <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</button>}
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => { setEditing(false); setEditForm(objectToEditForm(object)); if (object?.id) clearDraft(DRAFT_KEYS.object(object.id)); }}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </>
          )}
        </div>
      </header>
      {error && <div className="form-error" role="alert">{error}</div>}

      {showSharePanel && isOwner && (
        <ObjectDetailSharePanel
          shares={shares}
          shareEmail={shareEmail}
          setShareEmail={setShareEmail}
          shareRole={shareRole}
          setShareRole={setShareRole}
          sharing={sharing}
          onAddShare={handleAddShare}
          onRevokeShare={handleRevokeShare}
          onClose={() => setShowSharePanel(false)}
        />
      )}

      {showExportPanel && (
        <ObjectDetailExportPanel
          exportFormat={exportFormat}
          setExportFormat={setExportFormat}
          exportTemplate={exportTemplate}
          setExportTemplate={setExportTemplate}
          exportInclude={exportInclude}
          setExportInclude={setExportInclude}
          applyExportTemplate={applyExportTemplate}
          onExport={() => handleExport()}
          onClose={() => setShowExportPanel(false)}
        />
      )}

      <div className="detail-layout">
        <div className="detail-main" aria-label="Object content">
          <div className="detail-hero">
            <div className="detail-meta detail-meta-inline">
              <span className="detail-type" title={formatObjectTypeLabel(object.type)}>
                <TypeMark type={object.type} size="sm" className="detail-type-mark" />
                {formatObjectTypeLabel(object.type)}
              </span>
              {(object.status || 'active') !== 'active' && (
                <span className="detail-status" title="Status">{object.status}</span>
              )}
              {object.due_at && (
                <span className="detail-due" title="Due date">Due {new Date(object.due_at).toLocaleString()}</span>
              )}
              {object.remind_at && (
                <span className="detail-remind" title="Remind at">Remind {new Date(object.remind_at).toLocaleString()}</span>
              )}
              <span className="detail-updated">Updated {new Date(object.updated_at).toLocaleString()}</span>
              <span className="detail-version">v{object.current_version}</span>
            </div>
            {editing ? (
        <div className="detail-edit" key={`edit-${object?.id}`}>
          <label>Title <input type="text" value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} required /></label>
          <label>Status <select value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))} aria-label="Status" disabled={!isOwner}>{OBJECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label>Due date <input type="datetime-local" value={editForm.due_at} onChange={(e) => setEditForm((f) => ({ ...f, due_at: e.target.value }))} aria-label="Due date" disabled={!isOwner} /></label>
          <label>Remind at <input type="datetime-local" value={editForm.remind_at} onChange={(e) => setEditForm((f) => ({ ...f, remind_at: e.target.value }))} aria-label="Remind at" disabled={!isOwner} /></label>
          <label>Cover URL <input type="url" value={editForm.cover_url} onChange={(e) => setEditForm((f) => ({ ...f, cover_url: e.target.value }))} placeholder="https://…" disabled={!isOwner} /></label>
          {!isOwner && <p className="form-hint">Only the owner can change status, dates and cover.</p>}
          <label>{object.type === 'bookmark' ? 'URL' : 'Reference / URL'} <input type={object.type === 'bookmark' ? 'url' : 'text'} value={editForm.source} onChange={(e) => setEditForm((f) => ({ ...f, source: e.target.value }))} placeholder={object.type === 'bookmark' ? 'https://…' : 'e.g. https://… or book, article'} /></label>
          <label>Summary <textarea value={editForm.summary} onChange={(e) => setEditForm((f) => ({ ...f, summary: e.target.value }))} rows={2} /></label>
          <div className="detail-edit-field">
            <span className="detail-edit-label">Content</span>
            <BlockNoteEditor initialValue={editInitialContentRef.current} onChange={handleContentChange} placeholder="Main content (press / for commands)" minHeight={280} aria-label="Content" />
          </div>
        </div>
      ) : (
        <>
          <h1 className="detail-title">{object.title}</h1>
          {object.cover_url && (
            <figure className="detail-cover-wrap">
              <img src={object.cover_url} alt="" className="detail-cover" />
            </figure>
          )}
          {object.source && (
            <div className={object.type === 'bookmark' ? 'detail-bookmark-url' : 'detail-reference-wrap'}>
              <p className="detail-reference">
                <span className="detail-reference-label">{object.type === 'bookmark' ? 'URL' : 'Reference / URL'}</span>
                {/^https?:\/\//i.test(object.source.trim()) ? (
                  <>
                    <a href={object.source.trim()} target="_blank" rel="noopener noreferrer" className="detail-reference-link">{object.source}</a>
                    {object.type === 'bookmark' && (
                      <a href={object.source.trim()} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-small detail-open-link">Open link</a>
                    )}
                  </>
                ) : (
                  <span className="detail-reference-text">{object.source}</span>
                )}
              </p>
            </div>
          )}
          {object.summary && <p className="detail-summary">{object.summary}</p>}
          {isOwner && (
            <div className="detail-synthesize-cta">
              <span className="detail-synthesize-label">Synthesize</span>
              {applicableTemplates.length > 0 && (
                <select value={runTemplateId} onChange={(e) => setRunTemplateId(e.target.value)} className="detail-synthesize-select">
                  <option value="">Select prompt template</option>
                  {applicableTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
              <button type="button" className="btn btn-primary detail-synthesize-btn" onClick={handleRunPrompt}>
                Run prompt
              </button>
            </div>
          )}
          {object.content && <BlockNoteViewer content={object.content} className="detail-content" />}
        </>
      )}
          </div>
        </div>
        <aside className="detail-sidebar">
          <div className="detail-section-card">
            <h3 className="detail-section-card-title">Domains</h3>
            {(panelErrors.domains ?? panelErrors.taxonomy) ? (
              <QueryError what="domains" error={panelErrors.domains ?? panelErrors.taxonomy} onRetry={() => retryPanel(panelErrors.domains ? 'domains' : 'taxonomy')} />
            ) : objectDomains.length === 0 && !(isOwner && availableDomains.length > 0) ? (
              <p className="detail-empty">No domains yet.</p>
            ) : (
              <div className="chips">
          {objectDomains.map((d) => (
            <span key={d.id} className="chip">
              {d.name}
              {isOwner && <button type="button" className="chip-remove" onClick={() => removeDomain(d.id)} aria-label={`Remove ${d.name}`}>×</button>}
            </span>
          ))}
          {isOwner && availableDomains.length > 0 && (
            <select
              className="chip-select"
              value=""
              onChange={(e) => { const v = e.target.value; if (v) addDomain(v); e.target.value = ''; }}
            >
              <option value="">+ Add domain</option>
              {availableDomains.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
              </div>
            )}
          </div>
          <div className="detail-section-card">
            <h3 className="detail-section-card-title">Tags</h3>
            {(panelErrors.tags ?? panelErrors.taxonomy) ? (
              <QueryError what="tags" error={panelErrors.tags ?? panelErrors.taxonomy} onRetry={() => retryPanel(panelErrors.tags ? 'tags' : 'taxonomy')} />
            ) : objectTags.length === 0 && !(isOwner && (availableTags.length > 0 || suggestedTags.length > 0)) ? (
              <p className="detail-empty">No tags yet.</p>
            ) : (
              <div className="chips">
                {objectTags.map((t) => (
            <span key={t.id} className="chip">
              {t.name}
              {isOwner && <button type="button" className="chip-remove" onClick={() => removeTag(t.id)} aria-label={`Remove ${t.name}`}>×</button>}
            </span>
          ))}
          {isOwner && suggestedTags.length > 0 && (
            <span className="chips-suggested">
              <span className="muted">Suggested: </span>
              {suggestedTags.filter((s) => !objectTags.some((ot) => ot.id === s.tag_id)).map((s) => (
                <button key={s.tag_id} type="button" className="chip chip-suggested" onClick={() => addTag(s.tag_id)} title={`Add ${s.tag_name} (used ${s.usage_count}x in related objects)`}>
                  +{s.tag_name}
                </button>
              ))}
            </span>
          )}
          {isOwner && availableTags.length > 0 && (
            <select
              className="chip-select"
              value=""
              onChange={(e) => { const v = e.target.value; if (v) addTag(v); e.target.value = ''; }}
            >
              <option value="">+ Add tag</option>
              {availableTags.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
              </div>
            )}
          </div>
          <div className="detail-section-card">
            <h3 className="detail-section-card-title">Attachments</h3>
            {panelErrors.files ? (
              <QueryError what="attachments" error={panelErrors.files} onRetry={() => retryPanel('files')} />
            ) : attachedFiles.length === 0 && !isOwner ? (
              <p className="detail-empty">No attachments.</p>
            ) : (
              <>
                {attachedFiles.length > 0 ? (
                  <ul className="attachments-list">
                    {attachedFiles.map((f) => (
                      <li key={f.id}>
                        <button type="button" className="attachment-name" onClick={() => handleDownload(f)}>
                          {f.filename}
                        </button>
                        {f.size_bytes != null && <span className="attachment-size">({(f.size_bytes / 1024).toFixed(1)} KB)</span>}
                        {isOwner && <button type="button" className="chip-remove" onClick={() => handleDetachFile(f.id)} aria-label="Remove attachment">×</button>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="detail-empty">No attachments yet.</p>
                )}
                {isOwner && (
                  <label className={`attachment-upload ${uploading ? 'is-uploading' : ''}`}>
                    <input type="file" accept=".pdf,.docx,.doc,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={handleFileAttach} disabled={uploading} />
                    {uploading ? 'Uploading…' : '+ Attach file'}
                  </label>
                )}
              </>
            )}
          </div>
          {isOwner && (versions.length > 0 || panelErrors.versions) && (
            <div className="detail-section-card">
              <h3 className="detail-section-card-title">Version history</h3>
              {panelErrors.versions ? (
                <QueryError what="version history" error={panelErrors.versions} onRetry={() => retryPanel('versions')} />
              ) : (
              <ul className="version-history-list">
                {versions.map((v) => (
                  <li key={v.id}>
                    <span className="version-history-meta">v{v.version} · {new Date(v.created_at).toLocaleString()}</span>
                    <span className="version-history-title">{v.title || 'Untitled'}</span>
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => handleRestoreVersion(v)} disabled={restoringVersion === v.id}>{restoringVersion === v.id ? 'Restoring…' : 'Restore'}</button>
                  </li>
                ))}
              </ul>
              )}
            </div>
          )}
          {isOwner && (
            <div className="detail-section-card">
              <h3 className="detail-section-card-title">Prompt runs</h3>
              {(panelErrors.runs ?? panelErrors.prompts) ? (
                <QueryError what="prompt runs" error={panelErrors.runs ?? panelErrors.prompts} onRetry={() => retryPanel(panelErrors.runs ? 'runs' : 'prompts')} />
              ) : (
              <>
              <h4 className="detail-section-card-sub">History</h4>
              <ul className="prompt-runs-list">
                {promptRuns.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <span className="run-template-name">{r.prompt_template_id ? (promptTemplates.find((t) => t.id === r.prompt_template_id)?.name ?? 'Prompt') : 'Custom'}</span>
                    <span className="run-date">{new Date(r.created_at).toLocaleDateString()}</span>
                  </li>
                ))}
                {promptRuns.length === 0 && <li className="muted">No runs yet.</li>}
              </ul>
              </>
              )}
            </div>
          )}
          {isOwner && suggestedLinkedObjects.filter((o) => !outgoingLinks.some((l) => l.to_object_id === o.id)).length > 0 && (
            <div className="detail-section-card detail-related">
              <h3 className="detail-section-card-title">Related you might link</h3>
              <div className="detail-related-grid">
                {suggestedLinkedObjects.filter((o) => !outgoingLinks.some((l) => l.to_object_id === o.id)).slice(0, 4).map((o) => (
                  <div key={o.id} className="detail-related-card">
                    <Link to={`/objects/${o.id}`} className="detail-related-title-link" {...prefetch(o.id)}>{o.title}</Link>
                    <span className="detail-related-type">
                      <TypeMark type={o.type} size="sm" className="detail-related-type-mark" />
                      {formatObjectTypeLabel(o.type)}
                    </span>
                    <button type="button" className="btn btn-primary btn-small detail-related-link-btn" onClick={() => addLink(o.id)}>Link</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="detail-section-card">
            <h3 className="detail-section-card-title">Links</h3>
            {panelErrors.links ? (
              <QueryError what="links" error={panelErrors.links} onRetry={() => retryPanel('links')} />
            ) : outgoingLinks.length === 0 && incomingLinks.length === 0 ? (
              <>
                <p className="detail-empty">No links yet.</p>
                {isOwner && availableToLink.length > 0 && (
                  <select value="" onChange={(e) => { const v = e.target.value; if (v) addLink(v); e.target.value = ''; }} className="detail-links-add">
                    <option value="">+ Link to object</option>
                    {availableToLink.slice(0, 50).map((o) => (
                      <option key={o.id} value={o.id}>{o.title} ({formatObjectTypeLabel(o.type)})</option>
                    ))}
                  </select>
                )}
              </>
            ) : (
              <>
                <h4 className="detail-section-card-sub">Outgoing</h4>
                {outgoingLinks.length === 0 ? (
                  <p className="detail-empty">None yet.</p>
                ) : (
                  <ul className="links-list">
                    {outgoingLinks.map((l) => (
                      <li key={l.id}>
                        <Link to={`/objects/${l.to_object_id}`} {...prefetch(l.to_object_id)}>{l.target?.title ?? l.to_object_id}</Link>
                        <span className="link-type">{l.relationship_type}</span>
                        {isOwner && <button type="button" className="chip-remove" onClick={() => removeLink(l.id, true)} aria-label="Remove link">×</button>}
                      </li>
                    ))}
                  </ul>
                )}
                {isOwner && availableToLink.length > 0 && (
                  <select value="" onChange={(e) => { const v = e.target.value; if (v) addLink(v); e.target.value = ''; }} className="detail-links-add">
                    <option value="">+ Link to object</option>
                    {availableToLink.slice(0, 50).map((o) => (
                      <option key={o.id} value={o.id}>{o.title} ({formatObjectTypeLabel(o.type)})</option>
                    ))}
                  </select>
                )}
                <h4 className="detail-section-card-sub">Incoming</h4>
                {incomingLinks.length === 0 ? (
                  <p className="detail-empty">None yet.</p>
                ) : (
                  <ul className="links-list">
                    {incomingLinks.map((l) => (
                      <li key={l.id}>
                        <Link to={`/objects/${l.from_object_id}`} {...prefetch(l.from_object_id)}>{l.source?.title ?? l.from_object_id}</Link>
                        <span className="link-type">{l.relationship_type}</span>
                        {isOwner && <button type="button" className="chip-remove" onClick={() => removeLink(l.id, false)} aria-label="Remove link">×</button>}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          {!(isOwner && versions.length > 0) && (
          <div className="detail-section-card">
            <h3 className="detail-section-card-title">Version history</h3>
            {panelErrors.versions ? (
              <QueryError what="version history" error={panelErrors.versions} onRetry={() => retryPanel('versions')} />
            ) : versions.length === 0 ? (
              <p className="detail-empty">No previous versions yet.</p>
            ) : (
              <ul className="version-list">
                {versions.slice(0, 10).map((v) => (
                  <li key={v.id}>
                    <span className="version-num">v{v.version}</span>
                    <span className="version-title">{v.title}</span>
                    <span className="version-date">{new Date(v.created_at).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          )}
        </aside>
      </div>

      {showRunPanel && (
        <ObjectDetailRunPromptPanel
          object={object}
          runPromptSource={runPromptSource}
          setRunPromptSource={setRunPromptSource}
          runTemplateId={runTemplateId}
          setRunTemplateId={setRunTemplateId}
          runPromptText={runPromptText}
          setRunPromptText={setRunPromptText}
          runPromptEditFromBank={runPromptEditFromBank}
          setRunPromptEditFromBank={setRunPromptEditFromBank}
          aiProviders={aiProviders}
          runAiProviderId={runAiProviderId}
          setRunAiProviderId={setRunAiProviderId}
          runAiModel={runAiModel}
          setRunAiModel={setRunAiModel}
          promptTemplates={promptTemplates}
          applicableTemplates={applicableTemplates}
          runContextOpen={runContextOpen}
          setRunContextOpen={setRunContextOpen}
          error={error}
          generatingAI={generatingAI}
          runOutput={runOutput}
          setRunOutput={setRunOutput}
          savingRun={savingRun}
          onGenerateWithAI={handleGenerateWithAI}
          onSaveRun={handleSaveRun}
          onSaveOutputAsObject={handleSaveOutputAsObject}
          onClose={() => { setShowRunPanel(false); setRunOutput(''); }}
        />
      )}

    </div>
  );
}
