import { QueryCache, QueryClient } from '@tanstack/react-query';
import { classifyError } from '../lib/errors';
import { reportError } from '../lib/reportError';

export function shouldRetry(failureCount: number, error: unknown): boolean {
  const kind = classifyError(error);
  if (kind === 'network' || kind === 'server') return failureCount < 2;
  if (kind === 'auth') return failureCount < 1; // supabase-js may be refreshing the token
  return false;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: (error) => reportError(error) }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Must be >= the persister's maxAge (persistence.CACHE_MAX_AGE), or saved entries expire early.
        gcTime: 7 * 24 * 60 * 60 * 1000,
        retry: shouldRetry,
        refetchOnWindowFocus: true,
        networkMode: 'online',
      },
    },
  });
}

export const queryClient = createQueryClient();
