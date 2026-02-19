import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import Breadcrumbs from '../components/Breadcrumbs';
import './PasteBin.css';

export default function PasteBin() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [pastes, setPastes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    async function load() {
      const { data, error: e } = await supabase
        .from('paste_bin')
        .select('id, title, content, created_at, updated_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (cancelled) return;
      setError(e?.message ?? e?.error_description ?? '');
      setPastes(data || []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  const selected = pastes.find((p) => p.id === selectedId);

  useEffect(() => {
    if (selected) {
      setTitle(selected.title ?? '');
      setContent(selected.content ?? '');
    } else if (!creating) {
      setTitle('');
      setContent('');
    }
  }, [selected?.id, selected?.title, selected?.content, creating]);

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
        setPastes((prev) =>
          prev.map((p) => (p.id === selectedId ? { ...p, title: title.trim() || null, content: content.trim() || '', updated_at: new Date().toISOString() } : p))
        );
        addToast('success', 'Paste updated');
      } else {
        const { data, error: err } = await supabase
          .from('paste_bin')
          .insert({ user_id: user.id, title: title.trim() || null, content: content.trim() || '' })
          .select('id, title, content, created_at, updated_at')
          .single();
        if (err) throw err;
        setPastes((prev) => [data, ...prev]);
        setSelectedId(data.id);
        setCreating(false);
        addToast('success', 'Paste created');
      }
    } catch (err) {
      const msg = err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Failed to save');
      addToast('error', msg);
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
      setPastes((prev) => prev.filter((p) => p.id !== selectedId));
      setSelectedId(null);
      setTitle('');
      setContent('');
      addToast('success', 'Paste deleted');
    } catch (err) {
      const msg = err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Failed to delete');
      addToast('error', msg);
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
    <div className="paste-bin-page" id="main-content" role="main">
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
          ) : pastes.length === 0 ? (
            <p className="paste-bin-muted">No pastes yet. Create one with &quot;New paste&quot;.</p>
          ) : (
            <ul className="paste-bin-list-ul" role="list">
              {pastes.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`paste-bin-list-item ${selectedId === p.id ? 'active' : ''}`}
                    onClick={() => selectPaste(p)}
                  >
                    <span className="paste-bin-list-label">
                      {p.title || (p.content ? p.content.slice(0, 40).replace(/\n/g, ' ') + (p.content.length > 40 ? '…' : '') : 'Untitled')}
                    </span>
                    <span className="paste-bin-list-date">{new Date(p.updated_at ?? p.created_at).toLocaleDateString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="paste-bin-main">
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
        </main>
      </div>
    </div>
  );
}
