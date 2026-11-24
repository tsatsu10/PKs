import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../lib/errors';
import { logAudit } from '../lib/audit';
import { deliverWebhookEvent } from '../lib/webhooks';
import { createNotification } from '../lib/notifications';
import { getDraft, setDraft, clearDraft, DRAFT_KEYS } from '../lib/draftStorage';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../constants';
import { useToast } from '../components/ui/Toaster';
import { OBJECT_TYPES, OBJECT_STATUSES, formatObjectTypeLabel } from '../constants';
import { slugify } from '../lib/slugify';
import { useTaxonomy } from '../data/taxonomy';
import { useTemplatesList } from '../data/templates';
import { createObject } from '../data/createObject';
import { useQueryClient } from '@tanstack/react-query';
import QueryError from '../components/QueryError';
import BlockNoteEditor from '../components/BlockNoteEditor';
import { useMediaQuery } from '@mantine/hooks';
import Button, { ButtonLink } from '../components/ui/Button';
import Chip from '../components/ui/Chip';
import Combobox from '../components/ui/Combobox';
import Field from '../components/ui/Field';
import Input, { Textarea } from '../components/ui/Input';
import Select from '../components/ui/Select';
import './ObjectForm.css';

export default function ObjectNew() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const templateFromUrl = searchParams.get('template');
  const { addToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const taxonomy = useTaxonomy(user?.id ?? null);
  const { domains, tags } = taxonomy;
  const templatesQ = useTemplatesList(user?.id ?? null);
  const templates = useMemo(() => templatesQ.data ?? [], [templatesQ.data]);
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
      ? (typeof selectedTemplate.schema === 'string'
          ? (() => { try { return JSON.parse(selectedTemplate.schema || '{}'); } catch { return {}; } })()
          : selectedTemplate.schema)
      : null;
  const templateFields = schema?.fields || [];

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

  // Template values restored from a draft; the reset effect below must not wipe them.
  // Holds { templateId, values } so the reset effect only consumes it once
  // selectedTemplateId has actually caught up to the restored id — under
  // StrictMode's double-invoked effects, the reset effect can otherwise run
  // before the id state update commits and wipe the just-restored values.
  const restoredTemplateValuesRef = useRef(null);
  useEffect(() => {
    const restored = restoredTemplateValuesRef.current;
    if (restored) {
      if (restored.templateId === selectedTemplateId) {
        setTemplateValues(restored.values);
        restoredTemplateValuesRef.current = null;
        return;
      }
      if (selectedTemplateId) {
        // User (or a later render) moved on to a different template; the
        // stale restore no longer applies.
        restoredTemplateValuesRef.current = null;
      }
    }
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
    const hasTemplateInput = Object.values(draft.templateValues || {}).some((v) => String(v ?? '').trim());
    if (!draft.form.title?.trim() && !draft.form.content?.trim() && !hasTemplateInput) return;
    hasRestoredDraft.current = true;
    setForm((f) => ({ ...f, ...draft.form }));
    if (draft.templateValues && Object.keys(draft.templateValues).length) {
      if (draft.selectedTemplateId) {
        restoredTemplateValuesRef.current = { templateId: draft.selectedTemplateId, values: draft.templateValues };
      }
      setTemplateValues(draft.templateValues);
    }
    if (draft.selectedTemplateId) setSelectedTemplateId(draft.selectedTemplateId);
    addToast('success', 'Draft restored');
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
      const finalTitle = title || 'Untitled';
      const objectId = createObject({
        userId: user.id,
        row: {
          type: form.type,
          title: finalTitle,
          source: form.source.trim() || null,
          content,
          summary: summary || null,
          status: form.status || 'active',
          due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
          remind_at: form.remind_at ? new Date(form.remind_at).toISOString() : null,
          slug,
        },
        domainIds: form.domainIds,
        tagIds: form.tagIds,
        domains: domains.filter((d) => form.domainIds.includes(d.id)).map(({ id, name }) => ({ id, name })),
        tags: tags.filter((t) => form.tagIds.includes(t.id)).map(({ id, name }) => ({ id, name })),
        onCreated: (createdId) => {
          // The draft goes only once the row exists: a failed create must not lose what was typed.
          clearDraft(DRAFT_KEYS.new);
          logAudit(user.id, AUDIT_ACTIONS.OBJECT_CREATE, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, createdId, { title: finalTitle, type: form.type });
          deliverWebhookEvent('object.created', { objectId: createdId, title: finalTitle, type: form.type });
          createNotification(user.id, 'object_created', 'Object created', finalTitle.slice(0, 80), { type: 'knowledge_object', id: createdId });
        },
      }, queryClient);
      addToast('success', 'Object created');
      navigate(`/objects/${objectId}`, { replace: true });
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to create object');
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

  const narrow = useMediaQuery('(max-width: 767px)', false, { getInitialValueInEffect: false });
  const [editorHeight, setEditorHeight] = useState(560);
  useEffect(() => {
    // On a phone the properties and the submit bar follow the editor, so it starts short (M10).
    const updateHeight = () => setEditorHeight(narrow ? 192 : Math.max(520, (typeof window !== 'undefined' ? window.innerHeight : 800) - 340));
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [narrow]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const isBookmark = form.type === 'bookmark';
  const actions = (
    <>
      <ButtonLink to="/" variant="ghost">Cancel</ButtonLink>
      <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Creating…' : 'Create'}</Button>
    </>
  );
  const chipPicker = (kind, all, ids, available, add, remove) => all.length > 0 && (
    <div className="notion-prop notion-prop-chips">
      <span className="notion-prop-label">{kind === 'domain' ? 'Domains' : 'Tags'}</span>
      <div className="form-chips-row">
        {ids.map((id) => {
          const item = all.find((x) => x.id === id);
          return item ? <Chip key={id} onRemove={() => remove(id)} removeLabel={`Remove ${kind} ${item.name}`}>{item.name}</Chip> : null;
        })}
      </div>
      <Combobox
        label={`Add ${kind}`}
        labelHidden
        placeholder={`Add ${kind}…`}
        emptyText={available.length === 0 ? `No more ${kind}s to add` : undefined}
        options={available.map((x) => ({ value: x.id, label: x.name }))}
        onSelect={add}
      />
    </div>
  );
  const prop = (label, control) => (
    <Field label={label}>{(f) => control(f.id)}</Field>
  );
  // The same properties in the sidebar (free form) and in a row under template fields.
  const properties = (
    <>
      {prop('Type', (id) => (
        <Select id={id} value={form.type} onChange={set('type')} required>
          {OBJECT_TYPES.map((t) => <option key={t} value={t}>{formatObjectTypeLabel(t)}</option>)}
        </Select>
      ))}
      {prop('Status', (id) => (
        <Select id={id} value={form.status} onChange={set('status')}>
          {OBJECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      ))}
      {prop('Due date', (id) => <Input id={id} type="datetime-local" value={form.due_at} onChange={set('due_at')} />)}
      {prop('Remind at', (id) => <Input id={id} type="datetime-local" value={form.remind_at} onChange={set('remind_at')} />)}
      {chipPicker('domain', domains, form.domainIds, availableDomains, addDomain, removeDomain)}
      {chipPicker('tag', tags, form.tagIds, availableTags, addTag, removeTag)}
      {prop(isBookmark ? 'URL' : 'Source', (id) => (
        <Input id={id} type={isBookmark ? 'url' : 'text'} value={form.source} onChange={set('source')} placeholder={isBookmark ? 'https://…' : 'URL or reference'} />
      ))}
    </>
  );

  return (
    <div className="object-form-page notion-style">
      <form onSubmit={handleSubmit} className="object-form">
        {error && <div className="object-form-error" role="alert">{error}</div>}

        <header className="notion-form-header">
          <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'New' }]} />
          <div className="notion-form-toolbar">
            <Field label="Template">
              {(f) => (
                <Select id={f.id} value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
                  <option value="">Free form</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
              )}
            </Field>
            {!narrow && <div className="notion-form-toolbar-right">{actions}</div>}
          </div>
        </header>

        <div className="notion-form-body">
          {templateFields.length > 0 ? (
            <>
              <div className="template-driven-fields">
                {templateFields.map((f) => {
                  const label = f.label || f.key;
                  const value = templateValues[f.key] ?? '';
                  const change = (val) => setTemplateValues((v) => ({ ...v, [f.key]: val }));
                  if (f.type === 'textarea' && (f.key === 'content' || f.key === 'body')) {
                    return (
                      <div key={f.key} className="notion-field">
                        <span className="notion-field-label">{label}</span>
                        <BlockNoteEditor value={value} onChange={change} placeholder={label} minHeight={editorHeight} aria-label={label} />
                      </div>
                    );
                  }
                  return (
                    <Field key={f.key} label={f.required ? `${label} (required)` : label}>
                      {(ids) => f.type === 'textarea' ? (
                        <Textarea id={ids.id} value={value} onChange={(e) => change(e.target.value)} placeholder={label} rows={4} required={!!f.required} />
                      ) : f.type === 'select' ? (
                        <Select id={ids.id} value={value} onChange={(e) => change(e.target.value)} required={!!f.required}>
                          <option value="">—</option>
                          {(f.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </Select>
                      ) : (
                        <Input id={ids.id} type="text" value={value} onChange={(e) => change(e.target.value)} placeholder={label} required={!!f.required} />
                      )}
                    </Field>
                  );
                })}
              </div>
              <div className="notion-properties-row">{properties}</div>
            </>
          ) : (
            <div className="notion-form-layout">
              <div className="notion-form-main">
                <input
                  type="text"
                  className="notion-title-input"
                  value={form.title}
                  onChange={set('title')}
                  placeholder="Untitled"
                  required
                  aria-label="Title"
                />
                {isBookmark && (
                  <Field label="Bookmark URL">
                    {(f) => <Input id={f.id} type="url" value={form.source} onChange={set('source')} placeholder="https://…" />}
                  </Field>
                )}
                <input
                  type="text"
                  className="notion-summary-input"
                  value={form.summary}
                  onChange={set('summary')}
                  placeholder="Add a short summary…"
                  aria-label="Summary"
                />
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
                {properties}
                {taxonomy.error && (
                  <QueryError what="domains and tags" error={taxonomy.error} onRetry={taxonomy.refetch} />
                )}
                {!taxonomy.error && domains.length === 0 && tags.length === 0 && (
                  <p className="notion-hint"><Link to="/settings">Settings</Link> → Add domains and tags to classify objects.</p>
                )}
              </aside>
            </div>
          )}
        </div>

        {narrow && <div className="object-form-submit-bar">{actions}</div>}
      </form>
    </div>
  );
}
