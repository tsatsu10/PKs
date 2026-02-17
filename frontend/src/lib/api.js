/**
 * API helpers for a future custom backend.
 * Current app uses Supabase client directly (see lib/supabase.js); all auth is via Supabase JWT and RLS.
 *
 * When calling your own backend that verifies Supabase JWT:
 * 1. Use getAuthHeaders() to attach the session token.
 * 2. Set VITE_API_URL in .env to your backend base URL (optional; defaults to '').
 */

const API_BASE = import.meta.env.VITE_API_URL ?? '';

/**
 * Returns headers including the Supabase session JWT for backend auth.
 * Use with: fetch(url, { headers: await getAuthHeaders() }).
 * @returns {Promise<Record<string, string>>}
 */
export async function getAuthHeaders() {
  const { supabase } = await import('./supabase');
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

/**
 * Fetch from the optional backend API with auth headers.
 * Only use when VITE_API_URL is set and the backend expects Supabase JWT.
 */
export async function apiFetch(path, options = {}) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  return res;
}
