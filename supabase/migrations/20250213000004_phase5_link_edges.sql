-- PKS Phase 5: Object-to-Object Linking
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.link_edges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_object_id  UUID NOT NULL REFERENCES public.knowledge_objects(id) ON DELETE CASCADE,
  to_object_id    UUID NOT NULL REFERENCES public.knowledge_objects(id) ON DELETE CASCADE,
  relationship_type TEXT DEFAULT 'references',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT link_edges_no_self CHECK (from_object_id != to_object_id),
  CONSTRAINT link_edges_unique UNIQUE (from_object_id, to_object_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_link_edges_from ON public.link_edges(from_object_id);
CREATE INDEX IF NOT EXISTS idx_link_edges_to ON public.link_edges(to_object_id);

-- RLS: user can only manage links between their own objects
ALTER TABLE public.link_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read links for own objects"
  ON public.link_edges FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.knowledge_objects ko WHERE ko.id = from_object_id AND ko.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.knowledge_objects ko WHERE ko.id = to_object_id AND ko.user_id = auth.uid())
  );

CREATE POLICY "Users can insert links between own objects"
  ON public.link_edges FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.knowledge_objects ko WHERE ko.id = from_object_id AND ko.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.knowledge_objects ko WHERE ko.id = to_object_id AND ko.user_id = auth.uid())
  );

CREATE POLICY "Users can delete links for own objects"
  ON public.link_edges FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.knowledge_objects ko WHERE ko.id = from_object_id AND ko.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.knowledge_objects ko WHERE ko.id = to_object_id AND ko.user_id = auth.uid())
  );
