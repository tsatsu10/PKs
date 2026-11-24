import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ui/Toaster';
import { useNotifyError } from '../lib/useNotifyError';
import Breadcrumbs from '../components/Breadcrumbs';
import QueryError from '../components/QueryError';
import LoadMore from '../components/LoadMore';
import { usePasteList, usePasteItem, invalidatePasteBin } from '../data/pasteBin';
import './PasteBin.css';

export default function PasteBin() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const notifyError = useNotifyError();
  const queryClient = useQueryClient();
  const { rows: pastes, query, removeRow } = usePasteList(user?.id ?? null);
  const loading = query.isPending;
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const itemQ = usePasteItem(selectedId);
  const item = itemQ.data ?? null;
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  // Seed the editor once per selected item; user edits afterwards must not be overwritten.
  useEffect(() => {
    if (!selectedId) return;
    if (item && item.id === selectedId) {
      setTitle(item.title ?? '');
      setContent(item.content ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, item?.id]);

  useEffect(() => {
    if (!selectedId && !creating) {
      setTitle('');
      setContent('');
    }
  }, [selectedId, creating]);

  async function handleSave() {
    if (!user?.id) return;
    setError('');
    setSaving(true);
    try {
      if (selectedId) {
        const { error: err } = await supabase
          .from('paste_bin')
          .update({ title: title.trim() || null, content: content.trim() || '', updated_at: new Date().toISOString() })
          .eq('id', selectedId)
          .eq('user_id', user.id);
        if (err) throw err;
        await invalidatePasteBin(queryClient);
        addToast('success', 'Paste updated');
      } else {
        const { data, error: err } = await supabase
          .from('paste_bin')
          .insert({ user_id: user.id, title: title.trim() || null, content: content.trim() || '' })
          .select('id')
          .single();
        if (err) throw err;
        await invalidatePasteBin(queryClient);
        setSelectedId(data.id);
        setCreating(false);
        addToast('success', 'Paste created');
      }
    } catch (err) {
      const msg = notifyError(err, 'Failed to save');
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedId || !user?.id) return;
    if (!window.confirm('Delete this paste?')) return;
    setError('');
    try {
      const { error: err } = await supabase.from('paste_bin').delete().eq('id', selectedId).eq('user_id', user.id);
      if (err) throw err;
      removeRow(selectedId);
      invalidatePasteBin(queryClient);
      setSelectedId(null);
      setTitle('');
      setContent('');
      addToast('success', 'Paste deleted');
    } catch (err) {
      const msg = notifyError(err, 'Failed to delete');
      setError(msg);
    }
  }

  function handleCopy() {
    if (!content) return;
    navigator.clipboard.writeText(content).then(() => addToast('success', 'Copied to clipboard')).catch(() => addToast('error', 'Copy failed'));
  }

  function handleNew() {
    setSelectedId(null);
    setTitle('');
    setContent('');
    setCreating(true);
  }

  function selectPaste(p) {
    setSelectedId(p.id);
    setCreating(false);
  }

  if (!user) return null;

  return (
    <div className="paste-bin-page" >
      <header className="paste-bin-header">
        <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'Paste bin' }]} />
        <div className="paste-bin-actions">
          <button type="button" className="btn btn-primary" onClick={handleNew}>
            New paste
          </button>
        </div>
      </header>
      {error && <div className="form-error" role="alert">{error}</div>}

      <div className="paste-bin-layout">
        <aside className="paste-bin-list">
          <h2 className="paste-bin-list-title">Recent pastes</h2>
          {loading ? (
            <p className="paste-bin-muted">Loading…</p>
          ) : query.error ? (
            <QueryError what="pastes" error={query.error} onRetry={() => query.refetch()} />
          ) : pastes.length === 0 ? (
            <div className="paste-bin-empty empty-state">
              <p className="empty-state-title">No pastes yet</p>
              <p className="empty-state-desc">Store snippets, code, or text you want to reuse.</p>
              <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                Create your first paste
              </button>
            </div>
          ) : (
            <>
            <ul className="paste-bin-list-ul" role="list">
              {pastes.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`paste-bin-list-item ${selectedId === p.id ? 'active' : ''}`}
                    onClick={() => selectPaste(p)}
                  >
                    <span className="paste-bin-list-label">
                      {p.title || 'Untitled'}
                    </span>
                    <span className="paste-bin-list-date">{new Date(p.updated_at ?? p.created_at).toLocaleDateString()}</span>
                  </button>
                </li>
              ))}
            </ul>
            <LoadMore query={query} />
            </>
          )}
        </aside>

        <div className="paste-bin-main" aria-label="Paste bin">
          <div className="paste-bin-editor-card">
            <div className="paste-bin-editor-meta">
              <input
                type="text"
                className="paste-bin-title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title (optional)"
                aria-label="Paste title"
              />
              <div className="paste-bin-editor-actions">
                <button type="button" className="btn btn-secondary" onClick={handleCopy} disabled={!content.trim()}>
                  Copy
                </button>
                {selectedId && (
                  <button type="button" className="btn btn-danger" onClick={handleDelete}>
                    Delete
                  </button>
                )}
                <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : selectedId ? 'Update' : 'Save'}
                </button>
              </div>
            </div>
            <textarea
              className="paste-bin-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste code or text here…"
              spellCheck="false"
              rows={18}
              aria-label="Paste content"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
