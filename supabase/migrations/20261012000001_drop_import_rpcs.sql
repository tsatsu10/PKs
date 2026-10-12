-- Drop the import dedupe RPCs. No client calls them and production's import_items has no
-- rows, so nothing depends on them. Production's import_register also lacks the ownership
-- check from 20250309100004 (see the −1C runbook's drift table); dropping it removes that gap.
-- The import_items table itself goes with −1B1 Task 11's contract migration.

DROP FUNCTION IF EXISTS public.import_register(uuid, text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.import_get_existing_object(uuid, text);
