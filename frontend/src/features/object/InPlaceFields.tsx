import type { ReactNode } from 'react';
import type { SaveFields } from './save/saveQueue';
import type { ObjectRow } from './types';

type Props = {
  object: ObjectRow;
  /** What the fields start from: the server row with any unsent edits on top. */
  initial: Pick<ObjectRow, 'title' | 'summary' | 'key_points'>;
  editable: boolean;
  onChange: (fields: SaveFields) => void;
  autoFocusTitle: boolean;
  /** Shown next to the title (the save indicator). */
  titleAddon?: ReactNode;
};

const keyPointsText = (points: unknown) =>
  (Array.isArray(points) ? points : []).map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('\n');

const keyPointsList = (text: string) => text.split('\n').map((s) => s.trim()).filter(Boolean);

/**
 * Title, summary and key points, edited in place. Uncontrolled (defaultValue), so typing never
 * re-renders the page; the parent remounts them (via key) when the object reloads.
 */
export default function InPlaceFields({ object, initial, editable, onChange, autoFocusTitle, titleAddon }: Props) {
  return (
    <div className="detail-inplace">
      <div className="detail-title-row">
        <input
          type="text"
          className="detail-title detail-title-input"
          aria-label="Title"
          placeholder="Untitled"
          defaultValue={initial.title ?? ''}
          readOnly={!editable}
          // Only a brand-new, empty object takes focus (phones must not pop the keyboard on open).
          autoFocus={autoFocusTitle}
          onChange={(e) => onChange({ title: e.target.value.trim() })}
          maxLength={500}
        />
        {titleAddon}
      </div>
      <textarea
        className="detail-summary detail-inplace-summary"
        aria-label="Summary"
        placeholder="Add a summary"
        rows={2}
        defaultValue={initial.summary ?? ''}
        readOnly={!editable}
        onChange={(e) => onChange({ summary: e.target.value.trim() === '' ? null : e.target.value })}
      />
      <textarea
        className="detail-inplace-keypoints"
        aria-label="Key points"
        placeholder={object.type === 'bookmark' ? 'Why this link matters, one per line' : 'Key points, one per line'}
        rows={2}
        defaultValue={keyPointsText(initial.key_points)}
        readOnly={!editable}
        onChange={(e) => onChange({ key_points: keyPointsList(e.target.value) })}
      />
    </div>
  );
}
