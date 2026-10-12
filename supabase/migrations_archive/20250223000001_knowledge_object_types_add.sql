-- Add more knowledge object types for richer PKM use cases.
-- New values: bookmark, meeting_notes, quote, recipe, person, howto
-- Run once; re-running will error if values already exist.

ALTER TYPE public.knowledge_object_type ADD VALUE 'bookmark';
ALTER TYPE public.knowledge_object_type ADD VALUE 'meeting_notes';
ALTER TYPE public.knowledge_object_type ADD VALUE 'quote';
ALTER TYPE public.knowledge_object_type ADD VALUE 'recipe';
ALTER TYPE public.knowledge_object_type ADD VALUE 'person';
ALTER TYPE public.knowledge_object_type ADD VALUE 'howto';
