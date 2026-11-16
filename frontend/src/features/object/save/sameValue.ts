/** Compare a sent field with the stored one, for the save engine's lost-response check. */
const TIMESTAMP_KEYS = new Set(['due_at', 'remind_at']);

/** Does the server's value match what we sent? (jsonb reorders object keys; timestamps reformat.) */
export function sameValue(key: string, sent: unknown, stored: unknown): boolean {
  if (TIMESTAMP_KEYS.has(key) && sent && stored) return Date.parse(String(sent)) === Date.parse(String(stored));
  return deepEqual(sent ?? null, stored ?? null);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => deepEqual(v, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = Object.keys(ao);
  return keys.length === Object.keys(bo).length && keys.every((k) => k in bo && deepEqual(ao[k], bo[k]));
}
