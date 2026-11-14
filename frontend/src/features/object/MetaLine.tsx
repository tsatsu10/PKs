import TypeMark from '../../components/TypeMark';
import { formatObjectTypeLabel } from '../../constants';
import type { ObjectRow } from './types';

/** Type, status, due, remind, updated and version, above the title. */
export default function MetaLine({ object }: { object: ObjectRow }) {
  return (
    <div className="detail-meta detail-meta-inline">
      <span className="detail-type" title={formatObjectTypeLabel(object.type)}>
        <TypeMark type={object.type} size="sm" className="detail-type-mark" />
        {formatObjectTypeLabel(object.type)}
      </span>
      {(object.status || 'active') !== 'active' && (
        <span className="detail-status" title="Status">{object.status}</span>
      )}
      {object.due_at && (
        <span className="detail-due" title="Due date">Due {new Date(object.due_at).toLocaleString()}</span>
      )}
      {object.remind_at && (
        <span className="detail-remind" title="Remind at">Remind {new Date(object.remind_at).toLocaleString()}</span>
      )}
      <span className="detail-updated">Updated {new Date(object.updated_at).toLocaleString()}</span>
      <span className="detail-version">v{object.current_version}</span>
    </div>
  );
}
