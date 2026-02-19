-- Create the pks-files storage bucket (private) and RLS policies for file attachments.
-- Fixes "Bucket not found" when uploading attachments on object detail.
-- Path convention: userId/fileId/filename (see getStoragePath in frontend).

INSERT INTO storage.buckets (id, name, public)
VALUES ('pks-files', 'pks-files', false)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public;

-- Allow authenticated users to upload only to their own folder (first path segment = auth.uid())
DROP POLICY IF EXISTS "pks-files insert own" ON storage.objects;
CREATE POLICY "pks-files insert own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'pks-files'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- Allow authenticated users to read/delete only from their own folder
DROP POLICY IF EXISTS "pks-files select own" ON storage.objects;
CREATE POLICY "pks-files select own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'pks-files'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "pks-files delete own" ON storage.objects;
CREATE POLICY "pks-files delete own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'pks-files'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );
