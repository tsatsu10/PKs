export const KEYSET_PAGE_SIZE = 50;
export type Cursor = { value: string; id: string };

/** Double-quote a value for a PostgREST logical filter, escaping backslashes and quotes. */
export function quoteFilterValue(v: string): string {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** `or()` filter for rows after the cursor in (column desc, id desc) order. */
export function afterCursorDesc(column: string, cursor: Cursor): string {
  const v = quoteFilterValue(cursor.value);
  return `${column}.lt.${v},and(${column}.eq.${v},id.lt.${quoteFilterValue(cursor.id)})`;
}

export function nextCursor<T extends { id: string }>(rows: T[], column: keyof T, pageSize: number): Cursor | null {
  if (rows.length < pageSize) return null;
  const last = rows[rows.length - 1];
  return { value: String(last[column]), id: last.id };
}
