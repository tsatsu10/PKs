import { formatRelativeTime } from '../lib/relativeTime';

/**
 * Version · time · optional due — right-aligned meta for dashboard rows.
 */
export default function MetaCluster({ object, compact = false }) {
  const dueLabel = object.due_at
    ? new Date(object.due_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;

  return (
    <span className={`meta-cluster${compact ? ' meta-cluster--compact' : ''}`}>
      <span className="meta-cluster-version" title={`Version ${object.current_version}`}>
        v{object.current_version}
      </span>
      <span className="meta-cluster-sep" aria-hidden="true">·</span>
      <time className="meta-cluster-time" dateTime={object.updated_at}>
        {formatRelativeTime(object.updated_at)}
      </time>
      {dueLabel && (
        <>
          <span className="meta-cluster-sep" aria-hidden="true">·</span>
          <span className="meta-cluster-due" title={`Due ${dueLabel}`}>Due {dueLabel}</span>
        </>
      )}
    </span>
  );
}
