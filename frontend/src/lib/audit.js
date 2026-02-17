import { supabase } from './supabase';

/**
 * Write an audit log entry. Call from UI after successful actions.
 * @param {string} userId - auth user id
 * @param {string} action - e.g. 'object_create', 'object_update', 'object_delete', 'prompt_run', 'export_run'
 * @param {string} entityType - e.g. 'knowledge_object', 'prompt_run'
 * @param {string} [entityId] - related entity id
 * @param {object} [payload] - optional extra data (e.g. title, format)
 */
export async function logAudit(userId, action, entityType, entityId = null, payload = {}) {
  const { error } = await supabase.from('audit_logs').insert({
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId || null,
    payload: payload && typeof payload === 'object' ? payload : {},
  });
  if (error) console.warn('Audit log failed:', error);
}
