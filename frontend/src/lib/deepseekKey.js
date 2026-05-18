/**
 * DeepSeek API key helpers (client-side validation before save / display).
 * Keys are created at https://platform.deepseek.com/api_keys and start with sk-.
 */

export function normalizeDeepSeekApiKey(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let key = raw.trim();
  if (key.toLowerCase().startsWith('bearer ')) key = key.slice(7).trim();
  return key;
}

/**
 * @returns {{ ok: true, key: string } | { ok: false, message: string }}
 */
export function validateDeepSeekApiKey(raw) {
  const key = normalizeDeepSeekApiKey(raw);
  if (!key) return { ok: false, message: 'API key is required.' };
  if (key.startsWith('eyJ')) {
    return {
      ok: false,
      message:
        'This looks like a Supabase or JWT token, not a DeepSeek API key. Create one at platform.deepseek.com/api_keys (starts with sk-).',
    };
  }
  if (/\s/.test(key)) {
    return { ok: false, message: 'API key must not contain spaces.' };
  }
  if (!key.startsWith('sk-')) {
    return {
      ok: false,
      message:
        'DeepSeek API keys start with sk-. Copy yours from platform.deepseek.com/api_keys — do not use OpenAI or Supabase keys.',
    };
  }
  return { ok: true, key };
}

/** User-facing hint for known DeepSeek / edge-function auth error codes. */
export function getDeepSeekErrorMessage(code, fallback) {
  switch (code) {
    case 'UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM':
    case 'INVALID_DEEPSEEK_API_KEY':
      return (
        'Invalid DeepSeek API key. Use a key from platform.deepseek.com/api_keys (starts with sk-). ' +
        'Do not paste Supabase anon/service keys or OpenAI keys. ' +
        'For the server default, set DEEPSEEK_API_KEY in Supabase → Edge Functions → Secrets.'
      );
    case 'DEEPSEEK_API_KEY_MISSING':
      return 'DeepSeek is not configured on the server. Set DEEPSEEK_API_KEY in Supabase Edge Function secrets, or add your own key under Settings → AI API keys.';
    default:
      return fallback;
  }
}
