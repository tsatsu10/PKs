import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../lib/errors';
import { logAudit } from '../lib/audit';
import { deliverWebhookEvent } from '../lib/webhooks';
import { createNotification } from '../lib/notifications';
import { getDraft, setDraft, clearDraft, DRAFT_KEYS } from '../lib/draftStorage';
import { createObject } from '../data/createObject';
import { useQueryClient } from '@tanstack/react-query';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../constants';
import { useToast } from '../components/ui/Toaster';
import BlockNoteEditor from '../components/BlockNoteEditor';
import Button, { ButtonLink } from '../components/ui/Button';
import Field from '../components/ui/Field';
import Input from '../components/ui/Input';
import Page from '../components/ui/Page';
import './ObjectForm.css';

export default function QuickCapture() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
    addToast('success', 'Draft restored');
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
      const objectId = createObject({
        userId: user.id,
        row: { type: 'note', title: t, content: c, summary: null, source: null },
        onCreated: (createdId) => {
          // The draft goes only once the row exists: a failed create must not lose what was typed.
          clearDraft(DRAFT_KEYS.quick);
          logAudit(user.id, AUDIT_ACTIONS.OBJECT_CREATE, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, createdId, { title: t, type: 'note' });
          deliverWebhookEvent('object.created', { objectId: createdId, title: t, type: 'note' });
          createNotification(user.id, 'object_created', 'Quick capture', t.slice(0, 80), { type: 'knowledge_object', id: createdId });
        },
      }, queryClient);
      addToast('success', 'Captured');
      navigate(`/objects/${objectId}`, { replace: true });
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to capture');
      addToast('error', msg);
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page title="Quick capture" width="narrow">
      <Breadcrumbs items={[{ label: 'Dashboard', to: '/' }, { label: 'Quick capture' }]} />
      <p className="quick-capture-desc">Minimal capture: title + content. You can add details later.</p>
      <form onSubmit={handleSubmit} className="object-form object-form-quick">
        {error && <div className="object-form-error" role="alert">{error}</div>}
        <Field label="Title (required)">
          {(f) => (
            // eslint-disable-next-line jsx-a11y/no-autofocus -- the page exists to type into this field
            <Input id={f.id} type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short title" required autoFocus />
          )}
        </Field>
        <div className="object-form-field">
          <span className="object-form-label">Content (required)</span>
          <BlockNoteEditor
            value={content}
            onChange={(val) => setContent(val)}
            placeholder="Notes, snippet, or idea… (press / for commands)"
            minHeight={180}
            aria-label="Content"
          />
        </div>
        <div className="object-form-actions">
          <ButtonLink to="/">Cancel</ButtonLink>
          <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Capturing…' : 'Capture'}</Button>
        </div>
      </form>
    </Page>
  );
}
