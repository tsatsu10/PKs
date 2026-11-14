import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';
import { db } from './client';
import { fetchAll } from './fetchAll';
import { qk } from './keys';

export const TEMPLATE_COLS = 'id, name, description, schema, created_at, updated_at';
export type TemplateRow = { id: string; name: string; description: string | null; schema: unknown; created_at: string; updated_at: string };

export const templatesQuery = (userId: string) => queryOptions({
  queryKey: qk.templates.list(),
  queryFn: () => fetchAll<TemplateRow>((from, to) => db.from('templates').select(TEMPLATE_COLS).eq('user_id', userId)
    .order('name').order('id').range(from, to)),
});
export const useTemplatesList = (userId: string | null) => useQuery({ ...templatesQuery(userId ?? ''), enabled: !!userId });
export const invalidateTemplates = (client: QueryClient) => client.invalidateQueries({ queryKey: qk.templates.list() });
