/**
 * Password strength, scored 0–4 on length plus character variety.
 * Shared by the strength meter and its tests; the meter renders four
 * segments plus a text label, never colour alone.
 */
export function scorePassword(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  return Math.min(4, score);
}
