/** DeepSeek API key normalization and validation (edge function). */

export function normalizeDeepSeekApiKey(raw: string): string {
  let key = raw.trim();
  if (key.toLowerCase().startsWith("bearer ")) key = key.slice(7).trim();
  return key;
}

export function validateDeepSeekApiKey(raw: string): { ok: true; key: string } | { ok: false; code: string; hint: string } {
  const key = normalizeDeepSeekApiKey(raw);
  if (!key) {
    return {
      ok: false,
      code: "INVALID_DEEPSEEK_API_KEY",
      hint: "API key is missing. Set DEEPSEEK_API_KEY in Edge Function secrets or add a key in Settings.",
    };
  }
  if (key.startsWith("eyJ")) {
    return {
      ok: false,
      code: "INVALID_DEEPSEEK_API_KEY",
      hint:
        "This looks like a Supabase/JWT token, not a DeepSeek API key. Use a key from platform.deepseek.com/api_keys (starts with sk-).",
    };
  }
  if (!key.startsWith("sk-")) {
    return {
      ok: false,
      code: "INVALID_DEEPSEEK_API_KEY",
      hint:
        "DeepSeek API keys start with sk-. Do not use OpenAI keys or Supabase anon/service keys in DEEPSEEK_API_KEY.",
    };
  }
  return { ok: true, key };
}

export function hintForDeepSeekAuthCode(code: string): string {
  if (code === "UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM" || code === "INVALID_DEEPSEEK_API_KEY") {
    return (
      "Invalid DeepSeek API key. Create one at platform.deepseek.com/api_keys (sk-…). " +
      "Set DEEPSEEK_API_KEY in Supabase Edge Function secrets to that value — not your Supabase JWT."
    );
  }
  return "Check your DeepSeek API key in Settings → AI API keys, or DEEPSEEK_API_KEY in Edge Function secrets.";
}
