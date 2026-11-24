import { useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import Breadcrumbs from '../components/Breadcrumbs';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { SkeletonList } from '../components/Skeleton';
import QueryError from '../components/QueryError';
import LoadMore from '../components/LoadMore';
import { formatObjectTypeLabel } from '../constants';
import { useNotifyError } from '../lib/useNotifyError';
import { useNotificationsList, invalidateNotifications } from '../data/notifications';
import './Notifications.css';
import Button, { ButtonLink } from '../components/ui/Button';
import Page from '../components/ui/Page';

export default function Notifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const notifyError = useNotifyError();
  const [filter, setFilter] = useState('all'); // all | unread
  const { rows: list, query, patchRow } = useNotificationsList(user?.id ?? null, filter);
  const loading = query.isPending;

  async function markRead(id) {
    if (!user?.id) return;
    const readAt = new Date().toISOString();
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: readAt })
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) {
      notifyError(error, 'Failed to update notification');
      return;
    }
    patchRow(id, { read_at: readAt });
  }

  async function markUnread(id) {
    if (!user?.id) return;
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: null })
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) {
      notifyError(error, 'Failed to update notification');
      return;
    }
    patchRow(id, { read_at: null });
  }

  async function markAllRead() {
    if (!user?.id) return;
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null);
    if (error) {
      notifyError(error, 'Failed to update notification');
      return;
    }
    invalidateNotifications(queryClient);
  }

  return (
    <Page title="Notifications" width="narrow" className="notifications-page">
      <header className="notifications-header">
        <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'Notifications' }]} />
        <div className="notifications-toolbar">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter notifications">
            <option value="all">All</option>
            <option value="unread">Unread</option>
          </select>
          {filter === 'all' && list.some((n) => !n.read_at) && (
            <Button onClick={markAllRead}>Mark all read</Button>
          )}
        </div>
      </header>
      {loading ? (
        <div className="notifications-loading" role="status" aria-live="polite">
          <SkeletonList lines={6} />
        </div>
      ) : query.error ? (
        <QueryError what="notifications" error={query.error} onRetry={() => query.refetch()} />
      ) : list.length === 0 ? (
        <p className="notifications-empty" role="status">No notifications.</p>
      ) : (
        <>
        <ul className="notifications-list">
          {list.map((n) => (
            <li key={n.id} className={n.read_at ? 'read' : 'unread'}>
              <div className="notifications-item">
                <div className="notifications-item-main">
                  <span className="notifications-title">{n.title}</span>
                  {n.body && <span className="notifications-body">{n.body}</span>}
                  <span className="notifications-meta">
                    {formatObjectTypeLabel(n.type)} · {new Date(n.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="notifications-item-actions">
                  {n.related_type === 'knowledge_object' && n.related_id && (
                    <ButtonLink to={`/objects/${n.related_id}`} size="sm">View object</ButtonLink>
                  )}
                  {n.read_at ? (
                    <Button size="sm" onClick={() => markUnread(n.id)}>Mark unread</Button>
                  ) : (
                    <Button size="sm" onClick={() => markRead(n.id)}>Mark read</Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <LoadMore query={query} />
        </>
      )}
    </Page>
  );
}
