import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { logAudit } from '../lib/audit';
import { deliverWebhookEvent } from '../lib/webhooks';
import { createNotification } from '../lib/notifications';
import { getDraft, setDraft, clearDraft, DRAFT_KEYS } from '../lib/draftStorage';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../constants';
import { useToast } from '../context/ToastContext';
import BlockNoteEditor from '../components/BlockNoteEditor';
import './ObjectForm.css';

export default function QuickCapture() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const hasRestoredDraft = useRef(false);

  useEffect(() => {
    if (hasRestoredDraft.current) return;
    const draft = getDraft(DRAFT_KEYS.quick);
    if (!draft || (!draft.title?.trim() && !draft.content?.trim())) return;
    hasRestoredDraft.current = true;
    setTitle(draft.title ?? '');
    setContent(draft.content ?? '');
    addToast('Draft restored');
  }, [addToast]);

  const draftTimerRef = useRef(null);
  useEffect(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => setDraft(DRAFT_KEYS.quick, { title, content }), 500);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [title, content]);

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
      createNotification(user.id, 'object_created', 'Quick capture', t.slice(0, 80), { type: 'knowledge_object', id: objectId });
      addToast('success', 'Captured');
      clearDraft(DRAFT_KEYS.quick);
      navigate(`/objects/${objectId}`, { replace: true });
    } catch (err) {
      const msg = err?.message ?? err?.error_description ?? (typeof err === 'string' ? err : 'Failed to capture');
      addToast('error', msg);
      setError(msg);
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
        <div className="object-form-field">
          <span className="object-form-label">Content <span className="required">*</span></span>
          <BlockNoteEditor
            value={content}
            onChange={(val) => setContent(val)}
            placeholder="Notes, snippet, or idea… (press / for commands)"
            minHeight={180}
            aria-label="Content"
          />
        </div>
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
