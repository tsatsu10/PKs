-- Fix: infinite recursion in RLS for knowledge_objects.
-- Cause: knowledge_objects SELECT policy uses EXISTS (SELECT FROM share_permissions),
-- and share_permissions "Owners" policy uses EXISTS (SELECT FROM knowledge_objects) → cycle.
-- Fix: use a SECURITY DEFINER function for ownership check so share_permissions policy
-- does not trigger knowledge_objects RLS.

CREATE OR REPLACE FUNCTION public.owns_knowledge_object(obj_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.knowledge_objects ko
    WHERE ko.id = obj_id AND ko.user_id = auth.uid()
  );
$$;
GRANT EXECUTE ON FUNCTION public.owns_knowledge_object(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_knowledge_object(uuid) TO service_role;

DROP POLICY IF EXISTS "Owners can manage share_permissions" ON public.share_permissions;
CREATE POLICY "Owners can manage share_permissions"
  ON public.share_permissions FOR ALL
  USING (public.owns_knowledge_object(knowledge_object_id))
  WITH CHECK (public.owns_knowledge_object(knowledge_object_id));
