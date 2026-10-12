-- PKS Phase 2: Knowledge Objects + Versioning
-- Run in Supabase SQL Editor or via supabase db push

-- Enum for object type (matches plan: note, document, sop, report, proposal, guideline, insight, template, concept, tool, incident, case, research_paper, decision, prompt)
DO $$ BEGIN
  CREATE TYPE knowledge_object_type AS ENUM (
    'note', 'document', 'sop', 'report', 'proposal', 'guideline', 'insight',
    'template', 'concept', 'tool', 'incident', 'case', 'research_paper', 'decision', 'prompt'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- knowledge_objects: core CRUD fields (domains/tags/links in later phases)
CREATE TABLE IF NOT EXISTS public.knowledge_objects (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type              knowledge_object_type NOT NULL DEFAULT 'note',
  title             TEXT NOT NULL,
  source            TEXT,
  content           TEXT,
  summary           TEXT,
  key_points        JSONB DEFAULT '[]'::jsonb,
  is_deleted        BOOLEAN NOT NULL DEFAULT false,
  current_version   INTEGER NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_objects_user_id ON public.knowledge_objects(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_objects_is_deleted ON public.knowledge_objects(is_deleted);
CREATE INDEX IF NOT EXISTS idx_knowledge_objects_updated_at ON public.knowledge_objects(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_objects_type ON public.knowledge_objects(type);

-- knowledge_object_versions: immutable history on every update
CREATE TABLE IF NOT EXISTS public.knowledge_object_versions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_object_id  UUID NOT NULL REFERENCES public.knowledge_objects(id) ON DELETE CASCADE,
  version             INTEGER NOT NULL,
  title               TEXT NOT NULL,
  content             TEXT,
  summary             TEXT,
  key_points          JSONB DEFAULT '[]'::jsonb,
  edited_by           UUID NOT NULL REFERENCES auth.users(id),
  change_reason       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_object_versions_object_id ON public.knowledge_object_versions(knowledge_object_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_object_versions_created_at ON public.knowledge_object_versions(knowledge_object_id, created_at DESC);

-- RLS: users see only their own objects (and only non-deleted in default list)
ALTER TABLE public.knowledge_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_object_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own knowledge_objects"
  ON public.knowledge_objects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own knowledge_objects"
  ON public.knowledge_objects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own knowledge_objects"
  ON public.knowledge_objects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own knowledge_objects"
  ON public.knowledge_objects FOR DELETE
  USING (auth.uid() = user_id);

-- Versions: read/insert only (no update/delete); insert only when updating an object you own
CREATE POLICY "Users can read versions of own objects"
  ON public.knowledge_object_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.knowledge_objects ko
      WHERE ko.id = knowledge_object_versions.knowledge_object_id AND ko.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert versions for own objects"
  ON public.knowledge_object_versions FOR INSERT
  WITH CHECK (
    auth.uid() = edited_by
    AND EXISTS (
      SELECT 1 FROM public.knowledge_objects ko
      WHERE ko.id = knowledge_object_versions.knowledge_object_id AND ko.user_id = auth.uid()
    )
  );

-- updated_at trigger (reuse same function name if exists from phase1)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_knowledge_objects_updated_at ON public.knowledge_objects;
CREATE TRIGGER trg_knowledge_objects_updated_at
  BEFORE UPDATE ON public.knowledge_objects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Versioning trigger: on UPDATE of knowledge_objects, insert a row into knowledge_object_versions
CREATE OR REPLACE FUNCTION public.save_knowledge_object_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.knowledge_object_versions (
    knowledge_object_id, version, title, content, summary, key_points, edited_by, change_reason
  )
  VALUES (
    OLD.id,
    OLD.current_version,
    OLD.title,
    OLD.content,
    OLD.summary,
    OLD.key_points,
    auth.uid(),
    NULL
  );
  NEW.current_version := OLD.current_version + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_knowledge_objects_version ON public.knowledge_objects;
CREATE TRIGGER trg_knowledge_objects_version
  BEFORE UPDATE ON public.knowledge_objects
  FOR EACH ROW
  WHEN (OLD.title IS DISTINCT FROM NEW.title OR OLD.content IS DISTINCT FROM NEW.content OR OLD.summary IS DISTINCT FROM NEW.summary OR OLD.key_points IS DISTINCT FROM NEW.key_points)
  EXECUTE FUNCTION public.save_knowledge_object_version();
