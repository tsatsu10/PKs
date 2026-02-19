import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { OBJECT_TYPES, RUN_PROMPT_STORAGE_KEY } from '../constants';
import './PromptBank.css';
const OUTPUT_FORMATS = ['text', 'markdown', 'json'];

export default function PromptBank() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(undefined);
  const [form, setForm] = useState({
    name: '',
    description: '',
    applies_to_types: [],
    tags: [],
    prompt_text: '',
    output_format: 'text',
  });
  const [tagInput, setTagInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [saving, setSaving] = useState(false);

  const allTags = useMemo(() => {
    const set = new Set();
    templates.forEach((t) => (t.tags || []).forEach((tag) => tag && set.add(tag.trim())));
    return Array.from(set).sort();
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    let list = templates;
    if (tagFilter) {
      list = list.filter((t) => (t.tags || []).some((tag) => (tag || '').trim() === tagFilter));
    }
    if (!searchQuery.trim()) return list;
    const q = searchQuery.trim().toLowerCase();
    return list.filter(
      (t) =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        (t.prompt_text || '').toLowerCase().includes(q) ||
        (t.tags || []).some((tag) => (tag || '').toLowerCase().includes(q))
    );
  }, [templates, searchQuery, tagFilter]);

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
    setForm({ name: '', description: '', applies_to_types: [], tags: [], prompt_text: '', output_format: 'text' });
    setTagInput('');
    setError('');
  }

  function openEdit(t) {
    setEditingId(t.id);
    setForm({
      name: t.name,
      description: t.description || '',
      applies_to_types: t.applies_to_types || [],
      tags: Array.isArray(t.tags) ? t.tags.filter(Boolean) : [],
      prompt_text: t.prompt_text || '',
      output_format: t.output_format || 'text',
    });
    setTagInput('');
    setError('');
  }

  function addTag() {
    const tag = tagInput.trim();
    if (!tag || form.tags.includes(tag)) return;
    setForm((f) => ({ ...f, tags: [...f.tags, tag].sort() }));
    setTagInput('');
  }

  function removeTag(tag) {
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));
  }

  function closeEditor() {
    setEditingId(undefined);
    setDeleteConfirmId(null);
  }

  function toggleAppliesTo(type) {
    setForm((f) => ({
      ...f,
      applies_to_types: f.applies_to_types.includes(type)
        ? f.applies_to_types.filter((x) => x !== type)
        : [...f.applies_to_types, type],
    }));
  }

  async function handleCopyPrompt(t) {
    if (!t?.prompt_text) return;
    try {
      await navigator.clipboard.writeText(t.prompt_text);
      addToast('success', 'Prompt copied to clipboard');
    } catch {
      addToast('error', 'Could not copy');
    }
  }

  function handleUseOnObject(t) {
    try {
      sessionStorage.setItem(
        RUN_PROMPT_STORAGE_KEY,
        JSON.stringify({ id: t.id, name: t.name })
      );
      navigate('/');
      addToast('success', `Open an object and use "Run prompt" to run "${t.name}"`);
    } catch {
      addToast('error', 'Could not set prompt');
    }
  }

  async function handleSave() {
    setError('');
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        applies_to_types: form.applies_to_types.length ? form.applies_to_types : [],
        tags: (form.tags || []).map((t) => t.trim()).filter(Boolean),
        prompt_text: form.prompt_text.trim(),
        output_format: form.output_format,
      };
      if (editingId && editingId !== 'new') {
        const { error: err } = await supabase
          .from('prompt_templates')
          .update(payload)
          .eq('id', editingId)
          .eq('user_id', user.id);
        if (err) throw err;
        setTemplates((prev) => prev.map((t) => (t.id === editingId ? { ...t, ...payload } : t)));
        addToast('success', 'Prompt updated');
      } else {
        const { data, error: err } = await supabase
          .from('prompt_templates')
          .insert({ user_id: user.id, ...payload })
          .select()
          .single();
        if (err) throw err;
        setTemplates((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        addToast('success', 'Prompt saved');
      }
      closeEditor();
    } catch (e) {
      const msg = e?.message ?? e?.error_description ?? (typeof e === 'string' ? e : 'Save failed');
      setError(msg);
      addToast('error', msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    setError('');
    try {
      const { error: err } = await supabase
        .from('prompt_templates')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (err) throw err;
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (editingId === id) closeEditor();
      setDeleteConfirmId(null);
      addToast('success', 'Prompt deleted');
    } catch (e) {
      const msg = e?.message ?? e?.error_description ?? (typeof e === 'string' ? e : 'Delete failed');
      setError(msg);
      addToast('error', msg);
    }
  }

  const emptyListMessage =
    tagFilter && searchQuery.trim()
      ? `No prompts match "${searchQuery}" and tag "${tagFilter}".`
      : tagFilter
        ? `No prompts with tag "${tagFilter}".`
        : `No prompts match "${searchQuery}".`;

  if (loading) {
    return (
      <div className="prompt-bank-page" id="main-content" role="main">
        <div className="prompt-bank-loading">
          <div className="prompt-bank-spinner" aria-hidden="true" />
          <p role="status" aria-live="polite">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="prompt-bank-page" id="main-content" role="main">
      <header className="prompt-bank-hero">
        <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'Prompt Bank' }]} />
        <h1 className="prompt-bank-title">Prompt Bank</h1>
        <p className="prompt-bank-desc">
          Your library of prompts from different situations and use cases. Save them here, copy when you need them, or run one on a knowledge object.
        </p>
      </header>

      {error && (
        <div className="prompt-bank-error" role="alert">
          {error}
        </div>
      )}

      <div className="prompt-bank-layout">
        <aside className="prompt-bank-sidebar">
          <button type="button" className="btn btn-primary prompt-bank-new" onClick={openNew}>
            + Save new prompt
          </button>
          {templates.length > 0 && (
            <>
              <div className="prompt-bank-search-wrap">
                <input
                  type="search"
                  className="prompt-bank-search"
                  placeholder="Search prompts…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search prompts"
                />
              </div>
              {allTags.length > 0 && (
                <div className="prompt-bank-tag-filters">
                  <button
                    type="button"
                    className={`prompt-bank-tag-pill ${!tagFilter ? 'active' : ''}`}
                    onClick={() => setTagFilter('')}
                  >
                    All
                  </button>
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={`prompt-bank-tag-pill ${tagFilter === tag ? 'active' : ''}`}
                      onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {templates.length === 0 ? (
            <div className="prompt-bank-empty">
              <div className="prompt-bank-empty-icon" aria-hidden="true">💬</div>
              <p className="prompt-bank-empty-title">No prompts yet</p>
              <p className="prompt-bank-empty-desc">
                Save prompts you collect so you can copy them anytime or run them on a knowledge object.
              </p>
              <button type="button" className="btn btn-primary" onClick={openNew}>
                Save your first prompt
              </button>
            </div>
          ) : (
            <ul className="prompt-bank-list" role="list">
              {filteredTemplates.map((t) => {
                const isActive = editingId === t.id;
                const typesLabel = (t.applies_to_types || []).length
                  ? (t.applies_to_types || []).join(', ')
                  : 'all types';
                return (
                  <li key={t.id} className="prompt-bank-list-item">
                    <div
                      className={`prompt-bank-card ${isActive ? 'prompt-bank-card-active' : ''}`}
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
                      <div className="prompt-bank-card-head">
                        <span className="prompt-bank-card-name">{t.name}</span>
                        <span className="prompt-bank-card-types">{typesLabel}</span>
                      </div>
                      {(t.tags || []).length > 0 && (
                        <div className="prompt-bank-card-tags">
                          {(t.tags || []).map((tag) => (
                            <span key={tag} className="prompt-bank-tag-chip">{tag}</span>
                          ))}
                        </div>
                      )}
                      {t.description && (
                        <p className="prompt-bank-card-desc">{t.description}</p>
                      )}
                      <div className="prompt-bank-card-actions">
                        <button
                          type="button"
                          className="prompt-bank-card-btn prompt-bank-card-copy"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyPrompt(t);
                          }}
                        >
                          Copy prompt
                        </button>
                        <button
                          type="button"
                          className="prompt-bank-card-btn prompt-bank-card-use"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUseOnObject(t);
                          }}
                        >
                          Use on object
                        </button>
                        <button
                          type="button"
                          className="prompt-bank-card-btn prompt-bank-card-danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(t.id);
                          }}
                          aria-label="Delete prompt"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
              {filteredTemplates.length === 0 && (searchQuery.trim() || tagFilter) && (
                <li className="prompt-bank-list-empty">
                  <p>{emptyListMessage}</p>
                </li>
              )}
            </ul>
          )}
        </aside>

        <main className="prompt-bank-main">
          {editingId === 'new' || editingId ? (
            <div className="prompt-bank-editor">
              <div className="prompt-bank-editor-header">
                <h2>{editingId === 'new' ? 'Save new prompt' : 'Edit prompt'}</h2>
                <div className="prompt-bank-editor-actions">
                  <button type="button" className="btn btn-ghost" onClick={closeEditor} disabled={saving}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
              <div className="prompt-bank-editor-body">
                <label className="prompt-bank-field">
                  <span className="prompt-bank-field-label">Name</span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Executive summary"
                    required
                  />
                </label>
                <label className="prompt-bank-field">
                  <span className="prompt-bank-field-label">Description (optional)</span>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="When you use this prompt"
                  />
                </label>
                <div className="prompt-bank-field">
                  <span className="prompt-bank-field-label">Tags</span>
                  <div className="prompt-bank-tags-editor">
                    <div className="prompt-bank-tags-chips">
                      {(form.tags || []).map((tag) => (
                        <span key={tag} className="prompt-bank-editor-tag">
                          {tag}
                          <button type="button" className="prompt-bank-editor-tag-remove" onClick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`}>×</button>
                        </span>
                      ))}
                    </div>
                    <div className="prompt-bank-tags-input-row">
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                        placeholder="Add a tag (e.g. summarization, writing)"
                        className="prompt-bank-tag-input"
                      />
                      <button type="button" className="btn btn-secondary btn-small" onClick={addTag} disabled={!tagInput.trim()}>
                        Add
                      </button>
                    </div>
                  </div>
                </div>
                <div className="prompt-bank-field">
                  <span className="prompt-bank-field-label">Use on object types (empty = any)</span>
                  <div className="prompt-bank-checkbox-group">
                    {OBJECT_TYPES.map((type) => (
                      <label key={type} className="prompt-bank-checkbox">
                        <input
                          type="checkbox"
                          checked={form.applies_to_types.includes(type)}
                          onChange={() => toggleAppliesTo(type)}
                        />
                        <span>{type}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <label className="prompt-bank-field">
                  <span className="prompt-bank-field-label">Output format</span>
                  <select
                    value={form.output_format}
                    onChange={(e) => setForm((f) => ({ ...f, output_format: e.target.value }))}
                  >
                    {OUTPUT_FORMATS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </label>
                <label className="prompt-bank-field">
                  <span className="prompt-bank-field-label">Prompt text</span>
                  <textarea
                    value={form.prompt_text}
                    onChange={(e) => setForm((f) => ({ ...f, prompt_text: e.target.value }))}
                    placeholder="Paste or write the prompt. When run on an object, the app will send the object title and content with this prompt to AI (if enabled)."
                    rows={8}
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="prompt-bank-welcome">
              <div className="prompt-bank-welcome-icon" aria-hidden="true">📋</div>
              <p className="prompt-bank-welcome-text">
                {templates.length === 0
                  ? 'Save a prompt to get started.'
                  : 'Select a prompt to edit, or use Copy / Use on object from the list.'}
              </p>
              {templates.length > 0 && (
                <button type="button" className="btn btn-secondary" onClick={openNew}>
                  Save new prompt
                </button>
              )}
            </div>
          )}
        </main>
      </div>

      {deleteConfirmId && (
        <div className="prompt-bank-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="prompt-bank-delete-title">
          <div className="prompt-bank-modal">
            <h2 id="prompt-bank-delete-title">Delete this prompt?</h2>
            <p className="prompt-bank-modal-desc">This cannot be undone.</p>
            <div className="prompt-bank-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteConfirmId(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={() => handleDelete(deleteConfirmId)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
