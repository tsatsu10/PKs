import { supabase } from './supabase';

/**
 * Notify webhook endpoints for the current user (fire-and-forget).
 * Skips the call in development to avoid CORS errors when the Edge Function
 * is not deployed or not configured for localhost.
 * @param {string} event - e.g. 'object.created', 'prompt_run.completed', 'export.completed'
 * @param {object} payload - event data
 */
export function deliverWebhookEvent(event, payload = {}) {
  if (import.meta.env.DEV) return;
  supabase.functions
    .invoke('webhook-deliver', { body: { event, payload } })
    .then(({ error }) => {
      if (error) console.warn('Webhook delivery failed:', error);
    })
    .catch((err) => console.warn('Webhook delivery error:', err));
}
