import { queryOptions, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { db } from './client';
import { fetchAll } from './fetchAll';
import { qk } from './keys';
import { queryClient as defaultClient } from './queryClient';

export type Entity = { id: string; name: string };
type Kind = 'domains' | 'tags';

const fetchEntities = (table: Kind) => (userId: string) =>
  fetchAll<Entity>((from, to) => db.from(table).select('id, name').eq('user_id', userId)
    .order('name').order('id').range(from, to));

export const fetchDomains = fetchEntities('domains');
export const fetchTags = fetchEntities('tags');

export const domainsQuery = (userId: string) => queryOptions({ queryKey: qk.taxonomy.domains(), queryFn: () => fetchDomains(userId) });
export const tagsQuery = (userId: string) => queryOptions({ queryKey: qk.taxonomy.tags(), queryFn: () => fetchTags(userId) });

export const useDomains = (userId: string | null) => useQuery({ ...domainsQuery(userId ?? ''), enabled: !!userId });
export const useTags = (userId: string | null) => useQuery({ ...tagsQuery(userId ?? ''), enabled: !!userId });

export function useTaxonomy(userId: string | null) {
  const domains = useDomains(userId);
  const tags = useTags(userId);
  return {
    domains: domains.data ?? [],
    tags: tags.data ?? [],
    isPending: domains.isPending || tags.isPending,
    error: domains.error ?? tags.error,
    refetch: () => { void domains.refetch(); void tags.refetch(); },
  };
}

const keyFor = (kind: Kind) => (kind === 'domains' ? qk.taxonomy.domains() : qk.taxonomy.tags());

export function upsertTaxonomyEntity(kind: Kind, entity: Entity, client: QueryClient = defaultClient): void {
  client.setQueryData<Entity[]>(keyFor(kind), (prev = []) =>
    [...prev.filter((e) => e.id !== entity.id), entity].sort((a, b) => a.name.localeCompare(b.name)));
}

export function removeTaxonomyEntity(kind: Kind, id: string, client: QueryClient = defaultClient): void {
  client.setQueryData<Entity[]>(keyFor(kind), (prev = []) => prev.filter((e) => e.id !== id));
}

export async function invalidateTaxonomy(client: QueryClient = defaultClient): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: qk.taxonomy.all }),
    client.invalidateQueries({ queryKey: qk.objects.all }),
  ]);
}

export { useQueryClient };
