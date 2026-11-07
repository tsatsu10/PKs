import { useQuery, type QueryClient } from '@tanstack/react-query';
import { db } from './client';
import { fetchAll } from './fetchAll';
import { qk } from './keys';

export const INTEGRATION_COLS = 'id, name, type, enabled, config, created_at, has_secret';
export type IntegrationRow = { id: string; name: string; type: string; enabled: boolean; config: unknown; created_at: string; has_secret: boolean };

export const useIntegrationsList = (userId: string | null) => useQuery({
  queryKey: qk.integrations.list(),
  enabled: !!userId,
  queryFn: () => fetchAll<IntegrationRow>((from, to) => db.from('integrations').select(INTEGRATION_COLS)
    .eq('user_id', userId as string).order('name').order('id').range(from, to)),
});
export const invalidateIntegrations = (client: QueryClient) => client.invalidateQueries({ queryKey: qk.integrations.list() });
