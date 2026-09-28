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

/**
 * Columns that differ between the row and the form. Sending only these keeps a
 * save from reverting fields another tab or collaborator changed.
 * @returns {Record<string, unknown>}
 */
export function buildObjectPatch(object, form) {
  const before = normalizeForm(objectToEditForm(object));
  const after = normalizeForm(form);
  const patch = {};
  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) patch[key] = after[key];
  }
  if ('title' in patch) {
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
