/**
 * Knowledge-object field rules shared by the save queue (features/object/save).
 */
import { slugify } from './slugify';

/**
 * The slug for an owner's title change: the slugified title plus the id prefix, or null.
 * Shared editors never send a slug (the database keeps the owner's).
 * @param {string} title
 * @param {string} id
 * @returns {string | null}
 */
export function slugForTitle(title, id) {
  const base = slugify((title ?? '').trim());
  return base ? `${base}-${id.slice(0, 8)}` : null;
}
