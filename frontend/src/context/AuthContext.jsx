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

async function resolveUserFromSession(session) {
  if (!session?.user) return null;
  const { data: { user: verifiedUser }, error: userError } = await supabase.auth.getUser();
  if (userError || !verifiedUser) return null;
  const profile = await fetchProfile(verifiedUser.id).catch(() => null);
  return mapUser(verifiedUser, profile);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [hasValidSession, setHasValidSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const hadUserRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const globalTimeoutId = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 8000);

    const applySession = async (session) => {
      if (cancelled) return;
      if (session?.user) {
        const mapped = await resolveUserFromSession(session);
        if (cancelled) return;
        const sessionOk = !!session?.access_token;
        if (mapped && sessionOk) {
          hadUserRef.current = true;
          setUser(mapped);
          setHasValidSession(true);
        } else if (hadUserRef.current) {
          setSessionExpired(true);
          hadUserRef.current = false;
          setUser(null);
          setHasValidSession(false);
        } else {
          setUser(null);
          setHasValidSession(false);
        }
      } else {
        if (hadUserRef.current) {
          setSessionExpired(true);
          hadUserRef.current = false;
        }
        setUser(null);
        setHasValidSession(false);
      }
      clearTimeout(globalTimeoutId);
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => applySession(session)).catch(() => {
      if (!cancelled) {
        setUser(null);
        setHasValidSession(false);
        clearTimeout(globalTimeoutId);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
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
    setUser(userData);
    setHasValidSession(true);
    return true;
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    hadUserRef.current = false;
    setUser(null);
    setHasValidSession(false);
  }, []);

  const refreshUser = useCallback(async () => {
    const { data: { user: au } } = await supabase.auth.getUser();
    if (!au) return;
    const profile = await fetchProfile(au.id);
    setUser(mapUser(au, profile ?? null));
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
