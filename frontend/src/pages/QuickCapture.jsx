import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { logAudit } from '../lib/audit';
import { deliverWebhookEvent } from '../lib/webhooks';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../constants';
import { useToast } from '../context/ToastContext';
import './ObjectForm.css';

export default function QuickCapture() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const t = title.trim();
    const c = content.trim();
    if (!t || !c) {
      setError('Title and content are required.');
      return;
    }
    setSaving(true);
    try {
      const { data, error: err } = await supabase
        .from('knowledge_objects')
        .insert({
          user_id: user.id,
          type: 'note',
          title: t,
          content: c,
          summary: null,
          source: null,
        })
        .select('id')
        .single();
      if (err) throw err;
      const objectId = data.id;
      logAudit(user.id, AUDIT_ACTIONS.OBJECT_CREATE, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, objectId, { title: t, type: 'note' });
      deliverWebhookEvent('object.created', { objectId, title: t, type: 'note' });
      addToast('success', 'Captured');
      navigate(`/objects/${objectId}`, { replace: true });
    } catch (err) {
      addToast('error', err.message || 'Failed to capture');
      setError(err.message || 'Failed to capture');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="object-form-page quick-capture-page" id="main-content" role="main">
      <header className="object-form-header">
        <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'Quick capture' }]} />
        <h1>Quick capture</h1>
        <p className="quick-capture-desc">Minimal capture: title + content. You can add details later.</p>
      </header>
      <form onSubmit={handleSubmit} className="object-form object-form-quick form">
        {error && <div className="form-error" role="alert">{error}</div>}
        <label>
          Title <span className="required">*</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short title"
            required
            autoFocus
          />
        </label>
        <label>
          Content <span className="required">*</span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Notes, snippet, or idea…"
            rows={6}
            required
          />
        </label>
        <div className="object-form-actions">
          <Link to="/" className="btn btn-secondary">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Capturing…' : 'Capture'}
          </button>
        </div>
      </form>
    </div>
  );
}
