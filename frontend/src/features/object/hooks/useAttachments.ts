import { useState, type ChangeEvent } from 'react';
import { supabase } from '../../../lib/supabase';
import { useNotifyError } from '../../../lib/useNotifyError';
import { getErrorMessage } from '../../../lib/errors';
import { FILES_BUCKET, getStoragePath } from '../../../lib/storage';
import { invalidateObjectLists } from '../../../data/objects';
import type { ObjectRow, FileRow, ListSetter, SetError } from '../types';

type Options = { object: ObjectRow | null; userId: string | undefined; setAttachedFiles: ListSetter<FileRow>; setError: SetError };

/** Attach a file (upload + link), download it through a signed URL, or detach it. */
export function useAttachments({ object, userId, setAttachedFiles, setError }: Options) {
  const notifyError = useNotifyError();
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
      setAttachedFiles((prev) => [...prev, { id: fileRow.id, filename: file.name, mime_type: file.type, size_bytes: file.size }]);
      invalidateObjectLists();
    } catch (err) {
      setError(notifyError(err, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  }

  async function download(f: FileRow) {
    setError('');
    try {
      const path = f.storage_key || getStoragePath(userId as string, f.id, f.filename);
      const { data, error: err } = await supabase.storage.from(FILES_BUCKET).createSignedUrl(path, 60);
      if (err) throw err;
      if (data?.signedUrl) window.open(data.signedUrl, '_blank');
    } catch (err) {
      setError(getErrorMessage(err, 'Download failed'));
    }
  }

  async function detach(fileId: string) {
    if (!object) return;
    setError('');
    try {
      const { error: err } = await supabase.from('knowledge_object_files').delete().eq('knowledge_object_id', object.id).eq('file_id', fileId);
      if (err) throw err;
      setAttachedFiles((prev) => prev.filter((x) => x.id !== fileId));
      invalidateObjectLists();
    } catch (err) {
      setError(notifyError(err, 'Failed to remove attachment'));
    }
  }

  return { uploading, attach, download, detach };
}
