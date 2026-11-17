import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { FILES_BUCKET, getStoragePath } from '../lib/storage';
import { useToast } from '../components/ui/Toaster';
import { useNotifyError } from '../lib/useNotifyError';
import Breadcrumbs from '../components/Breadcrumbs';
import TypeMark from '../components/TypeMark';
import QueryError from '../components/QueryError';
import LoadMore from '../components/LoadMore';
import { SkeletonList } from '../components/Skeleton';
import { useQueryClient } from '@tanstack/react-query';
import { useTrashList, restoreFromTrash } from '../data/trash';
import { optimistic } from '../data/optimistic';
import { qk } from '../data/keys';
import { invalidateObjectLists } from '../data/objects';
import './Trash.css';

export default function Trash() {
  const { user } = useAuth();
  const client = useQueryClient();
  const { addToast } = useToast();
  const notifyError = useNotifyError();
  const { rows: objects, query, removeRow } = useTrashList(user?.id ?? null);
  const loading = query.isPending;
  const [error, setError] = useState('');
  const [restoringId, setRestoringId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  /** The row leaves the list at once and comes back if the update fails. */
  async function handleRestore(id) {
    setRestoringId(id);
    setError('');
    try {
      await optimistic(client, {
        keys: [{ queryKey: qk.trash.list(), exact: true }],
        apply: () => removeRow(id),
        run: () => restoreFromTrash(id, user.id),
      });
      addToast('success', 'Restored');
      invalidateObjectLists();
    } catch (e) {
      notifyError(e, 'Restore failed');
    } finally {
      setRestoringId(null);
    }
  }

  async function handlePermanentDelete(id) {
    if (!window.confirm('Permanently delete this object? This cannot be undone.')) return;
    setDeletingId(id);
    setError('');
    try {
      const { data: orphans, error: err } = await supabase.rpc('delete_object_permanently', { p_object_id: id });
      if (err) throw err;
      const paths = (orphans || []).map((f) => f.storage_key || getStoragePath(user.id, f.id, f.filename));
      if (paths.length) {
        const { error: storageErr } = await supabase.storage.from(FILES_BUCKET).remove(paths);
        if (storageErr && import.meta.env.DEV) console.warn('Storage cleanup failed:', storageErr);
      }
      addToast('success', 'Permanently deleted');
      removeRow(id);
    } catch (e) {
      notifyError(e, 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="trash-page">
      <header className="trash-header">
        <Breadcrumbs items={[{ label: 'Trash', to: '/trash' }]} />
        <h1 className="trash-title">Trash</h1>
        <p className="trash-desc">Soft-deleted objects. Restore or permanently delete.</p>
      </header>

      {error && <div className="trash-error" role="alert">{error}</div>}

      {loading ? (
        <SkeletonList lines={6} />
      ) : query.error ? (
        <QueryError what="trash" error={query.error} onRetry={() => query.refetch()} />
      ) : objects.length === 0 ? (
        <section className="trash-empty empty-state" aria-label="Trash empty">
          <p className="empty-state-title">Nothing in trash</p>
          <p className="empty-state-desc">Deleted objects will appear here. You can restore or permanently delete them.</p>
          <Link to="/" className="btn btn-primary">Back to Dashboard</Link>
        </section>
      ) : (
        <>
        <ul className="trash-list" aria-label="Deleted objects">
          {objects.map((o) => (
            <li key={o.id} className="trash-item">
              <TypeMark type={o.type} size="sm" className="trash-item-type-mark" />
              <span className="trash-item-title">{o.title || 'Untitled'}</span>
              <span className="trash-item-meta">{new Date(o.updated_at).toLocaleDateString()}</span>
              <div className="trash-item-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-small"
                  onClick={() => handleRestore(o.id)}
                  disabled={restoringId === o.id || deletingId === o.id}
                >
                  {restoringId === o.id ? 'Restoring…' : 'Restore'}
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-small"
                  onClick={() => handlePermanentDelete(o.id)}
                  disabled={restoringId === o.id || deletingId === o.id}
                >
                  {deletingId === o.id ? 'Deleting…' : 'Delete permanently'}
                </button>
              </div>
            </li>
          ))}
        </ul>
        <LoadMore query={query} />
        </>
      )}
    </div>
  );
}
