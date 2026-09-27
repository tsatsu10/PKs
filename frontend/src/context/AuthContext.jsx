import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { isAuthApiError, isAuthSessionMissingError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  resolveSessionEvent,
  resolveSignOut,
  shouldIgnoreWhileLoggingOut,
  isSameUser,
  markExplicitLogout,
  readExplicitLogoutMark,
  clearExplicitLogoutMark,
} from '../lib/authEvents';
import { clearUserData, clearOrphanedLocalData, claimUserData } from '../lib/userStorage';

const AuthContext = createContext(null);

function mapUser(au, profile) {
  if (!au) return null;
  return {
    id: au.id,
    email: au.email ?? profile?.email,
    displayName: profile?.display_name ?? au.user_metadata?.display_name ?? au.user_metadata?.displayName ?? '',
    timezone: profile?.timezone ?? 'Africa/Accra',
    createdAt: profile?.created_at ?? au.created_at,
  };
}

async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('email, display_name, timezone, created_at')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

/**
 * Verify JWT with server and load profile (parallel).
 * Returns `{ user, profileLoaded }` (the mapped user, and whether the profile row
 * actually loaded rather than falling back to defaults), `null` when the server
 * rejected the session, or `undefined` when it couldn't be checked (offline,
 * network error, Supabase down).
 */
async function verifyAndEnrichUser(session) {
  if (!session?.user) return null;
  let result;
  try {
    result = await Promise.all([
      supabase.auth.getUser(),
      fetchProfile(session.user.id).catch(() => null),
    ]);
  } catch {
    return undefined;
  }
  const [{ data: { user: verifiedUser }, error: userError }, profile] = result;
  if (userError) {
    return isAuthApiError(userError) || isAuthSessionMissingError(userError) ? null : undefined;
  }
  if (!verifiedUser) return null;
  return { user: mapUser(verifiedUser, profile), profileLoaded: profile != null };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [hasValidSession, setHasValidSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [explicitLogout, setExplicitLogout] = useState(false);
  const hadUserRef = useRef(false);
  const sessionUserIdRef = useRef(null);
  const verifyGenerationRef = useRef(0);
  // True once the current user was mapped with a loaded profile. Until then a
  // same-user refocus/refresh event re-verifies instead of being skipped, so an
  // offline boot (or a failed profile fetch) doesn't leave default settings.
  const enrichedRef = useRef(false);
  // Mirrors enrichedRef for rendering (Settings won't save defaults over an unloaded profile).
  const [profileLoaded, setProfileLoaded] = useState(false);
  const verifyInFlightRef = useRef(false);
  // True while logout() awaits signOut: auth events other than SIGNED_OUT are ignored.
  const loggingOutRef = useRef(false);

  const setEnriched = useCallback((value) => {
    enrichedRef.current = value;
    setProfileLoaded(value);
  }, []);

  useEffect(() => {
    let cancelled = false;
    clearOrphanedLocalData();
    const globalTimeoutId = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 8000);

    const finishLoading = () => {
      clearTimeout(globalTimeoutId);
      setLoading(false);
    };

    const clearAuthenticated = (expired = false) => {
      if (expired && hadUserRef.current) {
        setSessionExpired(true);
      }
      hadUserRef.current = false;
      sessionUserIdRef.current = null;
      setEnriched(false);
      // Invalidate any in-flight verify so it can't bring the user back.
      ++verifyGenerationRef.current;
      verifyInFlightRef.current = false;
      // Per-user data is NOT cleared here: on expiry the user may be mid-edit.
      // It stays owned by them; claimUserData drops it if someone else signs in.
      setUser(null);
      setHasValidSession(false);
    };

    // The session ended without this tab calling logout(): either another tab
    // signed out on purpose (it marked localStorage first) or the session expired.
    const endSession = () => {
      const kind = resolveSignOut(hadUserRef.current, readExplicitLogoutMark(), Date.now());
      if (kind === 'logout') {
        clearUserData();
        clearAuthenticated(false);
        setExplicitLogout(true);
      } else {
        clearAuthenticated(kind === 'expired');
      }
    };

    // Verify with the server and load the profile, without first resetting the user.
    const verifySession = (session) => {
      const generation = ++verifyGenerationRef.current;
      verifyInFlightRef.current = true;
      verifyAndEnrichUser(session).then((result) => {
        if (cancelled || generation !== verifyGenerationRef.current) return;
        verifyInFlightRef.current = false;
        if (result) {
          setEnriched(result.profileLoaded);
          // Keep the same object when nothing changed, so a refocus re-verify of
          // an un-enriched user doesn't re-render consumers keyed on `user`.
          setUser((prev) => (isSameUser(prev, result.user) ? prev : result.user));
          setHasValidSession(true);
        } else if (result === null) {
          endSession();
        }
        // undefined: couldn't reach the server; keep the stored session rather than logging out.
      });
    };

    const applyFastSession = (session) => {
      // logout() owns the state until signOut settles; never restore the user mid-logout.
      if (loggingOutRef.current) return;
      const sessionOk = !!session?.access_token;
      if (!session?.user || !sessionOk) {
        endSession();
        finishLoading();
        return;
      }

      // A different user than the one whose data is stored: drop it before any page reads it.
      claimUserData(session.user.id);
      hadUserRef.current = true;
      sessionUserIdRef.current = session.user.id;
      setEnriched(false);
      setUser(mapUser(session.user, null));
      setHasValidSession(true);
      setExplicitLogout(false);
      finishLoading();
      verifySession(session);
    };

    // Same user, profile not loaded yet: finish enriching unless a verify is already running.
    const reverifySession = (session) => {
      setHasValidSession(!!session?.access_token);
      finishLoading();
      if (!verifyInFlightRef.current) verifySession(session);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      const action = resolveSessionEvent('INITIAL_SESSION', session, sessionUserIdRef.current, enrichedRef.current);
      if (action === 'skip') return;
      if (action === 'reverify') reverifySession(session);
      else applyFastSession(session);
    }).catch(() => {
      if (!cancelled) {
        clearAuthenticated(false);
        finishLoading();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled || shouldIgnoreWhileLoggingOut(event, loggingOutRef.current)) return;

      const action = resolveSessionEvent(event, session, sessionUserIdRef.current, enrichedRef.current);
      if (action === 'skip') {
        setHasValidSession(!!session?.access_token);
        return;
      }
      if (action === 'reverify') {
        reverifySession(session);
        return;
      }

      if (event === 'SIGNED_OUT' || !session?.user) {
        endSession();
        finishLoading();
        return;
      }

      applyFastSession(session);
    });

    // Back online after an offline boot: load the profile we couldn't get earlier.
    const onOnline = () => {
      if (cancelled || enrichedRef.current || !sessionUserIdRef.current) return;
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (cancelled || enrichedRef.current || !session?.user) return;
        if (session.user.id !== sessionUserIdRef.current) return;
        reverifySession(session);
      }).catch(() => {});
    };
    window.addEventListener('online', onOnline);

    return () => {
      cancelled = true;
      clearTimeout(globalTimeoutId);
      subscription.unsubscribe();
      window.removeEventListener('online', onOnline);
      // A verify started by this effect is ignored once cancelled; don't let it block the next run.
      verifyInFlightRef.current = false;
    };
  }, [setEnriched]);

  /** Only set user when Supabase has a JWT (required for RLS). Returns false if no session. */
  const login = useCallback(async (userData) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setHasValidSession(false);
      return false;
    }
    clearExplicitLogoutMark();
    hadUserRef.current = true;
    const userId = session.user?.id ?? userData?.id ?? null;
    claimUserData(userId);
    // The SIGNED_IN event usually got here first and its verify may already have
    // loaded the profile; don't swap that for userData's possibly-default one.
    const alreadyEnriched = enrichedRef.current && sessionUserIdRef.current === userId;
    sessionUserIdRef.current = userId;
    if (!alreadyEnriched) {
      // userData may carry a default profile (its fetch can time out); let the
      // next same-user event re-verify rather than trusting it.
      setEnriched(false);
      setUser(userData);
    }
    setHasValidSession(true);
    setExplicitLogout(false);
    return true;
  }, [setEnriched]);

  const logout = useCallback(async () => {
    loggingOutRef.current = true;
    // Other tabs receive our SIGNED_OUT over auth-js's BroadcastChannel; this
    // shared mark tells them it was deliberate, not an expiry.
    markExplicitLogout();
    // Deliberate sign-out: not a session expiry, and no "return to" page for the next user.
    hadUserRef.current = false;
    sessionUserIdRef.current = null;
    setEnriched(false);
    // Invalidate any in-flight verify so it can't bring the user back.
    ++verifyGenerationRef.current;
    verifyInFlightRef.current = false;
    setExplicitLogout(true);
    clearUserData();
    try {
      const { error } = await supabase.auth.signOut();
      // Offline: auth-js returns a network error *before* removing the stored
      // session, for every scope including 'local'. Remove it directly so a
      // reload can't log the user back in. storageKey is a runtime field on
      // GoTrueClient (protected in its TypeScript types).
      if (error) {
        try {
          localStorage.removeItem(supabase.auth.storageKey);
          localStorage.removeItem(`${supabase.auth.storageKey}-code-verifier`);
        } catch (_e) { void _e; }
      }
    } finally {
      loggingOutRef.current = false;
      setUser(null);
      setHasValidSession(false);
      setSessionExpired(false);
    }
  }, [setEnriched]);

  const refreshUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user || sessionUserIdRef.current !== session.user.id) return;
    // Take a new generation: an older verify still in flight (a refocus
    // re-verify, the boot verify) is discarded instead of landing after us with
    // pre-save data. We own the in-flight flag until we finish.
    const generation = ++verifyGenerationRef.current;
    verifyInFlightRef.current = true;
    const result = await verifyAndEnrichUser(session);
    // Ignore a result that lands after logout, a user change or a newer verify.
    if (generation !== verifyGenerationRef.current) return;
    verifyInFlightRef.current = false;
    if (!result || sessionUserIdRef.current !== session.user.id) return;
    if (result.profileLoaded) setEnriched(true);
    setUser((prev) => (isSameUser(prev, result.user) ? prev : result.user));
  }, [setEnriched]);

  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  const value = useMemo(
    () => ({
      user,
      hasValidSession,
      loading,
      login,
      logout,
      refreshUser,
      supabase,
      sessionExpired,
      clearSessionExpired,
      explicitLogout,
      profileLoaded,
    }),
    [user, hasValidSession, loading, login, logout, refreshUser, sessionExpired, clearSessionExpired, explicitLogout, profileLoaded]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* eslint-disable-next-line react-refresh/only-export-components -- useAuth is the standard hook for AuthProvider */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
