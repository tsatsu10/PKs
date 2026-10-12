-- Added by clean-baseline.sh: create objects with built-in default privileges so the
-- dumped GRANT/REVOKE lines reproduce production exactly. The ALTER DEFAULT PRIVILEGES lines
-- at the end of this file restore production's defaults.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: export_format; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.export_format AS ENUM (
    'txt',
    'md',
    'pdf',
    'docx',
    'html',
    'json'
);


--
-- Name: export_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.export_status AS ENUM (
    'queued',
    'processing',
    'completed',
    'failed'
);


--
-- Name: export_template; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.export_template AS ENUM (
    'raw',
    'brief',
    'full',
    'stakeholder'
);


--
-- Name: knowledge_object_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.knowledge_object_type AS ENUM (
    'note',
    'document',
    'sop',
    'report',
    'proposal',
    'guideline',
    'insight',
    'template',
    'concept',
    'tool',
    'incident',
    'case',
    'research_paper',
    'decision',
    'prompt',
    'bookmark',
    'meeting_notes',
    'quote',
    'recipe',
    'person',
    'howto'
);


--
-- Name: share_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.share_role AS ENUM (
    'viewer',
    'editor'
);


--
-- Name: consume_server_key_quota(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_server_key_quota(p_daily_limit integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_count   INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized', 'count', 0, 'limited', true);
  END IF;

  INSERT INTO public.server_key_daily_usage (user_id, day, count)
  VALUES (v_user_id, (now() AT TIME ZONE 'utc')::date, 1)
  ON CONFLICT (user_id, day) DO UPDATE SET count = server_key_daily_usage.count + 1
  RETURNING count INTO v_count;

  DELETE FROM public.server_key_daily_usage
  WHERE day < (now() AT TIME ZONE 'utc')::date - 7;

  RETURN jsonb_build_object('count', v_count, 'limited', v_count > p_daily_limit);
END;
$$;


--
-- Name: count_knowledge_objects(text, text, uuid, uuid, timestamp with time zone, timestamp with time zone, text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_knowledge_objects(search_query text DEFAULT NULL::text, type_filter text DEFAULT NULL::text, domain_id_f uuid DEFAULT NULL::uuid, tag_id_f uuid DEFAULT NULL::uuid, date_from_f timestamp with time zone DEFAULT NULL::timestamp with time zone, date_to_f timestamp with time zone DEFAULT NULL::timestamp with time zone, status_filter text DEFAULT NULL::text, due_from_f timestamp with time zone DEFAULT NULL::timestamp with time zone, due_to_f timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT count(*)::bigint
  FROM public.knowledge_objects ko
  WHERE (ko.user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.share_permissions sp
    WHERE sp.knowledge_object_id = ko.id AND sp.shared_with_user_id = auth.uid()
  ))
    AND ko.is_deleted = false
    AND (
      search_query IS NULL OR search_query = ''
      OR ko.fts @@ plainto_tsquery('english', search_query)
      OR EXISTS (
        SELECT 1 FROM public.knowledge_object_tags kot
        JOIN public.tags t ON t.id = kot.tag_id
        WHERE kot.knowledge_object_id = ko.id
          AND to_tsvector('english', coalesce(t.name, '')) @@ plainto_tsquery('english', search_query)
      )
      OR EXISTS (
        SELECT 1 FROM public.knowledge_object_files kof
        JOIN public.files f ON f.id = kof.file_id
        WHERE kof.knowledge_object_id = ko.id
          AND f.extracted_text IS NOT NULL
          AND trim(f.extracted_text) <> ''
          AND to_tsvector('english', left(f.extracted_text, 100000)) @@ plainto_tsquery('english', search_query)
      )
    )
    AND (type_filter IS NULL OR type_filter = '' OR ko.type::text = type_filter)
    AND (status_filter IS NULL OR status_filter = '' OR ko.status = status_filter)
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
    AND (due_from_f IS NULL OR ko.due_at >= due_from_f)
    AND (due_to_f IS NULL OR ko.due_at <= due_to_f);
$$;


--
-- Name: FUNCTION count_knowledge_objects(search_query text, type_filter text, domain_id_f uuid, tag_id_f uuid, date_from_f timestamp with time zone, date_to_f timestamp with time zone, status_filter text, due_from_f timestamp with time zone, due_to_f timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.count_knowledge_objects(search_query text, type_filter text, domain_id_f uuid, tag_id_f uuid, date_from_f timestamp with time zone, date_to_f timestamp with time zone, status_filter text, due_from_f timestamp with time zone, due_to_f timestamp with time zone) IS 'Count objects matching dashboard search filters (RLS via auth.uid).';


--
-- Name: create_domain(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_domain(p_name text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_name text;
  v_id uuid;
BEGIN
  v_name := trim(coalesce(p_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'Domain name is required' USING ERRCODE = '22023';
  END IF;
  IF length(v_name) > 120 THEN
    RAISE EXCEPTION 'Domain name too long' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.domains (user_id, name)
  VALUES (auth.uid(), v_name)
  ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'name', v_name);
END;
$$;


--
-- Name: FUNCTION create_domain(p_name text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_domain(p_name text) IS 'Create or return existing domain for current user.';


--
-- Name: create_tag(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_tag(p_name text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_name text;
  v_id uuid;
BEGIN
  v_name := trim(coalesce(p_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'Tag name is required' USING ERRCODE = '22023';
  END IF;
  IF length(v_name) > 120 THEN
    RAISE EXCEPTION 'Tag name too long' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.tags (user_id, name)
  VALUES (auth.uid(), v_name)
  ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'name', v_name);
END;
$$;


--
-- Name: FUNCTION create_tag(p_name text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_tag(p_name text) IS 'Create or return existing tag for current user.';


--
-- Name: get_dashboard_activity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_dashboard_activity() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH days AS (
    SELECT generate_series(6, 0, -1) AS day_offset
  ),
  day_bounds AS (
    SELECT
      day_offset,
      date_trunc('day', now()) - (day_offset || ' days')::interval AS day_start,
      date_trunc('day', now()) - (day_offset || ' days')::interval + interval '1 day' AS day_end
    FROM days
  ),
  owned AS (
    SELECT id, created_at, updated_at
    FROM public.knowledge_objects
    WHERE user_id = auth.uid() AND is_deleted = false
  ),
  capture_series AS (
    SELECT
      db.day_offset,
      count(o.id)::int AS cnt
    FROM day_bounds db
    LEFT JOIN owned o ON o.created_at >= db.day_start AND o.created_at < db.day_end
    GROUP BY db.day_offset
    ORDER BY db.day_offset
  ),
  tend_series AS (
    SELECT
      db.day_offset,
      count(o.id)::int AS cnt
    FROM day_bounds db
    LEFT JOIN owned o ON o.updated_at >= db.day_start AND o.updated_at < db.day_end
    GROUP BY db.day_offset
    ORDER BY db.day_offset
  ),
  trending_tags AS (
    SELECT t.id, t.name, count(*)::int AS cnt
    FROM public.knowledge_object_tags kot
    JOIN public.tags t ON t.id = kot.tag_id
    JOIN public.knowledge_objects ko ON ko.id = kot.knowledge_object_id
    WHERE ko.user_id = auth.uid()
      AND ko.is_deleted = false
      AND ko.updated_at >= now() - interval '7 days'
    GROUP BY t.id, t.name
    ORDER BY cnt DESC
    LIMIT 6
  ),
  recent_links AS (
    SELECT
      le.id,
      le.from_object_id,
      le.to_object_id,
      le.relationship_type,
      le.created_at,
      ko_from.title AS from_title,
      ko_from.type AS from_type,
      ko_to.title AS to_title,
      ko_to.type AS to_type
    FROM public.link_edges le
    JOIN public.knowledge_objects ko_from ON ko_from.id = le.from_object_id AND ko_from.is_deleted = false
    JOIN public.knowledge_objects ko_to ON ko_to.id = le.to_object_id AND ko_to.is_deleted = false
    WHERE (
      ko_from.user_id = auth.uid()
      OR ko_to.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.share_permissions sp
        WHERE sp.shared_with_user_id = auth.uid()
          AND sp.knowledge_object_id IN (le.from_object_id, le.to_object_id)
      )
    )
    ORDER BY le.created_at DESC
    LIMIT 5
  )
  SELECT jsonb_build_object(
    'capture_7d', (SELECT coalesce(jsonb_agg(cnt ORDER BY day_offset), '[]'::jsonb) FROM capture_series),
    'tend_7d', (SELECT coalesce(jsonb_agg(cnt ORDER BY day_offset), '[]'::jsonb) FROM tend_series),
    'trending_tags', (
      SELECT coalesce(
        jsonb_agg(jsonb_build_object('id', id, 'name', name, 'count', cnt)),
        '[]'::jsonb
      )
      FROM trending_tags
    ),
    'recent_links', (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'from_object_id', from_object_id,
            'to_object_id', to_object_id,
            'relationship_type', relationship_type,
            'created_at', created_at,
            'from_title', from_title,
            'from_type', from_type,
            'to_title', to_title,
            'to_type', to_type
          )
        ),
        '[]'::jsonb
      )
      FROM recent_links
    )
  );
$$;


--
-- Name: get_dashboard_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_dashboard_stats() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH base AS (
    SELECT ko.id, ko.type, ko.status, ko.updated_at, ko.created_at, ko.due_at
    FROM public.knowledge_objects ko
    WHERE (ko.user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.share_permissions sp
      WHERE sp.knowledge_object_id = ko.id AND sp.shared_with_user_id = auth.uid()
    ))
      AND ko.is_deleted = false
  ),
  owned_today AS (
    SELECT ko.id, ko.status, ko.updated_at, ko.created_at
    FROM public.knowledge_objects ko
    WHERE ko.user_id = auth.uid()
      AND ko.is_deleted = false
  ),
  totals AS (
    SELECT
      (SELECT count(*) FROM base) AS total,
      (SELECT count(*) FROM base WHERE updated_at >= (now() - interval '7 days')) AS updated_last_7_days,
      (SELECT count(*) FROM public.knowledge_objects ko
       WHERE (ko.user_id = auth.uid() OR EXISTS (
         SELECT 1 FROM public.share_permissions sp
         WHERE sp.knowledge_object_id = ko.id AND sp.shared_with_user_id = auth.uid()
       ))
         AND ko.is_deleted = false
         AND ko.due_at IS NOT NULL
         AND ko.due_at >= now()
         AND ko.due_at <= now() + interval '7 days') AS due_next_7_days,
      (SELECT count(*) FROM owned_today WHERE created_at >= date_trunc('day', now())) AS capture_today,
      (SELECT count(*) FROM owned_today WHERE updated_at >= date_trunc('day', now())) AS tend_today,
      (SELECT count(*) FROM owned_today
       WHERE status = 'archived' AND updated_at >= date_trunc('day', now())) AS close_today
  ),
  by_type AS (
    SELECT jsonb_object_agg(coalesce(type::text, 'unknown'), cnt) AS data
    FROM (
      SELECT type, count(*)::int AS cnt
      FROM base
      GROUP BY type
    ) t
  ),
  by_status AS (
    SELECT jsonb_object_agg(coalesce(status, 'active'), cnt) AS data
    FROM (
      SELECT coalesce(status, 'active') AS status, count(*)::int AS cnt
      FROM base
      GROUP BY coalesce(status, 'active')
    ) s
  )
  SELECT jsonb_build_object(
    'total', (SELECT total FROM totals),
    'updated_last_7_days', (SELECT updated_last_7_days FROM totals),
    'due_next_7_days', (SELECT due_next_7_days FROM totals),
    'by_type', coalesce((SELECT data FROM by_type), '{}'::jsonb),
    'by_status', coalesce((SELECT data FROM by_status), '{}'::jsonb),
    'pulse', jsonb_build_object(
      'capture_today', (SELECT capture_today FROM totals),
      'tend_today', (SELECT tend_today FROM totals),
      'close_today', (SELECT close_today FROM totals)
    )
  );
$$;


--
-- Name: FUNCTION get_dashboard_stats(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_dashboard_stats() IS 'Returns dashboard stats for current user: total, by_type, by_status, updated_last_7_days, due_next_7_days.';


--
-- Name: get_object_links_batch(uuid[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_object_links_batch(p_object_ids uuid[], p_limit_per integer DEFAULT 3) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  WITH ids AS (
    SELECT unnest(coalesce(p_object_ids, ARRAY[]::uuid[])) AS object_id
  ),
  neighbors AS (
    SELECT
      i.object_id AS source_id,
      CASE
        WHEN le.from_object_id = i.object_id THEN le.to_object_id
        ELSE le.from_object_id
      END AS linked_id,
      le.relationship_type,
      le.created_at
    FROM ids i
    JOIN public.link_edges le
      ON le.from_object_id = i.object_id OR le.to_object_id = i.object_id
  ),
  ranked AS (
    SELECT
      n.*,
      row_number() OVER (PARTITION BY n.source_id ORDER BY n.created_at DESC) AS rn,
      count(*) OVER (PARTITION BY n.source_id) AS total_count
    FROM neighbors n
    WHERE n.linked_id IS NOT NULL
  ),
  limited AS (
    SELECT r.*
    FROM ranked r
    WHERE r.rn <= greatest(1, least(coalesce(p_limit_per, 3), 10))
  )
  SELECT coalesce(
    jsonb_object_agg(
      l.source_id::text,
      jsonb_build_object(
        'links', l.links,
        'total', l.total_count
      )
    ),
    '{}'::jsonb
  )
  FROM (
    SELECT
      l.source_id,
      max(l.total_count)::int AS total_count,
      jsonb_agg(
        jsonb_build_object(
          'id', ko.id,
          'title', ko.title,
          'type', ko.type,
          'relationship_type', l.relationship_type
        )
        ORDER BY l.created_at DESC
      ) AS links
    FROM limited l
    JOIN public.knowledge_objects ko ON ko.id = l.linked_id AND ko.is_deleted = false
    GROUP BY l.source_id
  ) l;
$$;


--
-- Name: guard_knowledge_object_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_knowledge_object_update() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Changing the owner of an object is not allowed'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.user_id <> auth.uid() AND (
       NEW.is_deleted IS DISTINCT FROM OLD.is_deleted
    OR NEW.is_pinned IS DISTINCT FROM OLD.is_pinned
  ) THEN
    RAISE EXCEPTION 'Only the owner can delete, restore, or pin this object'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'displayName', '')
  );
  RETURN NEW;
END;
$$;


--
-- Name: import_get_existing_object(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.import_get_existing_object(p_integration_id uuid DEFAULT NULL::uuid, p_source_identifier text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT knowledge_object_id
  FROM public.import_items
  WHERE user_id = auth.uid()
    AND (p_integration_id IS NULL AND integration_id IS NULL OR integration_id = p_integration_id)
    AND source_identifier = p_source_identifier
  LIMIT 1;
$$;


--
-- Name: import_register(uuid, text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.import_register(p_integration_id uuid DEFAULT NULL::uuid, p_source_identifier text DEFAULT NULL::text, p_knowledge_object_id uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_knowledge_object_id IS NULL THEN
    RAISE EXCEPTION 'knowledge_object_id required';
  END IF;
  UPDATE public.import_items
  SET knowledge_object_id = p_knowledge_object_id, payload = COALESCE(p_payload, '{}'::jsonb)
  WHERE user_id = auth.uid()
    AND (integration_id IS NOT DISTINCT FROM p_integration_id)
    AND source_identifier = p_source_identifier;
  IF FOUND THEN
    SELECT id INTO v_id FROM public.import_items
    WHERE user_id = auth.uid() AND (integration_id IS NOT DISTINCT FROM p_integration_id) AND source_identifier = p_source_identifier;
    RETURN v_id;
  END IF;
  INSERT INTO public.import_items (user_id, integration_id, source_identifier, knowledge_object_id, payload)
  VALUES (auth.uid(), p_integration_id, p_source_identifier, p_knowledge_object_id, COALESCE(p_payload, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;


--
-- Name: increment_run_prompt_rate_limit(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_run_prompt_rate_limit(p_limit_per_minute integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id   UUID;
  v_bucket    TIMESTAMPTZ;
  v_count     INT;
  v_retry_sec INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized', 'count', 0, 'limited', true);
  END IF;

  v_bucket := date_trunc('minute', now());

  INSERT INTO public.rate_limit_run_prompt (user_id, window_bucket, count)
  VALUES (v_user_id, v_bucket, 1)
  ON CONFLICT (user_id, window_bucket) DO UPDATE SET count = rate_limit_run_prompt.count + 1
  RETURNING count INTO v_count;

  -- Cleanup buckets older than 5 minutes
  DELETE FROM public.rate_limit_run_prompt
  WHERE window_bucket < now() - interval '5 minutes';

  -- Seconds until next minute (window resets)
  v_retry_sec := GREATEST(0, EXTRACT(EPOCH FROM (v_bucket + interval '1 minute' - now()))::INT);

  IF v_count > p_limit_per_minute THEN
    RETURN jsonb_build_object('count', v_count, 'limited', true, 'retry_after_sec', v_retry_sec);
  END IF;

  RETURN jsonb_build_object('count', v_count, 'limited', false, 'retry_after_sec', v_retry_sec);
END;
$$;


--
-- Name: FUNCTION increment_run_prompt_rate_limit(p_limit_per_minute integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.increment_run_prompt_rate_limit(p_limit_per_minute integer) IS 'Increment run-prompt rate limit for current user; returns { count, limited, retry_after_sec }. Call from edge function with user JWT.';


--
-- Name: owns_knowledge_object(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.owns_knowledge_object(obj_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.knowledge_objects ko
    WHERE ko.id = obj_id AND ko.user_id = auth.uid()
  );
$$;


--
-- Name: resolve_user_id_by_email(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_user_id_by_email(target_email text, p_knowledge_object_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT au.id
  FROM auth.users au
  WHERE lower(au.email) = lower(trim(target_email))
    AND p_knowledge_object_id IS NOT NULL
    AND public.owns_knowledge_object(p_knowledge_object_id)
  LIMIT 1;
$$;


--
-- Name: FUNCTION resolve_user_id_by_email(target_email text, p_knowledge_object_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.resolve_user_id_by_email(target_email text, p_knowledge_object_id uuid) IS 'Resolves an auth email to a user id only when the caller owns the given knowledge_object_id (share-by-email).';


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: save_knowledge_object_version(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_knowledge_object_version() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: knowledge_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type public.knowledge_object_type DEFAULT 'note'::public.knowledge_object_type NOT NULL,
    title text NOT NULL,
    source text,
    content text,
    summary text,
    key_points jsonb DEFAULT '[]'::jsonb,
    is_deleted boolean DEFAULT false NOT NULL,
    current_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    fts tsvector GENERATED ALWAYS AS (((setweight(to_tsvector('english'::regconfig, COALESCE(title, ''::text)), 'A'::"char") || setweight(to_tsvector('english'::regconfig, COALESCE(summary, ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(content, ''::text)), 'C'::"char"))) STORED,
    is_pinned boolean DEFAULT false NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    slug text,
    cover_url text,
    due_at timestamp with time zone,
    remind_at timestamp with time zone,
    last_viewed_at timestamp with time zone,
    CONSTRAINT knowledge_objects_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])))
);


--
-- Name: COLUMN knowledge_objects.is_pinned; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.knowledge_objects.is_pinned IS 'When true, object appears at top of lists (pinned for quick access).';


--
-- Name: COLUMN knowledge_objects.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.knowledge_objects.status IS 'Workflow: draft, active, archived. Default active.';


--
-- Name: COLUMN knowledge_objects.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.knowledge_objects.slug IS 'URL-friendly identifier, unique per user. Optional.';


--
-- Name: COLUMN knowledge_objects.cover_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.knowledge_objects.cover_url IS 'Optional cover/thumbnail image URL for cards.';


--
-- Name: COLUMN knowledge_objects.due_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.knowledge_objects.due_at IS 'Optional due date for tasks/follow-ups.';


--
-- Name: COLUMN knowledge_objects.remind_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.knowledge_objects.remind_at IS 'Optional reminder time.';


--
-- Name: COLUMN knowledge_objects.last_viewed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.knowledge_objects.last_viewed_at IS 'When the owner last opened this object (for Resume on dashboard).';


--
-- Name: search_knowledge_objects(text, text, uuid, uuid, timestamp with time zone, timestamp with time zone, text, timestamp with time zone, timestamp with time zone, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_knowledge_objects(search_query text DEFAULT NULL::text, type_filter text DEFAULT NULL::text, domain_id_f uuid DEFAULT NULL::uuid, tag_id_f uuid DEFAULT NULL::uuid, date_from_f timestamp with time zone DEFAULT NULL::timestamp with time zone, date_to_f timestamp with time zone DEFAULT NULL::timestamp with time zone, status_filter text DEFAULT NULL::text, due_from_f timestamp with time zone DEFAULT NULL::timestamp with time zone, due_to_f timestamp with time zone DEFAULT NULL::timestamp with time zone, limit_n integer DEFAULT 50, offset_n integer DEFAULT 0) RETURNS SETOF public.knowledge_objects
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT ko.*
  FROM public.knowledge_objects ko
  WHERE (ko.user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.share_permissions sp WHERE sp.knowledge_object_id = ko.id AND sp.shared_with_user_id = auth.uid()))
    AND ko.is_deleted = false
    AND (
      search_query IS NULL OR search_query = ''
      OR ko.fts @@ plainto_tsquery('english', search_query)
      OR EXISTS (
        SELECT 1 FROM public.knowledge_object_tags kot
        JOIN public.tags t ON t.id = kot.tag_id
        WHERE kot.knowledge_object_id = ko.id
          AND to_tsvector('english', coalesce(t.name, '')) @@ plainto_tsquery('english', search_query)
      )
      OR EXISTS (
        SELECT 1 FROM public.knowledge_object_files kof
        JOIN public.files f ON f.id = kof.file_id
        WHERE kof.knowledge_object_id = ko.id
          AND f.extracted_text IS NOT NULL
          AND trim(f.extracted_text) <> ''
          AND to_tsvector('english', left(f.extracted_text, 100000)) @@ plainto_tsquery('english', search_query)
      )
    )
    AND (type_filter IS NULL OR type_filter = '' OR ko.type::text = type_filter)
    AND (status_filter IS NULL OR status_filter = '' OR ko.status = status_filter)
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
    AND (due_from_f IS NULL OR ko.due_at >= due_from_f)
    AND (due_to_f IS NULL OR ko.due_at <= due_to_f)
  ORDER BY ko.is_pinned DESC, ko.updated_at DESC
  LIMIT greatest(1, least(limit_n, 100))
  OFFSET greatest(0, offset_n);
$$;


--
-- Name: search_knowledge_objects_with_snippets(text, text, uuid, uuid, timestamp with time zone, timestamp with time zone, text, timestamp with time zone, timestamp with time zone, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_knowledge_objects_with_snippets(search_query text DEFAULT NULL::text, type_filter text DEFAULT NULL::text, domain_id_f uuid DEFAULT NULL::uuid, tag_id_f uuid DEFAULT NULL::uuid, date_from_f timestamp with time zone DEFAULT NULL::timestamp with time zone, date_to_f timestamp with time zone DEFAULT NULL::timestamp with time zone, status_filter text DEFAULT NULL::text, due_from_f timestamp with time zone DEFAULT NULL::timestamp with time zone, due_to_f timestamp with time zone DEFAULT NULL::timestamp with time zone, limit_n integer DEFAULT 50, offset_n integer DEFAULT 0) RETURNS SETOF jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH base AS (
    SELECT ko.*
    FROM public.knowledge_objects ko
    WHERE (ko.user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.share_permissions sp WHERE sp.knowledge_object_id = ko.id AND sp.shared_with_user_id = auth.uid()))
      AND ko.is_deleted = false
      AND (
        search_query IS NULL OR search_query = ''
        OR ko.fts @@ plainto_tsquery('english', search_query)
        OR EXISTS (
          SELECT 1 FROM public.knowledge_object_tags kot
          JOIN public.tags t ON t.id = kot.tag_id
          WHERE kot.knowledge_object_id = ko.id
            AND to_tsvector('english', coalesce(t.name, '')) @@ plainto_tsquery('english', search_query)
        )
        OR EXISTS (
          SELECT 1 FROM public.knowledge_object_files kof
          JOIN public.files f ON f.id = kof.file_id
          WHERE kof.knowledge_object_id = ko.id
            AND f.extracted_text IS NOT NULL
            AND trim(f.extracted_text) <> ''
            AND to_tsvector('english', left(f.extracted_text, 100000)) @@ plainto_tsquery('english', search_query)
        )
      )
      AND (type_filter IS NULL OR type_filter = '' OR ko.type::text = type_filter)
      AND (status_filter IS NULL OR status_filter = '' OR ko.status = status_filter)
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
      AND (due_from_f IS NULL OR ko.due_at >= due_from_f)
      AND (due_to_f IS NULL OR ko.due_at <= due_to_f)
  ),
  limited AS (
    SELECT * FROM base
    ORDER BY is_pinned DESC, updated_at DESC
    LIMIT greatest(1, least(limit_n, 100))
    OFFSET greatest(0, offset_n)
  )
  SELECT (
    jsonb_build_object(
      'id', lim.id, 'user_id', lim.user_id, 'type', lim.type, 'title', lim.title,
      'source', lim.source, 'content', lim.content, 'summary', lim.summary,
      'key_points', lim.key_points, 'is_deleted', lim.is_deleted,
      'current_version', lim.current_version, 'created_at', lim.created_at,
      'updated_at', lim.updated_at, 'is_pinned', lim.is_pinned,
      'status', lim.status, 'slug', lim.slug, 'cover_url', lim.cover_url,
      'due_at', lim.due_at, 'remind_at', lim.remind_at
    )
    || CASE
         WHEN search_query IS NOT NULL AND trim(search_query) <> '' THEN
           jsonb_build_object(
             'snippet',
             ts_headline(
               'english',
               coalesce(lim.title, '') || ' ' || coalesce(lim.summary, '') || ' ' || coalesce(left(lim.content, 5000), ''),
               plainto_tsquery('english', trim(search_query)),
               'MaxFragments=2, MaxWords=35, MinWords=10'
             )
           )
         ELSE jsonb_build_object('snippet', null)
       END
  )::jsonb
  FROM limited lim;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: suggest_linked_objects(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.suggest_linked_objects(p_object_id uuid, limit_n integer DEFAULT 10) RETURNS SETOF public.knowledge_objects
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH caller_can_read AS (
    SELECT 1
    FROM public.knowledge_objects ko
    WHERE ko.id = p_object_id
      AND (ko.user_id = auth.uid()
           OR EXISTS (
             SELECT 1 FROM public.share_permissions sp
             WHERE sp.knowledge_object_id = ko.id AND sp.shared_with_user_id = auth.uid()
           ))
    LIMIT 1
  ),
  object_domain_ids AS (
    SELECT domain_id FROM public.knowledge_object_domains
    WHERE knowledge_object_id = p_object_id
      AND EXISTS (SELECT 1 FROM caller_can_read)
  ),
  object_tag_ids AS (
    SELECT tag_id FROM public.knowledge_object_tags
    WHERE knowledge_object_id = p_object_id
      AND EXISTS (SELECT 1 FROM caller_can_read)
  ),
  already_linked AS (
    SELECT to_object_id AS oid FROM public.link_edges WHERE from_object_id = p_object_id
    UNION
    SELECT from_object_id FROM public.link_edges WHERE to_object_id = p_object_id
  ),
  overlap AS (
    SELECT ko.id,
      (SELECT count(*) FROM public.knowledge_object_domains kod WHERE kod.knowledge_object_id = ko.id AND kod.domain_id IN (SELECT domain_id FROM object_domain_ids))
      + (SELECT count(*) FROM public.knowledge_object_tags kot WHERE kot.knowledge_object_id = ko.id AND kot.tag_id IN (SELECT tag_id FROM object_tag_ids)) AS score
    FROM public.knowledge_objects ko
    WHERE ko.user_id = auth.uid() AND ko.is_deleted = false AND ko.id != p_object_id
      AND ko.id NOT IN (SELECT oid FROM already_linked)
      AND EXISTS (SELECT 1 FROM caller_can_read)
      AND (
        EXISTS (SELECT 1 FROM public.knowledge_object_domains kod WHERE kod.knowledge_object_id = ko.id AND kod.domain_id IN (SELECT domain_id FROM object_domain_ids))
        OR EXISTS (SELECT 1 FROM public.knowledge_object_tags kot WHERE kot.knowledge_object_id = ko.id AND kot.tag_id IN (SELECT tag_id FROM object_tag_ids))
      )
  )
  SELECT ko.*
  FROM public.knowledge_objects ko
  JOIN overlap o ON o.id = ko.id
  ORDER BY o.score DESC, ko.updated_at DESC
  LIMIT greatest(1, least(limit_n, 50));
$$;


--
-- Name: suggest_tags_for_object(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.suggest_tags_for_object(p_object_id uuid) RETURNS TABLE(tag_id uuid, tag_name text, usage_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH object_domains AS (
    SELECT kod.domain_id
    FROM public.knowledge_object_domains kod
    JOIN public.knowledge_objects ko ON ko.id = kod.knowledge_object_id
    WHERE kod.knowledge_object_id = p_object_id AND ko.user_id = auth.uid()
  ),
  object_tag_ids AS (
    SELECT kot.tag_id FROM public.knowledge_object_tags kot WHERE kot.knowledge_object_id = p_object_id
  ),
  candidate_objects AS (
    SELECT DISTINCT kod2.knowledge_object_id
    FROM public.knowledge_object_domains kod2
    WHERE kod2.domain_id IN (SELECT domain_id FROM object_domains)
      AND kod2.knowledge_object_id != p_object_id
      AND EXISTS (SELECT 1 FROM public.knowledge_objects ko WHERE ko.id = kod2.knowledge_object_id AND ko.user_id = auth.uid())
  ),
  tag_counts AS (
    SELECT kot.tag_id, count(*) AS cnt
    FROM public.knowledge_object_tags kot
    WHERE kot.knowledge_object_id IN (SELECT knowledge_object_id FROM candidate_objects)
      AND kot.tag_id NOT IN (SELECT tag_id FROM object_tag_ids)
    GROUP BY kot.tag_id
  )
  SELECT t.id AS tag_id, t.name AS tag_name, tc.cnt AS usage_count
  FROM tag_counts tc
  JOIN public.tags t ON t.id = tc.tag_id AND t.user_id = auth.uid()
  ORDER BY tc.cnt DESC, t.name
  LIMIT 15;
$$;


--
-- Name: suggest_tags_for_object_fallback(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.suggest_tags_for_object_fallback(p_object_id uuid) RETURNS TABLE(tag_id uuid, tag_name text, usage_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH object_tag_ids AS (
    SELECT kot.tag_id FROM public.knowledge_object_tags kot WHERE kot.knowledge_object_id = p_object_id
  ),
  tag_counts AS (
    SELECT kot.tag_id, count(*) AS cnt
    FROM public.knowledge_object_tags kot
    JOIN public.knowledge_objects ko ON ko.id = kot.knowledge_object_id AND ko.user_id = auth.uid() AND ko.is_deleted = false
    WHERE kot.tag_id NOT IN (SELECT tag_id FROM object_tag_ids)
    GROUP BY kot.tag_id
  )
  SELECT t.id AS tag_id, t.name AS tag_name, tc.cnt AS usage_count
  FROM tag_counts tc
  JOIN public.tags t ON t.id = tc.tag_id AND t.user_id = auth.uid()
  ORDER BY tc.cnt DESC, t.name
  LIMIT 10;
$$;


--
-- Name: sync_user_email_from_auth(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_user_email_from_auth() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.users SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END;
$$;


--
-- Name: touch_object_view(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_object_view(p_object_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_object_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.knowledge_objects ko
  SET last_viewed_at = now()
  WHERE ko.id = p_object_id
    AND ko.user_id = auth.uid()
    AND ko.is_deleted = false;
END;
$$;


--
-- Name: FUNCTION touch_object_view(p_object_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.touch_object_view(p_object_id uuid) IS 'Record that the current user opened their own object (for Resume).';


--
-- Name: users_email_from_auth(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.users_email_from_auth() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.email := (SELECT au.email FROM auth.users au WHERE au.id = NEW.id);
  RETURN NEW;
END;
$$;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    payload jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: domains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.domains (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: export_job_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.export_job_items (
    export_job_id uuid NOT NULL,
    knowledge_object_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: export_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.export_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    knowledge_object_id uuid,
    format public.export_format NOT NULL,
    template public.export_template DEFAULT 'full'::public.export_template NOT NULL,
    include_content boolean DEFAULT true NOT NULL,
    include_summary boolean DEFAULT true NOT NULL,
    include_key_points boolean DEFAULT true NOT NULL,
    include_tags boolean DEFAULT true NOT NULL,
    include_domains boolean DEFAULT true NOT NULL,
    include_links boolean DEFAULT true NOT NULL,
    filename text,
    status public.export_status DEFAULT 'queued'::public.export_status NOT NULL,
    storage_key text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    filename text NOT NULL,
    mime_type text,
    size_bytes bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    storage_key text,
    extracted_text text
);


--
-- Name: COLUMN files.extracted_text; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.files.extracted_text IS 'Plain text extracted from the file (e.g. PDF, DOCX) for search; populated by worker or on upload.';


--
-- Name: import_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    integration_id uuid,
    source_identifier text NOT NULL,
    knowledge_object_id uuid NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'generic'::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    config jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    entry_date date NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_object_domains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_object_domains (
    knowledge_object_id uuid NOT NULL,
    domain_id uuid NOT NULL
);


--
-- Name: knowledge_object_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_object_files (
    knowledge_object_id uuid NOT NULL,
    file_id uuid NOT NULL
);


--
-- Name: knowledge_object_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_object_tags (
    knowledge_object_id uuid NOT NULL,
    tag_id uuid NOT NULL
);


--
-- Name: knowledge_object_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_object_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    knowledge_object_id uuid NOT NULL,
    version integer NOT NULL,
    title text NOT NULL,
    content text,
    summary text,
    key_points jsonb DEFAULT '[]'::jsonb,
    edited_by uuid NOT NULL,
    change_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: link_edges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.link_edges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    from_object_id uuid NOT NULL,
    to_object_id uuid NOT NULL,
    relationship_type text DEFAULT 'references'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT link_edges_no_self CHECK ((from_object_id <> to_object_id))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    read_at timestamp with time zone,
    related_type text,
    related_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: paste_bin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paste_bin (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text,
    content text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prompt_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prompt_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    prompt_template_id uuid,
    knowledge_object_id uuid NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    output text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT prompt_runs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: COLUMN prompt_runs.prompt_template_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.prompt_runs.prompt_template_id IS 'Optional: set when run used a Prompt Bank template; null for custom prompts.';


--
-- Name: prompt_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prompt_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    applies_to_types text[] DEFAULT '{}'::text[],
    prompt_text text NOT NULL,
    output_format text DEFAULT 'text'::text,
    tags text[] DEFAULT '{}'::text[],
    visibility text DEFAULT 'private'::text,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT prompt_templates_output_format_check CHECK ((output_format = ANY (ARRAY['text'::text, 'markdown'::text, 'json'::text]))),
    CONSTRAINT prompt_templates_visibility_check CHECK ((visibility = ANY (ARRAY['private'::text, 'org'::text])))
);


--
-- Name: rate_limit_run_prompt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limit_run_prompt (
    user_id uuid NOT NULL,
    window_bucket timestamp with time zone NOT NULL,
    count integer DEFAULT 0 NOT NULL
);


--
-- Name: TABLE rate_limit_run_prompt; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.rate_limit_run_prompt IS 'Run prompt rate limit: (user_id, minute bucket) -> count. Used by edge function only.';


--
-- Name: server_key_daily_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.server_key_daily_usage (
    user_id uuid NOT NULL,
    day date NOT NULL,
    count integer DEFAULT 0 NOT NULL
);


--
-- Name: TABLE server_key_daily_usage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.server_key_daily_usage IS 'Run prompt calls per user per UTC day that used the shared server DeepSeek key.';


--
-- Name: share_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.share_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    knowledge_object_id uuid NOT NULL,
    shared_with_user_id uuid NOT NULL,
    shared_with_email text,
    role public.share_role DEFAULT 'viewer'::public.share_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    schema jsonb DEFAULT '{"fields": [], "titleField": "title"}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_ai_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_ai_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    provider_type text NOT NULL,
    api_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_ai_providers_provider_type_check CHECK ((provider_type = ANY (ARRAY['openai'::text, 'deepseek'::text, 'anthropic'::text])))
);


--
-- Name: TABLE user_ai_providers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_ai_providers IS 'Per-user AI API keys (OpenAI/DeepSeek) for Run prompt; keys only read server-side in edge function.';


--
-- Name: COLUMN user_ai_providers.api_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_ai_providers.api_key IS 'Write-only for authenticated users (no SELECT grant); read by the run-prompt edge function via service role.';


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    email text,
    display_name text,
    timezone text DEFAULT 'Africa/Accra'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: domains domains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domains
    ADD CONSTRAINT domains_pkey PRIMARY KEY (id);


--
-- Name: domains domains_user_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domains
    ADD CONSTRAINT domains_user_id_name_key UNIQUE (user_id, name);


--
-- Name: export_job_items export_job_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_job_items
    ADD CONSTRAINT export_job_items_pkey PRIMARY KEY (export_job_id, knowledge_object_id);


--
-- Name: export_jobs export_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_jobs
    ADD CONSTRAINT export_jobs_pkey PRIMARY KEY (id);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: import_items import_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_items
    ADD CONSTRAINT import_items_pkey PRIMARY KEY (id);


--
-- Name: integrations integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: journal_entries journal_entries_user_id_entry_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_user_id_entry_date_key UNIQUE (user_id, entry_date);


--
-- Name: knowledge_object_domains knowledge_object_domains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_object_domains
    ADD CONSTRAINT knowledge_object_domains_pkey PRIMARY KEY (knowledge_object_id, domain_id);


--
-- Name: knowledge_object_files knowledge_object_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_object_files
    ADD CONSTRAINT knowledge_object_files_pkey PRIMARY KEY (knowledge_object_id, file_id);


--
-- Name: knowledge_object_tags knowledge_object_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_object_tags
    ADD CONSTRAINT knowledge_object_tags_pkey PRIMARY KEY (knowledge_object_id, tag_id);


--
-- Name: knowledge_object_versions knowledge_object_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_object_versions
    ADD CONSTRAINT knowledge_object_versions_pkey PRIMARY KEY (id);


--
-- Name: knowledge_objects knowledge_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_objects
    ADD CONSTRAINT knowledge_objects_pkey PRIMARY KEY (id);


--
-- Name: link_edges link_edges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.link_edges
    ADD CONSTRAINT link_edges_pkey PRIMARY KEY (id);


--
-- Name: link_edges link_edges_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.link_edges
    ADD CONSTRAINT link_edges_unique UNIQUE (from_object_id, to_object_id, relationship_type);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: paste_bin paste_bin_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paste_bin
    ADD CONSTRAINT paste_bin_pkey PRIMARY KEY (id);


--
-- Name: prompt_runs prompt_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_runs
    ADD CONSTRAINT prompt_runs_pkey PRIMARY KEY (id);


--
-- Name: prompt_templates prompt_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_templates
    ADD CONSTRAINT prompt_templates_pkey PRIMARY KEY (id);


--
-- Name: rate_limit_run_prompt rate_limit_run_prompt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit_run_prompt
    ADD CONSTRAINT rate_limit_run_prompt_pkey PRIMARY KEY (user_id, window_bucket);


--
-- Name: server_key_daily_usage server_key_daily_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.server_key_daily_usage
    ADD CONSTRAINT server_key_daily_usage_pkey PRIMARY KEY (user_id, day);


--
-- Name: share_permissions share_permissions_knowledge_object_id_shared_with_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_permissions
    ADD CONSTRAINT share_permissions_knowledge_object_id_shared_with_user_id_key UNIQUE (knowledge_object_id, shared_with_user_id);


--
-- Name: share_permissions share_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_permissions
    ADD CONSTRAINT share_permissions_pkey PRIMARY KEY (id);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: tags tags_user_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_user_id_name_key UNIQUE (user_id, name);


--
-- Name: templates templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_pkey PRIMARY KEY (id);


--
-- Name: user_ai_providers user_ai_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ai_providers
    ADD CONSTRAINT user_ai_providers_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_logs_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_entity ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: idx_audit_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);


--
-- Name: idx_domains_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_domains_user_id ON public.domains USING btree (user_id);


--
-- Name: idx_export_job_items_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_export_job_items_job ON public.export_job_items USING btree (export_job_id);


--
-- Name: idx_export_jobs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_export_jobs_created_at ON public.export_jobs USING btree (created_at DESC);


--
-- Name: idx_export_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_export_jobs_status ON public.export_jobs USING btree (status);


--
-- Name: idx_export_jobs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_export_jobs_user_id ON public.export_jobs USING btree (user_id);


--
-- Name: idx_files_storage_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_storage_key ON public.files USING btree (storage_key) WHERE (storage_key IS NOT NULL);


--
-- Name: idx_files_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_user_id ON public.files USING btree (user_id);


--
-- Name: idx_import_items_object; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_items_object ON public.import_items USING btree (knowledge_object_id);


--
-- Name: idx_import_items_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_import_items_unique ON public.import_items USING btree (user_id, COALESCE(integration_id, '00000000-0000-0000-0000-000000000000'::uuid), source_identifier);


--
-- Name: idx_import_items_user_integration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_items_user_integration ON public.import_items USING btree (user_id, integration_id);


--
-- Name: idx_integrations_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integrations_enabled ON public.integrations USING btree (user_id, enabled);


--
-- Name: idx_integrations_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integrations_user_id ON public.integrations USING btree (user_id);


--
-- Name: idx_journal_entries_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_journal_entries_user_date ON public.journal_entries USING btree (user_id, entry_date DESC);


--
-- Name: idx_knowledge_object_versions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_object_versions_created_at ON public.knowledge_object_versions USING btree (knowledge_object_id, created_at DESC);


--
-- Name: idx_knowledge_object_versions_object_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_object_versions_object_id ON public.knowledge_object_versions USING btree (knowledge_object_id);


--
-- Name: idx_knowledge_objects_due_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_objects_due_at ON public.knowledge_objects USING btree (user_id, due_at) WHERE ((due_at IS NOT NULL) AND (is_deleted = false));


--
-- Name: idx_knowledge_objects_fts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_objects_fts ON public.knowledge_objects USING gin (fts);


--
-- Name: idx_knowledge_objects_is_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_objects_is_deleted ON public.knowledge_objects USING btree (is_deleted);


--
-- Name: idx_knowledge_objects_is_pinned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_objects_is_pinned ON public.knowledge_objects USING btree (user_id, is_pinned) WHERE (is_pinned = true);


--
-- Name: idx_knowledge_objects_last_viewed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_objects_last_viewed ON public.knowledge_objects USING btree (user_id, last_viewed_at DESC NULLS LAST) WHERE (is_deleted = false);


--
-- Name: idx_knowledge_objects_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_objects_status ON public.knowledge_objects USING btree (user_id, status) WHERE (is_deleted = false);


--
-- Name: idx_knowledge_objects_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_objects_type ON public.knowledge_objects USING btree (type);


--
-- Name: idx_knowledge_objects_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_objects_updated_at ON public.knowledge_objects USING btree (updated_at DESC);


--
-- Name: idx_knowledge_objects_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_objects_user_id ON public.knowledge_objects USING btree (user_id);


--
-- Name: idx_knowledge_objects_user_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_knowledge_objects_user_slug ON public.knowledge_objects USING btree (user_id, slug) WHERE ((slug IS NOT NULL) AND (slug <> ''::text));


--
-- Name: idx_kod_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kod_domain ON public.knowledge_object_domains USING btree (domain_id);


--
-- Name: idx_kod_object; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kod_object ON public.knowledge_object_domains USING btree (knowledge_object_id);


--
-- Name: idx_kof_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kof_file ON public.knowledge_object_files USING btree (file_id);


--
-- Name: idx_kof_object; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kof_object ON public.knowledge_object_files USING btree (knowledge_object_id);


--
-- Name: idx_kot_object; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kot_object ON public.knowledge_object_tags USING btree (knowledge_object_id);


--
-- Name: idx_kot_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kot_tag ON public.knowledge_object_tags USING btree (tag_id);


--
-- Name: idx_link_edges_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_link_edges_from ON public.link_edges USING btree (from_object_id);


--
-- Name: idx_link_edges_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_link_edges_to ON public.link_edges USING btree (to_object_id);


--
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: idx_notifications_user_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_read ON public.notifications USING btree (user_id, read_at);


--
-- Name: idx_paste_bin_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_paste_bin_user_created ON public.paste_bin USING btree (user_id, created_at DESC);


--
-- Name: idx_prompt_runs_object; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prompt_runs_object ON public.prompt_runs USING btree (knowledge_object_id);


--
-- Name: idx_prompt_runs_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prompt_runs_template ON public.prompt_runs USING btree (prompt_template_id);


--
-- Name: idx_prompt_templates_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prompt_templates_user ON public.prompt_templates USING btree (user_id);


--
-- Name: idx_share_permissions_object; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_share_permissions_object ON public.share_permissions USING btree (knowledge_object_id);


--
-- Name: idx_share_permissions_shared_with; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_share_permissions_shared_with ON public.share_permissions USING btree (shared_with_user_id);


--
-- Name: idx_tags_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tags_user_id ON public.tags USING btree (user_id);


--
-- Name: idx_templates_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_user_id ON public.templates USING btree (user_id);


--
-- Name: idx_user_ai_providers_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_ai_providers_user_id ON public.user_ai_providers USING btree (user_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: integrations trg_integrations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_integrations_updated_at BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: knowledge_objects trg_knowledge_objects_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_knowledge_objects_guard BEFORE UPDATE ON public.knowledge_objects FOR EACH ROW EXECUTE FUNCTION public.guard_knowledge_object_update();


--
-- Name: knowledge_objects trg_knowledge_objects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_knowledge_objects_updated_at BEFORE UPDATE ON public.knowledge_objects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: knowledge_objects trg_knowledge_objects_version; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_knowledge_objects_version BEFORE UPDATE ON public.knowledge_objects FOR EACH ROW WHEN (((old.title IS DISTINCT FROM new.title) OR (old.content IS DISTINCT FROM new.content) OR (old.summary IS DISTINCT FROM new.summary) OR (old.key_points IS DISTINCT FROM new.key_points))) EXECUTE FUNCTION public.save_knowledge_object_version();


--
-- Name: prompt_templates trg_prompt_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prompt_templates_updated_at BEFORE UPDATE ON public.prompt_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: templates trg_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_templates_updated_at BEFORE UPDATE ON public.templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users trg_users_email_from_auth; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_email_from_auth BEFORE INSERT OR UPDATE OF email ON public.users FOR EACH ROW EXECUTE FUNCTION public.users_email_from_auth();


--
-- Name: users trg_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: domains domains_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domains
    ADD CONSTRAINT domains_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: export_job_items export_job_items_export_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_job_items
    ADD CONSTRAINT export_job_items_export_job_id_fkey FOREIGN KEY (export_job_id) REFERENCES public.export_jobs(id) ON DELETE CASCADE;


--
-- Name: export_job_items export_job_items_knowledge_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_job_items
    ADD CONSTRAINT export_job_items_knowledge_object_id_fkey FOREIGN KEY (knowledge_object_id) REFERENCES public.knowledge_objects(id) ON DELETE CASCADE;


--
-- Name: export_jobs export_jobs_knowledge_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_jobs
    ADD CONSTRAINT export_jobs_knowledge_object_id_fkey FOREIGN KEY (knowledge_object_id) REFERENCES public.knowledge_objects(id) ON DELETE SET NULL;


--
-- Name: export_jobs export_jobs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_jobs
    ADD CONSTRAINT export_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: files files_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: import_items import_items_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_items
    ADD CONSTRAINT import_items_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE SET NULL;


--
-- Name: import_items import_items_knowledge_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_items
    ADD CONSTRAINT import_items_knowledge_object_id_fkey FOREIGN KEY (knowledge_object_id) REFERENCES public.knowledge_objects(id) ON DELETE CASCADE;


--
-- Name: import_items import_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_items
    ADD CONSTRAINT import_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: integrations integrations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: journal_entries journal_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: knowledge_object_domains knowledge_object_domains_domain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_object_domains
    ADD CONSTRAINT knowledge_object_domains_domain_id_fkey FOREIGN KEY (domain_id) REFERENCES public.domains(id) ON DELETE CASCADE;


--
-- Name: knowledge_object_domains knowledge_object_domains_knowledge_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_object_domains
    ADD CONSTRAINT knowledge_object_domains_knowledge_object_id_fkey FOREIGN KEY (knowledge_object_id) REFERENCES public.knowledge_objects(id) ON DELETE CASCADE;


--
-- Name: knowledge_object_files knowledge_object_files_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_object_files
    ADD CONSTRAINT knowledge_object_files_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: knowledge_object_files knowledge_object_files_knowledge_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_object_files
    ADD CONSTRAINT knowledge_object_files_knowledge_object_id_fkey FOREIGN KEY (knowledge_object_id) REFERENCES public.knowledge_objects(id) ON DELETE CASCADE;


--
-- Name: knowledge_object_tags knowledge_object_tags_knowledge_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_object_tags
    ADD CONSTRAINT knowledge_object_tags_knowledge_object_id_fkey FOREIGN KEY (knowledge_object_id) REFERENCES public.knowledge_objects(id) ON DELETE CASCADE;


--
-- Name: knowledge_object_tags knowledge_object_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_object_tags
    ADD CONSTRAINT knowledge_object_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: knowledge_object_versions knowledge_object_versions_edited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_object_versions
    ADD CONSTRAINT knowledge_object_versions_edited_by_fkey FOREIGN KEY (edited_by) REFERENCES auth.users(id);


--
-- Name: knowledge_object_versions knowledge_object_versions_knowledge_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_object_versions
    ADD CONSTRAINT knowledge_object_versions_knowledge_object_id_fkey FOREIGN KEY (knowledge_object_id) REFERENCES public.knowledge_objects(id) ON DELETE CASCADE;


--
-- Name: knowledge_objects knowledge_objects_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_objects
    ADD CONSTRAINT knowledge_objects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: link_edges link_edges_from_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.link_edges
    ADD CONSTRAINT link_edges_from_object_id_fkey FOREIGN KEY (from_object_id) REFERENCES public.knowledge_objects(id) ON DELETE CASCADE;


--
-- Name: link_edges link_edges_to_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.link_edges
    ADD CONSTRAINT link_edges_to_object_id_fkey FOREIGN KEY (to_object_id) REFERENCES public.knowledge_objects(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: paste_bin paste_bin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paste_bin
    ADD CONSTRAINT paste_bin_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: prompt_runs prompt_runs_knowledge_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_runs
    ADD CONSTRAINT prompt_runs_knowledge_object_id_fkey FOREIGN KEY (knowledge_object_id) REFERENCES public.knowledge_objects(id) ON DELETE CASCADE;


--
-- Name: prompt_runs prompt_runs_prompt_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_runs
    ADD CONSTRAINT prompt_runs_prompt_template_id_fkey FOREIGN KEY (prompt_template_id) REFERENCES public.prompt_templates(id) ON DELETE CASCADE;


--
-- Name: prompt_runs prompt_runs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_runs
    ADD CONSTRAINT prompt_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: prompt_templates prompt_templates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_templates
    ADD CONSTRAINT prompt_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: rate_limit_run_prompt rate_limit_run_prompt_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit_run_prompt
    ADD CONSTRAINT rate_limit_run_prompt_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: server_key_daily_usage server_key_daily_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.server_key_daily_usage
    ADD CONSTRAINT server_key_daily_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: share_permissions share_permissions_knowledge_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_permissions
    ADD CONSTRAINT share_permissions_knowledge_object_id_fkey FOREIGN KEY (knowledge_object_id) REFERENCES public.knowledge_objects(id) ON DELETE CASCADE;


--
-- Name: share_permissions share_permissions_shared_with_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_permissions
    ADD CONSTRAINT share_permissions_shared_with_user_id_fkey FOREIGN KEY (shared_with_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: tags tags_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: templates templates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_ai_providers user_ai_providers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ai_providers
    ADD CONSTRAINT user_ai_providers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: rate_limit_run_prompt No direct access to rate_limit_run_prompt; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "No direct access to rate_limit_run_prompt" ON public.rate_limit_run_prompt USING (false) WITH CHECK (false);


--
-- Name: server_key_daily_usage No direct access to server_key_daily_usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "No direct access to server_key_daily_usage" ON public.server_key_daily_usage USING (false) WITH CHECK (false);


--
-- Name: share_permissions Owners can manage share_permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can manage share_permissions" ON public.share_permissions USING (public.owns_knowledge_object(knowledge_object_id)) WITH CHECK (public.owns_knowledge_object(knowledge_object_id));


--
-- Name: share_permissions Shared user can read own share_permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Shared user can read own share_permissions" ON public.share_permissions FOR SELECT USING ((shared_with_user_id = auth.uid()));


--
-- Name: link_edges Users can delete links for own objects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete links for own objects" ON public.link_edges FOR DELETE USING (((EXISTS ( SELECT 1
   FROM public.knowledge_objects ko
  WHERE ((ko.id = link_edges.from_object_id) AND (ko.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.knowledge_objects ko
  WHERE ((ko.id = link_edges.to_object_id) AND (ko.user_id = auth.uid()))))));


--
-- Name: domains Users can delete own domains; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own domains" ON public.domains FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: files Users can delete own files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own files" ON public.files FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: journal_entries Users can delete own journal_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own journal_entries" ON public.journal_entries FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: knowledge_objects Users can delete own knowledge_objects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own knowledge_objects" ON public.knowledge_objects FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: paste_bin Users can delete own paste_bin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own paste_bin" ON public.paste_bin FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: tags Users can delete own tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own tags" ON public.tags FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: link_edges Users can insert links between own objects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert links between own objects" ON public.link_edges FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.knowledge_objects ko
  WHERE ((ko.id = link_edges.from_object_id) AND (ko.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM public.knowledge_objects ko
  WHERE ((ko.id = link_edges.to_object_id) AND (ko.user_id = auth.uid()))))));


--
-- Name: audit_logs Users can insert own audit_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own audit_logs" ON public.audit_logs FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: domains Users can insert own domains; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own domains" ON public.domains FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: files Users can insert own files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own files" ON public.files FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: journal_entries Users can insert own journal_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own journal_entries" ON public.journal_entries FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: knowledge_objects Users can insert own knowledge_objects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own knowledge_objects" ON public.knowledge_objects FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: paste_bin Users can insert own paste_bin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own paste_bin" ON public.paste_bin FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: users Users can insert own row; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own row" ON public.users FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: tags Users can insert own tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own tags" ON public.tags FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: knowledge_object_versions Users can insert versions for own objects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert versions for own objects" ON public.knowledge_object_versions FOR INSERT WITH CHECK (((auth.uid() = edited_by) AND ((EXISTS ( SELECT 1
   FROM public.knowledge_objects ko
  WHERE ((ko.id = knowledge_object_versions.knowledge_object_id) AND (ko.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.share_permissions sp
  WHERE ((sp.knowledge_object_id = knowledge_object_versions.knowledge_object_id) AND (sp.shared_with_user_id = auth.uid()) AND (sp.role = 'editor'::public.share_role)))))));


--
-- Name: export_job_items Users can manage export_job_items for own jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage export_job_items for own jobs" ON public.export_job_items USING ((EXISTS ( SELECT 1
   FROM public.export_jobs ej
  WHERE ((ej.id = export_job_items.export_job_id) AND (ej.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.export_jobs ej
  WHERE ((ej.id = export_job_items.export_job_id) AND (ej.user_id = auth.uid())))));


--
-- Name: knowledge_object_domains Users can manage kod for own objects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage kod for own objects" ON public.knowledge_object_domains USING ((EXISTS ( SELECT 1
   FROM public.knowledge_objects ko
  WHERE ((ko.id = knowledge_object_domains.knowledge_object_id) AND (ko.user_id = auth.uid()))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.knowledge_objects ko
  WHERE ((ko.id = knowledge_object_domains.knowledge_object_id) AND (ko.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM public.domains d
  WHERE ((d.id = knowledge_object_domains.domain_id) AND (d.user_id = auth.uid()))))));


--
-- Name: knowledge_object_files Users can manage kof for own objects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage kof for own objects" ON public.knowledge_object_files USING ((EXISTS ( SELECT 1
   FROM public.knowledge_objects ko
  WHERE ((ko.id = knowledge_object_files.knowledge_object_id) AND (ko.user_id = auth.uid()))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.knowledge_objects ko
  WHERE ((ko.id = knowledge_object_files.knowledge_object_id) AND (ko.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM public.files f
  WHERE ((f.id = knowledge_object_files.file_id) AND (f.user_id = auth.uid()))))));


--
-- Name: knowledge_object_tags Users can manage kot for own objects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage kot for own objects" ON public.knowledge_object_tags USING ((EXISTS ( SELECT 1
   FROM public.knowledge_objects ko
  WHERE ((ko.id = knowledge_object_tags.knowledge_object_id) AND (ko.user_id = auth.uid()))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.knowledge_objects ko
  WHERE ((ko.id = knowledge_object_tags.knowledge_object_id) AND (ko.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM public.tags t
  WHERE ((t.id = knowledge_object_tags.tag_id) AND (t.user_id = auth.uid()))))));


--
-- Name: export_jobs Users can manage own export_jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own export_jobs" ON public.export_jobs USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: import_items Users can manage own import_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own import_items" ON public.import_items USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: integrations Users can manage own integrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own integrations" ON public.integrations USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: notifications Users can manage own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own notifications" ON public.notifications USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: prompt_runs Users can manage own prompt_runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own prompt_runs" ON public.prompt_runs USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: prompt_templates Users can manage own prompt_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own prompt_templates" ON public.prompt_templates USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: templates Users can manage own templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own templates" ON public.templates USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_ai_providers Users can manage own user_ai_providers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own user_ai_providers" ON public.user_ai_providers USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: knowledge_object_domains Users can read kod for shared objects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read kod for shared objects" ON public.knowledge_object_domains FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.share_permissions sp
  WHERE ((sp.knowledge_object_id = knowledge_object_domains.knowledge_object_id) AND (sp.shared_with_user_id = auth.uid())))));


--
-- Name: knowledge_object_tags Users can read kot for shared objects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read kot for shared objects" ON public.knowledge_object_tags FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.share_permissions sp
  WHERE ((sp.knowledge_object_id = knowledge_object_tags.knowledge_object_id) AND (sp.shared_with_user_id = auth.uid())))));


--
-- Name: link_edges Users can read links for own objects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read links for own objects" ON public.link_edges FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.knowledge_objects ko
  WHERE ((ko.id = link_edges.from_object_id) AND (ko.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.knowledge_objects ko
  WHERE ((ko.id = link_edges.to_object_id) AND (ko.user_id = auth.uid()))))));


--
-- Name: link_edges Users can read links for shared objects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read links for shared objects" ON public.link_edges FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.share_permissions sp
  WHERE ((sp.knowledge_object_id = link_edges.from_object_id) AND (sp.shared_with_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.share_permissions sp
  WHERE ((sp.knowledge_object_id = link_edges.to_object_id) AND (sp.shared_with_user_id = auth.uid()))))));


--
-- Name: audit_logs Users can read own audit_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own audit_logs" ON public.audit_logs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: domains Users can read own domains; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own domains" ON public.domains FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: files Users can read own files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own files" ON public.files FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: journal_entries Users can read own journal_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own journal_entries" ON public.journal_entries FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: knowledge_objects Users can read own knowledge_objects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own knowledge_objects" ON public.knowledge_objects FOR SELECT USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.share_permissions sp
  WHERE ((sp.knowledge_object_id = knowledge_objects.id) AND (sp.shared_with_user_id = auth.uid()))))));


--
-- Name: paste_bin Users can read own paste_bin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own paste_bin" ON public.paste_bin FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: users Users can read own row; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own row" ON public.users FOR SELECT USING ((auth.uid() = id));


--
-- Name: tags Users can read own tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own tags" ON public.tags FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: knowledge_object_versions Users can read versions of own objects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read versions of own objects" ON public.knowledge_object_versions FOR SELECT USING ((public.owns_knowledge_object(knowledge_object_id) OR (EXISTS ( SELECT 1
   FROM public.share_permissions sp
  WHERE ((sp.knowledge_object_id = knowledge_object_versions.knowledge_object_id) AND (sp.shared_with_user_id = auth.uid()))))));


--
-- Name: domains Users can update own domains; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own domains" ON public.domains FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: journal_entries Users can update own journal_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own journal_entries" ON public.journal_entries FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: knowledge_objects Users can update own knowledge_objects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own knowledge_objects" ON public.knowledge_objects FOR UPDATE USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.share_permissions sp
  WHERE ((sp.knowledge_object_id = knowledge_objects.id) AND (sp.shared_with_user_id = auth.uid()) AND (sp.role = 'editor'::public.share_role)))))) WITH CHECK (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.share_permissions sp
  WHERE ((sp.knowledge_object_id = knowledge_objects.id) AND (sp.shared_with_user_id = auth.uid()) AND (sp.role = 'editor'::public.share_role))))));


--
-- Name: paste_bin Users can update own paste_bin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own paste_bin" ON public.paste_bin FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: users Users can update own row; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own row" ON public.users FOR UPDATE USING ((auth.uid() = id));


--
-- Name: tags Users can update own tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own tags" ON public.tags FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: domains; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;

--
-- Name: export_job_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.export_job_items ENABLE ROW LEVEL SECURITY;

--
-- Name: export_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

--
-- Name: import_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.import_items ENABLE ROW LEVEL SECURITY;

--
-- Name: integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: journal_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_object_domains; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_object_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_object_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_object_files ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_object_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_object_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_object_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_object_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_objects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_objects ENABLE ROW LEVEL SECURITY;

--
-- Name: link_edges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.link_edges ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: paste_bin; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.paste_bin ENABLE ROW LEVEL SECURITY;

--
-- Name: prompt_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prompt_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: prompt_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_limit_run_prompt; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limit_run_prompt ENABLE ROW LEVEL SECURITY;

--
-- Name: server_key_daily_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.server_key_daily_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: share_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.share_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

--
-- Name: user_ai_providers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_ai_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION consume_server_key_quota(p_daily_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.consume_server_key_quota(p_daily_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.consume_server_key_quota(p_daily_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.consume_server_key_quota(p_daily_limit integer) TO service_role;


--
-- Name: FUNCTION count_knowledge_objects(search_query text, type_filter text, domain_id_f uuid, tag_id_f uuid, date_from_f timestamp with time zone, date_to_f timestamp with time zone, status_filter text, due_from_f timestamp with time zone, due_to_f timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.count_knowledge_objects(search_query text, type_filter text, domain_id_f uuid, tag_id_f uuid, date_from_f timestamp with time zone, date_to_f timestamp with time zone, status_filter text, due_from_f timestamp with time zone, due_to_f timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.count_knowledge_objects(search_query text, type_filter text, domain_id_f uuid, tag_id_f uuid, date_from_f timestamp with time zone, date_to_f timestamp with time zone, status_filter text, due_from_f timestamp with time zone, due_to_f timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.count_knowledge_objects(search_query text, type_filter text, domain_id_f uuid, tag_id_f uuid, date_from_f timestamp with time zone, date_to_f timestamp with time zone, status_filter text, due_from_f timestamp with time zone, due_to_f timestamp with time zone) TO service_role;


--
-- Name: FUNCTION create_domain(p_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_domain(p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_domain(p_name text) TO authenticated;
GRANT ALL ON FUNCTION public.create_domain(p_name text) TO service_role;


--
-- Name: FUNCTION create_tag(p_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_tag(p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_tag(p_name text) TO authenticated;
GRANT ALL ON FUNCTION public.create_tag(p_name text) TO service_role;


--
-- Name: FUNCTION get_dashboard_activity(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_dashboard_activity() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_dashboard_activity() TO authenticated;
GRANT ALL ON FUNCTION public.get_dashboard_activity() TO service_role;


--
-- Name: FUNCTION get_dashboard_stats(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_dashboard_stats() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_dashboard_stats() TO authenticated;
GRANT ALL ON FUNCTION public.get_dashboard_stats() TO service_role;


--
-- Name: FUNCTION get_object_links_batch(p_object_ids uuid[], p_limit_per integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_object_links_batch(p_object_ids uuid[], p_limit_per integer) TO anon;
GRANT ALL ON FUNCTION public.get_object_links_batch(p_object_ids uuid[], p_limit_per integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_object_links_batch(p_object_ids uuid[], p_limit_per integer) TO service_role;


--
-- Name: FUNCTION guard_knowledge_object_update(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_knowledge_object_update() TO anon;
GRANT ALL ON FUNCTION public.guard_knowledge_object_update() TO authenticated;
GRANT ALL ON FUNCTION public.guard_knowledge_object_update() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION import_get_existing_object(p_integration_id uuid, p_source_identifier text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.import_get_existing_object(p_integration_id uuid, p_source_identifier text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.import_get_existing_object(p_integration_id uuid, p_source_identifier text) TO authenticated;
GRANT ALL ON FUNCTION public.import_get_existing_object(p_integration_id uuid, p_source_identifier text) TO service_role;


--
-- Name: FUNCTION import_register(p_integration_id uuid, p_source_identifier text, p_knowledge_object_id uuid, p_payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.import_register(p_integration_id uuid, p_source_identifier text, p_knowledge_object_id uuid, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.import_register(p_integration_id uuid, p_source_identifier text, p_knowledge_object_id uuid, p_payload jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.import_register(p_integration_id uuid, p_source_identifier text, p_knowledge_object_id uuid, p_payload jsonb) TO service_role;


--
-- Name: FUNCTION increment_run_prompt_rate_limit(p_limit_per_minute integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.increment_run_prompt_rate_limit(p_limit_per_minute integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.increment_run_prompt_rate_limit(p_limit_per_minute integer) TO authenticated;
GRANT ALL ON FUNCTION public.increment_run_prompt_rate_limit(p_limit_per_minute integer) TO service_role;


--
-- Name: FUNCTION owns_knowledge_object(obj_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.owns_knowledge_object(obj_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.owns_knowledge_object(obj_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.owns_knowledge_object(obj_id uuid) TO service_role;


--
-- Name: FUNCTION resolve_user_id_by_email(target_email text, p_knowledge_object_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_user_id_by_email(target_email text, p_knowledge_object_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_user_id_by_email(target_email text, p_knowledge_object_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.resolve_user_id_by_email(target_email text, p_knowledge_object_id uuid) TO service_role;


--
-- Name: FUNCTION rls_auto_enable(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO authenticated;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;


--
-- Name: FUNCTION save_knowledge_object_version(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_knowledge_object_version() FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_knowledge_object_version() TO service_role;


--
-- Name: TABLE knowledge_objects; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.knowledge_objects TO anon;
GRANT ALL ON TABLE public.knowledge_objects TO authenticated;
GRANT ALL ON TABLE public.knowledge_objects TO service_role;


--
-- Name: FUNCTION search_knowledge_objects(search_query text, type_filter text, domain_id_f uuid, tag_id_f uuid, date_from_f timestamp with time zone, date_to_f timestamp with time zone, status_filter text, due_from_f timestamp with time zone, due_to_f timestamp with time zone, limit_n integer, offset_n integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.search_knowledge_objects(search_query text, type_filter text, domain_id_f uuid, tag_id_f uuid, date_from_f timestamp with time zone, date_to_f timestamp with time zone, status_filter text, due_from_f timestamp with time zone, due_to_f timestamp with time zone, limit_n integer, offset_n integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.search_knowledge_objects(search_query text, type_filter text, domain_id_f uuid, tag_id_f uuid, date_from_f timestamp with time zone, date_to_f timestamp with time zone, status_filter text, due_from_f timestamp with time zone, due_to_f timestamp with time zone, limit_n integer, offset_n integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_knowledge_objects(search_query text, type_filter text, domain_id_f uuid, tag_id_f uuid, date_from_f timestamp with time zone, date_to_f timestamp with time zone, status_filter text, due_from_f timestamp with time zone, due_to_f timestamp with time zone, limit_n integer, offset_n integer) TO service_role;


--
-- Name: FUNCTION search_knowledge_objects_with_snippets(search_query text, type_filter text, domain_id_f uuid, tag_id_f uuid, date_from_f timestamp with time zone, date_to_f timestamp with time zone, status_filter text, due_from_f timestamp with time zone, due_to_f timestamp with time zone, limit_n integer, offset_n integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.search_knowledge_objects_with_snippets(search_query text, type_filter text, domain_id_f uuid, tag_id_f uuid, date_from_f timestamp with time zone, date_to_f timestamp with time zone, status_filter text, due_from_f timestamp with time zone, due_to_f timestamp with time zone, limit_n integer, offset_n integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.search_knowledge_objects_with_snippets(search_query text, type_filter text, domain_id_f uuid, tag_id_f uuid, date_from_f timestamp with time zone, date_to_f timestamp with time zone, status_filter text, due_from_f timestamp with time zone, due_to_f timestamp with time zone, limit_n integer, offset_n integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_knowledge_objects_with_snippets(search_query text, type_filter text, domain_id_f uuid, tag_id_f uuid, date_from_f timestamp with time zone, date_to_f timestamp with time zone, status_filter text, due_from_f timestamp with time zone, due_to_f timestamp with time zone, limit_n integer, offset_n integer) TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION suggest_linked_objects(p_object_id uuid, limit_n integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.suggest_linked_objects(p_object_id uuid, limit_n integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.suggest_linked_objects(p_object_id uuid, limit_n integer) TO authenticated;
GRANT ALL ON FUNCTION public.suggest_linked_objects(p_object_id uuid, limit_n integer) TO service_role;


--
-- Name: FUNCTION suggest_tags_for_object(p_object_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.suggest_tags_for_object(p_object_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.suggest_tags_for_object(p_object_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.suggest_tags_for_object(p_object_id uuid) TO service_role;


--
-- Name: FUNCTION suggest_tags_for_object_fallback(p_object_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.suggest_tags_for_object_fallback(p_object_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.suggest_tags_for_object_fallback(p_object_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.suggest_tags_for_object_fallback(p_object_id uuid) TO service_role;


--
-- Name: FUNCTION sync_user_email_from_auth(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sync_user_email_from_auth() FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_user_email_from_auth() TO service_role;


--
-- Name: FUNCTION touch_object_view(p_object_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.touch_object_view(p_object_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.touch_object_view(p_object_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.touch_object_view(p_object_id uuid) TO service_role;


--
-- Name: FUNCTION users_email_from_auth(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.users_email_from_auth() FROM PUBLIC;
GRANT ALL ON FUNCTION public.users_email_from_auth() TO service_role;


--
-- Name: TABLE audit_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.audit_logs TO anon;
GRANT ALL ON TABLE public.audit_logs TO authenticated;
GRANT ALL ON TABLE public.audit_logs TO service_role;


--
-- Name: TABLE domains; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.domains TO anon;
GRANT ALL ON TABLE public.domains TO authenticated;
GRANT ALL ON TABLE public.domains TO service_role;


--
-- Name: TABLE export_job_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.export_job_items TO anon;
GRANT ALL ON TABLE public.export_job_items TO authenticated;
GRANT ALL ON TABLE public.export_job_items TO service_role;


--
-- Name: TABLE export_jobs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.export_jobs TO anon;
GRANT ALL ON TABLE public.export_jobs TO authenticated;
GRANT ALL ON TABLE public.export_jobs TO service_role;


--
-- Name: TABLE files; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.files TO anon;
GRANT ALL ON TABLE public.files TO authenticated;
GRANT ALL ON TABLE public.files TO service_role;


--
-- Name: TABLE import_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.import_items TO anon;
GRANT ALL ON TABLE public.import_items TO authenticated;
GRANT ALL ON TABLE public.import_items TO service_role;


--
-- Name: TABLE integrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.integrations TO anon;
GRANT ALL ON TABLE public.integrations TO authenticated;
GRANT ALL ON TABLE public.integrations TO service_role;


--
-- Name: TABLE journal_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.journal_entries TO anon;
GRANT ALL ON TABLE public.journal_entries TO authenticated;
GRANT ALL ON TABLE public.journal_entries TO service_role;


--
-- Name: TABLE knowledge_object_domains; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.knowledge_object_domains TO anon;
GRANT ALL ON TABLE public.knowledge_object_domains TO authenticated;
GRANT ALL ON TABLE public.knowledge_object_domains TO service_role;


--
-- Name: TABLE knowledge_object_files; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.knowledge_object_files TO anon;
GRANT ALL ON TABLE public.knowledge_object_files TO authenticated;
GRANT ALL ON TABLE public.knowledge_object_files TO service_role;


--
-- Name: TABLE knowledge_object_tags; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.knowledge_object_tags TO anon;
GRANT ALL ON TABLE public.knowledge_object_tags TO authenticated;
GRANT ALL ON TABLE public.knowledge_object_tags TO service_role;


--
-- Name: TABLE knowledge_object_versions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.knowledge_object_versions TO anon;
GRANT ALL ON TABLE public.knowledge_object_versions TO authenticated;
GRANT ALL ON TABLE public.knowledge_object_versions TO service_role;


--
-- Name: TABLE link_edges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.link_edges TO anon;
GRANT ALL ON TABLE public.link_edges TO authenticated;
GRANT ALL ON TABLE public.link_edges TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE paste_bin; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.paste_bin TO anon;
GRANT ALL ON TABLE public.paste_bin TO authenticated;
GRANT ALL ON TABLE public.paste_bin TO service_role;


--
-- Name: TABLE prompt_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.prompt_runs TO anon;
GRANT ALL ON TABLE public.prompt_runs TO authenticated;
GRANT ALL ON TABLE public.prompt_runs TO service_role;


--
-- Name: TABLE prompt_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.prompt_templates TO anon;
GRANT ALL ON TABLE public.prompt_templates TO authenticated;
GRANT ALL ON TABLE public.prompt_templates TO service_role;


--
-- Name: TABLE rate_limit_run_prompt; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rate_limit_run_prompt TO anon;
GRANT ALL ON TABLE public.rate_limit_run_prompt TO authenticated;
GRANT ALL ON TABLE public.rate_limit_run_prompt TO service_role;


--
-- Name: TABLE server_key_daily_usage; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.server_key_daily_usage TO anon;
GRANT ALL ON TABLE public.server_key_daily_usage TO authenticated;
GRANT ALL ON TABLE public.server_key_daily_usage TO service_role;


--
-- Name: TABLE share_permissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.share_permissions TO anon;
GRANT ALL ON TABLE public.share_permissions TO authenticated;
GRANT ALL ON TABLE public.share_permissions TO service_role;


--
-- Name: TABLE tags; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tags TO anon;
GRANT ALL ON TABLE public.tags TO authenticated;
GRANT ALL ON TABLE public.tags TO service_role;


--
-- Name: TABLE templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.templates TO anon;
GRANT ALL ON TABLE public.templates TO authenticated;
GRANT ALL ON TABLE public.templates TO service_role;


--
-- Name: TABLE user_ai_providers; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.user_ai_providers TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.user_ai_providers TO authenticated;
GRANT ALL ON TABLE public.user_ai_providers TO service_role;


--
-- Name: COLUMN user_ai_providers.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.user_ai_providers TO authenticated;


--
-- Name: COLUMN user_ai_providers.user_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(user_id) ON TABLE public.user_ai_providers TO authenticated;


--
-- Name: COLUMN user_ai_providers.name; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(name) ON TABLE public.user_ai_providers TO authenticated;


--
-- Name: COLUMN user_ai_providers.provider_type; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(provider_type) ON TABLE public.user_ai_providers TO authenticated;


--
-- Name: COLUMN user_ai_providers.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.user_ai_providers TO authenticated;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.users TO anon;
GRANT ALL ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--



-- ---------------------------------------------------------------------------
-- Objects outside the public schema (not included by `pg_dump --schema=public`)
-- ---------------------------------------------------------------------------

-- auth.users triggers (from 20250212000001_phase1_users.sql and 20260926000001 §4)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_user_email_from_auth();

-- Storage bucket and policies (from 20250219000003_storage_bucket_pks_files.sql)
INSERT INTO storage.buckets (id, name, public)
VALUES ('pks-files', 'pks-files', false)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, public = EXCLUDED.public;

DROP POLICY IF EXISTS "pks-files insert own" ON storage.objects;
CREATE POLICY "pks-files insert own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pks-files' AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP POLICY IF EXISTS "pks-files select own" ON storage.objects;
CREATE POLICY "pks-files select own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pks-files' AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP POLICY IF EXISTS "pks-files delete own" ON storage.objects;
CREATE POLICY "pks-files delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pks-files' AND (storage.foldername(name))[1] = (auth.uid())::text);
