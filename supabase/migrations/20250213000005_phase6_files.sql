-- PKS Phase 6: File uploads + attachments
-- Run in Supabase SQL Editor
--
-- Before using: In Dashboard > Storage, create a private bucket named "pks-files".
-- Add policy for authenticated users:
--   INSERT: (bucket_id = 'pks-files' AND (storage.foldername(name))[1] = (auth.uid())::text)
--   SELECT: same
--   DELETE: same

-- files: one row per uploaded file (storage path = user_id/id/filename)
CREATE TABLE IF NOT EXISTS public.files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  mime_type    TEXT,
  size_bytes   BIGINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_files_user_id ON public.files(user_id);

-- knowledge_object_files: M:N (object can have many files; file can be attached to many objects)
CREATE TABLE IF NOT EXISTS public.knowledge_object_files (
  knowledge_object_id UUID NOT NULL REFERENCES public.knowledge_objects(id) ON DELETE CASCADE,
  file_id             UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  PRIMARY KEY (knowledge_object_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_kof_object ON public.knowledge_object_files(knowledge_object_id);
CREATE INDEX IF NOT EXISTS idx_kof_file ON public.knowledge_object_files(file_id);

-- RLS: files
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own files"
  ON public.files FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own files"
  ON public.files FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own files"
  ON public.files FOR DELETE USING (auth.uid() = user_id);

-- RLS: knowledge_object_files
ALTER TABLE public.knowledge_object_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage kof for own objects"
  ON public.knowledge_object_files FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.knowledge_objects ko WHERE ko.id = knowledge_object_id AND ko.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.knowledge_objects ko WHERE ko.id = knowledge_object_id AND ko.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.files f WHERE f.id = file_id AND f.user_id = auth.uid())
  );
