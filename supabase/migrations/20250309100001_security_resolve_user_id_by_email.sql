-- Security: restrict resolve_user_id_by_email to sharing context only.
-- Caller must own the knowledge_object_id; returns target user id only when adding a share for that object.
-- Prevents user enumeration (email -> user id) for arbitrary emails.

CREATE OR REPLACE FUNCTION public.resolve_user_id_by_email(target_email text, p_knowledge_object_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.users u
  WHERE u.email = trim(target_email)
    AND p_knowledge_object_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.knowledge_objects ko
      WHERE ko.id = p_knowledge_object_id AND ko.user_id = auth.uid()
    )
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.resolve_user_id_by_email(text, uuid) IS
  'Resolves email to user id only when caller owns the given knowledge_object_id (for share-by-email). Pass object id when sharing.';
