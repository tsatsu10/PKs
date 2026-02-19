import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import './Settings.css';

export default function Settings() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [domains, setDomains] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState('');
  const [newTag, setNewTag] = useState('');
  const [addingDomain, setAddingDomain] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    async function load() {
      const [dRes, tRes] = await Promise.all([
        supabase.from('domains').select('id, name').eq('user_id', user.id).order('name'),
        supabase.from('tags').select('id, name').eq('user_id', user.id).order('name'),
      ]);
      if (cancelled) return;
      setDomains(dRes.data || []);
      setTags(tRes.data || []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  async function addDomain(e) {
    e.preventDefault();
    const name = newDomain.trim();
    if (!name) return;
    setError('');
    setAddingDomain(true);
    try {
      const { error: err } = await supabase.from('domains').insert({ user_id: user.id, name });
      if (err) throw err;
      setNewDomain('');
      const { data } = await supabase.from('domains').select('id, name').eq('user_id', user.id).order('name');
      setDomains(data || []);
    } catch (err) {
      setError(err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Failed to add domain'));
    } finally {
      setAddingDomain(false);
    }
  }

  async function addTag(e) {
    e.preventDefault();
    const name = newTag.trim();
    if (!name) return;
    setError('');
    setAddingTag(true);
    try {
      const { error: err } = await supabase.from('tags').insert({ user_id: user.id, name });
      if (err) throw err;
      const { data } = await supabase.from('tags').select('id, name').eq('user_id', user.id).eq('name', name).single();
      if (data) setTags((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTag('');
    } catch (err) {
      setError(err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Failed to add tag'));
    } finally {
      setAddingTag(false);
    }
  }

  async function deleteDomain(id) {
    setError('');
    setDeletingId(id);
    try {
      await supabase.from('knowledge_object_domains').delete().eq('domain_id', id);
      const { error: err } = await supabase.from('domains').delete().eq('id', id).eq('user_id', user.id);
      if (err) throw err;
      setDomains((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError(err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Failed to delete domain'));
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteTag(id) {
    setError('');
    setDeletingId(id);
    try {
      await supabase.from('knowledge_object_tags').delete().eq('tag_id', id);
      const { error: err } = await supabase.from('tags').delete().eq('id', id).eq('user_id', user.id);
      if (err) throw err;
      setTags((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Failed to delete tag'));
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) return <div className="settings-page" id="main-content" role="main"><p role="status" aria-live="polite">Loading…</p></div>;

  return (
    <div className="settings-page" id="main-content" role="main">
      <header className="settings-header">
        <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'Settings' }]} />
        <h1>Settings</h1>
      </header>
      {error && <div className="form-error" role="alert">{error}</div>}

      <section className="settings-section">
        <h2>Appearance</h2>
        <p className="settings-desc">Choose light, dark, or system theme.</p>
        <div className="settings-theme-toggle" role="group" aria-label="Theme">
          <button type="button" className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTheme('dark')}>Dark</button>
          <button type="button" className={`btn ${theme === 'light' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTheme('light')}>Light</button>
          <button type="button" className={`btn ${theme === 'system' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTheme('system')}>System</button>
        </div>
      </section>

      <section className="settings-section">
        <h2>Domains</h2>
        <p className="settings-desc">Domains group your knowledge by area (e.g. Health, Tech, Projects).</p>
        <form onSubmit={addDomain} className="settings-form form">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="New domain name"
            disabled={addingDomain}
          />
          <button type="submit" className="btn btn-primary" disabled={addingDomain || !newDomain.trim()}>
            {addingDomain ? 'Adding…' : 'Add'}
          </button>
        </form>
        <ul className="settings-list">
          {domains.map((d) => (
            <li key={d.id}>
              <span>{d.name}</span>
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() => deleteDomain(d.id)}
                disabled={deletingId === d.id}
              >
                {deletingId === d.id ? '…' : 'Remove'}
              </button>
            </li>
          ))}
          {domains.length === 0 && <li className="muted">No domains yet.</li>}
        </ul>
      </section>

      <section className="settings-section">
        <h2>Tags</h2>
        <p className="settings-desc">Tags are labels you can attach to any object (e.g. urgent, draft).</p>
        <form onSubmit={addTag} className="settings-form form">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="New tag name"
            disabled={addingTag}
          />
          <button type="submit" className="btn btn-primary" disabled={addingTag || !newTag.trim()}>
            {addingTag ? 'Adding…' : 'Add'}
          </button>
        </form>
        <ul className="settings-list">
          {tags.map((t) => (
            <li key={t.id}>
              <span>{t.name}</span>
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() => deleteTag(t.id)}
                disabled={deletingId === t.id}
              >
                {deletingId === t.id ? '…' : 'Remove'}
              </button>
            </li>
          ))}
          {tags.length === 0 && <li className="muted">No tags yet.</li>}
        </ul>
      </section>
    </div>
  );
}
