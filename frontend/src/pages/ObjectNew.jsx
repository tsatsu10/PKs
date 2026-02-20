import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { logAudit } from '../lib/audit';
import { deliverWebhookEvent } from '../lib/webhooks';
import { createNotification } from '../lib/notifications';
import { getDraft, setDraft, clearDraft, DRAFT_KEYS } from '../lib/draftStorage';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../constants';
import { useToast } from '../context/ToastContext';
import { OBJECT_TYPES, OBJECT_STATUSES } from '../constants';
import { slugify } from '../lib/slugify';
import BlockNoteEditor from '../components/BlockNoteEditor';
import './ObjectForm.css';

export default function ObjectNew() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const templateFromUrl = searchParams.get('template');
  const { addToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [domains, setDomains] = useState([]);
  const [tags, setTags] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateValues, setTemplateValues] = useState({});
  const [form, setForm] = useState({
    type: 'note',
    title: '',
    source: '',
    content: '',
    summary: '',
    status: 'active',
    due_at: '',
    remind_at: '',
    domainIds: [],
    tagIds: [],
  });

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const schema = selectedTemplate?.schema && typeof selectedTemplate.schema === 'object'
    ? selectedTemplate.schema
    : selectedTemplate?.schema
      ? (typeof selectedTemplate.schema === 'string' ? JSON.parse(selectedTemplate.schema || '{}') : selectedTemplate.schema)
      : null;
  const templateFields = schema?.fields || [];

  const fetchDomainsTagsTemplates = useCallback(async () => {
    if (!user?.id) return;
    const [dRes, tRes, tmplRes] = await Promise.all([
      supabase.from('domains').select('id, name').eq('user_id', user.id).order('name'),
      supabase.from('tags').select('id, name').eq('user_id', user.id).order('name'),
      supabase.from('templates').select('id, name, schema').eq('user_id', user.id).order('name'),
    ]);
    setDomains(dRes.data || []);
    setTags(tRes.data || []);
    setTemplates(tmplRes.data || []);
  }, [user?.id]);

  useEffect(() => {
    fetchDomainsTagsTemplates();
  }, [fetchDomainsTagsTemplates]);

  // Pre-select template from URL ?template=<id>
  const hasAppliedTemplateUrl = useRef(false);
  useEffect(() => {
    if (!templateFromUrl || !templates.length || hasAppliedTemplateUrl.current) return;
    const exists = templates.some((t) => t.id === templateFromUrl);
    if (exists) {
      setSelectedTemplateId(templateFromUrl);
      hasAppliedTemplateUrl.current = true;
    }
  }, [templateFromUrl, templates]);

  // Refetch when user returns to this tab (e.g. after adding domains/tags in Settings in another tab)
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') fetchDomainsTagsTemplates();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchDomainsTagsTemplates]);

  useEffect(() => {
    if (!schema?.fields?.length) {
      setTemplateValues({});
      return;
    }
    const initial = {};
    schema.fields.forEach((f) => { initial[f.key] = ''; });
    setTemplateValues(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset form when template selection changes only
  }, [selectedTemplateId]);

  const hasRestoredDraft = useRef(false);
  useEffect(() => {
    if (hasRestoredDraft.current) return;
    const draft = getDraft(DRAFT_KEYS.new);
    if (!draft?.form) return;
    if (!draft.form.title?.trim() && !draft.form.content?.trim()) return;
    hasRestoredDraft.current = true;
    setForm((f) => ({ ...f, ...draft.form }));
    if (draft.selectedTemplateId) setSelectedTemplateId(draft.selectedTemplateId);
    if (draft.templateValues && Object.keys(draft.templateValues).length) setTemplateValues(draft.templateValues);
    addToast('Draft restored');
  }, [addToast]);

  const draftTimerRef = useRef(null);
  useEffect(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      setDraft(DRAFT_KEYS.new, { form, selectedTemplateId, templateValues });
    }, 500);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [form, selectedTemplateId, templateValues]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      let title = form.title.trim();
      let content = form.content.trim() || null;
      let summary = form.summary.trim() || null;
      if (selectedTemplateId && schema) {
        title = String(templateValues[schema.titleField] ?? '').trim() || title;
        const contentVal = templateValues.content ?? templateValues.body;
        if (contentVal) content = String(contentVal).trim();
        const summaryVal = templateValues.summary;
        if (summaryVal) summary = String(summaryVal).trim();
        if (!content && templateFields.length > 0) {
          const parts = templateFields
            .filter((f) => f.key !== schema.titleField && (templateValues[f.key] ?? '').toString().trim())
            .map((f) => `${f.label || f.key}:\n${(templateValues[f.key] ?? '').toString().trim()}`);
          if (parts.length) content = parts.join('\n\n');
        }
      }
      const baseSlug = slugify(title || 'Untitled') || 'untitled';
      const slug = baseSlug ? `${baseSlug}-${Date.now().toString(36)}` : `untitled-${Date.now().toString(36)}`;
      const { data, error: err } = await supabase
        .from('knowledge_objects')
        .insert({
          user_id: user.id,
          type: form.type,
          title: title || 'Untitled',
          source: form.source.trim() || null,
          content,
          summary: summary || null,
          status: form.status || 'active',
          due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
          remind_at: form.remind_at ? new Date(form.remind_at).toISOString() : null,
          slug,
        })
        .select('id')
        .single();
      if (err) throw err;
      const objectId = data.id;
      if (form.domainIds?.length) {
        await supabase.from('knowledge_object_domains').insert(
          form.domainIds.map((domain_id) => ({ knowledge_object_id: objectId, domain_id }))
        );
      }
      if (form.tagIds?.length) {
        await supabase.from('knowledge_object_tags').insert(
          form.tagIds.map((tag_id) => ({ knowledge_object_id: objectId, tag_id }))
        );
      }
      logAudit(user.id, AUDIT_ACTIONS.OBJECT_CREATE, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, objectId, { title: title || 'Untitled', type: form.type });
      deliverWebhookEvent('object.created', { objectId, title: title || 'Untitled', type: form.type });
      createNotification(user.id, 'object_created', 'Object created', (title || 'Untitled').slice(0, 80), { type: 'knowledge_object', id: objectId });
      addToast('success', 'Object created');
      clearDraft(DRAFT_KEYS.new);
      navigate(`/objects/${objectId}`, { replace: true });
    } catch (err) {
      const msg = err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Failed to create object');
      addToast('error', msg);
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  function addDomain(id) {
    if (id && !form.domainIds.includes(id)) setForm((f) => ({ ...f, domainIds: [...f.domainIds, id] }));
  }

  function removeDomain(id) {
    setForm((f) => ({ ...f, domainIds: f.domainIds.filter((x) => x !== id) }));
  }

  function addTag(id) {
    if (id && !form.tagIds.includes(id)) setForm((f) => ({ ...f, tagIds: [...f.tagIds, id] }));
  }

  function removeTag(id) {
    setForm((f) => ({ ...f, tagIds: f.tagIds.filter((x) => x !== id) }));
  }

  const availableDomains = domains.filter((d) => !form.domainIds.includes(d.id));
  const availableTags = tags.filter((t) => !form.tagIds.includes(t.id));

  const [editorHeight, setEditorHeight] = useState(560);
  useEffect(() => {
    const updateHeight = () => setEditorHeight(Math.max(520, (typeof window !== 'undefined' ? window.innerHeight : 800) - 340));
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  return (
    <div className="object-form-page notion-style" id="main-content" role="main">
      <form onSubmit={handleSubmit} className="object-form form">
        {error && <div className="form-error" role="alert">{error}</div>}

        <header className="notion-form-header">
          <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'New' }]} />
          <div className="notion-form-toolbar">
            <div className="notion-form-toolbar-left">
              <label className="notion-form-template-label" htmlFor="object-form-template-select">
                Template
              </label>
              <select
                id="object-form-template-select"
                className="template-select"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                aria-label="Choose template"
              >
                <option value="">Free form</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="notion-form-toolbar-right">
              <Link to="/" className="btn btn-ghost">Cancel</Link>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </header>

        <div className="notion-form-body">
          {templateFields.length > 0 ? (
            <div className="template-driven-fields">
              {templateFields.map((f) => {
                const isBlockNote = f.type === 'textarea' && (f.key === 'content' || f.key === 'body');
                const Wrapper = isBlockNote ? 'div' : 'label';
                return (
                  <Wrapper key={f.key} className="notion-field">
                    <span className="notion-field-label">{f.label || f.key} {f.required && <span className="required">*</span>}</span>
                    {isBlockNote ? (
                      <BlockNoteEditor
                        value={templateValues[f.key] ?? ''}
                        onChange={(val) => setTemplateValues((v) => ({ ...v, [f.key]: val }))}
                        placeholder={f.label || f.key}
                        minHeight={editorHeight}
                        aria-label={f.label || f.key}
                      />
                    ) : f.type === 'textarea' ? (
                      <textarea
                        value={templateValues[f.key] ?? ''}
                        onChange={(e) => setTemplateValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        placeholder={f.label || f.key}
                        rows={4}
                        required={!!f.required}
                      />
                    ) : f.type === 'select' ? (
                      <select
                        value={templateValues[f.key] ?? ''}
                        onChange={(e) => setTemplateValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        required={!!f.required}
                      >
                        <option value="">—</option>
                        {(f.options || []).map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={templateValues[f.key] ?? ''}
                        onChange={(e) => setTemplateValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        placeholder={f.label || f.key}
                        required={!!f.required}
                      />
                    )}
                  </Wrapper>
                );
              })}
            </div>
          ) : (
            <div className="notion-form-layout">
              <div className="notion-form-main">
                <div className="notion-title-block">
                  <input
                    type="text"
                    className="notion-title-input"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Untitled"
                    required
                    aria-label="Title"
                  />
                </div>

                {form.type === 'bookmark' && (
                  <div className="notion-bookmark-url-block">
                    <label className="notion-bookmark-url-label">URL</label>
                    <input
                      type="url"
                      className="notion-bookmark-url-input"
                      value={form.source}
                      onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                      placeholder="https://…"
                      aria-label="Bookmark URL"
                    />
                  </div>
                )}

                <div className="notion-summary-block">
                  <input
                    type="text"
                    className="notion-summary-input"
                    value={form.summary}
                    onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                    placeholder="Add a short summary…"
                    aria-label="Summary"
                  />
                </div>

                <div className="notion-content-block">
                  <BlockNoteEditor
                    value={form.content}
                    onChange={(val) => setForm((f) => ({ ...f, content: val }))}
                    placeholder="Write your content… (press / for commands)"
                    minHeight={editorHeight}
                    aria-label="Content"
                  />
                </div>
              </div>

              <aside className="notion-form-sidebar" aria-label="Properties">
                <div className="notion-sidebar-props">
                  <div className="notion-prop">
                    <span className="notion-prop-label">Type</span>
                    <select
                      value={form.type}
                      onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                      className="notion-prop-select"
                      aria-label="Type"
                    >
                      {OBJECT_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div className="notion-prop">
                    <span className="notion-prop-label">Status</span>
                    <select
                      value={form.status}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                      className="notion-prop-select"
                      aria-label="Status"
                    >
                      {OBJECT_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="notion-prop">
                    <span className="notion-prop-label">Due date</span>
                    <input type="datetime-local" value={form.due_at} onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))} className="notion-prop-input" aria-label="Due date" />
                  </div>
                  <div className="notion-prop">
                    <span className="notion-prop-label">Remind at</span>
                    <input type="datetime-local" value={form.remind_at} onChange={(e) => setForm((f) => ({ ...f, remind_at: e.target.value }))} className="notion-prop-input" aria-label="Remind at" />
                  </div>
                  <div className={`notion-prop notion-prop-source ${form.type === 'bookmark' ? 'notion-prop-bookmark-url' : ''}`}>
                    <span className="notion-prop-label">{form.type === 'bookmark' ? 'URL' : 'Source'}</span>
                    <input
                      type={form.type === 'bookmark' ? 'url' : 'text'}
                      value={form.source}
                      onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                      placeholder={form.type === 'bookmark' ? 'https://…' : 'URL or reference'}
                      className="notion-prop-input"
                      aria-label={form.type === 'bookmark' ? 'Bookmark URL' : 'Source'}
                    />
                  </div>
                  {domains.length > 0 && (
                    <div className="notion-prop notion-prop-chips">
                      <span className="notion-prop-label">Domains</span>
                      <div className="form-chips-row">
                        {form.domainIds.map((id) => {
                          const d = domains.find((x) => x.id === id);
                          return d ? (
                            <span key={d.id} className="chip">
                              {d.name}
                              <button type="button" className="chip-remove" onClick={() => removeDomain(d.id)} aria-label={`Remove ${d.name}`}>×</button>
                            </span>
                          ) : null;
                        })}
                        <select
                          className="chip-select"
                          value=""
                          onChange={(e) => { const v = e.target.value; if (v) addDomain(v); e.target.value = ''; }}
                          aria-label="Add domain"
                        >
                          <option value="">+ Domain</option>
                          {availableDomains.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                  {tags.length > 0 && (
                    <div className="notion-prop notion-prop-chips">
                      <span className="notion-prop-label">Tags</span>
                      <div className="form-chips-row">
                        {form.tagIds.map((id) => {
                          const t = tags.find((x) => x.id === id);
                          return t ? (
                            <span key={t.id} className="chip">
                              {t.name}
                              <button type="button" className="chip-remove" onClick={() => removeTag(t.id)} aria-label={`Remove ${t.name}`}>×</button>
                            </span>
                          ) : null;
                        })}
                        <select
                          className="chip-select"
                          value=""
                          onChange={(e) => { const v = e.target.value; if (v) addTag(v); e.target.value = ''; }}
                          aria-label="Add tag"
                        >
                          <option value="">+ Tag</option>
                          {availableTags.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                  {domains.length === 0 && tags.length === 0 && (
                    <p className="form-hint notion-hint"><Link to="/settings">Settings</Link> → Add domains and tags to classify objects.</p>
                  )}
                </div>
              </aside>
            </div>
          )}

          {templateFields.length > 0 && (
            <div className="notion-properties-row">
              <div className="notion-prop">
                <span className="notion-prop-label">Type</span>
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="notion-prop-select" required>
                  {OBJECT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="notion-prop">
                <span className="notion-prop-label">Status</span>
                <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="notion-prop-select">
                  {OBJECT_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="notion-prop">
                <span className="notion-prop-label">Due date</span>
                <input type="datetime-local" value={form.due_at} onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))} className="notion-prop-input" aria-label="Due date" />
              </div>
              <div className="notion-prop">
                <span className="notion-prop-label">Remind at</span>
                <input type="datetime-local" value={form.remind_at} onChange={(e) => setForm((f) => ({ ...f, remind_at: e.target.value }))} className="notion-prop-input" aria-label="Remind at" />
              </div>
              <div className={`notion-prop notion-prop-source ${form.type === 'bookmark' ? 'notion-prop-bookmark-url' : ''}`}>
                <span className="notion-prop-label">{form.type === 'bookmark' ? 'URL' : 'Source'}</span>
                <input type={form.type === 'bookmark' ? 'url' : 'text'} value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} placeholder={form.type === 'bookmark' ? 'https://…' : 'URL or reference'} className="notion-prop-input" aria-label={form.type === 'bookmark' ? 'Bookmark URL' : 'Source'} />
              </div>
              {domains.length > 0 && (
                <div className="notion-prop notion-prop-chips">
                  <span className="notion-prop-label">Domains</span>
                  <div className="form-chips-row">
                    {form.domainIds.map((id) => {
                      const d = domains.find((x) => x.id === id);
                      return d ? (
                        <span key={d.id} className="chip">
                          {d.name}
                          <button type="button" className="chip-remove" onClick={() => removeDomain(d.id)} aria-label={`Remove ${d.name}`}>×</button>
                        </span>
                      ) : null;
                    })}
                    <select className="chip-select" value="" onChange={(e) => { const v = e.target.value; if (v) addDomain(v); e.target.value = ''; }} aria-label="Add domain">
                      <option value="">+ Domain</option>
                      {availableDomains.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              {tags.length > 0 && (
                <div className="notion-prop notion-prop-chips">
                  <span className="notion-prop-label">Tags</span>
                  <div className="form-chips-row">
                    {form.tagIds.map((id) => {
                      const t = tags.find((x) => x.id === id);
                      return t ? (
                        <span key={t.id} className="chip">
                          {t.name}
                          <button type="button" className="chip-remove" onClick={() => removeTag(t.id)} aria-label={`Remove ${t.name}`}>×</button>
                        </span>
                      ) : null;
                    })}
                    <select className="chip-select" value="" onChange={(e) => { const v = e.target.value; if (v) addTag(v); e.target.value = ''; }} aria-label="Add tag">
                      <option value="">+ Tag</option>
                      {availableTags.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
