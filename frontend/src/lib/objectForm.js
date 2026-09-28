/**
 * Edit-form state for a knowledge object and the minimal update patch to save it.
 */
import { slugify } from './slugify';
import { isoToDateTimeLocal, dateTimeLocalToIso } from './datetime';

/**
 * @param {object} object - knowledge_objects row
 * @returns {{ title: string, content: string, summary: string, source: string, status: string, due_at: string, remind_at: string, cover_url: string }}
 */
export function objectToEditForm(object) {
  return {
    title: object.title ?? '',
    content: object.content || '',
    summary: object.summary || '',
    source: object.source || '',
    status: object.status || 'active',
    due_at: isoToDateTimeLocal(object.due_at),
    remind_at: isoToDateTimeLocal(object.remind_at),
    cover_url: object.cover_url || '',
  };
}

function normalizeForm(form) {
  return {
    title: form.title.trim(),
    content: form.content.trim() || null,
    summary: form.summary.trim() || null,
    source: form.source.trim() || null,
    status: form.status || 'active',
    due_at: dateTimeLocalToIso(form.due_at),
    remind_at: dateTimeLocalToIso(form.remind_at),
    cover_url: form.cover_url?.trim() || null,
  };
}

/** Fields a shared editor is allowed to save (DB-enforced; see guard_knowledge_object_update). */
const EDITOR_WRITABLE_FORM_FIELDS = ['title', 'content', 'summary', 'source'];

/**
 * Columns that differ between the row and the form. Sending only these keeps a
 * save from reverting fields another tab or collaborator changed.
 *
 * When `isOwner` is false (a shared editor), the patch is restricted to the
 * content fields the DB guard allows them to write, and `slug` is never
 * derived, so an editor's title change can't be rejected for touching an
 * owner-only column and a restored draft can't leak stale owner-only values.
 * @param {object} object - knowledge_objects row
 * @param {ReturnType<typeof objectToEditForm>} form
 * @param {{ isOwner?: boolean }} [options]
 * @returns {Record<string, unknown>}
 */
export function buildObjectPatch(object, form, { isOwner = true } = {}) {
  const before = normalizeForm(objectToEditForm(object));
  const after = normalizeForm(form);
  const patch = {};
  for (const key of Object.keys(after)) {
    if (!isOwner && !EDITOR_WRITABLE_FORM_FIELDS.includes(key)) continue;
    if (before[key] !== after[key]) patch[key] = after[key];
  }
  if (isOwner && 'title' in patch) {
    const base = slugify(after.title);
    patch.slug = base ? `${base}-${object.id.slice(0, 8)}` : null;
  }
  return patch;
}

/** Draft payload that remembers which revision the edit started from. */
export function draftFromForm(form, baseRevision) {
  return { ...form, _baseRevision: baseRevision };
}

/**
 * Drafts saved before revisions existed carry `_baseVersion` (a different
 * counter); ignore it and fall back to the row's current revision.
 * @returns {{ form: ReturnType<typeof objectToEditForm>, baseRevision: number }}
 */
export function formFromDraft(draft, object) {
  const { _baseRevision, _baseVersion, ...fields } = draft;
  void _baseVersion;
  return {
    form: { ...objectToEditForm(object), ...fields },
    baseRevision: _baseRevision ?? object.revision,
  };
}
