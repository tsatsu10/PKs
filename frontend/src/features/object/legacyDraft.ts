import { getDraft, clearDraft } from '../../lib/draftStorage';
import { dateTimeLocalToIso } from '../../lib/datetime';
import type { SaveFields } from './save/saveQueue';

/** sessionStorage key of a pre-2b edit draft (the Edit/Save form's draft). */
const legacyKey = (objectId: string) => `pks-draft-${objectId}`;

type LegacyDraft = Record<string, unknown> & { _baseRevision?: number | null };

const orNull = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);

/**
 * A deploy can land while someone is mid-edit in the old form: their draft is in sessionStorage.
 * Read it once, map it to save-queue fields, and delete it (the queue's local copy takes over).
 */
export function adoptLegacyDraft(objectId: string): { fields: SaveFields; baseRevision: number | null } | null {
  const draft = getDraft(legacyKey(objectId)) as LegacyDraft | null;
  if (!draft || typeof draft !== 'object') return null;
  clearDraft(legacyKey(objectId));
  const fields: SaveFields = {};
  if (typeof draft.title === 'string') fields.title = draft.title;
  if (typeof draft.content === 'string') {
    fields.content = draft.content;
    fields.content_json = null; // the draft is Markdown; the editor seeds from it
  }
  if ('summary' in draft) fields.summary = orNull(draft.summary);
  if ('source' in draft) fields.source = orNull(draft.source);
  if (typeof draft.status === 'string' && draft.status) fields.status = draft.status;
  if ('due_at' in draft) fields.due_at = dateTimeLocalToIso(draft.due_at as string) ?? null;
  if ('remind_at' in draft) fields.remind_at = dateTimeLocalToIso(draft.remind_at as string) ?? null;
  if ('cover_url' in draft) fields.cover_url = orNull(draft.cover_url);
  if (Object.keys(fields).length === 0) return null;
  return { fields, baseRevision: typeof draft._baseRevision === 'number' ? draft._baseRevision : null };
}
