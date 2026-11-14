import { OBJECT_STATUSES } from '../../constants';
import Editor from './Editor';
import type { useEditSession } from './hooks/useEditSession';
import type { ObjectRow } from './types';

type Props = { object: ObjectRow; isOwner: boolean; edit: ReturnType<typeof useEditSession> };

/** Today's edit form (title … content). Status, dates and cover are owner-only. */
export default function EditForm({ object, isOwner, edit }: Props) {
  const { editForm, setField, initialContent, onContentChange } = edit;
  const isBookmark = object.type === 'bookmark';
  return (
    <div className="detail-edit" key={`edit-${object?.id}`}>
      <label>Title <input type="text" value={editForm.title} onChange={(e) => setField('title', e.target.value)} required /></label>
      <label>Status <select value={editForm.status} onChange={(e) => setField('status', e.target.value)} aria-label="Status" disabled={!isOwner}>{(OBJECT_STATUSES as string[]).map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
      <label>Due date <input type="datetime-local" value={editForm.due_at} onChange={(e) => setField('due_at', e.target.value)} aria-label="Due date" disabled={!isOwner} /></label>
      <label>Remind at <input type="datetime-local" value={editForm.remind_at} onChange={(e) => setField('remind_at', e.target.value)} aria-label="Remind at" disabled={!isOwner} /></label>
      <label>Cover URL <input type="url" value={editForm.cover_url} onChange={(e) => setField('cover_url', e.target.value)} placeholder="https://…" disabled={!isOwner} /></label>
      {!isOwner && <p className="form-hint">Only the owner can change status, dates and cover.</p>}
      <label>{isBookmark ? 'URL' : 'Reference / URL'} <input type={isBookmark ? 'url' : 'text'} value={editForm.source} onChange={(e) => setField('source', e.target.value)} placeholder={isBookmark ? 'https://…' : 'e.g. https://… or book, article'} /></label>
      <label>Summary <textarea value={editForm.summary} onChange={(e) => setField('summary', e.target.value)} rows={2} /></label>
      <div className="detail-edit-field">
        <span className="detail-edit-label">Content</span>
        <Editor initialValue={initialContent} onChange={onContentChange} />
      </div>
    </div>
  );
}
