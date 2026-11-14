import { OBJECT_STATUSES, OBJECT_TYPES, formatObjectTypeLabel } from '../../constants';
import { isoToDateTimeLocal, dateTimeLocalToIso } from '../../lib/datetime';
import type { SaveFields } from './save/saveQueue';
import type { ObjectRow } from './types';

type Initial = Pick<ObjectRow, 'type' | 'status' | 'source' | 'due_at' | 'remind_at' | 'cover_url'>;
type Props = { object: ObjectRow; initial: Initial; isOwner: boolean; onChange: (fields: SaveFields) => void };

const orNull = (v: string) => (v.trim() === '' ? null : v.trim());
const localTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

/**
 * Type, status, source, due, remind and cover. Shared editors may change the source only
 * (the database guard rejects the rest), so they see the others as text.
 */
export default function Properties({ object, initial, isOwner, onChange }: Props) {
  const isBookmark = object.type === 'bookmark';
  return (
    <dl className="detail-properties">
      <div className="detail-property">
        <dt>Type</dt>
        <dd>
          {isOwner ? (
            <select aria-label="Type" defaultValue={initial.type} onChange={(e) => onChange({ type: e.target.value })}>
              {(OBJECT_TYPES as string[]).map((t) => <option key={t} value={t}>{formatObjectTypeLabel(t)}</option>)}
            </select>
          ) : formatObjectTypeLabel(initial.type)}
        </dd>
      </div>
      <div className="detail-property">
        <dt>Status</dt>
        <dd>
          {isOwner ? (
            <select aria-label="Status" defaultValue={initial.status || 'active'} onChange={(e) => onChange({ status: e.target.value })}>
              {(OBJECT_STATUSES as string[]).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (initial.status || 'active')}
        </dd>
      </div>
      <div className="detail-property detail-property-wide">
        <dt>{isBookmark ? 'URL' : 'Reference / URL'}</dt>
        <dd>
          <input
            type={isBookmark ? 'url' : 'text'}
            aria-label={isBookmark ? 'URL' : 'Reference / URL'}
            defaultValue={initial.source ?? ''}
            placeholder={isBookmark ? 'https://…' : 'e.g. https://… or book, article'}
            onChange={(e) => onChange({ source: orNull(e.target.value) })}
          />
        </dd>
      </div>
      <div className="detail-property">
        <dt>Due</dt>
        <dd>
          {isOwner ? (
            <input type="datetime-local" aria-label="Due date" defaultValue={isoToDateTimeLocal(initial.due_at)}
              onChange={(e) => onChange({ due_at: dateTimeLocalToIso(e.target.value) })} />
          ) : localTime(initial.due_at)}
        </dd>
      </div>
      <div className="detail-property">
        <dt>Remind</dt>
        <dd>
          {isOwner ? (
            <input type="datetime-local" aria-label="Remind at" defaultValue={isoToDateTimeLocal(initial.remind_at)}
              onChange={(e) => onChange({ remind_at: dateTimeLocalToIso(e.target.value) })} />
          ) : localTime(initial.remind_at)}
        </dd>
      </div>
      <div className="detail-property detail-property-wide">
        <dt>Cover</dt>
        <dd>
          {isOwner ? (
            <input type="url" aria-label="Cover URL" defaultValue={initial.cover_url ?? ''} placeholder="https://…"
              onChange={(e) => onChange({ cover_url: orNull(e.target.value) })} />
          ) : (initial.cover_url ? 'Set' : '—')}
        </dd>
      </div>
    </dl>
  );
}
