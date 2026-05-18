import { Link } from 'react-router-dom';
import { OBJECT_TYPE_ICONS, formatObjectTypeLabel } from '../constants';

function formatRelativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function dueBadgeClass(dueAt) {
  if (!dueAt) return '';
  const due = new Date(dueAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const days = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
  if (days < 0) return 'object-card-due--overdue';
  if (days <= 7) return 'object-card-due--soon';
  return 'object-card-due--later';
}

function formatDueLabel(dueAt) {
  if (!dueAt) return '';
  const due = new Date(dueAt);
  const y = due.getFullYear() !== new Date().getFullYear();
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(y ? { year: 'numeric' } : {}) });
}

/**
 * Knowledge object card for dashboard grid view.
 */
export default function DashboardObjectCard({
  obj,
  to,
  selected,
  onToggleSelect,
  animationDelay = 0,
  compact = false,
  objectIndex = 0,
}) {
  const typeLabel = formatObjectTypeLabel(obj.type);
  const icon = OBJECT_TYPE_ICONS[obj.type] ?? '📄';
  const summary = obj.snippet || obj.summary;
  const status = obj.status && obj.status !== 'active' ? obj.status : null;

  return (
    <article
      className={`object-card-wrapper${compact ? ' object-card-wrapper--compact' : ''}`}
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <Link
        to={to}
        className={`object-card${selected ? ' object-card--selected' : ''}`}
        data-type={obj.type || 'note'}
        data-status={obj.status || 'active'}
        data-object-index={objectIndex}
        aria-label={`${obj.title}, ${typeLabel}, version ${obj.current_version}`}
      >
        <div className="object-card-accent" aria-hidden="true" />

        <div className="object-card-cover-wrap">
          {obj.cover_url ? (
            <span className="object-card-cover" style={{ backgroundImage: `url(${obj.cover_url})` }} aria-hidden="true" />
          ) : (
            <span className="object-card-cover-fallback" aria-hidden="true">
              <span className="object-card-cover-fallback-icon">{icon}</span>
            </span>
          )}
          <div className="object-card-cover-scrim" aria-hidden="true" />

          <div className="object-card-topbar">
            <span className="object-card-type-pill" title={typeLabel}>
              <span className="object-card-type-icon" aria-hidden="true">{icon}</span>
              <span className="object-card-type-label">{typeLabel}</span>
            </span>
            {status && (
              <span className={`object-card-status object-card-status--${status}`}>{status}</span>
            )}
          </div>

          <label
            className="object-card-checkbox"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(obj.id)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select ${obj.title}`}
            />
          </label>
        </div>

        <div className="object-card-body">
          <h3 className="object-card-title">
            {obj.is_pinned && <span className="object-card-pin" aria-label="Pinned">📌</span>}
            <span className="object-card-title-text">{obj.title}</span>
          </h3>

          {summary && (
            <p className="object-card-summary">{summary}</p>
          )}

          <footer className="object-card-footer">
            <div className="object-card-meta-group">
              <time className="object-card-meta" dateTime={obj.updated_at}>
                {formatRelativeTime(obj.updated_at)}
              </time>
              <span className="object-card-version" title={`Version ${obj.current_version}`}>
                v{obj.current_version}
              </span>
            </div>
            {obj.due_at && (
              <span
                className={`object-card-due ${dueBadgeClass(obj.due_at)}`}
                title={`Due ${formatDueLabel(obj.due_at)}`}
              >
                Due {formatDueLabel(obj.due_at)}
              </span>
            )}
          </footer>
        </div>

        <span className="object-card-open-hint" aria-hidden="true">Open</span>
      </Link>
    </article>
  );
}
