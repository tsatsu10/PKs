import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import Breadcrumbs from '../components/Breadcrumbs';
import { OBJECT_TYPE_ICONS } from '../constants';
import { SkeletonList } from '../components/Skeleton';
import './Trash.css';

export default function Trash() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restoringId, setRestoringId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('knowledge_objects')
        .select('id, type, title, updated_at')
        .eq('user_id', user.id)
        .eq('is_deleted', true)
        .order('updated_at', { ascending: false });
      if (err) throw err;
      setObjects(data || []);
    } catch (e) {
      setError(e?.message ?? 'Failed to load trash');
      setObjects([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRestore(id) {
    setRestoringId(id);
    setError('');
    try {
      const { error: err } = await supabase
        .from('knowledge_objects')
        .update({ is_deleted: false })
        .eq('id', id)
        .eq('user_id', user.id);
      if (err) throw err;
      addToast('success', 'Restored');
      setObjects((prev) => prev.filter((o) => o.id !== id));
    } catch (e) {
      addToast('error', e?.message ?? 'Restore failed');
    } finally {
      setRestoringId(null);
    }
  }

  async function handlePermanentDelete(id) {
    if (!window.confirm('Permanently delete this object? This cannot be undone.')) return;
    setDeletingId(id);
    setError('');
    try {
      const { error: err } = await supabase
        .from('knowledge_objects')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (err) throw err;
      addToast('success', 'Permanently deleted');
      setObjects((prev) => prev.filter((o) => o.id !== id));
    } catch (e) {
      addToast('error', e?.message ?? 'Delete failed');
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
      ) : objects.length === 0 ? (
        <section className="trash-empty" aria-label="Trash empty">
          <p className="trash-empty-text">Nothing in trash. Deleted objects will appear here.</p>
          <Link to="/" className="btn btn-primary">Back to Dashboard</Link>
        </section>
      ) : (
        <ul className="trash-list" aria-label="Deleted objects">
          {objects.map((o) => (
            <li key={o.id} className="trash-item">
              <span className="trash-item-type" title={o.type} aria-hidden>
                {OBJECT_TYPE_ICONS[o.type] ?? '•'}
              </span>
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
      )}
    </div>
  );
}
