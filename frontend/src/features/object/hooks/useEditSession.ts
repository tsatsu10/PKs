import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { objectToEditForm, buildObjectPatch, draftFromForm, formFromDraft } from '../../../lib/objectForm';
import { setDraft, clearDraft, DRAFT_KEYS } from '../../../lib/draftStorage';
import { logAudit } from '../../../lib/audit';
import { useNotifyError } from '../../../lib/useNotifyError';
import { useToast } from '../../../context/ToastContext';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../../../constants';
import { fetchObjectRow, invalidateObjectVersions, OBJECT_COLS } from '../../../data/objectDetail';
import { invalidateObjectLists } from '../../../data/objects';
import type { ObjectDraft } from '../useObjectPage';
import type { ObjectRow, SetError } from '../types';

export type EditFormFields = {
  title: string;
  content: string;
  summary: string;
  source: string;
  status: string;
  due_at: string;
  remind_at: string;
  cover_url: string;
};

type Options = {
  id: string | undefined;
  object: ObjectRow | null;
  isOwner: boolean;
  draft: ObjectDraft | null;
  setObject: (next: (prev: ObjectRow) => ObjectRow) => void;
  setError: SetError;
  userId: string | undefined;
};

const DRAFT_DELAY_MS = 500;
const toForm = (object: ObjectRow) => objectToEditForm(object) as EditFormFields;

/**
 * Edit mode: the form, draft save/restore, the before-unload guard, and save with the revision check.
 * The editor's content lives in a ref (`onContentChange` never sets state), so typing doesn't
 * re-render the page; `save()` and the draft timer read it from there.
 */
export function useEditSession({ id, object, isOwner, draft, setObject, setError, userId }: Options) {
  const { addToast } = useToast() as { addToast: (type: string, message: string) => void };
  const notifyError = useNotifyError();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<EditFormFields>({ title: '', content: '', summary: '', source: '', status: 'active', due_at: '', remind_at: '', cover_url: '' });
  const [initialContent, setInitialContent] = useState('');
  const formRef = useRef(editForm);
  const contentRef = useRef('');
  // Revision the current edit is based on; used for the optimistic-concurrency check on save.
  const baseRevisionRef = useRef<number | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelDraftWrite = useCallback(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = null;
  }, []);

  const scheduleDraftWrite = useCallback(() => {
    if (!id) return;
    cancelDraftWrite();
    draftTimerRef.current = setTimeout(() => {
      draftTimerRef.current = null;
      setDraft(DRAFT_KEYS.object(id), draftFromForm({ ...formRef.current, content: contentRef.current }, baseRevisionRef.current));
    }, DRAFT_DELAY_MS);
  }, [id, cancelDraftWrite]);

  useEffect(() => cancelDraftWrite, [cancelDraftWrite]);

  /** Replace the whole form (start, restore, cancel); the editor will mount with its content. */
  const loadForm = useCallback((form: EditFormFields) => {
    formRef.current = form;
    contentRef.current = form.content ?? '';
    setEditForm(form);
    setInitialContent(form.content ?? '');
  }, []);

  const draftAppliedRef = useRef(false);
  useEffect(() => {
    if (!object || !id || draftAppliedRef.current) return;
    const d = draft && (draft.title !== undefined || draft.content !== undefined || draft.summary !== undefined) ? draft : null;
    if (!d) return;
    draftAppliedRef.current = true;
    const restored = formFromDraft(d, object) as { form: EditFormFields; baseRevision: number };
    baseRevisionRef.current = restored.baseRevision;
    loadForm(restored.form);
    setEditing(true);
    addToast('success', 'Draft restored');
  }, [object, id, draft, addToast, loadForm]);

  // Warn before closing or reloading the tab mid-edit (drafts cover in-app navigation).
  useEffect(() => {
    if (!editing) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [editing]);

  function setField<K extends keyof EditFormFields>(key: K, value: EditFormFields[K]) {
    formRef.current = { ...formRef.current, [key]: value };
    setEditForm(formRef.current);
    scheduleDraftWrite();
  }

  const onContentChange = useCallback((markdown: string) => {
    contentRef.current = markdown ?? '';
    scheduleDraftWrite();
  }, [scheduleDraftWrite]);

  function start() {
    if (!object) return;
    baseRevisionRef.current = object.revision;
    loadForm(toForm(object));
    setEditing(true);
  }

  function cancel() {
    cancelDraftWrite();
    setEditing(false);
    if (object) {
      loadForm(toForm(object));
      clearDraft(DRAFT_KEYS.object(object.id));
    }
  }

  async function save() {
    if (!object || !userId) return;
    setSaving(true);
    setError('');
    const form = { ...formRef.current, content: contentRef.current };
    try {
      const patch = buildObjectPatch(object, form, { isOwner });
      if (Object.keys(patch).length === 0) {
        cancelDraftWrite();
        setEditing(false);
        clearDraft(DRAFT_KEYS.object(object.id));
        return;
      }
      // Optimistic concurrency: revision bumps on every edit (views and pins
      // excluded), so any change made elsewhere since this edit began is caught.
      const { data: updatedRows, error: err } = await supabase
        .from('knowledge_objects')
        .update(patch)
        .eq('id', object.id)
        .eq('revision', baseRevisionRef.current ?? object.revision)
        .select(OBJECT_COLS);
      if (err) throw err;
      if (!updatedRows || updatedRows.length === 0) {
        // Refresh this tab's copy so Cancel then Edit starts from the latest
        // version. Stay in edit mode; the draft stays until the user cancels.
        try {
          const fresh = await fetchObjectRow(object.id);
          if (fresh) setObject((o) => ({ ...o, ...fresh }));
        } catch (_e) { void _e; }
        const msg = 'This object was changed elsewhere (another tab or device). Your text is still in the editor — copy it, click Cancel, then Edit again and paste it back.';
        setError(msg);
        addToast('error', msg);
        return;
      }
      // Merge the full saved row so a stale tab also picks up other tabs' changes.
      setObject((o) => ({ ...o, ...updatedRows[0] }));
      cancelDraftWrite();
      setEditing(false);
      clearDraft(DRAFT_KEYS.object(object.id));
      addToast('success', 'Changes saved');
      logAudit(userId, AUDIT_ACTIONS.OBJECT_UPDATE, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, object.id, { title: form.title.trim() });
      invalidateObjectVersions(object.id);
      invalidateObjectLists();
    } catch (err) {
      setError(notifyError(err, 'Update failed'));
    } finally {
      setSaving(false);
    }
  }

  return { editing, editForm, setField, contentRef, initialContent, onContentChange, start, cancel, save, saving };
}
