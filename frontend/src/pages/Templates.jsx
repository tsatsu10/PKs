import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import './Templates.css';

const FIELD_TYPES = ['text', 'textarea', 'select'];

const defaultSchema = { titleField: 'title', fields: [{ key: 'title', label: 'Title', type: 'text', required: true }, { key: 'content', label: 'Content', type: 'textarea', required: false }] };

export default function Templates() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(undefined);
  const [form, setForm] = useState({ name: '', description: '', schema: defaultSchema });

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data, error: e } = await supabase.from('templates').select('*').eq('user_id', user.id).order('name');
      setList(e ? [] : (data || []));
      setLoading(false);
    })();
  }, [user?.id]);

  function openNew() {
    setEditingId('new');
    setForm({ name: '', description: '', schema: JSON.parse(JSON.stringify(defaultSchema)) });
  }

  function openEdit(t) {
    setEditingId(t.id);
    setForm({
      name: t.name,
      description: t.description || '',
      schema: t.schema && typeof t.schema === 'object' ? t.schema : JSON.parse(t.schema || JSON.stringify(defaultSchema)),
    });
  }

  function setSchemaField(updater) {
    setForm((f) => ({ ...f, schema: updater(f.schema) }));
  }

  function addField() {
    setSchemaField((s) => ({
      ...s,
      fields: [...(s.fields || []), { key: `field_${Date.now()}`, label: 'New field', type: 'text', required: false }],
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

  async function handleSave() {
    setError('');
    try {
      const payload = { name: form.name.trim(), description: form.description.trim() || null, schema: form.schema };
      if (editingId && editingId !== 'new') {
        const { error: err } = await supabase.from('templates').update(payload).eq('id', editingId).eq('user_id', user.id);
        if (err) throw err;
        setList((prev) => prev.map((t) => (t.id === editingId ? { ...t, ...payload } : t)));
      } else {
        const { data, error: err } = await supabase.from('templates').insert({ user_id: user.id, ...payload }).select().single();
        if (err) throw err;
        setList((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setEditingId(undefined);
    } catch (e) {
      setError(e.message || 'Save failed');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this template?')) return;
    setError('');
    try {
      const { error: err } = await supabase.from('templates').delete().eq('id', id).eq('user_id', user.id);
      if (err) throw err;
      setList((prev) => prev.filter((t) => t.id !== id));
      if (editingId === id) setEditingId(undefined);
    } catch (e) {
      setError(e.message || 'Delete failed');
    }
  }

  const schema = form.schema || defaultSchema;
  const fields = schema.fields || [];

  if (loading) return <div className="templates-page" id="main-content" role="main"><p role="status" aria-live="polite">Loading…</p></div>;

  return (
    <div className="templates-page" id="main-content" role="main">
      <header className="templates-header">
        <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'Templates' }]} />
        <h1>Templates</h1>
        <p className="templates-desc">Guided forms for creating knowledge objects. Use one when creating a new object.</p>
      </header>
      {error && <div className="form-error" role="alert">{error}</div>}

      <div className="templates-layout">
        <section className="template-list">
          <button type="button" className="btn btn-primary" onClick={openNew}>+ New template</button>
          <ul>
            {list.map((t) => (
              <li key={t.id}>
                <button type="button" className={`template-item ${editingId === t.id ? 'active' : ''}`} onClick={() => openEdit(t)}>
                  {t.name}
                </button>
                <button type="button" className="btn-small btn-danger" onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}>Delete</button>
              </li>
            ))}
            {list.length === 0 && <li className="muted">No templates yet.</li>}
          </ul>
        </section>

        <section className="template-editor">
          {(editingId === 'new' || editingId) && (
            <>
              <h2>{editingId === 'new' ? 'New template' : 'Edit template'}</h2>
              <div className="editor-form form">
                <label>Name <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Meeting note" required /></label>
                <label>Description <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional" /></label>
                <label>Title field (which field becomes the object title)</label>
                <select value={schema.titleField} onChange={(e) => setSchemaField((s) => ({ ...s, titleField: e.target.value }))}>
                  {fields.map((f) => <option key={f.key} value={f.key}>{f.label || f.key}</option>)}
                  {fields.length === 0 && <option value="title">title</option>}
                </select>
                <label>Fields</label>
                {fields.map((f, i) => (
                  <div key={i} className="field-block">
                    <div className="field-row">
                      <input placeholder="key" value={f.key} onChange={(e) => updateField(i, { key: e.target.value })} className="field-key" />
                      <input placeholder="label" value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} className="field-label" />
                      <select value={f.type} onChange={(e) => updateField(i, { type: e.target.value })}>
                        {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <label className="checkbox-label"><input type="checkbox" checked={!!f.required} onChange={(e) => updateField(i, { required: e.target.checked })} />Required</label>
                      <button type="button" className="btn-small btn-danger" onClick={() => removeField(i)}>×</button>
                    </div>
                    {f.type === 'select' && (
                      <input
                        type="text"
                        placeholder="Options (comma-separated)"
                        className="field-options"
                        value={Array.isArray(f.options) ? f.options.join(', ') : ''}
                        onChange={(e) => updateField(i, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                      />
                    )}
                  </div>
                ))}
                <button type="button" className="btn btn-secondary" onClick={addField}>+ Add field</button>
                <div className="editor-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setEditingId(undefined)}>Cancel</button>
                  <button type="button" className="btn btn-primary" onClick={handleSave}>Save</button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
