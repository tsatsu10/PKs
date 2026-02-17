import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { logAudit } from '../lib/audit';
import { deliverWebhookEvent } from '../lib/webhooks';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../constants';
import { useToast } from '../context/ToastContext';
import { OBJECT_TYPES } from '../constants';
import './ObjectForm.css';

export default function ObjectNew() {
  const { user } = useAuth();
  const navigate = useNavigate();
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

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const [dRes, tRes, tmplRes] = await Promise.all([
        supabase.from('domains').select('id, name').eq('user_id', user.id).order('name'),
        supabase.from('tags').select('id, name').eq('user_id', user.id).order('name'),
        supabase.from('templates').select('id, name, schema').eq('user_id', user.id).order('name'),
      ]);
      setDomains(dRes.data || []);
      setTags(tRes.data || []);
      setTemplates(tmplRes.data || []);
    })();
  }, [user?.id]);

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
      const { data, error: err } = await supabase
        .from('knowledge_objects')
        .insert({
          user_id: user.id,
          type: form.type,
          title: title || 'Untitled',
          source: form.source.trim() || null,
          content,
          summary: summary || null,
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
      addToast('success', 'Object created');
      navigate(`/objects/${objectId}`, { replace: true });
    } catch (err) {
      addToast('error', err.message || 'Failed to create object');
      setError(err.message || 'Failed to create object');
    } finally {
      setSaving(false);
    }
  }

  function toggleDomain(id) {
    setForm((f) => ({
      ...f,
      domainIds: f.domainIds.includes(id) ? f.domainIds.filter((x) => x !== id) : [...f.domainIds, id],
    }));
  }

  function toggleTag(id) {
    setForm((f) => ({
      ...f,
      tagIds: f.tagIds.includes(id) ? f.tagIds.filter((x) => x !== id) : [...f.tagIds, id],
    }));
  }

  return (
    <div className="object-form-page" id="main-content" role="main">
      <header className="object-form-header">
        <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'New object' }]} />
        <h1>New knowledge object</h1>
      </header>
      <form onSubmit={handleSubmit} className="object-form form">
        {error && <div className="form-error" role="alert">{error}</div>}
        <section className="object-form-templates-first" aria-label="Start from template">
          <h2 className="object-form-section-heading">Start from template</h2>
          <p className="object-form-section-desc">Use a template for guided structure, or create from scratch.</p>
          <div className="template-picker">
            <button type="button" className={`template-picker-option ${!selectedTemplateId ? 'active' : ''}`} onClick={() => setSelectedTemplateId('')}>
              Free form
            </button>
            {templates.map((t) => (
              <button key={t.id} type="button" className={`template-picker-option ${selectedTemplateId === t.id ? 'active' : ''}`} onClick={() => setSelectedTemplateId(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
        </section>
        {templateFields.length > 0 ? (
          <div className="template-driven-fields">
            {templateFields.map((f) => (
              <label key={f.key}>
                {f.label || f.key} {f.required && <span className="required">*</span>}
                {f.type === 'textarea' ? (
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
              </label>
            ))}
          </div>
        ) : (
          <>
            <label>
              Type
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                required
              >
                {OBJECT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              Title <span className="required">*</span>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Short title"
                required
              />
            </label>
            <label>
              Source
              <input
                type="text"
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                placeholder="URL or reference"
              />
            </label>
            <label>
              Summary
              <textarea
                value={form.summary}
                onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                placeholder="Brief summary"
                rows={2}
              />
            </label>
            <label>
              Content
              <textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Main content"
                rows={8}
              />
            </label>
          </>
        )}
        {templateFields.length > 0 && (
          <>
            <label>
              Type
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                required
              >
                {OBJECT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              Source
              <input
                type="text"
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                placeholder="URL or reference"
              />
            </label>
          </>
        )}
        {domains.length > 0 && (
          <label>
            Domains
            <div className="checkbox-group">
              {domains.map((d) => (
                <label key={d.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.domainIds.includes(d.id)}
                    onChange={() => toggleDomain(d.id)}
                  />
                  {d.name}
                </label>
              ))}
            </div>
          </label>
        )}
        {tags.length > 0 && (
          <label>
            Tags
            <div className="checkbox-group">
              {tags.map((t) => (
                <label key={t.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.tagIds.includes(t.id)}
                    onChange={() => toggleTag(t.id)}
                  />
                  {t.name}
                </label>
              ))}
            </div>
          </label>
        )}
        <div className="form-actions">
          <Link to="/" className="btn btn-secondary">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
