import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import { useDeckEnabled } from '../components/MainMenuDeck';
import { getExportIncludeFromTemplate, buildObjectMarkdown } from '../lib/export';
import JSZip from 'jszip';
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
  const { deckEnabled: mainMenuDeckEnabled, setDeckEnabled } = useDeckEnabled();
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupError, setBackupError] = useState('');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [aiProviders, setAiProviders] = useState([]);
  const [aiProviderName, setAiProviderName] = useState('');
  const [aiProviderType, setAiProviderType] = useState('openai');
  const [aiProviderKey, setAiProviderKey] = useState('');
  const [addingAiProvider, setAddingAiProvider] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) setInstalled(true);
  }, []);

  async function handleInstallClick() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setInstallPrompt(null);
  }

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    async function load() {
      const [dRes, tRes, pRes] = await Promise.all([
        supabase.from('domains').select('id, name').eq('user_id', user.id).order('name'),
        supabase.from('tags').select('id, name').eq('user_id', user.id).order('name'),
        supabase.from('user_ai_providers').select('id, name, provider_type').eq('user_id', user.id).order('name'),
      ]);
      if (cancelled) return;
      setDomains(dRes.data || []);
      setTags(tRes.data || []);
      setAiProviders(pRes.data || []);
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

  async function addAiProvider(e) {
    e.preventDefault();
    const name = aiProviderName.trim();
    const key = aiProviderKey.trim();
    if (!name || !key) return;
    setError('');
    setAddingAiProvider(true);
    try {
      const { error: err } = await supabase.from('user_ai_providers').insert({
        user_id: user.id,
        name,
        provider_type: aiProviderType,
        api_key: key,
      });
      if (err) throw err;
      setAiProviderName('');
      setAiProviderKey('');
      const { data } = await supabase.from('user_ai_providers').select('id, name, provider_type').eq('user_id', user.id).order('name');
      setAiProviders(data || []);
    } catch (err) {
      setError(err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Failed to add AI provider'));
    } finally {
      setAddingAiProvider(false);
    }
  }

  async function deleteAiProvider(id) {
    setError('');
    setDeletingId(id);
    try {
      const { error: err } = await supabase.from('user_ai_providers').delete().eq('id', id).eq('user_id', user.id);
      if (err) throw err;
      setAiProviders((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Failed to remove AI provider'));
    } finally {
      setDeletingId(null);
    }
  }

  async function downloadBackupJson() {
    setBackupError('');
    setBackupLoading(true);
    try {
      const { data: objs, error: e } = await supabase.from('knowledge_objects').select('*').eq('user_id', user.id).eq('is_deleted', false).order('updated_at', { ascending: false });
      if (e) throw e;
      const [kodRes, kotRes] = await Promise.all([
        supabase.from('knowledge_object_domains').select('knowledge_object_id, domain_id, domains(id, name)').in('knowledge_object_id', (objs || []).map((o) => o.id)),
        supabase.from('knowledge_object_tags').select('knowledge_object_id, tag_id, tags(id, name)').in('knowledge_object_id', (objs || []).map((o) => o.id)),
      ]);
      const domainsByObj = {};
      (kodRes.data || []).forEach((r) => {
        if (!domainsByObj[r.knowledge_object_id]) domainsByObj[r.knowledge_object_id] = [];
        if (r.domains) domainsByObj[r.knowledge_object_id].push(r.domains);
      });
      const tagsByObj = {};
      (kotRes.data || []).forEach((r) => {
        if (!tagsByObj[r.knowledge_object_id]) tagsByObj[r.knowledge_object_id] = [];
        if (r.tags) tagsByObj[r.knowledge_object_id].push(r.tags);
      });
      const normalized = (objs || []).map((o) => ({ ...o, domains: domainsByObj[o.id] || [], tags: tagsByObj[o.id] || [] }));
      const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), objects: normalized }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `pks-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setBackupError(err?.message ?? 'Export failed');
    } finally {
      setBackupLoading(false);
    }
  }

  async function downloadBackupMarkdownZip() {
    setBackupError('');
    setBackupLoading(true);
    try {
      const { data: objs, error: e } = await supabase.from('knowledge_objects').select('*').eq('user_id', user.id).eq('is_deleted', false).order('updated_at', { ascending: false });
      if (e) throw e;
      const ids = (objs || []).map((o) => o.id);
      const [kodRes, kotRes] = await Promise.all([
        supabase.from('knowledge_object_domains').select('knowledge_object_id, domain_id, domains(id, name)').in('knowledge_object_id', ids),
        supabase.from('knowledge_object_tags').select('knowledge_object_id, tag_id, tags(id, name)').in('knowledge_object_id', ids),
      ]);
      const domainsByObj = {};
      (kodRes.data || []).forEach((r) => {
        if (!domainsByObj[r.knowledge_object_id]) domainsByObj[r.knowledge_object_id] = [];
        if (r.domains) domainsByObj[r.knowledge_object_id].push(r.domains);
      });
      const tagsByObj = {};
      (kotRes.data || []).forEach((r) => {
        if (!tagsByObj[r.knowledge_object_id]) tagsByObj[r.knowledge_object_id] = [];
        if (r.tags) tagsByObj[r.knowledge_object_id].push(r.tags);
      });
      const include = getExportIncludeFromTemplate('full', { includeLinks: false });
      const zip = new JSZip();
      (objs || []).forEach((o, i) => {
        const obj = { ...o, domains: domainsByObj[o.id] || [], tags: tagsByObj[o.id] || [] };
        const md = buildObjectMarkdown(obj, include);
        const safeTitle = (o.title || 'untitled').replace(/[<>:"/\\|?*]/g, '_').slice(0, 80);
        zip.file(`${String(i + 1).padStart(3, '0')}-${safeTitle}.md`, md);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `pks-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setBackupError(err?.message ?? 'Export failed');
    } finally {
      setBackupLoading(false);
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
        <h2>Bottom menu</h2>
        <p className="settings-desc">Show the menu wheel at the bottom of the screen. When off, the standard bottom bar (Home, New, Alerts, Settings) is used on mobile.</p>
        <label className="settings-toggle-label">
          <input
            type="checkbox"
            checked={mainMenuDeckEnabled}
            onChange={(e) => setDeckEnabled(e.target.checked)}
            aria-describedby="deck-desc"
          />
          <span>Enable bottom menu wheel</span>
        </label>
        <p id="deck-desc" className="settings-desc">Tap the Menu button at the bottom to open the wheel and jump to any section.</p>
      </section>

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
        <h2>AI API keys</h2>
        <p className="settings-desc">Add your own OpenAI or DeepSeek API keys and give them a name. You can then choose them in the Run prompt dropdown instead of the server default.</p>
        <form onSubmit={addAiProvider} className="settings-form form">
          <input
            type="text"
            value={aiProviderName}
            onChange={(e) => setAiProviderName(e.target.value)}
            placeholder="e.g. My OpenAI"
            disabled={addingAiProvider}
            aria-label="Provider name"
          />
          <select
            value={aiProviderType}
            onChange={(e) => setAiProviderType(e.target.value)}
            disabled={addingAiProvider}
            aria-label="Provider type"
          >
            <option value="openai">OpenAI</option>
            <option value="deepseek">DeepSeek</option>
          </select>
          <input
            type="password"
            value={aiProviderKey}
            onChange={(e) => setAiProviderKey(e.target.value)}
            placeholder="API key (sk-…)"
            disabled={addingAiProvider}
            autoComplete="off"
            aria-label="API key"
          />
          <button type="submit" className="btn btn-primary" disabled={addingAiProvider || !aiProviderName.trim() || !aiProviderKey.trim()}>
            {addingAiProvider ? 'Adding…' : 'Add'}
          </button>
        </form>
        <ul className="settings-list">
          {aiProviders.map((p) => (
            <li key={p.id}>
              <span><strong>{p.name}</strong> ({p.provider_type})</span>
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() => deleteAiProvider(p.id)}
                disabled={deletingId === p.id}
              >
                {deletingId === p.id ? '…' : 'Remove'}
              </button>
            </li>
          ))}
          {aiProviders.length === 0 && <li className="muted">No custom AI providers yet.</li>}
        </ul>
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
        <h2>Install app</h2>
        <p className="settings-desc">Install PKS on your device for quick access and offline use (when supported).</p>
        {installPrompt && !installed && (
          <button type="button" className="btn btn-primary" onClick={handleInstallClick}>
            Install PKS app
          </button>
        )}
        {installed && <p className="settings-muted">PKS is installed.</p>}
        {!installPrompt && !installed && <p className="settings-muted">Install prompt not available (e.g. already installed or not supported).</p>}
      </section>

      <section className="settings-section">
        <h2>Export &amp; backup</h2>
        <p className="settings-desc">Download all your objects as a backup. JSON is one file; Markdown ZIP is one file per object.</p>
        {backupError && <div className="form-error" role="alert">{backupError}</div>}
        <div className="settings-form" style={{ gap: '0.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={downloadBackupJson} disabled={backupLoading}>
            {backupLoading ? 'Preparing…' : 'Download backup (JSON)'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={downloadBackupMarkdownZip} disabled={backupLoading}>
            {backupLoading ? 'Preparing…' : 'Download backup (Markdown ZIP)'}
          </button>
        </div>
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
