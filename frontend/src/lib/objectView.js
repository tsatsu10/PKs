import { supabase } from './supabase';

/**
 * Record that the current user opened an object (owner-only; no-op for shared read-only).
 * @param {string | null | undefined} objectId
 */
export async function touchObjectView(objectId) {
  if (!objectId) return;
  await supabase.rpc('touch_object_view', { p_object_id: objectId });
}
