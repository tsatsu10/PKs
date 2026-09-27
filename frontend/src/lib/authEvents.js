/**
 * Supabase re-emits SIGNED_IN whenever a tab becomes visible again, and
 * INITIAL_SESSION on subscribe. For the user who is already loaded these carry
 * nothing new: re-applying them wipes the profile and refetches it.
 * @param {string} event - Supabase AuthChangeEvent
 * @param {{ user?: { id?: string } } | null} session
 * @param {string | null} currentUserId
 * @returns {boolean}
 */
export function shouldSkipSessionApply(event, session, currentUserId) {
  const id = session?.user?.id;
  if (!id || !currentUserId || id !== currentUserId) return false;
  return event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION';
}
