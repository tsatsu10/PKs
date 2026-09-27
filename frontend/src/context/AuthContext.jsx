import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { isAuthApiError, isAuthSessionMissingError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { resolveSessionEvent } from '../lib/authEvents';
import { clearAllDrafts } from '../lib/draftStorage';
import { RUN_PROMPT_STORAGE_KEY } from '../constants';

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
  const verifyInFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
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
      enrichedRef.current = false;
      // Invalidate any in-flight verify so it can't bring the user back.
      ++verifyGenerationRef.current;
      verifyInFlightRef.current = false;
      setUser(null);
      setHasValidSession(false);
    };

    // Verify with the server and load the profile, without first resetting the user.
    const verifySession = (session) => {
      const generation = ++verifyGenerationRef.current;
      verifyInFlightRef.current = true;
      verifyAndEnrichUser(session).then((result) => {
        if (cancelled || generation !== verifyGenerationRef.current) return;
        verifyInFlightRef.current = false;
        if (result) {
          enrichedRef.current = result.profileLoaded;
          setUser(result.user);
          setHasValidSession(true);
        } else if (result === null) {
          clearAuthenticated(true);
        }
        // undefined: couldn't reach the server; keep the stored session rather than logging out.
      });
    };

    const applyFastSession = (session) => {
      const sessionOk = !!session?.access_token;
      if (!session?.user || !sessionOk) {
        clearAuthenticated(hadUserRef.current);
        finishLoading();
        return;
      }

      hadUserRef.current = true;
      sessionUserIdRef.current = session.user.id;
      enrichedRef.current = false;
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
      if (cancelled) return;

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
        clearAuthenticated(hadUserRef.current);
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
  }, []);

  /** Only set user when Supabase has a JWT (required for RLS). Returns false if no session. */
  const login = useCallback(async (userData) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setHasValidSession(false);
      return false;
    }
    hadUserRef.current = true;
    sessionUserIdRef.current = session.user?.id ?? userData?.id ?? null;
    // userData may carry a default profile (its fetch can time out); let the
    // next same-user event re-verify rather than trusting it.
    enrichedRef.current = false;
    setUser(userData);
    setHasValidSession(true);
    setExplicitLogout(false);
    return true;
  }, []);

  const logout = useCallback(async () => {
    // Deliberate sign-out: not a session expiry, and no "return to" page for the next user.
    hadUserRef.current = false;
    sessionUserIdRef.current = null;
    enrichedRef.current = false;
    // Invalidate any in-flight verify so it can't bring the user back.
    ++verifyGenerationRef.current;
    verifyInFlightRef.current = false;
    setExplicitLogout(true);
    clearAllDrafts();
    try { sessionStorage.removeItem(RUN_PROMPT_STORAGE_KEY); } catch (_e) { void _e; }
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
    setUser(null);
    setHasValidSession(false);
    setSessionExpired(false);
  }, []);

  const refreshUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const generation = verifyGenerationRef.current;
    const result = await verifyAndEnrichUser(session);
    // Ignore a result that lands after logout or a user change.
    if (!result || generation !== verifyGenerationRef.current || sessionUserIdRef.current !== session.user.id) return;
    if (result.profileLoaded) enrichedRef.current = true;
    setUser(result.user);
  }, []);

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
    }),
    [user, hasValidSession, loading, login, logout, refreshUser, sessionExpired, clearSessionExpired, explicitLogout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* eslint-disable-next-line react-refresh/only-export-components -- useAuth is the standard hook for AuthProvider */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
