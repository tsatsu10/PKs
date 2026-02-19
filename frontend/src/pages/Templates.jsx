import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
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
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(undefined);
  const [form, setForm] = useState({ name: '', description: '', schema: defaultSchema });
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [saving, setSaving] = useState(false);

  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.trim().toLowerCase();
    return list.filter(
      (t) =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
    );
  }, [list, searchQuery]);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data, error: e } = await supabase
        .from('templates')
        .select('*')
        .eq('user_id', user.id)
        .order('name');
      setList(e ? [] : (data || []));
      setLoading(false);
    })();
  }, [user?.id]);

  function openNew() {
    setEditingId('new');
    setForm({ name: '', description: '', schema: JSON.parse(JSON.stringify(defaultSchema)) });
    setError('');
  }

  function openEdit(t) {
    setEditingId(t.id);
    setForm({
      name: t.name,
      description: t.description || '',
      schema:
        t.schema && typeof t.schema === 'object'
          ? t.schema
          : JSON.parse(t.schema || JSON.stringify(defaultSchema)),
    });
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
        setList((prev) => prev.map((t) => (t.id === editingId ? { ...t, ...payload } : t)));
        addToast('success', 'Template updated');
      } else {
        const { data, error: err } = await supabase
          .from('templates')
          .insert({ user_id: user.id, ...payload })
          .select()
          .single();
        if (err) throw err;
        setList((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        addToast('success', 'Template created');
      }
      closeEditor();
    } catch (e) {
      if (import.meta.env.DEV) console.error('Template save failed:', e);
      const msg =
        e?.message ?? e?.error_description ?? (typeof e === 'string' ? e : 'Save failed');
      setError(msg);
      addToast('error', msg);
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
      setList((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      openEdit(data);
      addToast('success', 'Template duplicated');
    } catch (e) {
      const msg =
        e?.message ?? e?.error_description ?? (typeof e === 'string' ? e : 'Duplicate failed');
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
      setList((prev) => prev.filter((t) => t.id !== id));
      if (editingId === id) closeEditor();
      setDeleteConfirmId(null);
      addToast('success', 'Template deleted');
    } catch (e) {
      const msg =
        e?.message ?? e?.error_description ?? (typeof e === 'string' ? e : 'Delete failed');
      setError(msg);
      addToast('error', msg);
    }
  }

  const schema = form.schema || defaultSchema;
  const fields = schema.fields || [];

  if (loading) {
    return (
      <div className="templates-page" id="main-content" role="main">
        <div className="templates-loading">
          <div className="templates-loading-spinner" aria-hidden="true" />
          <p role="status" aria-live="polite">
            Loading templates…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="templates-page" id="main-content" role="main">
      <header className="templates-hero">
        <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'Templates' }]} />
        <h1 className="templates-hero-title">Templates</h1>
        <p className="templates-hero-desc">
          Guided forms for creating knowledge objects. Pick a template when creating a new object to
          get a structured form.
        </p>
      </header>

      {error && (
        <div className="templates-error" role="alert">
          {error}
        </div>
      )}

      <div className="templates-layout">
        <aside className="templates-sidebar">
          <div className="templates-sidebar-actions">
            <button type="button" className="btn btn-primary templates-new-btn" onClick={openNew}>
              <span className="templates-new-icon" aria-hidden="true">+</span>
              New template
            </button>
            {list.length > 0 && (
              <div className="templates-search-wrap">
                <input
                  type="search"
                  className="templates-search"
                  placeholder="Search templates…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search templates"
                />
              </div>
            )}
          </div>

          {list.length === 0 ? (
            <div className="templates-empty-state">
              <div className="templates-empty-icon" aria-hidden="true">
                📋
              </div>
              <p className="templates-empty-title">No templates yet</p>
              <p className="templates-empty-desc">
                Create a template to get a guided form when adding new objects—e.g. meeting notes,
                reports, or SOPs.
              </p>
              <button type="button" className="btn btn-primary" onClick={openNew}>
                Create your first template
              </button>
            </div>
          ) : (
            <ul className="templates-list" role="list">
              {filteredList.map((t) => {
                const fieldCount = getFieldCount(t);
                const isActive = editingId === t.id;
                return (
                  <li key={t.id} className="templates-list-item">
                    <div
                      className={`templates-card ${isActive ? 'templates-card-active' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => openEdit(t)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openEdit(t);
                        }
                      }}
                      aria-pressed={isActive}
                    >
                      <div className="templates-card-head">
                        <span className="templates-card-name">{t.name}</span>
                        <span className="templates-card-badge">{fieldCount} fields</span>
                      </div>
                      {t.description && (
                        <p className="templates-card-desc">{t.description}</p>
                      )}
                      <div className="templates-card-actions">
                        <Link
                          to={`/objects/new?template=${t.id}`}
                          className="templates-card-use"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Use template
                        </Link>
                        <button
                          type="button"
                          className="templates-card-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicate(t);
                          }}
                          title="Duplicate"
                          aria-label="Duplicate template"
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          className="templates-card-action-btn templates-card-action-danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(t.id);
                          }}
                          title="Delete"
                          aria-label="Delete template"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
              {filteredList.length === 0 && searchQuery.trim() && (
                <li className="templates-list-empty">
                  <p>No templates match “{searchQuery}”.</p>
                </li>
              )}
            </ul>
          )}
        </aside>

        <main className="templates-main">
          {editingId === 'new' || editingId ? (
            <div className="templates-editor">
              <div className="templates-editor-header">
                <h2>{editingId === 'new' ? 'New template' : 'Edit template'}</h2>
                <div className="templates-editor-header-actions">
                  <button type="button" className="btn btn-ghost" onClick={closeEditor} disabled={saving}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>

              <div className="templates-editor-sections">
                <section className="templates-section">
                  <h3 className="templates-section-title">Basics</h3>
                  <div className="templates-section-fields">
                    <label className="templates-field">
                      <span className="templates-field-label">Name</span>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="e.g. Meeting note"
                        required
                      />
                    </label>
                    <label className="templates-field">
                      <span className="templates-field-label">Description (optional)</span>
                      <input
                        type="text"
                        value={form.description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        placeholder="Short description of when to use this template"
                      />
                    </label>
                  </div>
                </section>

                <section className="templates-section">
                  <h3 className="templates-section-title">Form design</h3>
                  <p className="templates-section-hint">
                    Choose which field becomes the object title and define the form fields.
                  </p>
                  <details className="templates-example">
                    <summary>Example: what each property does</summary>
                    <div className="templates-example-content">
                      <table className="templates-example-table">
                        <thead>
                          <tr>
                            <th>Property</th>
                            <th>Meaning</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr><td><strong>Key</strong></td><td>Internal name (e.g. <code>title</code>, <code>content</code>). Use <code>content</code> or <code>body</code> for the main text area. Lowercase, no spaces.</td></tr>
                          <tr><td><strong>Label</strong></td><td>Text shown on the form (e.g. &quot;Meeting title&quot;, &quot;Notes&quot;).</td></tr>
                          <tr><td><strong>Type</strong></td><td><strong>Text</strong> = single line. <strong>Long text</strong> = paragraph. <strong>Dropdown</strong> = select one option.</td></tr>
                          <tr><td><strong>Required</strong></td><td>If checked, the form won’t submit until this field has a value.</td></tr>
                          <tr><td><strong>Options</strong></td><td>Only for Dropdown: comma-separated choices (e.g. Draft, In review, Done).</td></tr>
                        </tbody>
                      </table>
                      <p className="templates-example-note">The <strong>Title field</strong> dropdown above picks which field becomes the knowledge object’s title when you create an object from this template.</p>
                    </div>
                  </details>
                  <label className="templates-field">
                    <span className="templates-field-label">Title field</span>
                    <select
                      value={schema.titleField}
                      onChange={(e) =>
                        setSchemaField((s) => ({ ...s, titleField: e.target.value }))
                      }
                    >
                      {fields.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label || f.key}
                        </option>
                      ))}
                      {fields.length === 0 && <option value="title">title</option>}
                    </select>
                  </label>

                  <div className="templates-fields-block">
                    <div className="templates-fields-head">
                      <span className="templates-field-label">Fields</span>
                      <button type="button" className="btn btn-secondary btn-small" onClick={addField}>
                        + Add field
                      </button>
                    </div>
                    <p className="templates-fields-legend">
                      Each field becomes a form input when creating an object. <strong>Key</strong> is the internal name; <strong>Label</strong> is what users see. Use <strong>key</strong> <code>content</code> or <code>body</code> for the main text area.
                    </p>
                    {fields.length === 0 ? (
                      <p className="templates-fields-empty">No fields. Add one to define the form.</p>
                    ) : (
                      <>
                        <div className="templates-fields-header-row" aria-hidden="true">
                          <span className="templates-fields-th templates-fields-th-key">Key</span>
                          <span className="templates-fields-th templates-fields-th-label">Label</span>
                          <span className="templates-fields-th templates-fields-th-type">Type</span>
                          <span className="templates-fields-th templates-fields-th-required">Required</span>
                          <span className="templates-fields-th templates-fields-th-action" />
                        </div>
                        <ul className="templates-fields-list">
                          {fields.map((f, i) => (
                            <li key={i} className="templates-field-row">
                              <div className="templates-field-row-inputs">
                                <input
                                  placeholder="e.g. title"
                                  value={f.key}
                                  onChange={(e) => updateField(i, { key: e.target.value })}
                                  className="templates-field-key"
                                  title="Internal name (lowercase, no spaces)"
                                  aria-label="Field key"
                                />
                                <input
                                  placeholder="e.g. Title"
                                  value={f.label}
                                  onChange={(e) => updateField(i, { label: e.target.value })}
                                  className="templates-field-label-input"
                                  title="Shown to users on the form"
                                  aria-label="Field label"
                                />
                                <select
                                  value={f.type}
                                  onChange={(e) => updateField(i, { type: e.target.value })}
                                  className="templates-field-type"
                                  aria-label="Field type"
                                  title="Text = one line, Long text = paragraph, Dropdown = select one"
                                >
                                  {FIELD_TYPES.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                  </option>
                                  ))}
                                </select>
                                <label className="templates-checkbox" title="Form won't submit until filled">
                                  <input
                                    type="checkbox"
                                    checked={!!f.required}
                                    onChange={(e) => updateField(i, { required: e.target.checked })}
                                    aria-label="Required"
                                  />
                                  <span>Required</span>
                                </label>
                                <button
                                  type="button"
                                  className="templates-field-remove"
                                  onClick={() => removeField(i)}
                                  aria-label="Remove field"
                                >
                                  ×
                                </button>
                              </div>
                              {f.type === 'select' && (
                                <div className="templates-field-options-wrap">
                                  <span className="templates-field-options-label">Options (comma-separated)</span>
                                  <input
                                    type="text"
                                    placeholder="e.g. Draft, In review, Done"
                                    className="templates-field-options"
                                    value={Array.isArray(f.options) ? f.options.join(', ') : ''}
                                    onChange={(e) =>
                                      updateField(i, {
                                        options: e.target.value
                                          .split(',')
                                          .map((s) => s.trim())
                                          .filter(Boolean),
                                      })
                                    }
                                    aria-label="Dropdown options"
                                  />
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                </section>
              </div>
            </div>
          ) : (
            <div className="templates-welcome">
              <div className="templates-welcome-icon" aria-hidden="true">
                ✨
              </div>
              <p className="templates-welcome-text">
                {list.length === 0
                  ? 'Create a template to get started.'
                  : 'Select a template to edit, or create a new one.'}
              </p>
              {list.length > 0 && (
                <button type="button" className="btn btn-secondary" onClick={openNew}>
                  New template
                </button>
              )}
            </div>
          )}
        </main>
      </div>

      {deleteConfirmId && (
        <div
          className="templates-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="templates-delete-title"
        >
          <div className="templates-modal">
            <h2 id="templates-delete-title">Delete this template?</h2>
            <p className="templates-modal-desc">
              This cannot be undone. Objects created with this template will not be affected.
            </p>
            <div className="templates-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteConfirmId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => handleDelete(deleteConfirmId)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
