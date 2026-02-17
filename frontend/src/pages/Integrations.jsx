import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { INTEGRATION_TYPES, WEBHOOK_EVENTS } from '../constants';
import Breadcrumbs from '../components/Breadcrumbs';
import './Integrations.css';

export default function Integrations() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', type: 'generic', webhookUrl: '', webhookEvents: [], webhookSecret: '' });
  const [adding, setAdding] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState(null);
  const [editConfig, setEditConfig] = useState({ url: '', events: [], secret: '' });

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data, error: e } = await supabase
        .from('integrations')
        .select('id, name, type, enabled, config, created_at')
        .eq('user_id', user.id)
        .order('name');
      setList(e ? [] : (data || []));
      setLoading(false);
    })();
  }, [user?.id]);

  async function handleAdd(e) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    if (form.type === 'webhook' && !form.webhookUrl?.trim()) {
      setError('Webhook URL is required');
      return;
    }
    setError('');
    setAdding(true);
    try {
      const payload = { user_id: user.id, name, type: form.type, enabled: true };
      if (form.type === 'webhook') {
        payload.config = {
          url: form.webhookUrl.trim(),
          events: Array.isArray(form.webhookEvents) ? form.webhookEvents : [],
          ...(form.webhookSecret?.trim() ? { secret: form.webhookSecret.trim() } : {}),
        };
      }
      const { data, error: err } = await supabase
        .from('integrations')
        .insert(payload)
        .select('id, name, type, enabled, config, created_at')
        .single();
      if (err) throw err;
      setList((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setForm({ name: '', type: 'generic', webhookUrl: '', webhookEvents: [], webhookSecret: '' });
    } catch (err) {
      setError(err.message || 'Failed to add integration');
    } finally {
      setAdding(false);
    }
  }

  function openEditConfig(integration) {
    if (integration.type !== 'webhook') return;
    const c = integration.config || {};
    setEditConfig({
      url: c.url || '',
      events: Array.isArray(c.events) ? [...c.events] : [],
      secret: c.secret ? '********' : '',
    });
    setEditingConfigId(integration.id);
  }

  function toggleEditEvent(id) {
    setEditConfig((prev) =>
      prev.events.includes(id) ? { ...prev, events: prev.events.filter((e) => e !== id) } : { ...prev, events: [...prev.events, id] }
    );
  }

  async function saveEditConfig() {
    if (!editingConfigId || !editConfig.url?.trim()) {
      setError('Webhook URL is required');
      return;
    }
    setError('');
    try {
      const config = {
        url: editConfig.url.trim(),
        events: editConfig.events,
        ...(editConfig.secret && editConfig.secret !== '********' ? { secret: editConfig.secret.trim() } : {}),
      };
      const item = list.find((i) => i.id === editingConfigId);
      if (item?.config?.secret && editConfig.secret === '********') config.secret = item.config.secret;

      const { error: err } = await supabase
        .from('integrations')
        .update({ config, updated_at: new Date().toISOString() })
        .eq('id', editingConfigId)
        .eq('user_id', user.id);
      if (err) throw err;
      setList((prev) => prev.map((i) => (i.id === editingConfigId ? { ...i, config } : i)));
      setEditingConfigId(null);
      setEditConfig({ url: '', events: [], secret: '' });
    } catch (err) {
      setError(err.message || 'Failed to update webhook config');
    }
  }

  async function toggleEnabled(id, enabled) {
    setError('');
    try {
      const { error: err } = await supabase
        .from('integrations')
        .update({ enabled })
        .eq('id', id)
        .eq('user_id', user.id);
      if (err) throw err;
      setList((prev) => prev.map((i) => (i.id === id ? { ...i, enabled } : i)));
    } catch (err) {
      setError(err.message || 'Failed to update');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Remove this integration? Import history for it will remain but the integration will be deleted.')) return;
    setError('');
    try {
      const { error: err } = await supabase.from('integrations').delete().eq('id', id).eq('user_id', user.id);
      if (err) throw err;
      setList((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(err.message || 'Failed to delete');
    }
  }

  if (loading) return <div className="integrations-page" id="main-content" role="main"><p role="status" aria-live="polite">Loading…</p></div>;

  return (
    <div className="integrations-page" id="main-content" role="main">
      <header className="integrations-header">
        <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'Integrations' }]} />
        <h1>Integrations</h1>
        <p className="integrations-desc">Manage integrations for imports and API. Enable or disable each one. Use import_items and RPCs for deduplication when importing.</p>
      </header>
      {error && <div className="form-error" role="alert">{error}</div>}

      <section className="integrations-add">
        <h2>Add integration</h2>
        <form onSubmit={handleAdd} className="integrations-form form">
          <label>
            Name
            <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Notion import" required />
          </label>
          <label>
            Type
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              {INTEGRATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          {form.type === 'webhook' && (
            <div className="webhook-config">
              <label>
                Webhook URL
                <input type="url" value={form.webhookUrl} onChange={(e) => setForm((f) => ({ ...f, webhookUrl: e.target.value }))} placeholder="https://..." required />
              </label>
              <div className="webhook-events">
                <span>Events</span>
                {WEBHOOK_EVENTS.map((ev) => (
                  <label key={ev.id} className="checkbox-label">
                    <input type="checkbox" checked={form.webhookEvents.includes(ev.id)} onChange={() => setForm((f) => ({ ...f, webhookEvents: f.webhookEvents.includes(ev.id) ? f.webhookEvents.filter((e) => e !== ev.id) : [...f.webhookEvents, ev.id] }))} />
                    {ev.label}
                  </label>
                ))}
              </div>
              <label>
                Secret (optional, for HMAC signing)
                <input type="password" value={form.webhookSecret} onChange={(e) => setForm((f) => ({ ...f, webhookSecret: e.target.value }))} placeholder="Leave blank to skip signing" autoComplete="off" />
              </label>
            </div>
          )}
          <button type="submit" className="btn btn-primary" disabled={adding}>{adding ? 'Adding…' : 'Add'}</button>
        </form>
      </section>

      <section className="integrations-list">
        <h2>Your integrations</h2>
        {list.length === 0 ? (
          <p className="muted">No integrations yet. Add one to track imports or use with future API/webhooks.</p>
        ) : (
          <ul>
            {list.map((i) => (
              <li key={i.id} className="integration-item">
                <div className="integration-info">
                  <span className="integration-name">{i.name}</span>
                  <span className="integration-type">{i.type}</span>
                  {i.type === 'webhook' && i.config?.url && <span className="integration-webhook-url" title={i.config.url}>{i.config.url.slice(0, 40)}{i.config.url.length > 40 ? '…' : ''}</span>}
                </div>
                {i.type === 'webhook' && <button type="button" className="btn btn-small" onClick={() => openEditConfig(i)}>Configure</button>}
                <label className="toggle-label">
                  <input type="checkbox" checked={i.enabled} onChange={(e) => toggleEnabled(i.id, e.target.checked)} />
                  {i.enabled ? 'On' : 'Off'}
                </label>
                <button type="button" className="btn btn-danger btn-small" onClick={() => handleDelete(i.id)}>Remove</button>
                {editingConfigId === i.id && (
                  <div className="webhook-edit-overlay">
                    <div className="webhook-edit-box form">
                      <h3>Webhook config</h3>
                      <label>URL <input type="url" value={editConfig.url} onChange={(e) => setEditConfig((c) => ({ ...c, url: e.target.value }))} placeholder="https://..." /></label>
                      <div className="webhook-events">
                        <span>Events</span>
                        {WEBHOOK_EVENTS.map((ev) => (
                          <label key={ev.id} className="checkbox-label">
                            <input type="checkbox" checked={editConfig.events.includes(ev.id)} onChange={() => toggleEditEvent(ev.id)} />
                            {ev.label}
                          </label>
                        ))}
                      </div>
                      <label>Secret (optional) <input type="password" value={editConfig.secret} onChange={(e) => setEditConfig((c) => ({ ...c, secret: e.target.value }))} placeholder="Leave blank or ******** to keep" autoComplete="off" /></label>
                      <div className="webhook-edit-actions">
                        <button type="button" className="btn btn-primary" onClick={saveEditConfig}>Save</button>
                        <button type="button" className="btn" onClick={() => { setEditingConfigId(null); setEditConfig({ url: '', events: [], secret: '' }); }}>Cancel</button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="integrations-api">
        <h2>API & imports</h2>
        <p className="api-desc">All data access is auth-protected via Supabase (JWT). Use the Supabase client with your project URL and anon key; pass the user session for RLS.</p>
        <ul className="api-bullets">
          <li><strong>Object CRUD:</strong> <code>knowledge_objects</code> table (insert, select, update, delete).</li>
          <li><strong>Search:</strong> RPC <code>search_knowledge_objects</code> (query, filters, pagination).</li>
          <li><strong>Export:</strong> Build TXT/MD in the app or replicate the export logic client-side.</li>
          <li><strong>Import dedupe:</strong> Before creating an object from an import, call <code>import_get_existing_object(integration_id, source_identifier)</code>; if it returns an id, update that object instead of creating. After creating, call <code>import_register(integration_id, source_identifier, object_id, payload)</code>.</li>
        </ul>
      </section>
    </div>
  );
}
