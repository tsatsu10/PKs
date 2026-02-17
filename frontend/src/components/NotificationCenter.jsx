import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import './NotificationCenter.css';

const LIMIT = 10;

export default function NotificationCenter() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('read_at', null);
      if (!cancelled && !error) setUnreadCount(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!open || !user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, title, body, read_at, related_type, related_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(LIMIT);
      if (!cancelled) {
        setList(error ? [] : (data || []));
        setLoading(false);
      }
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('read_at', null);
      if (!cancelled && count != null) setUnreadCount(count);
    })();
    return () => { cancelled = true; };
  }, [open, user?.id]);

  async function markRead(id) {
    if (!user?.id) return;
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id);
    if (!error) {
      setList((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
  }

  async function markAllRead() {
    if (!user?.id) return;
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null);
    if (!error) {
      setList((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
      setUnreadCount(0);
    }
  }

  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [open]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && open) setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  function formatTime(created_at) {
    const d = new Date(created_at);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
  }

  return (
    <div className="notification-center" ref={panelRef}>
      <button
        type="button"
        className="notification-bell"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close notifications' : `Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="bell-icon" aria-hidden="true">🔔</span>
        {unreadCount > 0 && <span className="notification-badge" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="notification-panel" role="dialog" aria-label="Notifications" aria-modal="true">
          <div className="notification-panel-header">
            <h3>Notifications</h3>
            {unreadCount > 0 && (
              <button type="button" className="btn-mark-all" onClick={markAllRead}>Mark all read</button>
            )}
          </div>
          {loading ? (
            <p className="notification-loading">Loading…</p>
          ) : list.length === 0 ? (
            <p className="notification-empty">No notifications yet.</p>
          ) : (
            <ul className="notification-list">
              {list.map((n) => (
                <li key={n.id} className={n.read_at ? 'read' : 'unread'}>
                  <div className="notification-item">
                    <div className="notification-item-main">
                      <span className="notification-title">{n.title}</span>
                      {n.body && <span className="notification-body">{n.body}</span>}
                      <span className="notification-time">{formatTime(n.created_at)}</span>
                    </div>
                    <div className="notification-item-actions">
                      {n.related_type === 'knowledge_object' && n.related_id && (
                        <Link to={`/objects/${n.related_id}`} className="notification-link" onClick={() => setOpen(false)}>View</Link>
                      )}
                      {!n.read_at && (
                        <button type="button" className="btn-mark-read" onClick={() => markRead(n.id)}>Mark read</button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="notification-panel-footer">
            <Link to="/notifications" onClick={() => setOpen(false)}>See all</Link>
          </div>
        </div>
      )}
    </div>
  );
}
