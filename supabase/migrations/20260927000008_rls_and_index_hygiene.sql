-- 1. set_updated_at: the only function without a pinned search_path (Supabase linter).
ALTER FUNCTION public.set_updated_at() SET search_path = public;

-- 2. Evaluate auth.uid() once per statement, not once per row (Supabase advisor auth_rls_initplan).
DO $$
DECLARE
  p record;
  v_qual text;
  v_check text;
  v_sql text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') ~ 'auth\.uid\(\)' OR coalesce(with_check, '') ~ 'auth\.uid\(\)')
      AND NOT (coalesce(qual, '') || coalesce(with_check, '')) ~* 'select auth\.uid\(\)'
  LOOP
    v_qual := replace(p.qual, 'auth.uid()', '(SELECT auth.uid())');
    v_check := replace(p.with_check, 'auth.uid()', '(SELECT auth.uid())');
    v_sql := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    IF v_qual IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', v_qual); END IF;
    IF v_check IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', v_check); END IF;
    EXECUTE v_sql;
  END LOOP;
END $$;

-- 3. Drop indexes that duplicate a primary key / unique prefix or are global instead of per-user.
DROP INDEX IF EXISTS public.idx_knowledge_objects_is_deleted;
DROP INDEX IF EXISTS public.idx_knowledge_objects_type;
DROP INDEX IF EXISTS public.idx_knowledge_objects_updated_at;
DROP INDEX IF EXISTS public.idx_knowledge_object_versions_object_id;
DROP INDEX IF EXISTS public.idx_kod_object;
DROP INDEX IF EXISTS public.idx_kot_object;
DROP INDEX IF EXISTS public.idx_kof_object;
DROP INDEX IF EXISTS public.idx_link_edges_from;
DROP INDEX IF EXISTS public.idx_share_permissions_object;
DROP INDEX IF EXISTS public.idx_notifications_user_id;
DROP INDEX IF EXISTS public.idx_notifications_created_at;
DROP INDEX IF EXISTS public.idx_audit_logs_created_at;
DROP INDEX IF EXISTS public.idx_integrations_user_id;
DROP INDEX IF EXISTS public.idx_files_storage_key;

-- 4. Per-user indexes for the queries the app actually runs.
CREATE INDEX IF NOT EXISTS idx_ko_user_updated_live
  ON public.knowledge_objects(user_id, updated_at DESC) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_ko_user_pinned_updated_live
  ON public.knowledge_objects(user_id, is_pinned DESC, updated_at DESC) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
  ON public.audit_logs(user_id, created_at DESC);

-- 5. Case-insensitive tag/domain names.
-- Internal maintenance function (not an API): merges case-duplicate tags/domains into the oldest
-- row per (user_id, lower(name)). It attaches every object to the kept row (DISTINCT + ON CONFLICT,
-- so an object carrying several variants gets exactly one link), then deletes the duplicates;
-- their join rows cascade away. Run only by the migration or a superuser; no role may execute it.
CREATE OR REPLACE FUNCTION public.merge_case_duplicate_taxonomy()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['domains', 'tags'] LOOP
    EXECUTE format($f$
      WITH ranked AS (
        SELECT id,
               first_value(id) OVER (PARTITION BY user_id, lower(name) ORDER BY created_at, id) AS keep_id
        FROM public.%1$I
      )
      INSERT INTO public.%2$I (knowledge_object_id, %3$I)
      SELECT DISTINCT j.knowledge_object_id, r.keep_id
      FROM public.%2$I j
      JOIN ranked r ON r.id = j.%3$I
      WHERE r.id <> r.keep_id
      ON CONFLICT DO NOTHING
    $f$, t,
      CASE t WHEN 'domains' THEN 'knowledge_object_domains' ELSE 'knowledge_object_tags' END,
      CASE t WHEN 'domains' THEN 'domain_id' ELSE 'tag_id' END);
    EXECUTE format($f$
      DELETE FROM public.%1$I x
      USING public.%1$I k
      WHERE x.user_id = k.user_id AND lower(x.name) = lower(k.name)
        AND (k.created_at, k.id) < (x.created_at, x.id)
    $f$, t);
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.merge_case_duplicate_taxonomy() FROM PUBLIC, anon, authenticated, service_role;

-- Lock, merge and build the unique indexes in one statement, so no case-variant can be inserted
-- between the merge and the index even when the migration runner autocommits each statement.
DO $$
BEGIN
  LOCK TABLE public.tags, public.domains,
    public.knowledge_object_tags, public.knowledge_object_domains
    IN SHARE ROW EXCLUSIVE MODE;
  PERFORM public.merge_case_duplicate_taxonomy();
  ALTER TABLE public.domains DROP CONSTRAINT IF EXISTS domains_user_id_name_key;
  ALTER TABLE public.tags DROP CONSTRAINT IF EXISTS tags_user_id_name_key;
  CREATE UNIQUE INDEX IF NOT EXISTS domains_user_lower_name_key ON public.domains(user_id, lower(name));
  CREATE UNIQUE INDEX IF NOT EXISTS tags_user_lower_name_key ON public.tags(user_id, lower(name));
END $$;

CREATE OR REPLACE FUNCTION public.create_domain(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := trim(coalesce(p_name, ''));
  v_row public.domains;
BEGIN
  IF v_name = '' THEN RAISE EXCEPTION 'Domain name is required' USING ERRCODE = '22023'; END IF;
  IF length(v_name) > 120 THEN RAISE EXCEPTION 'Domain name too long' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.domains (user_id, name) VALUES (auth.uid(), v_name)
  ON CONFLICT (user_id, lower(name)) DO UPDATE SET name = public.domains.name
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('id', v_row.id, 'name', v_row.name);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_tag(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := trim(coalesce(p_name, ''));
  v_row public.tags;
BEGIN
  IF v_name = '' THEN RAISE EXCEPTION 'Tag name is required' USING ERRCODE = '22023'; END IF;
  IF length(v_name) > 120 THEN RAISE EXCEPTION 'Tag name too long' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.tags (user_id, name) VALUES (auth.uid(), v_name)
  ON CONFLICT (user_id, lower(name)) DO UPDATE SET name = public.tags.name
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('id', v_row.id, 'name', v_row.name);
END;
$$;
