/**
 * Generate a URL-safe slug from a title (e.g. for knowledge_objects.slug).
 * Uniqueness must be enforced by the caller (e.g. append suffix if needed).
 */
export function slugify(title) {
  if (!title || typeof title !== 'string') return '';
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}
