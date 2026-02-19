import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { createNotification } from '../lib/notifications';
import { logAudit } from '../lib/audit';
import { deliverWebhookEvent } from '../lib/webhooks';
import { getExportIncludeFromTemplate, EXPORT_FORMAT_LABELS } from '../lib/export';
import { FILES_BUCKET, getStoragePath } from '../lib/storage';
import { getDraft, setDraft, clearDraft, DRAFT_KEYS } from '../lib/draftStorage';
import { useToast } from '../context/ToastContext';
import NotificationCenter from '../components/NotificationCenter';
import { SkeletonDetail } from '../components/Skeleton';
import Breadcrumbs from '../components/Breadcrumbs';
import BlockNoteEditor from '../components/BlockNoteEditor';
import BlockNoteViewer from '../components/BlockNoteViewer';
import { markdownToHtml } from '../lib/markdown';
import { OBJECT_TYPE_ICONS, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, RUN_PROMPT_STORAGE_KEY } from '../constants';
import './ObjectDetail.css';

export default function ObjectDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const runPromptFromUrl = searchParams.get('runPrompt');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();
  const [object, setObject] = useState(null);
  const [versions, setVersions] = useState([]);
  const [objectDomains, setObjectDomains] = useState([]);
  const [objectTags, setObjectTags] = useState([]);
  const [allDomains, setAllDomains] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [outgoingLinks, setOutgoingLinks] = useState([]);
  const [incomingLinks, setIncomingLinks] = useState([]);
  const [otherObjects, setOtherObjects] = useState([]);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [promptTemplates, setPromptTemplates] = useState([]);
  const [promptRuns, setPromptRuns] = useState([]);
  const [runTemplateId, setRunTemplateId] = useState('');
  const [runPromptText, setRunPromptText] = useState('');
  const [runPromptSource, setRunPromptSource] = useState('bank');
  const [runPromptEditFromBank, setRunPromptEditFromBank] = useState(false);
  const [runOutput, setRunOutput] = useState('');
  const [showRunPanel, setShowRunPanel] = useState(false);
  const [savingRun, setSavingRun] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [runContextOpen, setRunContextOpen] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [exportFormat, setExportFormat] = useState('md');
  const [exportTemplate, setExportTemplate] = useState('full');
  const [exportInclude, setExportInclude] = useState({ content: true, summary: true, key_points: true, tags: true, domains: true, links: true });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', content: '', summary: '', source: '' });
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [shares, setShares] = useState([]);
  const [shareEmail, setShareEmail] = useState('');
  const [shareRole, setShareRole] = useState('viewer');
  const [sharing, setSharing] = useState(false);
  const [myShare, setMyShare] = useState(null);
  const [suggestedTags, setSuggestedTags] = useState([]);
  const [suggestedLinkedObjects, setSuggestedLinkedObjects] = useState([]);
  const [recentExportJobs, setRecentExportJobs] = useState([]);
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const [linkSearchResults, setLinkSearchResults] = useState([]);
  const [linkSearchOpen, setLinkSearchOpen] = useState(false);
  const editInitialContentRef = useRef('');
  const linkSearchRef = useRef(null);

  useEffect(() => {
    if (!id || !user?.id) return;
    let cancelled = false;
    async function load() {
      const { data: obj, error: e1 } = await supabase
        .from('knowledge_objects')
        .select('*')
        .eq('id', id)
        .single();
      if (cancelled) return;
      if (e1 || !obj) {
        setError(e1?.message ?? e1?.error_description ?? 'Not found');
        setObject(null);
        setLoading(false);
        return;
      }
      if (obj.is_deleted) {
        setError('This object has been deleted');
        setObject(null);
        setLoading(false);
        return;
      }
      setObject(obj);
      setEditForm({ title: obj.title, content: obj.content || '', summary: obj.summary || '', source: obj.source || '' });
      const draft = id ? getDraft(DRAFT_KEYS.object(id)) : null;
      if (!cancelled && draft && (draft.title !== undefined || draft.content !== undefined || draft.summary !== undefined)) {
        editInitialContentRef.current = draft.content ?? obj.content ?? '';
        setEditForm((prev) => ({ ...prev, ...draft }));
        setEditing(true);
        addToast('Draft restored');
      }

      const myShareRes = await supabase.from('share_permissions').select('id, role').eq('knowledge_object_id', id).eq('shared_with_user_id', user.id).maybeSingle();
      if (!cancelled) setMyShare(myShareRes.data || null);

      const [versRes, kodRes, kotRes, domRes, tagRes, outRes, inRes, othersRes, kofRes, ptRes, prRes] = await Promise.all([
        supabase.from('knowledge_object_versions').select('id, version, title, created_at, edited_by').eq('knowledge_object_id', id).order('created_at', { ascending: false }).limit(50),
        supabase.from('knowledge_object_domains').select('domain_id, domains(id, name)').eq('knowledge_object_id', id),
        supabase.from('knowledge_object_tags').select('tag_id, tags(id, name)').eq('knowledge_object_id', id),
        supabase.from('domains').select('id, name').eq('user_id', user.id).order('name'),
        supabase.from('tags').select('id, name').eq('user_id', user.id).order('name'),
        supabase.from('link_edges').select('id, to_object_id, relationship_type').eq('from_object_id', id),
        supabase.from('link_edges').select('id, from_object_id, relationship_type').eq('to_object_id', id),
        supabase.from('knowledge_objects').select('id, title, type').eq('user_id', user.id).eq('is_deleted', false).neq('id', id).order('title').limit(200),
        supabase.from('knowledge_object_files').select('file_id, files(id, filename, mime_type, size_bytes, storage_key)').eq('knowledge_object_id', id),
        supabase.from('prompt_templates').select('id, name, applies_to_types, prompt_text').eq('user_id', user.id).order('name'),
        supabase.from('prompt_runs').select('id, prompt_template_id, status, output, created_at').eq('knowledge_object_id', id).order('created_at', { ascending: false }).limit(20),
      ]);
      if (cancelled) return;
      setAttachedFiles((kofRes.data || []).map((r) => r.files).filter(Boolean));
      setPromptTemplates(ptRes.data || []);
      setPromptRuns(prRes.data || []);
      setVersions(versRes.data || []);
      setObjectDomains((kodRes.data || []).map((r) => r.domains).filter(Boolean));
      setObjectTags((kotRes.data || []).map((r) => r.tags).filter(Boolean));
      setAllDomains(domRes.data || []);
      setAllTags(tagRes.data || []);

      const outRows = outRes.data || [];
      const inRows = inRes.data || [];
      const toIds = [...new Set(outRows.map((r) => r.to_object_id))];
      const fromIds = [...new Set(inRows.map((r) => r.from_object_id))];
      const allLinkIds = [...new Set([...toIds, ...fromIds])];
      let targetMap = {};
      if (allLinkIds.length > 0) {
        const { data: objs } = await supabase.from('knowledge_objects').select('id, title, type').in('id', allLinkIds);
        targetMap = (objs || []).reduce((acc, o) => ({ ...acc, [o.id]: o }), {});
      }
      setOutgoingLinks(outRows.map((r) => ({ id: r.id, to_object_id: r.to_object_id, relationship_type: r.relationship_type || 'references', target: targetMap[r.to_object_id] })));
      setIncomingLinks(inRows.map((r) => ({ id: r.id, from_object_id: r.from_object_id, relationship_type: r.relationship_type || 'references', source: targetMap[r.from_object_id] })));

      setOtherObjects(othersRes.data || []);

      const [sugTagsRes, sugLinkRes] = await Promise.all([
        supabase.rpc('suggest_tags_for_object', { p_object_id: id }),
        supabase.rpc('suggest_linked_objects', { p_object_id: id, limit_n: 10 }),
      ]);
      if (!cancelled) {
        const tagSuggestions = sugTagsRes.data?.length ? sugTagsRes.data : (await supabase.rpc('suggest_tags_for_object_fallback', { p_object_id: id })).data || [];
        setSuggestedTags(tagSuggestions);
        setSuggestedLinkedObjects(sugLinkRes.data || []);
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [id, user?.id]);

  const editDraftTimerRef = useRef(null);
  useEffect(() => {
    if (!id || !editing) return;
    if (editDraftTimerRef.current) clearTimeout(editDraftTimerRef.current);
    editDraftTimerRef.current = setTimeout(() => {
      setDraft(DRAFT_KEYS.object(id), editForm);
    }, 500);
    return () => { if (editDraftTimerRef.current) clearTimeout(editDraftTimerRef.current); };
  }, [id, editing, editForm]);

  const loadRecentExportJobs = useCallback(async () => {
    if (!id || !user?.id) return;
    const { data } = await supabase
      .from('export_jobs')
      .select('id, format, template, status, error_message, completed_at, created_at, include_content, include_summary, include_key_points, include_tags, include_domains, include_links')
      .eq('knowledge_object_id', id)
      .order('created_at', { ascending: false })
      .limit(10);
    setRecentExportJobs(data || []);
  }, [id, user?.id]);

  useEffect(() => {
    loadRecentExportJobs();
  }, [loadRecentExportJobs]);

  useEffect(() => {
    if (showExportPanel) loadRecentExportJobs();
  }, [showExportPanel, loadRecentExportJobs]);

  useEffect(() => {
    const inProgress = recentExportJobs.some((j) => j.status === 'queued' || j.status === 'processing');
    if (!inProgress) return;
    const t = setInterval(loadRecentExportJobs, 3000);
    return () => clearInterval(t);
  }, [loadRecentExportJobs, recentExportJobs]);

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'R') {
        if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
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
      const { data, error: err } = await supabase.rpc('search_knowledge_objects', {
        search_query: linkSearchQuery.trim(),
        limit_n: 8,
        offset_n: 0,
      });
      if (err) {
        setLinkSearchResults([]);
        return;
      }
      const list = (data || []).filter((o) => o.id !== object.id);
      setLinkSearchResults(list);
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
      const { error: err } = await supabase
        .from('knowledge_objects')
        .update({
          title: editForm.title.trim(),
          content: editForm.content.trim() || null,
          summary: editForm.summary.trim() || null,
          source: editForm.source.trim() || null,
        })
        .eq('id', object.id);
      if (err) throw err;
      setObject((o) => ({
        ...o,
        title: editForm.title.trim(),
        content: editForm.content.trim() || null,
        summary: editForm.summary.trim() || null,
        source: editForm.source.trim() || null,
        updated_at: new Date().toISOString(),
        current_version: o.current_version + 1,
      }));
      setEditing(false);
      clearDraft(DRAFT_KEYS.object(object.id));
      addToast('success', 'Changes saved');
      logAudit(user.id, AUDIT_ACTIONS.OBJECT_UPDATE, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, object.id, { title: editForm.title.trim() });
      supabase
        .from('knowledge_object_versions')
        .select('id, version, title, created_at, edited_by')
        .eq('knowledge_object_id', object.id)
        .order('created_at', { ascending: false })
        .limit(50)
        .then(({ data: vers }) => { if (vers) setVersions(vers); })
        .catch(() => {});
    } catch (err) {
      const msg = err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Update failed');
      addToast('error', msg);
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!object || !window.confirm('Soft-delete this object? It will disappear from the list but can be restored from the database.')) return;
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
      addToast('success', 'Object deleted');
      navigate('/', { replace: true });
    } catch (err) {
      const msg = err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Delete failed');
      addToast('error', msg);
      setError(msg);
    } finally {
      setDeleting(false);
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
    } catch (err) {
      setError(err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Failed to add domain'));
    }
  }

  async function removeDomain(domainId) {
    if (!object) return;
    setError('');
    try {
      const { error: err } = await supabase.from('knowledge_object_domains').delete().eq('knowledge_object_id', object.id).eq('domain_id', domainId);
      if (err) throw err;
      setObjectDomains((prev) => prev.filter((d) => d.id !== domainId));
    } catch (err) {
      setError(err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Failed to remove domain'));
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
    } catch (err) {
      setError(err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Failed to add tag'));
    }
  }

  async function removeTag(tagId) {
    if (!object) return;
    setError('');
    try {
      const { error: err } = await supabase.from('knowledge_object_tags').delete().eq('knowledge_object_id', object.id).eq('tag_id', tagId);
      if (err) throw err;
      setObjectTags((prev) => prev.filter((t) => t.id !== tagId));
    } catch (err) {
      setError(err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Failed to remove tag'));
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
    } catch (err) {
      setError(err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Failed to add link'));
    }
  }

  async function removeLink(edgeId, isOutgoing) {
    if (!object) return;
    setError('');
    try {
      const { error: err } = await supabase.from('link_edges').delete().eq('id', edgeId);
      if (err) throw err;
      if (isOutgoing) setOutgoingLinks((prev) => prev.filter((l) => l.id !== edgeId));
      else setIncomingLinks((prev) => prev.filter((l) => l.id !== edgeId));
    } catch (err) {
      setError(err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Failed to remove link'));
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
    } catch (err) {
      setError(err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Upload failed'));
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
      setError(err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Download failed'));
    }
  }

  async function handleDetachFile(fileId) {
    if (!object) return;
    setError('');
    try {
      const { error: err } = await supabase.from('knowledge_object_files').delete().eq('knowledge_object_id', object.id).eq('file_id', fileId);
      if (err) throw err;
      setAttachedFiles((prev) => prev.filter((x) => x.id !== fileId));
    } catch (err) {
      setError(err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Failed to remove attachment'));
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
      const { data, error: fnErr } = await supabase.functions.invoke('run-prompt', {
        body: {
          promptText: promptToUse,
          objectTitle: object.title,
          objectContent: object.content || '',
        },
      });
      if (fnErr) throw new Error(fnErr?.message ?? fnErr?.error_description ?? 'Function failed');
      if (data?.error) throw new Error(data.hint || data.error);
      setRunOutput(data?.output ?? '');
    } catch (err) {
      setError(err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'AI generation failed.'));
    } finally {
      setGeneratingAI(false);
    }
  }

  async function handleSaveRun() {
    if (!object) return;
    setError('');
    setSavingRun(true);
    try {
      const { data, error: err } = await supabase.from('prompt_runs').insert({
        user_id: user.id,
        prompt_template_id: runTemplateId || null,
        knowledge_object_id: object.id,
        status: 'completed',
        output: runOutput.trim() || null,
      }).select('id, created_at').single();
      if (err) throw err;
      setPromptRuns((prev) => [{ id: data.id, prompt_template_id: runTemplateId || null, status: 'completed', output: runOutput.trim(), created_at: data.created_at }, ...prev]);
      setShowRunPanel(false);
      setRunOutput('');
      setRunPromptText('');
      setRunTemplateId('');
      createNotification(user.id, 'prompt_completed', 'Prompt run saved', `Run saved for "${object.title.slice(0, 50)}${object.title.length > 50 ? '…' : ''}"`, { type: 'knowledge_object', id: object.id });
      logAudit(user.id, AUDIT_ACTIONS.PROMPT_RUN, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, object.id, { prompt_template_id: runTemplateId || null });
      deliverWebhookEvent('prompt_run.completed', { objectId: object.id, objectTitle: object.title, promptTemplateId: runTemplateId || null });
    } catch (e) {
      setError(e?.message ?? e?.error_description ?? (typeof e === 'string' ? e : 'Failed to save run'));
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
      const { data: newObj, error: objErr } = await supabase.from('knowledge_objects').insert({
        user_id: user.id,
        type: 'prompt',
        title: title.slice(0, 500),
        content: runOutput.trim(),
        summary: null,
      }).select('id').single();
      if (objErr) throw objErr;
      await supabase.from('link_edges').insert({
        from_object_id: object.id,
        to_object_id: newObj.id,
        relationship_type: 'references',
      });
      const { data: runData, error: runErr } = await supabase.from('prompt_runs').insert({
        user_id: user.id,
        prompt_template_id: runTemplateId || null,
        knowledge_object_id: object.id,
        status: 'completed',
        output: runOutput.trim(),
      }).select('id, created_at').single();
      if (!runErr) setPromptRuns((prev) => [{ id: runData.id, prompt_template_id: runTemplateId || null, status: 'completed', output: runOutput.trim(), created_at: runData.created_at }, ...prev]);
      setShowRunPanel(false);
      setRunOutput('');
      setRunTemplateId('');
      setRunPromptText('');
      createNotification(user.id, 'prompt_completed', 'Prompt saved as new object', `Created "${title.slice(0, 60)}${title.length > 60 ? '…' : ''}"`, { type: 'knowledge_object', id: newObj.id });
      logAudit(user.id, AUDIT_ACTIONS.PROMPT_RUN, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, object.id, { prompt_template_id: runTemplateId || null, created_object_id: newObj.id });
      deliverWebhookEvent('prompt_run.completed', { objectId: object.id, createdObjectId: newObj.id, promptTemplateId: runTemplateId || null });
      navigate(`/objects/${newObj.id}`);
    } catch (e) {
      setError(e?.message ?? e?.error_description ?? (typeof e === 'string' ? e : 'Failed to save as object'));
    } finally {
      setSavingRun(false);
    }
  }

  function applyExportTemplate(template) {
    setExportInclude(getExportIncludeFromTemplate(template, { includeLinks: true }));
  }

  function buildExportText(asMarkdown, include = exportInclude) {
    const lines = [];
    const nl = () => lines.push('');
    lines.push(object.title);
    lines.push(`${object.type} · Updated ${new Date(object.updated_at).toLocaleString()}`);
    nl();
    if (object.source && (include.content || include.summary)) lines.push(asMarkdown ? `*Source:* ${object.source}` : `Source: ${object.source}`), nl();
    if (include.summary && object.summary) {
      lines.push(asMarkdown ? '## Summary' : '--- Summary ---');
      lines.push(object.summary);
      nl();
    }
    if (include.key_points && object.key_points && Array.isArray(object.key_points) && object.key_points.length) {
      lines.push(asMarkdown ? '## Key points' : '--- Key points ---');
      object.key_points.forEach((p) => lines.push(asMarkdown ? `- ${typeof p === 'string' ? p : JSON.stringify(p)}` : `• ${typeof p === 'string' ? p : JSON.stringify(p)}`));
      nl();
    }
    if (include.domains && objectDomains.length) {
      lines.push(asMarkdown ? '**Domains:** ' : 'Domains: ');
      lines.push(objectDomains.map((d) => d.name).join(', '));
      nl();
    }
    if (include.tags && objectTags.length) {
      lines.push(asMarkdown ? '**Tags:** ' : 'Tags: ');
      lines.push(objectTags.map((t) => t.name).join(', '));
      nl();
    }
    if (include.content && object.content) {
      lines.push(asMarkdown ? '## Content' : '--- Content ---');
      lines.push(object.content);
      nl();
    }
    if (include.links && (outgoingLinks.length || incomingLinks.length)) {
      lines.push(asMarkdown ? '## Links' : '--- Links ---');
      outgoingLinks.forEach((l) => lines.push(asMarkdown ? `- Out: ${l.target?.title ?? l.to_object_id}` : `Out: ${l.target?.title ?? l.to_object_id}`));
      incomingLinks.forEach((l) => lines.push(asMarkdown ? `- In: ${l.source?.title ?? l.from_object_id}` : `In: ${l.source?.title ?? l.from_object_id}`));
    }
    return lines.join('\n');
  }

  function buildExportHtml(include = exportInclude) {
    const parts = [];
    parts.push(`<h1>${escapeHtml(object.title)}</h1>`);
    parts.push(`<p><em>${escapeHtml(object.type)} · Updated ${new Date(object.updated_at).toLocaleString()}</em></p>`);
    if (object.source) parts.push(`<p>Source: ${escapeHtml(object.source)}</p>`);
    if (include.summary && object.summary) parts.push('<h2>Summary</h2>', `<p>${escapeHtml(object.summary)}</p>`);
    if (include.key_points && object.key_points?.length) {
      parts.push('<h2>Key points</h2><ul>');
      object.key_points.forEach((p) => parts.push(`<li>${escapeHtml(typeof p === 'string' ? p : JSON.stringify(p))}</li>`));
      parts.push('</ul>');
    }
    if (include.domains && objectDomains.length) parts.push('<p><strong>Domains:</strong> ' + objectDomains.map((d) => escapeHtml(d.name)).join(', ') + '</p>');
    if (include.tags && objectTags.length) parts.push('<p><strong>Tags:</strong> ' + objectTags.map((t) => escapeHtml(t.name)).join(', ') + '</p>');
    if (include.content && object.content) parts.push('<h2>Content</h2>', markdownToHtml(object.content));
    if (include.links && (outgoingLinks.length || incomingLinks.length)) {
      parts.push('<h2>Links</h2><ul>');
      outgoingLinks.forEach((l) => parts.push(`<li>Out: ${escapeHtml(l.target?.title ?? l.to_object_id)}</li>`));
      incomingLinks.forEach((l) => parts.push(`<li>In: ${escapeHtml(l.source?.title ?? l.from_object_id)}</li>`));
      parts.push('</ul>');
    }
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(object.title)}</title></head><body>${parts.join('')}</body></html>`;
  }

  function buildExportJson(include = exportInclude) {
    const out = {
      title: object.title,
      type: object.type,
      updated_at: object.updated_at,
      source: object.source || null,
    };
    if (include.summary && object.summary) out.summary = object.summary;
    if (include.key_points && object.key_points?.length) out.key_points = object.key_points;
    if (include.domains && objectDomains.length) out.domains = objectDomains.map((d) => d.name);
    if (include.tags && objectTags.length) out.tags = objectTags.map((t) => t.name);
    if (include.content && object.content) out.content = object.content;
    if (include.links && (outgoingLinks.length || incomingLinks.length)) {
      out.links = {
        outgoing: outgoingLinks.map((l) => ({ title: l.target?.title ?? l.to_object_id, type: l.relationship_type })),
        incoming: incomingLinks.map((l) => ({ title: l.source?.title ?? l.from_object_id, type: l.relationship_type })),
      };
    }
    return JSON.stringify(out, null, 2);
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  async function handleExport(jobOverrides) {
    const fmt = jobOverrides?.format ?? exportFormat;
    const tpl = jobOverrides?.template ?? exportTemplate;
    const inc = jobOverrides?.include ?? exportInclude;
    const slug = object.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 50);
    const ext = fmt === 'pdf' ? 'pdf' : fmt === 'docx' ? 'docx' : fmt;
    const suggestedFilename = `${slug}.${ext}`;
    let jobId = null;
    try {
      const { data: job, error: insertErr } = await supabase.from('export_jobs').insert({
        user_id: user.id,
        knowledge_object_id: object.id,
        format: fmt,
        template: tpl,
        include_content: inc.content,
        include_summary: inc.summary,
        include_key_points: inc.key_points,
        include_tags: inc.tags,
        include_domains: inc.domains,
        include_links: inc.links,
        filename: suggestedFilename,
        status: 'queued',
      }).select('id').single();
      if (insertErr) throw insertErr;
      jobId = job?.id;
      await supabase.from('export_jobs').update({ status: 'processing' }).eq('id', jobId);

      if (fmt === 'txt') {
        const blob = new Blob([buildExportText(false, inc)], { type: 'text/plain;charset=utf-8' });
        downloadBlob(blob, suggestedFilename);
      } else if (fmt === 'md') {
        const blob = new Blob([buildExportText(true, inc)], { type: 'text/markdown;charset=utf-8' });
        downloadBlob(blob, suggestedFilename);
      } else if (fmt === 'html') {
        const blob = new Blob([buildExportHtml(inc)], { type: 'text/html;charset=utf-8' });
        downloadBlob(blob, suggestedFilename);
      } else if (fmt === 'json') {
        const blob = new Blob([buildExportJson(inc)], { type: 'application/json;charset=utf-8' });
        downloadBlob(blob, suggestedFilename);
      } else if (fmt === 'docx') {
        const blob = await buildExportDocxBlob(inc);
        if (blob) downloadBlob(blob, suggestedFilename);
      } else {
        const html = buildExportHtml(inc);
        const w = window.open('', '_blank');
        w.document.write(html);
        w.document.close();
        w.focus();
        w.print();
      }

      await supabase.from('export_jobs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', jobId);
      const formatLabel = EXPORT_FORMAT_LABELS[fmt] || fmt;
      createNotification(user.id, 'export_completed', 'Export completed', `"${object.title.slice(0, 50)}${object.title.length > 50 ? '…' : ''}" as ${formatLabel}`, { type: 'knowledge_object', id: object.id });
      logAudit(user.id, AUDIT_ACTIONS.EXPORT_RUN, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, object.id, { format: fmt, title: object.title });
      deliverWebhookEvent('export.completed', { objectId: object.id, title: object.title, format: fmt });
      addToast('success', `Export downloaded as ${formatLabel}`);
      loadRecentExportJobs();
      setShowExportPanel(false);
    } catch (err) {
      const msg = err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Export failed');
      if (jobId) {
        await supabase.from('export_jobs').update({ status: 'failed', error_message: msg }).eq('id', jobId);
      }
      setError(msg);
      addToast('error', msg);
    }
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function retryExport(job) {
    const inc = {
      content: job.include_content ?? true,
      summary: job.include_summary ?? true,
      key_points: job.include_key_points ?? true,
      tags: job.include_tags ?? true,
      domains: job.include_domains ?? true,
      links: job.include_links ?? true,
    };
    handleExport({ format: job.format, template: job.template, include: inc });
  }

  async function buildExportDocxBlob(include = exportInclude) {
    const { Document, Packer, Paragraph, HeadingLevel } = await import('docx');
    const children = [];
    children.push(new Paragraph({ text: object.title, heading: HeadingLevel.TITLE }));
    children.push(new Paragraph({ text: `${object.type} · Updated ${new Date(object.updated_at).toLocaleString()}`, italics: true }));
    if (object.source) children.push(new Paragraph({ text: `Source: ${object.source}` }));
    if (include.summary && object.summary) {
      children.push(new Paragraph({ text: 'Summary', heading: HeadingLevel.HEADING_1 }));
      children.push(new Paragraph(object.summary));
    }
    if (include.key_points && object.key_points?.length) {
      children.push(new Paragraph({ text: 'Key points', heading: HeadingLevel.HEADING_1 }));
      object.key_points.forEach((p) => children.push(new Paragraph({ text: typeof p === 'string' ? p : JSON.stringify(p), bullet: { level: 0 } })));
    }
    if (include.domains && objectDomains.length) {
      children.push(new Paragraph({ text: `Domains: ${objectDomains.map((d) => d.name).join(', ')}` }));
    }
    if (include.tags && objectTags.length) {
      children.push(new Paragraph({ text: `Tags: ${objectTags.map((t) => t.name).join(', ')}` }));
    }
    if (include.content && object.content) {
      children.push(new Paragraph({ text: 'Content', heading: HeadingLevel.HEADING_1 }));
      const contentLines = object.content.split(/\n/);
      for (const line of contentLines) {
        const t = line.trimEnd();
        if (/^###\s+/.test(t)) children.push(new Paragraph({ text: t.replace(/^###\s+/, ''), heading: HeadingLevel.HEADING_3 }));
        else if (/^##\s+/.test(t)) children.push(new Paragraph({ text: t.replace(/^##\s+/, ''), heading: HeadingLevel.HEADING_2 }));
        else if (/^#\s+/.test(t)) children.push(new Paragraph({ text: t.replace(/^#\s+/, ''), heading: HeadingLevel.HEADING_1 }));
        else if (/^[-*]\s+/.test(t)) children.push(new Paragraph({ text: t.replace(/^[-*]\s+/, ''), bullet: { level: 0 } }));
        else children.push(new Paragraph(t || ' '));
      }
    }
    if (include.links && (outgoingLinks.length || incomingLinks.length)) {
      children.push(new Paragraph({ text: 'Links', heading: HeadingLevel.HEADING_1 }));
      outgoingLinks.forEach((l) => children.push(new Paragraph({ text: `Out: ${l.target?.title ?? l.to_object_id} (${l.relationship_type})`, bullet: { level: 0 } })));
      incomingLinks.forEach((l) => children.push(new Paragraph({ text: `In: ${l.source?.title ?? l.from_object_id} (${l.relationship_type})`, bullet: { level: 0 } })));
    }
    const doc = new Document({ sections: [{ properties: {}, children }] });
    return Packer.toBlob(doc);
  }

  const availableDomains = allDomains.filter((d) => !objectDomains.some((od) => od.id === d.id));
  const availableTags = allTags.filter((t) => !objectTags.some((ot) => ot.id === t.id));
  const availableToLink = otherObjects.filter((o) => !outgoingLinks.some((l) => l.to_object_id === o.id));

  const isOwner = object?.user_id === user?.id;
  const canEdit = isOwner || myShare?.role === 'editor';

  async function loadShares() {
    if (!object?.id || !user?.id) return;
    const { data } = await supabase.from('share_permissions').select('id, shared_with_email, role, created_at').eq('knowledge_object_id', object.id).order('created_at', { ascending: false });
    setShares(data || []);
  }

  async function handleAddShare(e) {
    e.preventDefault();
    if (!object || !shareEmail.trim()) return;
    setSharing(true);
    setError('');
    try {
      const { data: userId, error: rpcErr } = await supabase.rpc('resolve_user_id_by_email', { target_email: shareEmail.trim() });
      if (rpcErr) throw rpcErr;
      if (!userId) throw new Error('No user found with that email');
      if (userId === user.id) throw new Error('You cannot share with yourself');
      const { data: newShare, error: insErr } = await supabase.from('share_permissions').insert({
        knowledge_object_id: object.id,
        shared_with_user_id: userId,
        shared_with_email: shareEmail.trim(),
        role: shareRole,
      }).select('id, shared_with_email, role, created_at').single();
      if (insErr) throw insErr;
      setShares((prev) => [newShare, ...prev]);
      setShareEmail('');
      addToast('success', `Shared with ${shareEmail.trim()}`);
    } catch (err) {
      const msg = err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Failed to share');
      addToast('error', msg);
      setError(msg);
    } finally {
      setSharing(false);
    }
  }

  async function handleRevokeShare(shareId) {
    if (!object) return;
    setError('');
    try {
      const { error: err } = await supabase.from('share_permissions').delete().eq('id', shareId).eq('knowledge_object_id', object.id);
      if (err) throw err;
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (err) {
      setError(err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Failed to revoke'));
    }
  }

  if (loading) return <div className="object-detail loading" id="main-content" role="main"><p className="sr-only" role="status" aria-live="polite">Loading…</p><SkeletonDetail /></div>;
  if (error && !object) return <div className="object-detail" id="main-content" role="main"><p className="detail-error" role="alert">{error}</p><Link to="/">Back to Dashboard</Link></div>;
  if (!object) return null;

  return (
    <div className="object-detail" id="main-content" role="main">
      <header className="object-detail-header">
        <div className="object-detail-header-left">
          <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: object.title || 'Object' }]} />
          <NotificationCenter />
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
                      <Link to={`/objects/${o.id}`} className="detail-link-search-title" onClick={() => setLinkSearchOpen(false)}>{o.title}</Link>
                      <span className="detail-link-search-type">{o.type}</span>
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
          <button type="button" className="btn btn-secondary" onClick={() => setShowExportPanel((v) => !v)}>Export</button>
          {isOwner && (
            <button type="button" className="btn btn-secondary" onClick={() => { setShowSharePanel((v) => !v); if (!showSharePanel) loadShares(); }}>Share</button>
          )}
          {!editing ? (
            <>
              {canEdit && <button type="button" className="btn btn-secondary" onClick={() => { editInitialContentRef.current = editForm.content ?? ''; setEditing(true); }}>Edit</button>}
              {isOwner && <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</button>}
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => { setEditing(false); setEditForm({ title: object.title, content: object.content || '', summary: object.summary || '' }); if (object?.id) clearDraft(DRAFT_KEYS.object(object.id)); }}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </>
          )}
        </div>
      </header>
      {error && <div className="form-error" role="alert">{error}</div>}

      {showSharePanel && isOwner && (
        <section className="share-panel">
          <h2>Share object</h2>
          <form onSubmit={handleAddShare} className="share-form">
            <label>
              Email
              <input type="email" value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} placeholder="collaborator@example.com" required />
            </label>
            <label>
              Role
              <select value={shareRole} onChange={(e) => setShareRole(e.target.value)}>
                <option value="viewer">Viewer (read only)</option>
                <option value="editor">Editor (can edit content)</option>
              </select>
            </label>
            <button type="submit" className="btn btn-primary" disabled={sharing}>{sharing ? 'Adding…' : 'Add'}</button>
          </form>
          <h3>Shared with</h3>
          {shares.length === 0 ? <p className="share-empty">Not shared with anyone yet.</p> : (
            <ul className="share-list">
              {shares.map((s) => (
                <li key={s.id}>
                  <span className="share-email">{s.shared_with_email || '—'}</span>
                  <span className="share-role">{s.role}</span>
                  <button type="button" className="btn btn-danger btn-small" onClick={() => handleRevokeShare(s.id)}>Revoke</button>
                </li>
              ))}
            </ul>
          )}
          <div className="share-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowSharePanel(false)}>Close</button>
          </div>
        </section>
      )}

      {showExportPanel && (
        <section className="export-panel">
          <h2>Export object</h2>
          <div className="export-options">
            <label>Format <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}><option value="txt">TXT</option><option value="md">Markdown</option><option value="html">HTML</option><option value="json">JSON</option><option value="docx">DOCX</option><option value="pdf">PDF (print)</option></select></label>
            <label>Template <select value={exportTemplate} onChange={(e) => { const v = e.target.value; setExportTemplate(v); applyExportTemplate(v); }}><option value="raw">Raw (content only)</option><option value="brief">Brief (summary + key points)</option><option value="full">Full</option><option value="stakeholder">Stakeholder (condensed)</option></select></label>
          </div>
          <div className="export-include">
            <span className="export-include-label">Include:</span>
            {['content', 'summary', 'key_points', 'tags', 'domains', 'links'].map((k) => (
              <label key={k} className="checkbox-label">
                <input type="checkbox" checked={exportInclude[k]} onChange={(e) => setExportInclude((prev) => ({ ...prev, [k]: e.target.checked }))} />
                {k.replace('_', ' ')}
              </label>
            ))}
          </div>
          {recentExportJobs.length > 0 && (
            <div className="export-recent">
              <h3 className="export-recent-title">Recent exports</h3>
              <ul className="export-jobs-list">
                {recentExportJobs.map((j) => (
                  <li key={j.id} className="export-job-item">
                    <span className={`export-job-status ${j.status}`}>
                      {j.status === 'processing' || j.status === 'queued' ? (
                        <span className="export-job-spinner" aria-hidden="true" />
                      ) : j.status === 'completed' ? (
                        '✓ Ready'
                      ) : j.status === 'failed' ? (
                        'Failed'
                      ) : (
                        j.status
                      )}
                    </span>
                    <span className="export-job-meta">
                      {(EXPORT_FORMAT_LABELS[j.format] || j.format).toUpperCase()}
                      {' · '}
                      {new Date(j.created_at).toLocaleString()}
                      {j.error_message && ` — ${j.error_message}`}
                    </span>
                    {j.status === 'failed' && (
                      <span className="export-job-actions">
                        <button type="button" className="btn btn-secondary" onClick={() => retryExport(j)}>Retry</button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="export-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowExportPanel(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={() => handleExport()}>Export</button>
          </div>
        </section>
      )}

      <div className="detail-layout">
        <main className="detail-main">
          <div className="detail-hero">
            <div className="detail-meta detail-meta-inline">
              <span className="detail-type" title={object.type}>
                <span className="detail-type-icon" aria-hidden="true">{OBJECT_TYPE_ICONS[object.type] ?? '📄'}</span>
                {object.type}
              </span>
              <span className="detail-updated">Updated {new Date(object.updated_at).toLocaleString()}</span>
              <span className="detail-version">v{object.current_version}</span>
            </div>
            {editing ? (
        <div className="detail-edit" key={`edit-${object?.id}`}>
          <label>Title <input type="text" value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} required /></label>
          <label>Reference / URL <input type="text" value={editForm.source} onChange={(e) => setEditForm((f) => ({ ...f, source: e.target.value }))} placeholder="e.g. https://… or book, article" /></label>
          <label>Summary <textarea value={editForm.summary} onChange={(e) => setEditForm((f) => ({ ...f, summary: e.target.value }))} rows={2} /></label>
          <div className="detail-edit-field">
            <span className="detail-edit-label">Content</span>
            <BlockNoteEditor initialValue={editInitialContentRef.current} onChange={handleContentChange} placeholder="Main content (press / for commands)" minHeight={280} aria-label="Content" />
          </div>
        </div>
      ) : (
        <>
          <h1 className="detail-title">{object.title}</h1>
          {object.source && (
            <p className="detail-reference">
              <span className="detail-reference-label">Reference / URL</span>
              {/^https?:\/\//i.test(object.source.trim()) ? (
                <a href={object.source.trim()} target="_blank" rel="noopener noreferrer" className="detail-reference-link">{object.source}</a>
              ) : (
                <span className="detail-reference-text">{object.source}</span>
              )}
            </p>
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
        </main>
        <aside className="detail-sidebar">
          <div className="detail-section-card">
            <h3 className="detail-section-card-title">Domains</h3>
            {objectDomains.length === 0 && !(isOwner && availableDomains.length > 0) ? (
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
            {objectTags.length === 0 && !(isOwner && (availableTags.length > 0 || suggestedTags.length > 0)) ? (
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
            {attachedFiles.length === 0 && !isOwner ? (
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
          {isOwner && (
            <div className="detail-section-card">
              <h3 className="detail-section-card-title">Run prompt</h3>
              <button type="button" className="btn btn-primary run-prompt-open-btn" onClick={handleRunPrompt}>Run prompt</button>
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
            </div>
          )}
          {isOwner && suggestedLinkedObjects.filter((o) => !outgoingLinks.some((l) => l.to_object_id === o.id)).length > 0 && (
            <div className="detail-section-card detail-related">
              <h3 className="detail-section-card-title">Related you might link</h3>
              <div className="detail-related-grid">
                {suggestedLinkedObjects.filter((o) => !outgoingLinks.some((l) => l.to_object_id === o.id)).slice(0, 4).map((o) => (
                  <div key={o.id} className="detail-related-card">
                    <Link to={`/objects/${o.id}`} className="detail-related-title-link">{o.title}</Link>
                    <span className="detail-related-type">{OBJECT_TYPE_ICONS[o.type] ?? '📄'} {o.type}</span>
                    <button type="button" className="btn btn-primary btn-small detail-related-link-btn" onClick={() => addLink(o.id)}>Link</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="detail-section-card">
            <h3 className="detail-section-card-title">Links</h3>
            {outgoingLinks.length === 0 && incomingLinks.length === 0 ? (
              <>
                <p className="detail-empty">No links yet.</p>
                {isOwner && availableToLink.length > 0 && (
                  <select value="" onChange={(e) => { const v = e.target.value; if (v) addLink(v); e.target.value = ''; }} className="detail-links-add">
                    <option value="">+ Link to object</option>
                    {availableToLink.slice(0, 50).map((o) => (
                      <option key={o.id} value={o.id}>{o.title} ({o.type})</option>
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
                        <Link to={`/objects/${l.to_object_id}`}>{l.target?.title ?? l.to_object_id}</Link>
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
                      <option key={o.id} value={o.id}>{o.title} ({o.type})</option>
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
                        <Link to={`/objects/${l.from_object_id}`}>{l.source?.title ?? l.from_object_id}</Link>
                        <span className="link-type">{l.relationship_type}</span>
                        {isOwner && <button type="button" className="chip-remove" onClick={() => removeLink(l.id, false)} aria-label="Remove link">×</button>}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          <div className="detail-section-card">
            <h3 className="detail-section-card-title">Version history</h3>
            {versions.length === 0 ? (
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
        </aside>
      </div>

      {showRunPanel && (
        <div className="run-prompt-overlay" role="dialog" aria-modal="true" aria-labelledby="run-prompt-title">
          <div className="run-prompt-overlay-backdrop" onClick={() => { setShowRunPanel(false); setRunOutput(''); }} />
          <div className="run-prompt-overlay-panel">
            <header className="run-prompt-overlay-header">
              <h2 id="run-prompt-title" className="run-prompt-overlay-title">Run prompt</h2>
              <button type="button" className="run-prompt-overlay-close" onClick={() => { setShowRunPanel(false); setRunOutput(''); }} aria-label="Close">×</button>
            </header>
            <div className="run-prompt-overlay-body">
              <div className="run-prompt-source-row">
                <span className="run-prompt-source-label">Source</span>
                <div className="run-prompt-source-tabs">
                  <button type="button" className={`run-prompt-source-tab ${runPromptSource === 'bank' ? 'active' : ''}`} onClick={() => { setRunPromptSource('bank'); if (runTemplateId) { const t = promptTemplates.find((x) => x.id === runTemplateId); if (t?.prompt_text != null) setRunPromptText(t.prompt_text); } setRunPromptEditFromBank(false); }}>Prompt Bank</button>
                  <button type="button" className={`run-prompt-source-tab ${runPromptSource === 'custom' ? 'active' : ''}`} onClick={() => { setRunPromptSource('custom'); setRunTemplateId(''); setRunPromptText(''); setRunPromptEditFromBank(false); }}>Custom prompt</button>
                </div>
              </div>
              {runPromptSource === 'bank' && (
                <div className="run-prompt-bank-row">
                  <label className="run-prompt-select-label">Template</label>
                  <select value={runTemplateId} onChange={(e) => setRunTemplateId(e.target.value)} className="run-prompt-template-select">
                    <option value="">Select a prompt</option>
                    {applicableTemplates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  {runTemplateId && (
                    <label className="run-prompt-edit-check">
                      <input type="checkbox" checked={runPromptEditFromBank} onChange={(e) => { const checked = e.target.checked; setRunPromptEditFromBank(checked); const t = promptTemplates.find((x) => x.id === runTemplateId); if (t?.prompt_text != null) setRunPromptText(t.prompt_text); }} />
                      Edit before running
                    </label>
                  )}
                </div>
              )}
              <div className="run-prompt-prompt-block">
                <label className="run-prompt-prompt-label">Prompt</label>
                <textarea value={runPromptText} onChange={(e) => setRunPromptText(e.target.value)} className="run-prompt-prompt-input" rows={runPromptSource === 'custom' ? 6 : 5} placeholder={runPromptSource === 'custom' ? 'Type your prompt…' : 'Select a template or enable “Edit before running”.'} disabled={runPromptSource === 'bank' && !runPromptEditFromBank && !!runTemplateId} />
              </div>
              <details className="run-prompt-context-details" open={runContextOpen} onToggle={(e) => setRunContextOpen(e.target.open)}>
                <summary className="run-prompt-context-summary">Context: object used for this run</summary>
                <div className="run-prompt-context-body">
                  <p className="run-prompt-context-title">Object: {object?.title ?? '—'}</p>
                  <div className="run-prompt-context-preview">{(object?.content ?? '').slice(0, 800)}{(object?.content?.length ?? 0) > 800 ? '…' : ''}</div>
                </div>
              </details>
              {error && <p className="run-prompt-overlay-error" role="alert">{error}</p>}
              <div className="run-prompt-generate-row">
                <button type="button" className="btn btn-primary run-prompt-generate-btn" onClick={handleGenerateWithAI} disabled={generatingAI}>{generatingAI ? 'Generating…' : 'Generate with AI'}</button>
              </div>
              <div className="run-prompt-output-block">
                <label className="run-prompt-output-label">Output</label>
                <textarea value={runOutput} onChange={(e) => setRunOutput(e.target.value)} className="run-prompt-output-input" rows={8} placeholder="Generate with AI or paste your own…" />
              </div>
              <div className="run-prompt-overlay-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowRunPanel(false); setRunOutput(''); }}>Cancel</button>
                <button type="button" className="btn btn-secondary" onClick={handleSaveRun} disabled={savingRun}>Save run only</button>
                <button type="button" className="btn btn-primary" onClick={handleSaveOutputAsObject} disabled={savingRun || !runOutput.trim()}>{savingRun ? 'Saving…' : 'Save as new object'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
