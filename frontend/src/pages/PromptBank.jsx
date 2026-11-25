import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import Breadcrumbs from '../components/Breadcrumbs';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toaster';
import { supabase } from '../lib/supabase';
import { useNotifyError } from '../lib/useNotifyError';
import QueryError from '../components/QueryError';
import { usePromptsList, invalidatePrompts } from '../data/prompts';
import { OBJECT_TYPES, RUN_PROMPT_STORAGE_KEY } from '../constants';
import { ClipboardList, MessageSquare, Plus, Trash2 } from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Chip from '../components/ui/Chip';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import Field from '../components/ui/Field';
import IconButton from '../components/ui/IconButton';
import Input, { Textarea } from '../components/ui/Input';
import Page from '../components/ui/Page';
import Spinner from '../components/ui/Spinner';
import './PromptBank.css';

export default function PromptBank() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notifyError = useNotifyError();
  const listQ = usePromptsList(user?.id ?? null);
  const templates = useMemo(() => listQ.data ?? [], [listQ.data]);
  const loading = listQ.isPending;
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(undefined);
  const [form, setForm] = useState({
    name: '',
    description: '',
    applies_to_types: [],
    tags: [],
    prompt_text: '',
  });
  const [tagInput, setTagInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [saving, setSaving] = useState(false);
  /** The form as it was when the editor opened, to tell whether anything changed. */
  const [baseline, setBaseline] = useState('');
  /** What to do once the user agrees to drop unsaved edits. */
  const [pendingAction, setPendingAction] = useState(null);

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

  function startEditing(id, next) {
    setEditingId(id);
    setForm(next);
    setBaseline(JSON.stringify(next));
  }

  function openNew() {
    startEditing('new', { name: '', description: '', applies_to_types: [], tags: [], prompt_text: '' });
    setTagInput('');
    setError('');
  }

  function openEdit(t) {
    startEditing(t.id, {
      name: t.name,
      description: t.description || '',
      applies_to_types: t.applies_to_types || [],
      tags: Array.isArray(t.tags) ? t.tags.filter(Boolean) : [],
      prompt_text: t.prompt_text || '',
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
      };
      if (editingId && editingId !== 'new') {
        const { error: err } = await supabase
          .from('prompt_templates')
          .update(payload)
          .eq('id', editingId)
          .eq('user_id', user.id);
        if (err) throw err;
        addToast('success', 'Prompt updated');
      } else {
        const { error: err } = await supabase
          .from('prompt_templates')
          .insert({ user_id: user.id, ...payload });
        if (err) throw err;
        addToast('success', 'Prompt saved');
      }
      await invalidatePrompts(queryClient);
      closeEditor();
    } catch (e) {
      const msg = notifyError(e, 'Save failed');
      setError(msg);
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
      await invalidatePrompts(queryClient);
      if (editingId === id) closeEditor();
      setDeleteConfirmId(null);
      addToast('success', 'Prompt deleted');
    } catch (e) {
      const msg = notifyError(e, 'Delete failed');
      setError(msg);
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
      <Page title="Prompt Bank">
        <Spinner />
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
  const field = (key) => ({ value: form[key], onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value })) });

  return (
    <Page title="Prompt Bank" actions={<Button variant="primary" onClick={() => guard(openNew)}><Plus size={16} aria-hidden="true" />Save new prompt</Button>}>
      <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'Prompt Bank' }]} />
      <p className="prompt-bank-desc">
        Your library of prompts from different situations and use cases. Save them here, copy when you need them, or run one on a knowledge object.
      </p>

      {error && <div className="prompt-bank-error" role="alert">{error}</div>}

      <div className="prompt-bank-layout">
        <aside className="prompt-bank-sidebar">
          {templates.length > 0 && (
            <>
              <Field label="Search prompts" labelHidden>
                {(f) => <Input id={f.id} type="search" placeholder="Search prompts…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />}
              </Field>
              {allTags.length > 0 && (
                <div className="prompt-bank-tag-filters" role="group" aria-label="Filter by tag">
                  <Button size="sm" variant={!tagFilter ? 'primary' : 'secondary'} aria-pressed={!tagFilter} onClick={() => setTagFilter('')}>All</Button>
                  {allTags.map((tag) => (
                    <Button key={tag} size="sm" variant={tagFilter === tag ? 'primary' : 'secondary'} aria-pressed={tagFilter === tag} onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}>
                      {tag}
                    </Button>
                  ))}
                </div>
              )}
            </>
          )}

          {listQ.error ? (
            <QueryError what="prompts" error={listQ.error} onRetry={() => listQ.refetch()} />
          ) : templates.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No prompts yet"
              description="Save prompts you collect so you can copy them anytime or run them on a knowledge object."
              action={<Button variant="primary" onClick={() => guard(openNew)}>Save your first prompt</Button>}
            />
          ) : (
            <ul className="prompt-bank-list">
              {filteredTemplates.map((t) => {
                const types = (t.applies_to_types || []).length ? t.applies_to_types.join(', ') : 'all types';
                return (
                  <li key={t.id} className={`prompt-bank-card${editingId === t.id ? ' prompt-bank-card-active' : ''}`}>
                    {/* The row's main button selects it; its actions are siblings, never nested (A7). */}
                    <button type="button" className="prompt-bank-card-main" aria-current={editingId === t.id ? 'true' : undefined} onClick={() => guard(() => openEdit(t))}>
                      <span className="prompt-bank-card-name">{t.name}</span>
                      <span className="prompt-bank-card-types">{types}</span>
                      {t.description && <span className="prompt-bank-card-desc">{t.description}</span>}
                    </button>
                    {(t.tags || []).length > 0 && (
                      <div className="prompt-bank-card-tags">
                        {t.tags.map((tag) => <Chip key={tag}>{tag}</Chip>)}
                      </div>
                    )}
                    <div className="prompt-bank-card-actions">
                      <Button size="sm" variant="ghost" onClick={() => handleCopyPrompt(t)}>Copy prompt</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleUseOnObject(t)}>Use on object</Button>
                      <IconButton label={`Delete ${t.name}`} icon={Trash2} iconSize={16} onClick={() => setDeleteConfirmId(t.id)} />
                    </div>
                  </li>
                );
              })}
              {filteredTemplates.length === 0 && (searchQuery.trim() || tagFilter) && (
                <li className="prompt-bank-list-empty">{emptyListMessage}</li>
              )}
            </ul>
          )}
        </aside>

        <div className="prompt-bank-main">
          {editing ? (
            <Card
              as="section"
              titleLevel={2}
              title={editingId === 'new' ? 'Save new prompt' : 'Edit prompt'}
              actions={
                <>
                  <Button variant="ghost" onClick={() => guard(closeEditor)} disabled={saving}>Cancel</Button>
                  <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
                </>
              }
            >
              <div className="prompt-bank-editor-body">
                <Field label="Name">
                  {(f) => <Input id={f.id} type="text" {...field('name')} placeholder="e.g. Executive summary" required />}
                </Field>
                <Field label="Description (optional)">
                  {(f) => <Input id={f.id} type="text" {...field('description')} placeholder="When you use this prompt" />}
                </Field>
                <div>
                  <div className="prompt-bank-tags-chips">
                    {(form.tags || []).map((tag) => (
                      <Chip key={tag} onRemove={() => removeTag(tag)} removeLabel={`Remove tag ${tag}`}>{tag}</Chip>
                    ))}
                  </div>
                  <Field label="Tags">
                    {(f) => (
                      <div className="prompt-bank-tags-input-row">
                        <Input
                          id={f.id}
                          type="text"
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                          placeholder="Add a tag (e.g. summarization, writing)"
                        />
                        <Button size="sm" onClick={addTag} disabled={!tagInput.trim()}>Add</Button>
                      </div>
                    )}
                  </Field>
                </div>
                <fieldset className="prompt-bank-checkbox-group">
                  <legend>Use on object types (empty = any)</legend>
                  {OBJECT_TYPES.map((type) => (
                    <label key={type} className="prompt-bank-checkbox">
                      <input type="checkbox" checked={form.applies_to_types.includes(type)} onChange={() => toggleAppliesTo(type)} />
                      <span>{type}</span>
                    </label>
                  ))}
                </fieldset>
                <Field label="Prompt text">
                  {(f) => (
                    <Textarea
                      id={f.id}
                      {...field('prompt_text')}
                      placeholder="Paste or write the prompt. When run on an object, the app will send the object title and content with this prompt to AI (if enabled)."
                      rows={8}
                    />
                  )}
                </Field>
              </div>
            </Card>
          ) : (
            <EmptyState
              icon={ClipboardList}
              title={templates.length === 0 ? 'Save a prompt to get started.' : 'Select a prompt to edit, or use Copy / Use on object from the list.'}
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
        title="Delete this prompt?"
        message="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => handleDelete(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </Page>
  );
}
