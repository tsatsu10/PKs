import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useNotifyError } from '../lib/useNotifyError';
import QueryError from './QueryError';
import {
  useUnreadCount,
  useRecentNotifications,
  invalidateNotifications,
} from '../data/notifications';
import './NotificationCenter.css';

export default function NotificationCenter() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const notifyError = useNotifyError();
  const userId = user?.id ?? null;
  const unreadCount = useUnreadCount(userId).data ?? 0;
  const [open, setOpen] = useState(false);
  const recentQ = useRecentNotifications(userId, open);
  const list = recentQ.data ?? [];
  const loading = recentQ.isPending;
  const panelRef = useRef(null);

  async function markRead(id) {
    if (!user?.id) return;
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) {
      notifyError(error, 'Failed to mark read');
      return;
    }
    await invalidateNotifications(queryClient);
  }

  async function markAllRead() {
    if (!user?.id) return;
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null);
    if (error) {
      notifyError(error, 'Failed to mark all read');
      return;
    }
    await invalidateNotifications(queryClient);
  }

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    const id = setTimeout(() => document.addEventListener('click', handleClickOutside), 100);
    return () => {
      clearTimeout(id);
      document.removeEventListener('click', handleClickOutside);
    };
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
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={open ? 'Close notifications' : `Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="bell-icon" aria-hidden="true">🔔</span>
        {unreadCount > 0 && <span className="notification-badge" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {open && (
        <>
          <div
            className="notification-panel-backdrop"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div className="notification-panel notification-panel-side" role="dialog" aria-label="Notifications" aria-modal="true">
            <div className="notification-panel-header">
              <h3>Notifications</h3>
              <div className="notification-panel-header-actions">
                {unreadCount > 0 && (
                  <button type="button" className="btn-mark-all" onClick={markAllRead}>Mark all read</button>
                )}
                <button type="button" className="notification-panel-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
              </div>
            </div>
            <div className="notification-panel-body">
              {recentQ.error ? (
                <QueryError what="notifications" error={recentQ.error} onRetry={() => recentQ.refetch()} />
              ) : loading ? (
                <p className="notification-loading">Loading…</p>
              ) : list.length === 0 ? (
                <div className="empty-state">
                  <p className="empty-state-title">No notifications yet</p>
                  <p className="empty-state-desc">Alerts and updates will appear here.</p>
                </div>
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
            </div>
            <div className="notification-panel-footer">
              <Link to="/notifications" onClick={() => setOpen(false)}>See all</Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
