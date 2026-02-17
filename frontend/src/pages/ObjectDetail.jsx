import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { createNotification } from '../lib/notifications';
import { logAudit } from '../lib/audit';
import { deliverWebhookEvent } from '../lib/webhooks';
import { getExportIncludeFromTemplate, EXPORT_FORMAT_LABELS } from '../lib/export';
import { FILES_BUCKET, getStoragePath } from '../lib/storage';
import { useToast } from '../context/ToastContext';
import NotificationCenter from '../components/NotificationCenter';
import { SkeletonDetail } from '../components/Skeleton';
import Breadcrumbs from '../components/Breadcrumbs';
import { OBJECT_TYPE_ICONS, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../constants';
import './ObjectDetail.css';

export default function ObjectDetail() {
  const { id } = useParams();
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
  const [runOutput, setRunOutput] = useState('');
  const [showRunPanel, setShowRunPanel] = useState(false);
  const [savingRun, setSavingRun] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [exportFormat, setExportFormat] = useState('md');
  const [exportTemplate, setExportTemplate] = useState('full');
  const [exportInclude, setExportInclude] = useState({ content: true, summary: true, key_points: true, tags: true, domains: true, links: true });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', content: '', summary: '' });
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [shares, setShares] = useState([]);
  const [shareEmail, setShareEmail] = useState('');
  const [shareRole, setShareRole] = useState('viewer');
  const [sharing, setSharing] = useState(false);
  const [myShare, setMyShare] = useState(null);
  const [suggestedTags, setSuggestedTags] = useState([]);
  const [suggestedLinkedObjects, setSuggestedLinkedObjects] = useState([]);

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
        setError(e1?.message || 'Not found');
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
      setEditForm({ title: obj.title, content: obj.content || '', summary: obj.summary || '' });

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
        })
        .eq('id', object.id);
      if (err) throw err;
      setObject((o) => ({
        ...o,
        title: editForm.title.trim(),
        content: editForm.content.trim() || null,
        summary: editForm.summary.trim() || null,
        updated_at: new Date().toISOString(),
        current_version: o.current_version + 1,
      }));
      setEditing(false);
      addToast('success', 'Changes saved');
      logAudit(user.id, AUDIT_ACTIONS.OBJECT_UPDATE, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, object.id, { title: editForm.title.trim() });
      const { data: vers } = await supabase
        .from('knowledge_object_versions')
        .select('id, version, title, created_at, edited_by')
        .eq('knowledge_object_id', object.id)
        .order('created_at', { ascending: false })
        .limit(50);
      setVersions(vers || []);
    } catch (err) {
      addToast('error', err.message || 'Update failed');
      setError(err.message || 'Update failed');
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
      addToast('error', err.message || 'Delete failed');
      setError(err.message || 'Delete failed');
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
      setError(err.message || 'Failed to add domain');
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
      setError(err.message || 'Failed to remove domain');
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
      setError(err.message || 'Failed to add tag');
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
      setError(err.message || 'Failed to remove tag');
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
      setError(err.message || 'Failed to add link');
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
      setError(err.message || 'Failed to remove link');
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
      setError(err.message || 'Upload failed');
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
      setError(err.message || 'Download failed');
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
      setError(err.message || 'Failed to remove attachment');
    }
  }

  const applicableTemplates = promptTemplates.filter(
    (t) => !(t.applies_to_types && t.applies_to_types.length) || (t.applies_to_types || []).includes(object?.type)
  );

  async function handleRunPrompt() {
    if (!object || !runTemplateId) return;
    setShowRunPanel(true);
    setRunOutput('');
  }

  async function handleGenerateWithAI() {
    if (!object || !runTemplateId) return;
    const template = promptTemplates.find((t) => t.id === runTemplateId);
    if (!template?.prompt_text) {
      setError('Template has no prompt text');
      return;
    }
    setError('');
    setGeneratingAI(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('run-prompt', {
        body: {
          promptText: template.prompt_text,
          objectTitle: object.title,
          objectContent: object.content || '',
        },
      });
      if (fnErr) throw new Error(fnErr.message || 'Function failed');
      if (data?.error) throw new Error(data.hint || data.error);
      setRunOutput(data?.output ?? '');
    } catch (err) {
      setError(err.message || 'AI generation failed.');
    } finally {
      setGeneratingAI(false);
    }
  }

  async function handleSaveRun() {
    if (!object || !runTemplateId) return;
    setError('');
    setSavingRun(true);
    try {
      const { data, error: err } = await supabase.from('prompt_runs').insert({
        user_id: user.id,
        prompt_template_id: runTemplateId,
        knowledge_object_id: object.id,
        status: 'completed',
        output: runOutput.trim() || null,
      }).select('id, created_at').single();
      if (err) throw err;
      setPromptRuns((prev) => [{ id: data.id, prompt_template_id: runTemplateId, status: 'completed', output: runOutput.trim(), created_at: data.created_at }, ...prev]);
      setShowRunPanel(false);
      setRunOutput('');
      setRunTemplateId('');
      createNotification(user.id, 'prompt_completed', 'Prompt run saved', `Run saved for "${object.title.slice(0, 50)}${object.title.length > 50 ? '…' : ''}"`, { type: 'knowledge_object', id: object.id });
      logAudit(user.id, AUDIT_ACTIONS.PROMPT_RUN, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, object.id, { prompt_template_id: runTemplateId });
      deliverWebhookEvent('prompt_run.completed', { objectId: object.id, objectTitle: object.title, promptTemplateId: runTemplateId });
    } catch (e) {
      setError(e.message || 'Failed to save run');
    } finally {
      setSavingRun(false);
    }
  }

  async function handleSaveOutputAsObject() {
    if (!object || !runTemplateId || !runOutput.trim()) return;
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
        prompt_template_id: runTemplateId,
        knowledge_object_id: object.id,
        status: 'completed',
        output: runOutput.trim(),
      }).select('id, created_at').single();
      if (!runErr) setPromptRuns((prev) => [{ id: runData.id, prompt_template_id: runTemplateId, status: 'completed', output: runOutput.trim(), created_at: runData.created_at }, ...prev]);
      setShowRunPanel(false);
      setRunOutput('');
      setRunTemplateId('');
      createNotification(user.id, 'prompt_completed', 'Prompt saved as new object', `Created "${title.slice(0, 60)}${title.length > 60 ? '…' : ''}"`, { type: 'knowledge_object', id: newObj.id });
      logAudit(user.id, AUDIT_ACTIONS.PROMPT_RUN, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, object.id, { prompt_template_id: runTemplateId, created_object_id: newObj.id });
      deliverWebhookEvent('prompt_run.completed', { objectId: object.id, createdObjectId: newObj.id, promptTemplateId: runTemplateId });
      navigate(`/objects/${newObj.id}`);
    } catch (e) {
      setError(e.message || 'Failed to save as object');
    } finally {
      setSavingRun(false);
    }
  }

  function applyExportTemplate(template) {
    setExportInclude(getExportIncludeFromTemplate(template, { includeLinks: true }));
  }

  function buildExportText(asMarkdown) {
    const lines = [];
    const nl = () => lines.push('');
    lines.push(object.title);
    lines.push(`${object.type} · Updated ${new Date(object.updated_at).toLocaleString()}`);
    nl();
    if (object.source && (exportInclude.content || exportInclude.summary)) lines.push(asMarkdown ? `*Source:* ${object.source}` : `Source: ${object.source}`), nl();
    if (exportInclude.summary && object.summary) {
      lines.push(asMarkdown ? '## Summary' : '--- Summary ---');
      lines.push(object.summary);
      nl();
    }
    if (exportInclude.key_points && object.key_points && Array.isArray(object.key_points) && object.key_points.length) {
      lines.push(asMarkdown ? '## Key points' : '--- Key points ---');
      object.key_points.forEach((p) => lines.push(asMarkdown ? `- ${typeof p === 'string' ? p : JSON.stringify(p)}` : `• ${typeof p === 'string' ? p : JSON.stringify(p)}`));
      nl();
    }
    if (exportInclude.domains && objectDomains.length) {
      lines.push(asMarkdown ? '**Domains:** ' : 'Domains: ');
      lines.push(objectDomains.map((d) => d.name).join(', '));
      nl();
    }
    if (exportInclude.tags && objectTags.length) {
      lines.push(asMarkdown ? '**Tags:** ' : 'Tags: ');
      lines.push(objectTags.map((t) => t.name).join(', '));
      nl();
    }
    if (exportInclude.content && object.content) {
      lines.push(asMarkdown ? '## Content' : '--- Content ---');
      lines.push(object.content);
      nl();
    }
    if (exportInclude.links && (outgoingLinks.length || incomingLinks.length)) {
      lines.push(asMarkdown ? '## Links' : '--- Links ---');
      outgoingLinks.forEach((l) => lines.push(asMarkdown ? `- Out: ${l.target?.title ?? l.to_object_id}` : `Out: ${l.target?.title ?? l.to_object_id}`));
      incomingLinks.forEach((l) => lines.push(asMarkdown ? `- In: ${l.source?.title ?? l.from_object_id}` : `In: ${l.source?.title ?? l.from_object_id}`));
    }
    return lines.join('\n');
  }

  function buildExportHtml() {
    const parts = [];
    parts.push(`<h1>${escapeHtml(object.title)}</h1>`);
    parts.push(`<p><em>${escapeHtml(object.type)} · Updated ${new Date(object.updated_at).toLocaleString()}</em></p>`);
    if (object.source) parts.push(`<p>Source: ${escapeHtml(object.source)}</p>`);
    if (exportInclude.summary && object.summary) parts.push('<h2>Summary</h2>', `<p>${escapeHtml(object.summary)}</p>`);
    if (exportInclude.key_points && object.key_points?.length) {
      parts.push('<h2>Key points</h2><ul>');
      object.key_points.forEach((p) => parts.push(`<li>${escapeHtml(typeof p === 'string' ? p : JSON.stringify(p))}</li>`));
      parts.push('</ul>');
    }
    if (exportInclude.domains && objectDomains.length) parts.push('<p><strong>Domains:</strong> ' + objectDomains.map((d) => escapeHtml(d.name)).join(', ') + '</p>');
    if (exportInclude.tags && objectTags.length) parts.push('<p><strong>Tags:</strong> ' + objectTags.map((t) => escapeHtml(t.name)).join(', ') + '</p>');
    if (exportInclude.content && object.content) parts.push('<h2>Content</h2>', `<pre style="white-space:pre-wrap">${escapeHtml(object.content)}</pre>`);
    if (exportInclude.links && (outgoingLinks.length || incomingLinks.length)) {
      parts.push('<h2>Links</h2><ul>');
      outgoingLinks.forEach((l) => parts.push(`<li>Out: ${escapeHtml(l.target?.title ?? l.to_object_id)}</li>`));
      incomingLinks.forEach((l) => parts.push(`<li>In: ${escapeHtml(l.source?.title ?? l.from_object_id)}</li>`));
      parts.push('</ul>');
    }
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(object.title)}</title></head><body>${parts.join('')}</body></html>`;
  }

  function buildExportJson() {
    const out = {
      title: object.title,
      type: object.type,
      updated_at: object.updated_at,
      source: object.source || null,
    };
    if (exportInclude.summary && object.summary) out.summary = object.summary;
    if (exportInclude.key_points && object.key_points?.length) out.key_points = object.key_points;
    if (exportInclude.domains && objectDomains.length) out.domains = objectDomains.map((d) => d.name);
    if (exportInclude.tags && objectTags.length) out.tags = objectTags.map((t) => t.name);
    if (exportInclude.content && object.content) out.content = object.content;
    if (exportInclude.links && (outgoingLinks.length || incomingLinks.length)) {
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

  async function handleExport() {
    const slug = object.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 50);
    const ext = exportFormat === 'pdf' ? 'pdf' : exportFormat === 'docx' ? 'docx' : exportFormat;
    const suggestedFilename = `${slug}.${ext}`;
    let jobId = null;
    try {
      const { data: job, error: insertErr } = await supabase.from('export_jobs').insert({
        user_id: user.id,
        knowledge_object_id: object.id,
        format: exportFormat,
        template: exportTemplate,
        include_content: exportInclude.content,
        include_summary: exportInclude.summary,
        include_key_points: exportInclude.key_points,
        include_tags: exportInclude.tags,
        include_domains: exportInclude.domains,
        include_links: exportInclude.links,
        filename: suggestedFilename,
        status: 'queued',
      }).select('id').single();
      if (insertErr) throw insertErr;
      jobId = job?.id;
      await supabase.from('export_jobs').update({ status: 'processing' }).eq('id', jobId);

      if (exportFormat === 'txt') {
        const blob = new Blob([buildExportText(false)], { type: 'text/plain;charset=utf-8' });
        downloadBlob(blob, suggestedFilename);
      } else if (exportFormat === 'md') {
        const blob = new Blob([buildExportText(true)], { type: 'text/markdown;charset=utf-8' });
        downloadBlob(blob, suggestedFilename);
      } else if (exportFormat === 'html') {
        const blob = new Blob([buildExportHtml()], { type: 'text/html;charset=utf-8' });
        downloadBlob(blob, suggestedFilename);
      } else if (exportFormat === 'json') {
        const blob = new Blob([buildExportJson()], { type: 'application/json;charset=utf-8' });
        downloadBlob(blob, suggestedFilename);
      } else if (exportFormat === 'docx') {
        const blob = await buildExportDocxBlob();
        if (blob) downloadBlob(blob, suggestedFilename);
      } else {
        const html = buildExportHtml();
        const w = window.open('', '_blank');
        w.document.write(html);
        w.document.close();
        w.focus();
        w.print();
      }

      await supabase.from('export_jobs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', jobId);
      const formatLabel = EXPORT_FORMAT_LABELS[exportFormat] || exportFormat;
      createNotification(user.id, 'export_completed', 'Export completed', `"${object.title.slice(0, 50)}${object.title.length > 50 ? '…' : ''}" as ${formatLabel}`, { type: 'knowledge_object', id: object.id });
      logAudit(user.id, AUDIT_ACTIONS.EXPORT_RUN, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, object.id, { format: exportFormat, title: object.title });
      deliverWebhookEvent('export.completed', { objectId: object.id, title: object.title, format: exportFormat });
      addToast('success', `Export downloaded as ${formatLabel}`);
      setShowExportPanel(false);
    } catch (err) {
      const msg = err.message || 'Export failed';
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

  async function buildExportDocxBlob() {
    const { Document, Packer, Paragraph, HeadingLevel } = await import('docx');
    const children = [];
    children.push(new Paragraph({ text: object.title, heading: HeadingLevel.TITLE }));
    children.push(new Paragraph({ text: `${object.type} · Updated ${new Date(object.updated_at).toLocaleString()}`, italics: true }));
    if (object.source) children.push(new Paragraph({ text: `Source: ${object.source}` }));
    if (exportInclude.summary && object.summary) {
      children.push(new Paragraph({ text: 'Summary', heading: HeadingLevel.HEADING_1 }));
      children.push(new Paragraph(object.summary));
    }
    if (exportInclude.key_points && object.key_points?.length) {
      children.push(new Paragraph({ text: 'Key points', heading: HeadingLevel.HEADING_1 }));
      object.key_points.forEach((p) => children.push(new Paragraph({ text: typeof p === 'string' ? p : JSON.stringify(p), bullet: { level: 0 } })));
    }
    if (exportInclude.domains && objectDomains.length) {
      children.push(new Paragraph({ text: `Domains: ${objectDomains.map((d) => d.name).join(', ')}` }));
    }
    if (exportInclude.tags && objectTags.length) {
      children.push(new Paragraph({ text: `Tags: ${objectTags.map((t) => t.name).join(', ')}` }));
    }
    if (exportInclude.content && object.content) {
      children.push(new Paragraph({ text: 'Content', heading: HeadingLevel.HEADING_1 }));
      object.content.split(/\n/).forEach((line) => children.push(new Paragraph(line || ' ')));
    }
    if (exportInclude.links && (outgoingLinks.length || incomingLinks.length)) {
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
      addToast('error', err.message || 'Failed to share');
      setError(err.message || 'Failed to share');
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
      setError(err.message || 'Failed to revoke');
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
        <div className="detail-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setShowExportPanel((v) => !v)}>Export</button>
          {isOwner && (
            <button type="button" className="btn btn-secondary" onClick={() => { setShowSharePanel((v) => !v); if (!showSharePanel) loadShares(); }}>Share</button>
          )}
          {!editing ? (
            <>
              {canEdit && <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>Edit</button>}
              {isOwner && <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</button>}
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => { setEditing(false); setEditForm({ title: object.title, content: object.content || '', summary: object.summary || '' }); }}>Cancel</button>
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
          <div className="export-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowExportPanel(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleExport}>Export</button>
          </div>
        </section>
      )}

      <div className="detail-meta">
        <span className="detail-type" title={object.type}>
          <span className="detail-type-icon" aria-hidden="true">{OBJECT_TYPE_ICONS[object.type] ?? '📄'}</span>
          {object.type}
        </span>
        <span className="detail-updated">Updated {new Date(object.updated_at).toLocaleString()}</span>
        <span className="detail-version">v{object.current_version}</span>
      </div>
      {editing ? (
        <div className="detail-edit">
          <label>Title <input type="text" value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} required /></label>
          <label>Summary <textarea value={editForm.summary} onChange={(e) => setEditForm((f) => ({ ...f, summary: e.target.value }))} rows={2} /></label>
          <label>Content <textarea value={editForm.content} onChange={(e) => setEditForm((f) => ({ ...f, content: e.target.value }))} rows={12} /></label>
        </div>
      ) : (
        <>
          <h1 className="detail-title">{object.title}</h1>
          {object.source && <p className="detail-source">Source: {object.source}</p>}
          {object.summary && <p className="detail-summary">{object.summary}</p>}
          {object.content && <div className="detail-content">{object.content}</div>}
        </>
      )}

      <details className="detail-section detail-classification" open>
        <summary className="detail-section-summary">Domains</summary>
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
      </details>
      <details className="detail-section detail-classification" open>
        <summary className="detail-section-summary">Tags</summary>
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
      </details>

      <details className="detail-section detail-attachments">
        <summary className="detail-section-summary">Attachments</summary>
        <p className="links-desc">Files attached to this object (PDF, DOCX, TXT).</p>
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
          {attachedFiles.length === 0 && <li className="muted">No attachments yet.</li>}
        </ul>
        {isOwner && (
        <label className="attachment-upload">
          <input type="file" accept=".pdf,.docx,.doc,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={handleFileAttach} disabled={uploading} />
          {uploading ? 'Uploading…' : '+ Attach file (PDF, DOCX, TXT)'}
        </label>
        )}
      </details>

      {isOwner && (
      <details className="detail-section detail-prompts">
        <summary className="detail-section-summary">Run prompt</summary>
        <p className="links-desc">Run a Prompt Bank template on this object. Generate with AI or paste your own output.</p>
        <div className="run-prompt-row">
          <select value={runTemplateId} onChange={(e) => setRunTemplateId(e.target.value)} className="prompt-select">
            <option value="">Select template</option>
            {applicableTemplates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={handleRunPrompt} disabled={!runTemplateId}>
            Run
          </button>
        </div>
        {showRunPanel && runTemplateId && (
          <div className="run-output-panel">
            <label>Output</label>
            <textarea value={runOutput} onChange={(e) => setRunOutput(e.target.value)} rows={6} placeholder="Generate with AI or paste your own output…" />
            <div className="run-output-actions">
              <button type="button" className="btn btn-secondary" onClick={handleGenerateWithAI} disabled={generatingAI}>
                {generatingAI ? 'Generating…' : 'Generate with AI'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowRunPanel(false); setRunOutput(''); }}>Cancel</button>
              <button type="button" className="btn btn-secondary" onClick={handleSaveRun} disabled={savingRun}>Save run only</button>
              <button type="button" className="btn btn-primary" onClick={handleSaveOutputAsObject} disabled={savingRun || !runOutput.trim()}>
                {savingRun ? 'Saving…' : 'Save as new object'}
              </button>
            </div>
          </div>
        )}
        <h3 className="prompt-history-title">Prompt run history</h3>
        <ul className="prompt-runs-list">
          {promptRuns.map((r) => (
            <li key={r.id}>
              <span className="run-template-name">{promptTemplates.find((t) => t.id === r.prompt_template_id)?.name ?? 'Prompt'}</span>
              <span className="run-date">{new Date(r.created_at).toLocaleString()}</span>
              {r.output && <span className="run-snippet">{(r.output || '').slice(0, 80)}{(r.output || '').length > 80 ? '…' : ''}</span>}
            </li>
          ))}
          {promptRuns.length === 0 && <li className="muted">No runs yet.</li>}
        </ul>
      </details>
      )}

      <details className="detail-section detail-links">
        <summary className="detail-section-summary">Links (outgoing &amp; incoming)</summary>
        <h2 className="detail-subhead">Outgoing links</h2>
        <p className="links-desc">Objects this one references or relates to.</p>
        <ul className="links-list">
          {outgoingLinks.map((l) => (
            <li key={l.id}>
              <Link to={`/objects/${l.to_object_id}`}>{l.target?.title ?? l.to_object_id}</Link>
              <span className="link-type">{l.relationship_type}</span>
              {isOwner && <button type="button" className="chip-remove" onClick={() => removeLink(l.id, true)} aria-label="Remove link">×</button>}
            </li>
          ))}
          {outgoingLinks.length === 0 && <li className="muted">None yet.</li>}
        </ul>
        {isOwner && (suggestedLinkedObjects.length > 0 || availableToLink.length > 0) && (
          <div className="links-add">
            {suggestedLinkedObjects.filter((o) => !outgoingLinks.some((l) => l.to_object_id === o.id)).length > 0 && (
              <p className="links-suggested-label muted">Suggested (same domain/tag):</p>
            )}
            {suggestedLinkedObjects.filter((o) => !outgoingLinks.some((l) => l.to_object_id === o.id)).slice(0, 8).map((o) => (
              <button key={o.id} type="button" className="btn btn-secondary btn-small links-suggested-btn" onClick={() => addLink(o.id)}>
                + Link: {o.title}
              </button>
            ))}
            {availableToLink.length > 0 && (
              <select
                value=""
                onChange={(e) => { const v = e.target.value; if (v) addLink(v); e.target.value = ''; }}
              >
                <option value="">+ Link to any object</option>
                {availableToLink.map((o) => (
                  <option key={o.id} value={o.id}>{o.title} ({o.type})</option>
                ))}
              </select>
            )}
          </div>
        )}

        <h2>Incoming links</h2>
        <p className="links-desc">Objects that link to this one.</p>
        <ul className="links-list">
          {incomingLinks.map((l) => (
            <li key={l.id}>
              <Link to={`/objects/${l.from_object_id}`}>{l.source?.title ?? l.from_object_id}</Link>
              <span className="link-type">{l.relationship_type}</span>
              {isOwner && <button type="button" className="chip-remove" onClick={() => removeLink(l.id, false)} aria-label="Remove link">×</button>}
            </li>
          ))}
          {incomingLinks.length === 0 && <li className="muted">None yet.</li>}
        </ul>
      </details>

      <details className="detail-section version-history">
        <summary className="detail-section-summary">Version history</summary>
        {versions.length === 0 ? <p className="muted">No previous versions yet.</p> : (
          <ul>
            {versions.map((v) => (
              <li key={v.id}>
                <span className="version-num">v{v.version}</span>
                <span className="version-title">{v.title}</span>
                <span className="version-date">{new Date(v.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
