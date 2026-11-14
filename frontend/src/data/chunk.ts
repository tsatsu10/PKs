/** Keeps `.in()` URLs short; matches useDashboardBulkActions' existing chunk size. */
export const IN_CHUNK = 100;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
