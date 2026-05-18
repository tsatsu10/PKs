/**
 * Normalize Supabase/API error to a user-facing string.
 * @param {unknown} err - Error object, Supabase error, or string
 * @param {string} [fallback='Something went wrong'] - Default message when err has no message
 * @returns {string}
 */
const RLS_HINT =
  'Permission denied. Sign out and sign in again. If you just registered, confirm your email first.';

export function getErrorMessage(err, fallback = 'Something went wrong') {
  if (err == null) return fallback;
  if (typeof err === 'string') {
    if (/row-level security/i.test(err)) return RLS_HINT;
    return err || fallback;
  }
  const code = err?.code ?? err?.error_code;
  const message = err?.message ?? err?.error_description ?? fallback;
  if (code === '42501' || /row-level security/i.test(message)) return RLS_HINT;
  return message || fallback;
}
