import { createContext, useContext, useState, useEffect, useRef } from 'react';
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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  /** When session is lost after we had a user (expired/invalid), show re-auth message on login page. */
  const [sessionExpired, setSessionExpired] = useState(false);
  const hadUserRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const globalTimeoutId = setTimeout(() => {
      if (cancelled) return;
      setLoading(false);
    }, 8000);

    supabase.auth.getSession()
      .then(({ data: { session }, error: sessionError }) => {
        if (cancelled) return;
        if (sessionError) {
          setUser(null);
          clearTimeout(globalTimeoutId);
          setLoading(false);
          return;
        }
        if (session?.user) {
          hadUserRef.current = true;
          const profilePromise = fetchProfile(session.user.id);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('profile_timeout')), 4000)
          );
          Promise.race([profilePromise, timeoutPromise])
            .then((profile) => {
              if (!cancelled) setUser(mapUser(session.user, profile ?? null));
            })
            .catch(() => {
              if (!cancelled) setUser(mapUser(session.user, null));
            })
            .finally(() => {
              if (!cancelled) {
                clearTimeout(globalTimeoutId);
                setLoading(false);
              }
            });
        } else {
          setUser(null);
          clearTimeout(globalTimeoutId);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          clearTimeout(globalTimeoutId);
          setLoading(false);
        }
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          hadUserRef.current = true;
          const profile = await fetchProfile(session.user.id).catch(() => null);
          setUser(mapUser(session.user, profile));
        } else {
          if (hadUserRef.current) {
            setSessionExpired(true);
            hadUserRef.current = false;
          }
          setUser(null);
        }
        setLoading(false);
      }
    );

    return () => {
      cancelled = true;
      clearTimeout(globalTimeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const login = (userData) => {
    setUser(userData);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const clearSessionExpired = () => setSessionExpired(false);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, supabase, sessionExpired, clearSessionExpired }}>
      {children}
    </AuthContext.Provider>
  );
}

/* eslint-disable-next-line react-refresh/only-export-components -- useAuth is the standard hook for AuthProvider */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
