import type { QueryClient, QueryFilters, QueryKey } from '@tanstack/react-query';

/**
 * An optimistic write over cached queries (onMutate / onError / onSettled in one call):
 * snapshot every query matching `keys`, apply the cache change, run the request, restore the
 * snapshot if it fails (and rethrow, so the caller can notify), and invalidate `keys` afterwards.
 * A key `apply` creates from nothing is removed again on rollback.
 */
export async function optimistic<T>(client: QueryClient, opts: {
  keys: QueryFilters[];
  apply: () => void;
  run: () => Promise<T>;
}): Promise<T> {
  const { keys, apply, run } = opts;
  const before = new Map<string, { key: QueryKey; data: unknown }>();
  for (const filter of keys) {
    for (const [key, data] of client.getQueriesData(filter)) before.set(JSON.stringify(key), { key, data });
  }
  apply();
  try {
    return await run();
  } catch (err) {
    for (const filter of keys) {
      for (const [key] of client.getQueriesData(filter)) {
        const prev = before.get(JSON.stringify(key));
        if (!prev) client.removeQueries({ queryKey: key, exact: true });
        else client.setQueryData(prev.key, prev.data);
      }
    }
    throw err;
  } finally {
    for (const filter of keys) void client.invalidateQueries(filter);
  }
}
