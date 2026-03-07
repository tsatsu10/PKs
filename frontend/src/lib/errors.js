/**
 * Normalize Supabase/API error to a user-facing string.
 * @param {unknown} err - Error object, Supabase error, or string
 * @param {string} [fallback='Something went wrong'] - Default message when err has no message
 * @returns {string}
 */
export function getErrorMessage(err, fallback = 'Something went wrong') {
  if (err == null) return fallback;
  if (typeof err === 'string') return err || fallback;
  return err?.message ?? err?.error_description ?? fallback;
}
