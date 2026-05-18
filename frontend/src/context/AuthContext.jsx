import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';

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

/** Verify JWT with server and load profile (parallel). */
async function verifyAndEnrichUser(session) {
  if (!session?.user) return null;
  const [{ data: { user: verifiedUser }, error: userError }, profile] = await Promise.all([
    supabase.auth.getUser(),
    fetchProfile(session.user.id).catch(() => null),
  ]);
  if (userError || !verifiedUser) return null;
  return mapUser(verifiedUser, profile);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [hasValidSession, setHasValidSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const hadUserRef = useRef(false);
  const sessionUserIdRef = useRef(null);
  const verifyGenerationRef = useRef(0);

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
      setUser(null);
      setHasValidSession(false);
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
      setUser(mapUser(session.user, null));
      setHasValidSession(true);
      finishLoading();

      const generation = ++verifyGenerationRef.current;
      verifyAndEnrichUser(session).then((mapped) => {
        if (cancelled || generation !== verifyGenerationRef.current) return;
        if (mapped) {
          setUser(mapped);
          setHasValidSession(true);
        } else {
          clearAuthenticated(true);
        }
      });
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) applyFastSession(session);
    }).catch(() => {
      if (!cancelled) {
        clearAuthenticated(false);
        finishLoading();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;

      if (event === 'TOKEN_REFRESHED' && session?.user?.id && session.user.id === sessionUserIdRef.current) {
        setHasValidSession(!!session?.access_token);
        return;
      }

      if (event === 'SIGNED_OUT' || !session?.user) {
        clearAuthenticated(hadUserRef.current);
        finishLoading();
        return;
      }

      applyFastSession(session);
    });

    return () => {
      cancelled = true;
      clearTimeout(globalTimeoutId);
      subscription.unsubscribe();
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
    setUser(userData);
    setHasValidSession(true);
    return true;
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    hadUserRef.current = false;
    sessionUserIdRef.current = null;
    setUser(null);
    setHasValidSession(false);
  }, []);

  const refreshUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const mapped = await verifyAndEnrichUser(session);
    if (mapped) setUser(mapped);
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
    }),
    [user, hasValidSession, loading, login, logout, refreshUser, sessionExpired, clearSessionExpired]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* eslint-disable-next-line react-refresh/only-export-components -- useAuth is the standard hook for AuthProvider */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
