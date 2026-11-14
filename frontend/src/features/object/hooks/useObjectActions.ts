import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { logAudit } from '../../../lib/audit';
import { useNotifyError } from '../../../lib/useNotifyError';
import { useToast } from '../../../context/ToastContext';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../../../constants';
import { fetchVersionSnapshot } from '../../../data/objectDetail';
import { setObjectInLists, invalidateObjectLists } from '../../../data/objects';
import type { SaveQueue } from '../save/saveQueue';
import type { ObjectRow, Named, SetError } from '../types';

type Options = {
  object: ObjectRow | null;
  userId: string | undefined;
  objectDomains: Named[];
  objectTags: Named[];
  /** The object's save queue (editable objects only): restore and Save version go through it. */
  queue: SaveQueue | null;
  setObject: (next: (prev: ObjectRow) => ObjectRow) => void;
  setError: SetError;
};

/** Restore a version, save a version, duplicate, move to Trash, and pin/unpin. */
export function useObjectActions({ object, userId, objectDomains, objectTags, queue, setObject, setError }: Options) {
  const navigate = useNavigate();
  const { addToast } = useToast() as { addToast: (type: string, message: string) => void };
  const notifyError = useNotifyError();
  const [restoringVersion, setRestoringVersion] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);

  /** Unsent edits are saved first, the current text is snapshotted, then the version is saved over it. */
  async function restoreVersion(ver: { id: string; version: number }) {
    if (!object || !userId || !ver?.id || !queue) return;
    setRestoringVersion(ver.id);
    setError('');
    try {
      // Read the snapshot fresh so a partially-loaded version list can never restore blanks.
      const snap = await fetchVersionSnapshot(ver.id);
      await queue.applyVersion({
        version: ver.version,
        title: snap.title,
        content: snap.content ?? null,
        content_json: snap.content_json ?? null,
        summary: snap.summary ?? null,
        key_points: snap.key_points ?? [],
      });
      addToast('success', `Restored to v${ver.version}`);
    } catch (err) {
      setError(notifyError(err, 'Restore failed'));
    } finally {
      setRestoringVersion(null);
    }
  }

  async function saveVersion() {
    if (!queue) return;
    setSavingVersion(true);
    setError('');
    try {
      await queue.snapshot();
      addToast('success', 'Version saved');
    } catch (err) {
      setError(notifyError(err, 'Could not save a version'));
    } finally {
      setSavingVersion(false);
    }
  }

  async function duplicate() {
    if (!object || !userId) return;
    setDuplicating(true);
    setError('');
    try {
      const title = `Copy of ${object.title}`.slice(0, 500);
      const { data: newObj, error: insErr } = await supabase
        .from('knowledge_objects')
        .insert({
          user_id: userId,
          type: object.type,
          title,
          source: object.source || null,
          content: object.content || null,
          content_json: object.content_json ?? null,
          summary: object.summary || null,
          key_points: object.key_points ?? [],
          status: object.status || 'active',
          due_at: object.due_at || null,
          remind_at: object.remind_at || null,
          cover_url: object.cover_url || null,
        })
        .select('id')
        .single();
      if (insErr) throw insErr;
      const newId = newObj.id;
      if (objectDomains.length) {
        await supabase.from('knowledge_object_domains').insert(
          objectDomains.map((d) => ({ knowledge_object_id: newId, domain_id: d.id }))
        );
      }
      if (objectTags.length) {
        await supabase.from('knowledge_object_tags').insert(
          objectTags.map((t) => ({ knowledge_object_id: newId, tag_id: t.id }))
        );
      }
      logAudit(userId, AUDIT_ACTIONS.OBJECT_CREATE, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, newId, { title, duplicated_from: object.id });
      addToast('success', 'Object duplicated');
      await invalidateObjectLists();
      navigate(`/objects/${newId}`);
    } catch (err) {
      setError(notifyError(err, 'Duplicate failed'));
    } finally {
      setDuplicating(false);
    }
  }

  async function remove() {
    if (!object || !userId || !window.confirm('Move this object to Trash? You can restore it from Trash later.')) return;
    setDeleting(true);
    setError('');
    try {
      const { error: err } = await supabase
        .from('knowledge_objects')
        .update({ is_deleted: true })
        .eq('id', object.id)
        .eq('user_id', userId);
      if (err) throw err;
      logAudit(userId, AUDIT_ACTIONS.OBJECT_DELETE, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, object.id, { title: object.title });
      addToast('success', 'Moved to Trash');
      setObjectInLists(object.id, null);
      await invalidateObjectLists();
      navigate('/', { replace: true });
    } catch (err) {
      setError(notifyError(err, 'Delete failed'));
    } finally {
      setDeleting(false);
    }
  }

  async function togglePin() {
    if (!object || !userId) return;
    setPinning(true);
    setError('');
    try {
      const { error: e } = await supabase
        .from('knowledge_objects')
        .update({ is_pinned: !object.is_pinned })
        .eq('id', object.id)
        .eq('user_id', userId);
      if (e) throw e;
      setObject((o) => ({ ...o, is_pinned: !o.is_pinned }));
      setObjectInLists(object.id, { is_pinned: !object.is_pinned });
    } catch (err) {
      setError(notifyError(err, 'Failed to update pin'));
    } finally {
      setPinning(false);
    }
  }

  return { restoreVersion, restoringVersion, saveVersion, savingVersion, duplicate, duplicating, remove, deleting, togglePin, pinning };
}
