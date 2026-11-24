import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Breadcrumbs from '../components/Breadcrumbs';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useNotifyError } from '../lib/useNotifyError';
import { useToast } from '../components/ui/Toaster';
import QueryError from '../components/QueryError';
import OptionsInput from '../components/OptionsInput';
import { useTemplatesList, invalidateTemplates } from '../data/templates';
import { Copy, LayoutTemplate, Plus, Trash2, X } from 'lucide-react';
import Button, { ButtonLink } from '../components/ui/Button';
import Card from '../components/ui/Card';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import Field from '../components/ui/Field';
import IconButton from '../components/ui/IconButton';
import Input from '../components/ui/Input';
import Page from '../components/ui/Page';
import Select from '../components/ui/Select';
import Spinner from '../components/ui/Spinner';
import './Templates.css';

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'select', label: 'Dropdown' },
];

const defaultSchema = {
  titleField: 'title',
  fields: [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'content', label: 'Content', type: 'textarea', required: false },
  ],
};

function getFieldCount(template) {
  const schema = template?.schema && typeof template.schema === 'object'
    ? template.schema
    : (typeof template?.schema === 'string' ? (() => { try { return JSON.parse(template.schema || '{}'); } catch { return {}; } })() : template?.schema) || {};
  return (schema.fields || []).length;
}

export default function Templates() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const notifyError = useNotifyError();
  const listQ = useTemplatesList(user?.id ?? null);
  const list = useMemo(() => listQ.data ?? [], [listQ.data]);
  const loading = listQ.isPending;
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(undefined);
  const [form, setForm] = useState({ name: '', description: '', schema: defaultSchema });
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [saving, setSaving] = useState(false);
  /** The form as it was when the editor opened, to tell whether anything changed. */
  const [baseline, setBaseline] = useState('');
  /** What to do once the user agrees to drop unsaved edits. */
  const [pendingAction, setPendingAction] = useState(null);

  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.trim().toLowerCase();
    return list.filter(
      (t) =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
    );
  }, [list, searchQuery]);

  function startEditing(id, next) {
    setEditingId(id);
    setForm(next);
    setBaseline(JSON.stringify(next));
  }

  function openNew() {
    startEditing('new', { name: '', description: '', schema: JSON.parse(JSON.stringify(defaultSchema)) });
    setError('');
  }

  function openEdit(t) {
    let schemaVal = defaultSchema;
    if (t.schema && typeof t.schema === 'object') {
      schemaVal = t.schema;
    } else if (t.schema) {
      try {
        schemaVal = JSON.parse(t.schema || JSON.stringify(defaultSchema));
      } catch {
        schemaVal = defaultSchema;
      }
    }
    startEditing(t.id, { name: t.name, description: t.description || '', schema: schemaVal });
    setError('');
  }

  function closeEditor() {
    setEditingId(undefined);
    setDeleteConfirmId(null);
  }

  function setSchemaField(updater) {
    setForm((f) => ({ ...f, schema: updater(f.schema) }));
  }

  function addField() {
    setSchemaField((s) => ({
      ...s,
      fields: [
        ...(s.fields || []),
        { key: `field_${Date.now()}`, label: 'New field', type: 'text', required: false },
      ],
    }));
  }

  function updateField(index, patch) {
    setSchemaField((s) => {
      const fields = [...(s.fields || [])];
      fields[index] = { ...fields[index], ...patch };
      return { ...s, fields };
    });
  }

  function removeField(index) {
    setSchemaField((s) => ({ ...s, fields: (s.fields || []).filter((_, i) => i !== index) }));
  }

  function validate() {
    const name = form.name.trim();
    if (!name) {
      setError('Template name is required.');
      return false;
    }
    const schema = form.schema || defaultSchema;
    const fields = schema.fields || [];
    const keys = new Set();
    for (const f of fields) {
      const k = (f.key || '').trim().toLowerCase().replace(/\s+/g, '_');
      if (!k) {
        setError('Every field must have a key.');
        return false;
      }
      if (keys.has(k)) {
        setError(`Duplicate field key: ${f.key}`);
        return false;
      }
      keys.add(k);
    }
    const titleField = (schema.titleField || '').trim();
    if (titleField && fields.length > 0) {
      const hasTitleField = fields.some(
        (f) => (f.key || '').trim().toLowerCase().replace(/\s+/g, '_') === titleField.toLowerCase().replace(/\s+/g, '_')
      );
      if (!hasTitleField) {
        setError('Title field must be one of the field keys.');
        return false;
      }
    }
    setError('');
    return true;
  }

  function sanitizeSchemaForDb(schemaObj) {
    const raw = schemaObj || defaultSchema;
    const titleField = (raw.titleField && String(raw.titleField).trim()) || 'title';
    const fields = (raw.fields || [])
      .map((f) => {
        const key = (f.key && String(f.key).trim()) || '';
        const field = {
          key,
          label: (f.label && String(f.label).trim()) || key || '',
          type: f.type === 'textarea' || f.type === 'select' ? f.type : 'text',
          required: !!f.required,
        };
        if (field.type === 'select' && Array.isArray(f.options)) {
          field.options = f.options.filter((o) => o != null && String(o).trim() !== '');
        } else if (field.type === 'select' && f.options) {
          const opts = typeof f.options === 'string' ? f.options.split(',').map((s) => s.trim()).filter(Boolean) : [];
          field.options = opts;
        }
        return field;
      })
      .filter((f) => f.key !== '');
    return { titleField, fields };
  }

  async function handleSave() {
    if (!user?.id) {
      setError('You must be signed in to save.');
      addToast('error', 'You must be signed in to save.');
      return;
    }
    if (!validate()) return;
    setError('');
    setSaving(true);
    try {
      const schemaForDb = sanitizeSchemaForDb(form.schema);
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        schema: schemaForDb,
      };
      if (editingId && editingId !== 'new') {
        const { error: err } = await supabase
          .from('templates')
          .update(payload)
          .eq('id', editingId)
          .eq('user_id', user.id);
        if (err) throw err;
        addToast('success', 'Template updated');
      } else {
        const { error: err } = await supabase
          .from('templates')
          .insert({ user_id: user.id, ...payload });
        if (err) throw err;
        addToast('success', 'Template created');
      }
      await invalidateTemplates(queryClient);
      closeEditor();
    } catch (e) {
      if (import.meta.env.DEV) console.error('Template save failed:', e);
      const msg = notifyError(e, 'Save failed');
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate(t) {
    setError('');
    try {
      const raw =
        t.schema && typeof t.schema === 'object'
          ? t.schema
          : (() => { try { return JSON.parse(t.schema || '{}'); } catch { return defaultSchema; } })();
      const schema = sanitizeSchemaForDb(raw);
      const { data, error: err } = await supabase
        .from('templates')
        .insert({
          user_id: user.id,
          name: `${t.name} (copy)`,
          description: t.description || null,
          schema,
        })
        .select()
        .single();
      if (err) throw err;
      await invalidateTemplates(queryClient);
      openEdit(data);
      addToast('success', 'Template duplicated');
    } catch (e) {
      const msg = notifyError(e, 'Duplicate failed');
      setError(msg);
      addToast('error', msg);
    }
  }

  async function handleDelete(id) {
    setError('');
    try {
      const { error: err } = await supabase
        .from('templates')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (err) throw err;
      await invalidateTemplates(queryClient);
      if (editingId === id) closeEditor();
      setDeleteConfirmId(null);
      addToast('success', 'Template deleted');
    } catch (e) {
      const msg = notifyError(e, 'Delete failed');
      setError(msg);
      addToast('error', msg);
    }
  }

  const schema = form.schema || defaultSchema;
  const fields = schema.fields || [];

  if (loading) {
    return (
      <Page title="Templates">
        <Spinner label="Loading templates" />
      </Page>
    );
  }

  const editing = editingId !== undefined;
  const dirty = editing && JSON.stringify(form) !== baseline;
  /** Run `action` now, or after the user agrees to drop unsaved edits. */
  const guard = (action) => {
    if (dirty) setPendingAction(() => action);
    else action();
  };

  return (
    <Page title="Templates" actions={<Button variant="primary" onClick={() => guard(openNew)}><Plus size={16} aria-hidden="true" />New template</Button>}>
      <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'Templates' }]} />
      <p className="templates-hero-desc">
        Guided forms for creating knowledge objects. Pick a template when creating a new object to
        get a structured form.
      </p>

      {error && <div className="templates-error" role="alert">{error}</div>}

      <div className="templates-layout">
        <aside className="templates-sidebar">
          {list.length > 0 && (
            <Field label="Search templates" labelHidden>
              {(f) => <Input id={f.id} type="search" placeholder="Search templates…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />}
            </Field>
          )}

          {listQ.error ? (
            <QueryError what="templates" error={listQ.error} onRetry={() => listQ.refetch()} />
          ) : list.length === 0 ? (
            <EmptyState
              icon={LayoutTemplate}
              title="No templates yet"
              description="Create a template to get a guided form when adding new objects—e.g. meeting notes, reports, or SOPs."
              action={<Button variant="primary" onClick={openNew}>Create your first template</Button>}
            />
          ) : (
            <ul className="templates-list">
              {filteredList.map((t) => (
                <li key={t.id} className={`templates-card${editingId === t.id ? ' templates-card-active' : ''}`}>
                  {/* The row's main button selects it; its actions are siblings, never nested (A7). */}
                  <button type="button" className="templates-card-main" aria-current={editingId === t.id ? 'true' : undefined} onClick={() => guard(() => openEdit(t))}>
                    <span className="templates-card-name">{t.name}</span>
                    <span className="templates-card-badge">{getFieldCount(t)} fields</span>
                    {t.description && <span className="templates-card-desc">{t.description}</span>}
                  </button>
                  <div className="templates-card-actions">
                    <ButtonLink to={`/objects/new?template=${t.id}`} size="sm" variant="ghost">Use template</ButtonLink>
                    <IconButton label={`Duplicate ${t.name}`} icon={Copy} iconSize={16} onClick={() => handleDuplicate(t)} />
                    <IconButton label={`Delete ${t.name}`} icon={Trash2} iconSize={16} onClick={() => setDeleteConfirmId(t.id)} />
                  </div>
                </li>
              ))}
              {filteredList.length === 0 && searchQuery.trim() && (
                <li className="templates-list-empty">No templates match “{searchQuery}”.</li>
              )}
            </ul>
          )}
        </aside>

        <div className="templates-main">
          {editing ? (
            <Card
              as="section"
              titleLevel={2}
              title={editingId === 'new' ? 'New template' : 'Edit template'}
              actions={
                <>
                  <Button variant="ghost" onClick={() => guard(closeEditor)} disabled={saving}>Cancel</Button>
                  <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
                </>
              }
            >
              <div className="templates-editor-sections">
                <Field label="Name">
                  {(f) => <Input id={f.id} type="text" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="e.g. Meeting note" required />}
                </Field>
                <Field label="Description (optional)">
                  {(f) => <Input id={f.id} type="text" value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} placeholder="Short description of when to use this template" />}
                </Field>

                <h3 className="templates-section-title">Form design</h3>
                <p className="templates-section-hint">Choose which field becomes the object title and define the form fields.</p>
                <details className="templates-example">
                  <summary>Example: what each property does</summary>
                  <dl className="templates-example-list">
                    <dt>Key</dt>
                    <dd>Internal name (e.g. <code>title</code>, <code>content</code>). Use <code>content</code> or <code>body</code> for the main text area. Lowercase, no spaces.</dd>
                    <dt>Label</dt>
                    <dd>Text shown on the form (e.g. &quot;Meeting title&quot;, &quot;Notes&quot;).</dd>
                    <dt>Type</dt>
                    <dd><strong>Text</strong> = single line. <strong>Long text</strong> = paragraph. <strong>Dropdown</strong> = select one option.</dd>
                    <dt>Required</dt>
                    <dd>If checked, the form won’t submit until this field has a value.</dd>
                    <dt>Options</dt>
                    <dd>Only for Dropdown: comma-separated choices (e.g. Draft, In review, Done).</dd>
                    <dt>Title field</dt>
                    <dd>Which field becomes the knowledge object’s title when you create an object from this template.</dd>
                  </dl>
                </details>
                <Field label="Title field">
                  {(f) => (
                    <Select id={f.id} value={schema.titleField} onChange={(e) => setSchemaField((s) => ({ ...s, titleField: e.target.value }))}>
                      {fields.map((fld) => <option key={fld.key} value={fld.key}>{fld.label || fld.key}</option>)}
                      {fields.length === 0 && <option value="title">title</option>}
                    </Select>
                  )}
                </Field>

                <div className="templates-fields-head">
                  <h3 className="templates-section-title" id="templates-fields-title">Fields</h3>
                  <Button size="sm" onClick={addField}><Plus size={16} aria-hidden="true" />Add field</Button>
                </div>
                {fields.length === 0 ? (
                  <p className="templates-fields-empty">No fields. Add one to define the form.</p>
                ) : (
                  <ul className="templates-fields-list" aria-labelledby="templates-fields-title">
                    {fields.map((fld, i) => {
                      const n = i + 1;
                      return (
                        <li key={i} className="templates-field-row">
                          <Input placeholder="Key, e.g. title" value={fld.key} onChange={(e) => updateField(i, { key: e.target.value })} aria-label={`Key for field ${n}`} />
                          <Input placeholder="Label, e.g. Title" value={fld.label} onChange={(e) => updateField(i, { label: e.target.value })} aria-label={`Label for field ${n}`} />
                          <Select value={fld.type} onChange={(e) => updateField(i, { type: e.target.value })} aria-label={`Type for field ${n}`}>
                            {FIELD_TYPES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                          </Select>
                          <label className="templates-checkbox">
                            <input type="checkbox" checked={!!fld.required} onChange={(e) => updateField(i, { required: e.target.checked })} />
                            <span>Required</span>
                          </label>
                          <IconButton label={`Remove field ${n}`} icon={X} iconSize={16} onClick={() => removeField(i)} />
                          {fld.type === 'select' && (
                            <OptionsInput
                              key={`${editingId}:${i}:${fld.key}`}
                              options={fld.options}
                              onCommit={(opts) => updateField(i, { options: opts })}
                              className="ui-input templates-field-options"
                              placeholder="Options, e.g. Draft, In review, Done"
                              ariaLabel={`Options for field ${n}`}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </Card>
          ) : (
            <EmptyState
              icon={LayoutTemplate}
              title={list.length === 0 ? 'Create a template to get started.' : 'Select a template to edit, or create a new one.'}
            />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pendingAction !== null}
        danger
        title="Discard your changes?"
        message="Your edits haven't been saved."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={() => { const action = pendingAction; setPendingAction(null); action?.(); }}
        onCancel={() => setPendingAction(null)}
      />
      <ConfirmDialog
        open={deleteConfirmId !== null}
        danger
        title="Delete this template?"
        message="This cannot be undone. Objects created with this template will not be affected."
        confirmLabel="Delete"
        onConfirm={() => handleDelete(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </Page>
  );
}
