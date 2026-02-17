import { supabase } from './supabase';

/**
 * Create a notification for the current user.
 * @param {string} userId - auth user id
 * @param {string} type - e.g. 'export_completed', 'prompt_completed'
 * @param {string} title - short title
 * @param {string} [body] - optional body
 * @param {{ type: string, id: string }} [related] - e.g. { type: 'knowledge_object', id: objectId }
 */
export async function createNotification(userId, type, title, body = null, related = null) {
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    type,
    title,
    body: body || null,
    related_type: related?.type || null,
    related_id: related?.id || null,
  });
  if (error) console.warn('Failed to create notification:', error);
}
