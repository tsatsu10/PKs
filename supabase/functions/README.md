# PKS Edge Functions

## run-prompt

Calls OpenAI with the prompt template text and object content. Used by the "Generate with AI" button when running a prompt on an object.

**Setup**

1. Deploy the function (Supabase Dashboard → Edge Functions, or CLI: `supabase functions deploy run-prompt`).
2. Set the secret: **Project Settings → Edge Functions → Secrets** → add `OPENAI_API_KEY` with your OpenAI API key.

**Invoke** (from the app): `supabase.functions.invoke('run-prompt', { body: { promptText, objectTitle, objectContent } })`.  
The client sends the user's session; the function verifies auth before calling OpenAI.

**Optional body fields:** `model` (default `gpt-4o-mini`).
