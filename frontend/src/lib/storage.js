/**
 * Shared storage constants and path helper for PKS file attachments.
 * Single source of truth so ObjectDetail and any future file-using features (e.g. imports)
 * use the same bucket and path convention. Storage policies in Supabase must allow
 * (storage.foldername(name))[1] = (auth.uid())::text.
 */

/** Supabase Storage bucket name for user-uploaded files (PDF, DOCX, TXT) */
export const FILES_BUCKET = 'pks-files';

/**
 * Storage path for a file: userId/fileId/safeFilename (one path per file for RLS).
 * @param {string} userId - auth user id
 * @param {string} fileId - files.id
 * @param {string} filename - original filename
 */
export function getStoragePath(userId, fileId, filename) {
  const safe = (filename || 'file').replace(/[/\\]/g, '_');
  return `${userId}/${fileId}/${safe}`;
}
