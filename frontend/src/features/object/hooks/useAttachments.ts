import { useState, type ChangeEvent } from 'react';
import { supabase } from '../../../lib/supabase';
import { useNotifyError } from '../../../lib/useNotifyError';
import { getErrorMessage } from '../../../lib/errors';
import { openInNewTab } from '../../../lib/download';
import { FILES_BUCKET, getStoragePath } from '../../../lib/storage';
import { invalidateObjectLists } from '../../../data/objects';
import { useQueryClient } from '@tanstack/react-query';
import { optimistic } from '../../../data/optimistic';
import { qk } from '../../../data/keys';
import { useUndoToast } from './useUndoToast';
import type { ObjectRow, FileRow, SetError } from '../types';

type Options = { object: ObjectRow | null; userId: string | undefined; setError: SetError };

/** Attach a file (upload + link), download it through a signed URL, or detach it (at once, with Undo). */
export function useAttachments({ object, userId, setError }: Options) {
  const client = useQueryClient();
  const notifyError = useNotifyError();
  const undoToast = useUndoToast();
  const [uploading, setUploading] = useState(false);

  async function attach(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !object || !userId) return;
    e.target.value = '';
    setError('');
    setUploading(true);
    try {
      const { data: fileRow, error: insertErr } = await supabase.from('files').insert({
        user_id: userId,
        filename: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
      }).select('id').single();
      if (insertErr) throw insertErr;
      const path = getStoragePath(userId, fileRow.id, file.name);
      const { error: uploadErr } = await supabase.storage.from(FILES_BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      if (uploadErr) {
        await supabase.from('files').delete().eq('id', fileRow.id);
        throw uploadErr;
      }
      await supabase.from('files').update({ storage_key: path }).eq('id', fileRow.id);
      const { error: linkErr } = await supabase.from('knowledge_object_files').insert({ knowledge_object_id: object.id, file_id: fileRow.id });
      if (linkErr) throw linkErr;
      client.setQueryData<FileRow[]>(qk.object.files(object.id), (prev = []) =>
        [...prev, { id: fileRow.id, filename: file.name, mime_type: file.type, size_bytes: file.size, storage_key: path }]);
      invalidateObjectLists();
    } catch (err) {
      setError(notifyError(err, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  }

  /**
   * Sign a short-lived URL and open it in a new tab. The anchor click is not a popup,
   * so the await is safe (the old window.open flow had to open the tab inside the click; R16).
   */
  async function download(f: FileRow) {
    setError('');
    try {
      const path = f.storage_key || getStoragePath(userId as string, f.id, f.filename);
      const { data, error: err } = await supabase.storage.from(FILES_BUCKET).createSignedUrl(path, 60);
      if (err) throw err;
      if (!data?.signedUrl) throw new Error('Download failed');
      openInNewTab(data.signedUrl);
    } catch (err) {
      setError(getErrorMessage(err, 'Download failed'));
    }
  }

  /** Optimistically link or unlink file `f` on object `oid`. Throws after rolling back. */
  async function setAttached(oid: string, f: FileRow, attached: boolean) {
    const key = qk.object.files(oid);
    await optimistic(client, {
      keys: [{ queryKey: key, exact: true }],
      apply: () => client.setQueryData<FileRow[]>(key, (prev = []) =>
        attached ? [...prev.filter((x) => x.id !== f.id), f] : prev.filter((x) => x.id !== f.id)),
      run: async () => {
        const { error: err } = attached
          ? await supabase.from('knowledge_object_files').insert({ knowledge_object_id: oid, file_id: f.id })
          : await supabase.from('knowledge_object_files').delete().eq('knowledge_object_id', oid).eq('file_id', f.id);
        if (err) throw err;
      },
    });
    void invalidateObjectLists();
  }

  async function detach(fileId: string) {
    if (!object) return;
    setError('');
    const oid = object.id;
    const file = client.getQueryData<FileRow[]>(qk.object.files(oid))?.find((x) => x.id === fileId)
      ?? { id: fileId, filename: '', mime_type: null, size_bytes: null };
    const pending = setAttached(oid, file, false);
    const withdraw = undoToast('Attachment removed', () => setAttached(oid, file, true), pending);
    try {
      await pending;
    } catch (err) {
      withdraw();
      setError(notifyError(err, 'Failed to remove attachment'));
    }
  }

  return { uploading, attach, download, detach };
}
