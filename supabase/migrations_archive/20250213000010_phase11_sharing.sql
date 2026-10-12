-- PKS Phase 11b: Sharing & Permissions
-- Run in Supabase SQL Editor
-- share_permissions: share object with another user (viewer | editor)

DO $$ BEGIN
  CREATE TYPE share_role AS ENUM ('viewer', 'editor');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.share_permissions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_object_id  UUID NOT NULL REFERENCES public.knowledge_objects(id) ON DELETE CASCADE,
  shared_with_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_email   TEXT,
  role                share_role NOT NULL DEFAULT 'viewer',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(knowledge_object_id, shared_with_user_id)
);

CREATE INDEX IF NOT EXISTS idx_share_permissions_object ON public.share_permissions(knowledge_object_id);
CREATE INDEX IF NOT EXISTS idx_share_permissions_shared_with ON public.share_permissions(shared_with_user_id);

ALTER TABLE public.share_permissions ADD COLUMN IF NOT EXISTS shared_with_email TEXT;

ALTER TABLE public.share_permissions ENABLE ROW LEVEL SECURITY;

-- Owner can manage shares for their objects; shared user can read the row (to see their permission)
CREATE POLICY "Owners can manage share_permissions"
  ON public.share_permissions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.knowledge_objects ko WHERE ko.id = knowledge_object_id AND ko.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.knowledge_objects ko WHERE ko.id = knowledge_object_id AND ko.user_id = auth.uid())
  );

CREATE POLICY "Shared user can read own share_permissions"
  ON public.share_permissions FOR SELECT
  USING (shared_with_user_id = auth.uid());

-- Resolve email to user id (for sharing by email). Returns null if not found.
CREATE OR REPLACE FUNCTION public.resolve_user_id_by_email(target_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.users WHERE email = trim(target_email) LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_user_id_by_email(text) TO authenticated;

-- Allow knowledge_objects to be read/updated by shared users
DROP POLICY IF EXISTS "Users can read own knowledge_objects" ON public.knowledge_objects;
CREATE POLICY "Users can read own knowledge_objects"
  ON public.knowledge_objects FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.share_permissions sp WHERE sp.knowledge_object_id = id AND sp.shared_with_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own knowledge_objects" ON public.knowledge_objects;
CREATE POLICY "Users can update own knowledge_objects"
  ON public.knowledge_objects FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.share_permissions sp WHERE sp.knowledge_object_id = id AND sp.shared_with_user_id = auth.uid() AND sp.role = 'editor')
  );

-- Search RPC: include objects shared with the user
CREATE OR REPLACE FUNCTION public.search_knowledge_objects(
  search_query    text DEFAULT NULL,
  type_filter     text DEFAULT NULL,
  domain_id_f     uuid DEFAULT NULL,
  tag_id_f        uuid DEFAULT NULL,
  date_from_f     timestamptz DEFAULT NULL,
  date_to_f       timestamptz DEFAULT NULL,
  limit_n         int DEFAULT 50,
  offset_n        int DEFAULT 0
)
RETURNS SETOF public.knowledge_objects
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ko.*
  FROM public.knowledge_objects ko
  WHERE (ko.user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.share_permissions sp WHERE sp.knowledge_object_id = ko.id AND sp.shared_with_user_id = auth.uid()))
    AND ko.is_deleted = false
    AND (search_query IS NULL OR search_query = '' OR ko.fts @@ plainto_tsquery('english', search_query))
    AND (type_filter IS NULL OR type_filter = '' OR ko.type::text = type_filter)
    AND (domain_id_f IS NULL OR EXISTS (
      SELECT 1 FROM public.knowledge_object_domains kod
      WHERE kod.knowledge_object_id = ko.id AND kod.domain_id = domain_id_f
    ))
    AND (tag_id_f IS NULL OR EXISTS (
      SELECT 1 FROM public.knowledge_object_tags kot
      WHERE kot.knowledge_object_id = ko.id AND kot.tag_id = tag_id_f
    ))
    AND (date_from_f IS NULL OR ko.updated_at >= date_from_f)
    AND (date_to_f IS NULL OR ko.updated_at <= date_to_f)
  ORDER BY ko.updated_at DESC
  LIMIT greatest(1, least(limit_n, 100))
  OFFSET greatest(0, offset_n);
$$;

-- Versions: shared user can read versions of objects they can read
DROP POLICY IF EXISTS "Users can read versions of own objects" ON public.knowledge_object_versions;
CREATE POLICY "Users can read versions of own objects"
  ON public.knowledge_object_versions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.knowledge_objects ko WHERE ko.id = knowledge_object_versions.knowledge_object_id AND ko.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.knowledge_objects ko JOIN public.share_permissions sp ON sp.knowledge_object_id = ko.id AND sp.shared_with_user_id = auth.uid() WHERE ko.id = knowledge_object_versions.knowledge_object_id)
  );

-- Allow version insert when user is shared editor (trigger runs in user context for edited_by)
DROP POLICY IF EXISTS "Users can insert versions for own objects" ON public.knowledge_object_versions;
CREATE POLICY "Users can insert versions for own objects"
  ON public.knowledge_object_versions FOR INSERT
  WITH CHECK (
    auth.uid() = edited_by
    AND (
      EXISTS (SELECT 1 FROM public.knowledge_objects ko WHERE ko.id = knowledge_object_versions.knowledge_object_id AND ko.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.share_permissions sp WHERE sp.knowledge_object_id = knowledge_object_versions.knowledge_object_id AND sp.shared_with_user_id = auth.uid() AND sp.role = 'editor')
    )
  );

-- Links: shared user can read links involving objects shared with them
CREATE POLICY "Users can read links for shared objects"
  ON public.link_edges FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.share_permissions sp WHERE sp.knowledge_object_id = from_object_id AND sp.shared_with_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.share_permissions sp WHERE sp.knowledge_object_id = to_object_id AND sp.shared_with_user_id = auth.uid())
  );

-- knowledge_object_domains: shared user can read
CREATE POLICY "Users can read kod for shared objects"
  ON public.knowledge_object_domains FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.share_permissions sp WHERE sp.knowledge_object_id = knowledge_object_domains.knowledge_object_id AND sp.shared_with_user_id = auth.uid())
  );

-- knowledge_object_tags: shared user can read
CREATE POLICY "Users can read kot for shared objects"
  ON public.knowledge_object_tags FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.share_permissions sp WHERE sp.knowledge_object_id = knowledge_object_tags.knowledge_object_id AND sp.shared_with_user_id = auth.uid())
  );
