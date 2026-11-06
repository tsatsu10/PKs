import { useEffect, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { queryClient } from './queryClient';
import { connectCacheToSession, startPersisting, stopPersisting } from './persistence';

// Registered at import time: App.jsx imports this module before AuthProvider's first effect
// can call claimUserData / clearUserData.
connectCacheToSession();

/** The app's query cache. Persistence runs while a session user exists (also offline, from the local session). */
export function QueryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth() as { user: { id: string } | null };
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    void startPersisting(userId);
    return stopPersisting; // session ended: stop saving; logout deletion happens in clearUserData
  }, [userId]);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
