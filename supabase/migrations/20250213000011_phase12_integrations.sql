-- PKS Phase 12: Integrations + Import scaffolding
-- Run in Supabase SQL Editor
-- integrations: store/enable/disable per-user integrations
-- import_items: track imported items for deduplication (one object per source_identifier per integration)

CREATE TABLE IF NOT EXISTS public.integrations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'generic',
  enabled    BOOLEAN NOT NULL DEFAULT true,
  config      JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integrations_user_id ON public.integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_integrations_enabled ON public.integrations(user_id, enabled);

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own integrations"
  ON public.integrations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_integrations_updated_at ON public.integrations;
CREATE TRIGGER trg_integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- import_items: one row per imported object, for deduplication (same source_identifier = same object)
CREATE TABLE IF NOT EXISTS public.import_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id        UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  source_identifier    TEXT NOT NULL,
  knowledge_object_id   UUID NOT NULL REFERENCES public.knowledge_objects(id) ON DELETE CASCADE,
  payload              JSONB DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dedupe: one object per (user, integration, source_identifier). NULL integration_id = generic import.
CREATE UNIQUE INDEX idx_import_items_unique ON public.import_items (user_id, COALESCE(integration_id, '00000000-0000-0000-0000-000000000000'::uuid), source_identifier);

CREATE INDEX IF NOT EXISTS idx_import_items_user_integration ON public.import_items(user_id, integration_id);
CREATE INDEX IF NOT EXISTS idx_import_items_object ON public.import_items(knowledge_object_id);

ALTER TABLE public.import_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own import_items"
  ON public.import_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RPC: get or create knowledge_object id for import (dedupe by user + integration + source_identifier)
-- Returns existing object id if import_item exists; otherwise returns null (caller creates object then registers)
CREATE OR REPLACE FUNCTION public.import_get_existing_object(
  p_integration_id   uuid DEFAULT NULL,
  p_source_identifier text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT knowledge_object_id
  FROM public.import_items
  WHERE user_id = auth.uid()
    AND (p_integration_id IS NULL AND integration_id IS NULL OR integration_id = p_integration_id)
    AND source_identifier = p_source_identifier
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.import_get_existing_object(uuid, text) TO authenticated;

-- RPC: register an import (call after creating knowledge_object). Upserts by (user, integration_id, source_identifier).
CREATE OR REPLACE FUNCTION public.import_register(
  p_integration_id     uuid DEFAULT NULL,
  p_source_identifier text DEFAULT NULL,
  p_knowledge_object_id uuid DEFAULT NULL,
  p_payload           jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
GRANT EXECUTE ON FUNCTION public.import_register(uuid, text, uuid, jsonb) TO authenticated;
