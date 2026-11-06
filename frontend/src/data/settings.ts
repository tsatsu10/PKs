import { useQuery, type QueryClient } from '@tanstack/react-query';
import { AI_PROVIDER_IDS } from '../constants';
import { db } from './client';
import { unwrap } from './unwrap';
import { qk } from './keys';

export type AiProviderRow = { id: string; name: string; provider_type: string };

export function useAiProviders(userId: string | null) {
  return useQuery({
    queryKey: qk.settings.aiProviders(),
    enabled: !!userId,
    queryFn: async () => (unwrap(await db.from('user_ai_providers').select('id, name, provider_type')
      .eq('user_id', userId as string).in('provider_type', AI_PROVIDER_IDS as string[]).order('name')) ?? []) as AiProviderRow[],
  });
}

export const invalidateAiProviders = (client: QueryClient) =>
  client.invalidateQueries({ queryKey: qk.settings.aiProviders() });
