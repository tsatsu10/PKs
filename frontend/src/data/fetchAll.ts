import { unwrap } from './unwrap';

/** Must match `max_rows` in supabase/config.toml: a short page means "last page". */
export const MAX_ROWS = 1000;

/** Load every row by paging with .range(). The page query must have a stable order (ending in a unique column). */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = MAX_ROWS,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const rows = unwrap(await page(from, from + pageSize - 1)) ?? [];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}
