/**
 * Run-prompt provider helpers (must match supabase/functions/run-prompt).
 *
 * The Run prompt "Provider" select holds either a saved key's id (user_ai_providers.id) or a
 * server-default choice encoded as `server:<provider>`; null/'' means the DeepSeek server default.
 */
import { AI_MODELS, DEFAULT_AI_PROVIDER, DEFAULT_AI_MODEL_BY_PROVIDER } from '../constants';
import { normalizeDeepSeekApiKey, validateDeepSeekApiKey } from './deepseekKey';

export const SERVER_SELECTION_PREFIX = 'server:';

export function serverSelection(provider) {
  return `${SERVER_SELECTION_PREFIX}${provider}`;
}

export function isServerSelection(selection) {
  return !selection || String(selection).startsWith(SERVER_SELECTION_PREFIX);
}

/**
 * @param {string | null} selection
 * @param {{ id: string, provider_type: string }[]} aiProviders
 * @returns {{ provider: string, userProviderId: string | null }}
 */
export function resolveRunSelection(selection, aiProviders = []) {
  if (!selection) return { provider: DEFAULT_AI_PROVIDER, userProviderId: null };
  if (selection.startsWith(SERVER_SELECTION_PREFIX)) {
    return { provider: selection.slice(SERVER_SELECTION_PREFIX.length), userProviderId: null };
  }
  const saved = aiProviders.find((p) => p.id === selection);
  return { provider: saved?.provider_type ?? DEFAULT_AI_PROVIDER, userProviderId: selection };
}

export function modelsForProvider(provider) {
  return AI_MODELS.filter((m) => m.provider === provider);
}

/** Keep the chosen model if the provider offers it, else fall back to that provider's default. */
export function modelForProvider(provider, model) {
  const models = modelsForProvider(provider);
  if (models.some((m) => m.id === model)) return model;
  return DEFAULT_AI_MODEL_BY_PROVIDER[provider] ?? models[0]?.id;
}

/**
 * Claude keys are created at https://console.anthropic.com and start with sk-ant-.
 * @returns {{ ok: true, key: string } | { ok: false, message: string }}
 */
export function validateAnthropicApiKey(raw) {
  const key = normalizeDeepSeekApiKey(raw);
  if (!key) return { ok: false, message: 'API key is required.' };
  if (/\s/.test(key)) return { ok: false, message: 'API key must not contain spaces.' };
  if (!key.startsWith('sk-ant-')) {
    return { ok: false, message: 'Claude API keys start with sk-ant-. Create one at console.anthropic.com → API Keys.' };
  }
  return { ok: true, key };
}

export function validateApiKeyForProvider(provider, raw) {
  return provider === 'anthropic' ? validateAnthropicApiKey(raw) : validateDeepSeekApiKey(raw);
}
