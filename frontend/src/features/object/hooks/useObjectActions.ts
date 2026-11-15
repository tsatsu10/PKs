import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { logAudit } from '../../../lib/audit';
import { useNotifyError } from '../../../lib/useNotifyError';
import { useToast } from '../../../context/ToastContext';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../../../constants';
import { fetchVersionSnapshot, fetchVersionSnapshotByNumber, invalidateObject, type VersionSnapshot } from '../../../data/objectDetail';
import { restoreFromTrash } from '../../../data/trash';
import { optimistic } from '../../../data/optimistic';
import { useUndoToast } from './useUndoToast';
import { setObjectInLists, invalidateObjectLists } from '../../../data/objects';
import type { SaveQueue } from '../save/saveQueue';
import { qk } from '../../../data/keys';
import type { ObjectRow, Named, SetError } from '../types';

const toVersionFields = (version: number, snap: VersionSnapshot) => ({
  version,
  title: snap.title,
  content: snap.content ?? null,
  content_json: snap.content_json ?? null,
  summary: snap.summary ?? null,
  key_points: snap.key_points ?? [],
});

type Options = {
  object: ObjectRow | null;
  userId: string | undefined;
  objectDomains: Named[];
  objectTags: Named[];
  /** The object's save queue (editable objects only): restore and Save version go through it. */
  queue: SaveQueue | null;
  setError: SetError;
};

/** Restore a version, save a version, duplicate, move to Trash, and pin/unpin. */
export function useObjectActions({ object, userId, objectDomains, objectTags, queue, setError }: Options) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const { addToast } = useToast() as { addToast: (type: string, message: string) => void };
  const notifyError = useNotifyError();
  const undoToast = useUndoToast();
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
      const before = await queue.applyVersion(toVersionFields(ver.version, snap));
      const oid = object.id;
      undoToast(`Restored to v${ver.version}`, async () => {
        const prev = await fetchVersionSnapshotByNumber(oid, before);
        await queue.applyVersion(toVersionFields(prev.version, prev));
        addToast('success', 'Undone');
      });
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
      // Save what was just typed, then copy the row as saved (the prop may predate it).
      await queue?.flush();
      const src = client.getQueryData<ObjectRow>(qk.object.detail(object.id)) ?? object;
      const title = `Copy of ${src.title}`.slice(0, 500);
      const { data: newObj, error: insErr } = await supabase
        .from('knowledge_objects')
        .insert({
          user_id: userId,
          type: src.type,
          title,
          source: src.source || null,
          content: src.content || null,
          content_json: src.content_json ?? null,
          summary: src.summary || null,
          key_points: src.key_points ?? [],
          status: src.status || 'active',
          due_at: src.due_at || null,
          remind_at: src.remind_at || null,
          cover_url: src.cover_url || null,
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

  /**
   * Move to Trash without asking (U5): save what was just typed, leave the page, hide the object
   * from the lists at once, and offer Undo. The undo needs nothing from this (by then unmounted) page.
   */
  async function remove() {
    if (!object || !userId) return;
    setDeleting(true);
    setError('');
    const { id, title } = object;
    try {
      // Save what was just typed first, so restoring from Trash brings it back.
      await queue?.flush();
    } catch (err) {
      setDeleting(false);
      setError(notifyError(err, 'Delete failed'));
      return;
    }
    navigate('/', { replace: true });
    const pending = optimistic(client, {
      keys: [{ queryKey: qk.objects.all }, { queryKey: ['search'] }, { queryKey: qk.trash.list() }, { queryKey: qk.object.detail(id), exact: true }],
      apply: () => setObjectInLists(id, null, client),
      run: async () => {
        const { error: err } = await supabase.from('knowledge_objects').update({ is_deleted: true }).eq('id', id).eq('user_id', userId);
        if (err) throw err;
      },
    });
    const withdraw = undoToast('Moved to Trash', async () => {
      await restoreFromTrash(id, userId);
      addToast('success', 'Restored');
      await Promise.all([invalidateObjectLists(client), invalidateObject(id, client)]);
    });
    try {
      await pending;
      logAudit(userId, AUDIT_ACTIONS.OBJECT_DELETE, AUDIT_ENTITY_TYPES.KNOWLEDGE_OBJECT, id, { title });
      void invalidateObjectLists(client);
    } catch (err) {
      withdraw();
      setError(notifyError(err, 'Delete failed'));
    } finally {
      setDeleting(false);
    }
  }

  async function togglePin() {
    if (!object || !userId) return;
    setPinning(true);
    setError('');
    const { id } = object;
    const next = !object.is_pinned;
    try {
      await optimistic(client, {
        keys: [{ queryKey: qk.object.detail(id), exact: true }, { queryKey: ['objects', 'page'] }, { queryKey: ['search', 'results'] }],
        apply: () => {
          client.setQueryData<ObjectRow>(qk.object.detail(id), (o) => o && { ...o, is_pinned: next });
          setObjectInLists(id, { is_pinned: next }, client);
        },
        run: async () => {
          const { error: e } = await supabase.from('knowledge_objects').update({ is_pinned: next }).eq('id', id).eq('user_id', userId);
          if (e) throw e;
        },
      });
    } catch (err) {
      setError(notifyError(err, 'Failed to update pin'));
    } finally {
      setPinning(false);
    }
  }

  return { restoreVersion, restoringVersion, saveVersion, savingVersion, duplicate, duplicating, remove, deleting, togglePin, pinning };
}
