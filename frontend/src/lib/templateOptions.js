/**
 * Parse a comma-separated option list typed by the user.
 * @param {string} text
 * @returns {string[]}
 */
export function parseOptions(text) {
  const seen = new Set();
  return String(text ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !seen.has(s) && seen.add(s));
}
