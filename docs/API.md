# PKS API (Phase 12)

All access is **auth-protected** via Supabase: use the Supabase client with your project URL and anon key, and pass the user's JWT (session) so RLS applies.

## Auth

- **Register / Login:** Supabase Auth (email + password). Session yields a JWT.
- **Client:** `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)` then `supabase.auth.getSession()` for the token.

## Object CRUD

- **Table:** `knowledge_objects`
- **Insert:** `supabase.from('knowledge_objects').insert({ user_id, type, title, source?, content?, summary? }).select().single()`
- **Select one:** `supabase.from('knowledge_objects').select('*').eq('id', id).single()`
- **Update:** `supabase.from('knowledge_objects').update({ ... }).eq('id', id)`
- **Soft delete:** `supabase.from('knowledge_objects').update({ is_deleted: true }).eq('id', id)`

RLS ensures users only see/edit their own objects and objects shared with them.

## Search

- **RPC:** `search_knowledge_objects(search_query?, type_filter?, domain_id_f?, tag_id_f?, date_from_f?, date_to_f?, limit_n?, offset_n?)`
- Returns rows from `knowledge_objects` (own + shared), FTS + filters applied.

Example:

```js
const { data } = await supabase.rpc('search_knowledge_objects', {
  search_query: 'health',
  type_filter: 'document',
  limit_n: 20,
  offset_n: 0,
});
```

## AI-powered prompts

The **Run prompt** flow can generate output via AI. The app calls the Edge Function `run-prompt` with `{ promptText, objectTitle, objectContent }`. The function uses OpenAI and returns the generated text. Configure `OPENAI_API_KEY` in Supabase Edge Function secrets to enable this; otherwise users can paste prompt output manually.

## Export

Export is currently implemented in the app (TXT, MD, PDF via print). To replicate server-side or in another client: build text from object fields (title, summary, key_points, content, domains, tags, links) using the same logic as the frontend export panel.

## Import deduplication

To avoid creating duplicate objects when importing from an external source:

1. **Before create:** Call `import_get_existing_object(integration_id, source_identifier)`. If it returns a UUID, update that object instead of creating a new one.
2. **After create/update:** Call `import_register(integration_id, source_identifier, knowledge_object_id, payload?)` to register or update the mapping.

RPCs:

- `import_get_existing_object(p_integration_id uuid, p_source_identifier text)` → returns `knowledge_object_id` or null.
- `import_register(p_integration_id uuid, p_source_identifier text, p_knowledge_object_id uuid, p_payload jsonb)` → upserts `import_items` and returns the row id.

Integrations are stored in the `integrations` table (name, type, enabled). Create one per import source and pass its id when calling the import RPCs.

## Webhooks

Create an integration with **type** `webhook` and set **config** to `{ "url": "https://your-endpoint.com/webhook", "events": ["object.created", "prompt_run.completed", "export.completed"], "secret": "optional-hmac-secret" }`. The app calls the Edge Function `webhook-deliver` on these events; the function POSTs `{ event, payload, timestamp }` to each enabled webhook whose `config.events` includes the event (or all events if `events` is empty). If `config.secret` is set, the body is signed with HMAC-SHA256 and sent in the `X-PKS-Signature` header (base64).
