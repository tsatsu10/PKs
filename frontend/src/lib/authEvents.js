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

/**
 * Decide what to do with an auth event, given whether the loaded user has a
 * loaded profile. A same-user repeat event is normally skipped, but if the
 * profile never loaded (offline boot, profile fetch failed) it is the chance
 * to finish enriching the user, so re-verify instead of skipping.
 * @param {string} event - Supabase AuthChangeEvent
 * @param {{ user?: { id?: string } } | null} session
 * @param {string | null} currentUserId
 * @param {boolean} enriched - the current user was mapped with a loaded profile
 * @returns {'skip' | 'reverify' | 'apply'}
 */
export function resolveSessionEvent(event, session, currentUserId, enriched) {
  if (!shouldSkipSessionApply(event, session, currentUserId)) return 'apply';
  return enriched ? 'skip' : 'reverify';
}
