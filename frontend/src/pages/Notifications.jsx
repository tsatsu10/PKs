import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import './Notifications.css';

const PAGE_SIZE = 30;

export default function Notifications() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | unread

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setLoading(true);
      let q = supabase
        .from('notifications')
        .select('id, type, title, body, read_at, related_type, related_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (filter === 'unread') q = q.is('read_at', null);
      const { data, error } = await q;
      setList(error ? [] : (data || []));
      setLoading(false);
    })();
  }, [user?.id, filter]);

  async function markRead(id) {
    if (!user?.id) return;
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id);
    if (!error) setList((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
  }

  async function markUnread(id) {
    if (!user?.id) return;
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: null })
      .eq('id', id)
      .eq('user_id', user.id);
    if (!error) setList((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: null } : n)));
  }

  async function markAllRead() {
    if (!user?.id) return;
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null);
    if (!error) setList((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
  }

  return (
    <div className="notifications-page" id="main-content" role="main">
      <header className="notifications-header">
        <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'Notifications' }]} />
        <h1>Notifications</h1>
        <div className="notifications-toolbar">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter notifications">
            <option value="all">All</option>
            <option value="unread">Unread</option>
          </select>
          {filter === 'all' && list.some((n) => !n.read_at) && (
            <button type="button" className="btn btn-secondary" onClick={markAllRead}>Mark all read</button>
          )}
        </div>
      </header>
      {loading ? (
        <p className="notifications-loading" role="status" aria-live="polite">Loading…</p>
      ) : list.length === 0 ? (
        <p className="notifications-empty" role="status">No notifications.</p>
      ) : (
        <ul className="notifications-list">
          {list.map((n) => (
            <li key={n.id} className={n.read_at ? 'read' : 'unread'}>
              <div className="notifications-item">
                <div className="notifications-item-main">
                  <span className="notifications-title">{n.title}</span>
                  {n.body && <span className="notifications-body">{n.body}</span>}
                  <span className="notifications-meta">
                    {n.type.replace('_', ' ')} · {new Date(n.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="notifications-item-actions">
                  {n.related_type === 'knowledge_object' && n.related_id && (
                    <Link to={`/objects/${n.related_id}`} className="btn btn-secondary btn-small">View object</Link>
                  )}
                  {n.read_at ? (
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => markUnread(n.id)}>Mark unread</button>
                  ) : (
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => markRead(n.id)}>Mark read</button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
