-- S1/S5: sharing by email reveals nothing about which emails have accounts, and grants
-- access only to confirmed emails. Unconfirmed/unknown emails get a pending invite that
-- converts when that email is confirmed.

CREATE TABLE IF NOT EXISTS public.share_invites (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_object_id uuid NOT NULL REFERENCES public.knowledge_objects(id) ON DELETE CASCADE,
  email               text NOT NULL CHECK (email = lower(email)),
  role                share_role NOT NULL DEFAULT 'viewer',
  invited_by          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  accepted_at         timestamptz,
  UNIQUE (knowledge_object_id, email)
);
CREATE INDEX IF NOT EXISTS idx_share_invites_email_pending
  ON public.share_invites(email) WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_share_invites_invited_by
  ON public.share_invites(invited_by, created_at DESC);

ALTER TABLE public.share_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can read invites for own objects"
  ON public.share_invites FOR SELECT TO authenticated
  USING (public.owns_knowledge_object(knowledge_object_id));
CREATE POLICY "Owners can delete invites for own objects"
  ON public.share_invites FOR DELETE TO authenticated
  USING (public.owns_knowledge_object(knowledge_object_id));
-- No INSERT/UPDATE policy: invites are written only by share_object_by_email.

CREATE OR REPLACE FUNCTION public.share_object_by_email(p_object_id uuid, p_email text, p_role share_role)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_email     text := lower(trim(coalesce(p_email, '')));
  v_recipient uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.owns_knowledge_object(p_object_id) THEN
    RAISE EXCEPTION 'Only the owner can share this object' USING ERRCODE = '42501';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address' USING ERRCODE = '22023';
  END IF;
  IF v_email = (SELECT lower(email) FROM auth.users WHERE id = v_uid) THEN
    RAISE EXCEPTION 'You cannot share with yourself' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.share_invites
      WHERE invited_by = v_uid AND created_at > now() - interval '1 hour') >= 30 THEN
    RAISE EXCEPTION 'Too many shares in the last hour. Try again later.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.share_invites (knowledge_object_id, email, role, invited_by)
  VALUES (p_object_id, v_email, p_role, v_uid)
  ON CONFLICT (knowledge_object_id, email) DO UPDATE SET role = EXCLUDED.role;

  SELECT id INTO v_recipient FROM auth.users
  WHERE lower(email) = v_email AND email_confirmed_at IS NOT NULL
  LIMIT 1;

  IF v_recipient IS NOT NULL THEN
    INSERT INTO public.share_permissions (knowledge_object_id, shared_with_user_id, shared_with_email, role)
    VALUES (p_object_id, v_recipient, v_email, p_role)
    ON CONFLICT (knowledge_object_id, shared_with_user_id) DO UPDATE SET role = EXCLUDED.role;
    UPDATE public.share_invites SET accepted_at = coalesce(accepted_at, now())
    WHERE knowledge_object_id = p_object_id AND email = v_email;
  END IF;

  -- Identical response whether or not the email has an account.
  RETURN jsonb_build_object('status', 'ok');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.share_object_by_email(uuid, text, share_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_object_by_email(uuid, text, share_role) TO authenticated, service_role;

-- Convert pending invites when an email becomes confirmed (signup with confirmation,
-- or a later confirmation of an existing account).
CREATE OR REPLACE FUNCTION public.accept_pending_share_invites()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NULL OR NEW.email IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.share_permissions (knowledge_object_id, shared_with_user_id, shared_with_email, role)
  SELECT si.knowledge_object_id, NEW.id, si.email, si.role
  FROM public.share_invites si
  WHERE si.email = lower(NEW.email) AND si.accepted_at IS NULL
  ON CONFLICT (knowledge_object_id, shared_with_user_id) DO NOTHING;
  UPDATE public.share_invites SET accepted_at = now()
  WHERE email = lower(NEW.email) AND accepted_at IS NULL;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.accept_pending_share_invites() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_confirmed
  AFTER INSERT OR UPDATE OF email_confirmed_at, email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.accept_pending_share_invites();

-- Revoking a share also removes its invite, so a later confirmation can't re-grant it.
CREATE OR REPLACE FUNCTION public.delete_invite_for_revoked_share()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.share_invites
  WHERE knowledge_object_id = OLD.knowledge_object_id
    AND email = lower(coalesce(OLD.shared_with_email,
                               (SELECT email FROM auth.users WHERE id = OLD.shared_with_user_id)));
  RETURN OLD;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.delete_invite_for_revoked_share() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_share_permissions_delete_invite ON public.share_permissions;
CREATE TRIGGER trg_share_permissions_delete_invite
  AFTER DELETE ON public.share_permissions
  FOR EACH ROW EXECUTE FUNCTION public.delete_invite_for_revoked_share();

-- S1 for old clients until Task 11 drops it: only confirmed emails resolve.
CREATE OR REPLACE FUNCTION public.resolve_user_id_by_email(target_email text, p_knowledge_object_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT au.id
  FROM auth.users au
  WHERE lower(au.email) = lower(trim(target_email))
    AND au.email_confirmed_at IS NOT NULL
    AND p_knowledge_object_id IS NOT NULL
    AND public.owns_knowledge_object(p_knowledge_object_id)
  LIMIT 1;
$$;
