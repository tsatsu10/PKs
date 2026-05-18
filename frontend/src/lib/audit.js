import { supabase } from './supabase';

const MAX_PAYLOAD_KEYS = 20;
const MAX_STRING_LENGTH = 500;

/**
 * Sanitize payload for audit: only plain objects, max keys, string values truncated.
 * Payload must be small and must not contain secrets or raw PII.
 */
function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const keys = Object.keys(payload).slice(0, MAX_PAYLOAD_KEYS);
  const out = {};
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === 'string') out[k] = v.slice(0, MAX_STRING_LENGTH);
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (v === null) out[k] = null;
  }
  return out;
}

/**
 * Write an audit log entry. Call from UI after successful actions.
 * @param {string} userId - auth user id
 * @param {string} action - e.g. 'object_create', 'object_update', 'object_delete', 'prompt_run', 'export_run'
 * @param {string} entityType - e.g. 'knowledge_object', 'prompt_run'
 * @param {string} [entityId] - related entity id
 * @param {object} [payload] - optional extra data (e.g. title, format). Small only; no secrets or raw PII. Shape/size validated.
 */
export async function logAudit(userId, action, entityType, entityId = null, payload = {}) {
  const safePayload = sanitizePayload(payload && typeof payload === 'object' ? payload : {});
  const { error } = await supabase.from('audit_logs').insert({
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId || null,
    payload: safePayload,
  });
  if (error && import.meta.env.DEV) console.warn('Audit log failed:', error);
}
