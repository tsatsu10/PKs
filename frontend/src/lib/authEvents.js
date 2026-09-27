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

/**
 * localStorage key a tab writes (with `Date.now()`) just before a deliberate
 * sign-out. localStorage is shared by every tab, so the other tabs can read it
 * when auth-js relays that tab's SIGNED_OUT to them over its BroadcastChannel.
 */
export const EXPLICIT_LOGOUT_KEY = 'pks-explicit-logout';

/**
 * How long a logout mark counts as "this sign-out was deliberate". Covers the
 * signOut round-trip plus the broadcast to other tabs, with plenty of margin.
 *
 * If signOut takes longer than this (a very slow network), other tabs see the
 * relayed SIGNED_OUT after the mark has aged out and treat it as an expiry:
 * they show "session expired" and keep their drafts, still owned by the user
 * who signed out. That is safe: claimUserData discards them if a different
 * user signs in next.
 */
export const EXPLICIT_LOGOUT_WINDOW_MS = 10_000;

/**
 * Record that this tab is signing out on purpose, before calling signOut.
 * @param {number} [now] - defaults to Date.now()
 */
export function markExplicitLogout(now = Date.now()) {
  try { localStorage.setItem(EXPLICIT_LOGOUT_KEY, String(now)); } catch (_e) { void _e; }
}

/**
 * Read the logout mark written by {@link markExplicitLogout} (by any tab).
 * @returns {number | null} the mark's timestamp, or null when absent or unreadable
 */
export function readExplicitLogoutMark() {
  try {
    const raw = localStorage.getItem(EXPLICIT_LOGOUT_KEY);
    if (raw == null) return null;
    const at = Number(raw);
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

/** Remove the logout mark (on login, so a later real expiry isn't mistaken for a logout). */
export function clearExplicitLogoutMark() {
  try { localStorage.removeItem(EXPLICIT_LOGOUT_KEY); } catch (_e) { void _e; }
}

/**
 * Classify a sign-out. auth-js emits the same SIGNED_OUT (session null) for a
 * deliberate signOut, for a refresh token the server rejected, and for either
 * of those relayed from another tab, so the event alone can't tell them apart.
 * A fresh logout mark means some tab signed out on purpose.
 * @param {boolean} hadUser - a user was loaded in this tab
 * @param {number | null} logoutMarkedAt - from {@link readExplicitLogoutMark}
 * @param {number} now - Date.now()
 * @param {number} [windowMs]
 * @returns {'logout' | 'expired' | 'none'} 'logout': deliberate (no "session
 *   expired", no return-to page); 'expired': the session ended on its own;
 *   'none': there was no user to lose.
 */
export function resolveSignOut(hadUser, logoutMarkedAt, now, windowMs = EXPLICIT_LOGOUT_WINDOW_MS) {
  if (logoutMarkedAt != null) {
    const age = now - logoutMarkedAt;
    if (age >= 0 && age <= windowMs) return 'logout';
  }
  return hadUser ? 'expired' : 'none';
}

/**
 * While this tab's signOut is pending, only SIGNED_OUT may be acted on: a
 * TOKEN_REFRESHED or SIGNED_IN arriving in that window would otherwise bring the
 * user straight back (and offline no SIGNED_OUT follows to undo it).
 * @param {string} event - Supabase AuthChangeEvent
 * @param {boolean} loggingOut
 * @returns {boolean} true when the event must be ignored
 */
export function shouldIgnoreWhileLoggingOut(event, loggingOut) {
  return loggingOut && event !== 'SIGNED_OUT';
}

/**
 * Whether two mapped users carry the same data, so a re-verify that found
 * nothing new can keep the existing object (and not reset forms keyed on it).
 * @param {{ id?: string, email?: string, displayName?: string, timezone?: string, createdAt?: string } | null} a
 * @param {{ id?: string, email?: string, displayName?: string, timezone?: string, createdAt?: string } | null} b
 * @returns {boolean}
 */
export function isSameUser(a, b) {
  if (!a || !b) return false;
  return a.id === b.id
    && a.email === b.email
    && a.displayName === b.displayName
    && a.timezone === b.timezone
    && a.createdAt === b.createdAt;
}
