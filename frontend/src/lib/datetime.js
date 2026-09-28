/**
 * Conversions between stored ISO instants and <input type="datetime-local">
 * values, which are local wall-clock time without a zone.
 */

const pad = (n) => String(n).padStart(2, '0');

/**
 * @param {string | null | undefined} iso
 * @returns {string} 'YYYY-MM-DDTHH:mm' in the browser's time zone, or ''
 */
export function isoToDateTimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * @param {string | null | undefined} value - datetime-local input value
 * @returns {string | null} ISO instant, or null when empty/invalid
 */
export function dateTimeLocalToIso(value) {
  if (!value) return null;
  const d = new Date(value); // no zone suffix → parsed as local time
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
