import { useState } from 'react';
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
import { Bell, BellOff } from 'lucide-react';
import Button from './ui/Button';
import Dialog from './ui/Dialog';
import EmptyState from './ui/EmptyState';
import Spinner from './ui/Spinner';
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
    <>
      <button
        type="button"
        className="notification-bell"
        onClick={() => setOpen(true)}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-haspopup="dialog"
      >
        <Bell size={20} aria-hidden="true" />
        {unreadCount > 0 && <span className="notification-badge" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      <Dialog
        variant="drawer"
        title="Notifications"
        open={open}
        onClose={() => setOpen(false)}
        footer={<Link to="/notifications" onClick={() => setOpen(false)}>See all</Link>}
      >
        {unreadCount > 0 && <Button size="sm" variant="ghost" onClick={markAllRead}>Mark all read</Button>}
        {recentQ.error ? (
          <QueryError what="notifications" error={recentQ.error} onRetry={() => recentQ.refetch()} />
        ) : loading ? (
          <Spinner />
        ) : list.length === 0 ? (
          <EmptyState icon={BellOff} title="No notifications yet" description="Alerts and updates will appear here." />
        ) : (
          <ul className="notification-list">
            {list.map((n) => (
              <li key={n.id} className={`notification-item ${n.read_at ? 'read' : 'unread'}`}>
                <div className="notification-item-main">
                  <span className="notification-title">{n.title}</span>
                  {n.body && <span className="notification-body">{n.body}</span>}
                  <span className="notification-time">{formatTime(n.created_at)}</span>
                </div>
                <div className="notification-item-actions">
                  {n.related_type === 'knowledge_object' && n.related_id && (
                    <Link to={`/objects/${n.related_id}`} onClick={() => setOpen(false)}>View</Link>
                  )}
                  {!n.read_at && <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>Mark read</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </>
  );
}
