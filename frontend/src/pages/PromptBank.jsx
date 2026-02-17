import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { OBJECT_TYPES } from '../constants';
import './PromptBank.css';

const OUTPUT_FORMATS = ['text', 'markdown', 'json'];

export default function PromptBank() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(undefined); // undefined = none, null = new, string = edit
  const [form, setForm] = useState({
    name: '',
    description: '',
    applies_to_types: [],
    prompt_text: '',
    output_format: 'text',
  });

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data, error: e } = await supabase
        .from('prompt_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('name');
      setTemplates(e ? [] : (data || []));
      setLoading(false);
    })();
  }, [user?.id]);

  function openNew() {
    setEditingId('new');
    setForm({ name: '', description: '', applies_to_types: [], prompt_text: '', output_format: 'text' });
  }

  function openEdit(t) {
    setEditingId(t.id);
    setForm({
      name: t.name,
      description: t.description || '',
      applies_to_types: t.applies_to_types || [],
      prompt_text: t.prompt_text || '',
      output_format: t.output_format || 'text',
    });
  }

  function toggleAppliesTo(type) {
    setForm((f) => ({
      ...f,
      applies_to_types: f.applies_to_types.includes(type)
        ? f.applies_to_types.filter((x) => x !== type)
        : [...f.applies_to_types, type],
    }));
  }

  async function handleSave() {
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        applies_to_types: form.applies_to_types.length ? form.applies_to_types : [],
        prompt_text: form.prompt_text.trim(),
        output_format: form.output_format,
      };
      if (editingId && editingId !== 'new') {
        const { error: err } = await supabase.from('prompt_templates').update(payload).eq('id', editingId).eq('user_id', user.id);
        if (err) throw err;
        setTemplates((prev) => prev.map((t) => (t.id === editingId ? { ...t, ...payload } : t)));
      } else {
        const { data, error: err } = await supabase.from('prompt_templates').insert({ user_id: user.id, ...payload }).select().single();
        if (err) throw err;
        setTemplates((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setEditingId(undefined);
    } catch (e) {
      setError(e.message || 'Save failed');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this prompt template?')) return;
    setError('');
    try {
      const { error: err } = await supabase.from('prompt_templates').delete().eq('id', id).eq('user_id', user.id);
      if (err) throw err;
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (editingId === id) setEditingId(null);
    } catch (e) {
      setError(e.message || 'Delete failed');
    }
  }

  if (loading) return <div className="prompt-bank-page" id="main-content" role="main"><p role="status" aria-live="polite">Loading…</p></div>;

  return (
    <div className="prompt-bank-page" id="main-content" role="main">
      <header className="prompt-bank-header">
        <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'Prompt Bank' }]} />
        <h1>Prompt Bank</h1>
        <p className="prompt-bank-desc">Reusable prompt templates. Run them from any knowledge object.</p>
      </header>
      {error && <div className="form-error" role="alert">{error}</div>}

      <div className="prompt-bank-layout">
        <section className="prompt-list">
          <button type="button" className="btn btn-primary" onClick={openNew}>+ New prompt</button>
          <ul>
            {templates.map((t) => (
              <li key={t.id}>
                <button type="button" className={`prompt-item ${editingId === t.id ? 'active' : ''}`} onClick={() => openEdit(t)}>
                  <span className="prompt-item-name">{t.name}</span>
                  <span className="prompt-item-types">{(t.applies_to_types || []).length ? (t.applies_to_types || []).join(', ') : 'all types'}</span>
                </button>
                <button type="button" className="btn-small btn-danger" onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}>Delete</button>
              </li>
            ))}
            {templates.length === 0 && <li className="muted">No prompts yet. Create one to get started.</li>}
          </ul>
        </section>

        <section className="prompt-editor">
          {(editingId === 'new' || (editingId && editingId !== 'new')) && (
            <>
              <h2>{editingId === 'new' ? 'New prompt' : 'Edit prompt'}</h2>
              <div className="editor-form form">
                <label>Name <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Executive summary" required /></label>
                <label>Description <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional" /></label>
                <label>
                  Applies to object types (empty = all)
                  <div className="checkbox-group">
                    {OBJECT_TYPES.slice(0, 8).map((type) => (
                      <label key={type} className="checkbox-label">
                        <input type="checkbox" checked={form.applies_to_types.includes(type)} onChange={() => toggleAppliesTo(type)} />
                        {type}
                      </label>
                    ))}
                  </div>
                  <div className="checkbox-group">
                    {OBJECT_TYPES.slice(8).map((type) => (
                      <label key={type} className="checkbox-label">
                        <input type="checkbox" checked={form.applies_to_types.includes(type)} onChange={() => toggleAppliesTo(type)} />
                        {type}
                      </label>
                    ))}
                  </div>
                </label>
                <label>Output format <select value={form.output_format} onChange={(e) => setForm((f) => ({ ...f, output_format: e.target.value }))}>{OUTPUT_FORMATS.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
                <label>Prompt text <textarea value={form.prompt_text} onChange={(e) => setForm((f) => ({ ...f, prompt_text: e.target.value }))} placeholder="e.g. Summarize the key points of this document in 3 bullet points." rows={6} /></label>
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
