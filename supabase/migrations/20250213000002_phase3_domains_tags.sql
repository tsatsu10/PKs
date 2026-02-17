-- PKS Phase 3: Domains + Tags + M:N associations
-- Run in Supabase SQL Editor

-- domains: user-scoped, unique name per user
CREATE TABLE IF NOT EXISTS public.domains (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_domains_user_id ON public.domains(user_id);

-- tags: user-scoped, unique name per user
CREATE TABLE IF NOT EXISTS public.tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tags_user_id ON public.tags(user_id);

-- knowledge_object_domains: M:N
CREATE TABLE IF NOT EXISTS public.knowledge_object_domains (
  knowledge_object_id UUID NOT NULL REFERENCES public.knowledge_objects(id) ON DELETE CASCADE,
  domain_id           UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  PRIMARY KEY (knowledge_object_id, domain_id)
);

CREATE INDEX IF NOT EXISTS idx_kod_object ON public.knowledge_object_domains(knowledge_object_id);
CREATE INDEX IF NOT EXISTS idx_kod_domain ON public.knowledge_object_domains(domain_id);

-- knowledge_object_tags: M:N
CREATE TABLE IF NOT EXISTS public.knowledge_object_tags (
  knowledge_object_id UUID NOT NULL REFERENCES public.knowledge_objects(id) ON DELETE CASCADE,
  tag_id              UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (knowledge_object_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_kot_object ON public.knowledge_object_tags(knowledge_object_id);
CREATE INDEX IF NOT EXISTS idx_kot_tag ON public.knowledge_object_tags(tag_id);

-- RLS: domains
ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own domains"
  ON public.domains FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own domains"
  ON public.domains FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own domains"
  ON public.domains FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own domains"
  ON public.domains FOR DELETE USING (auth.uid() = user_id);

-- RLS: tags
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own tags"
  ON public.tags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tags"
  ON public.tags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tags"
  ON public.tags FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tags"
  ON public.tags FOR DELETE USING (auth.uid() = user_id);

-- RLS: knowledge_object_domains (only for objects the user owns)
ALTER TABLE public.knowledge_object_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage kod for own objects"
  ON public.knowledge_object_domains FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.knowledge_objects ko WHERE ko.id = knowledge_object_id AND ko.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.knowledge_objects ko WHERE ko.id = knowledge_object_id AND ko.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.domains d WHERE d.id = domain_id AND d.user_id = auth.uid())
  );

-- RLS: knowledge_object_tags
ALTER TABLE public.knowledge_object_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage kot for own objects"
  ON public.knowledge_object_tags FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.knowledge_objects ko WHERE ko.id = knowledge_object_id AND ko.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.knowledge_objects ko WHERE ko.id = knowledge_object_id AND ko.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.tags t WHERE t.id = tag_id AND t.user_id = auth.uid())
  );
