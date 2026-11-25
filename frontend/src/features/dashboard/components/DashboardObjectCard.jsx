import { memo } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Clock, Pin } from 'lucide-react';
import { formatObjectTypeLabel } from '../../../constants';
import TypeMark from '../../../components/TypeMark';
import Badge from '../../../components/ui/Badge';
import LinkedBar from './Views/LinkedBar';
import { useRowVisibility } from '../hooks/useRowVisibility';
import { usePrefetchObject } from '../../../data/usePrefetchObject';
import './Views/LinkedBar.css';
import './DashboardObjectCard.css';
import '../../../components/ui/Spinner.css'; // .ui-visually-hidden

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

/** 'overdue' before today, 'soon' within 7 days, otherwise 'later'. */
function dueState(dueAt) {
  const due = new Date(dueAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const days = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
  if (days < 0) return 'overdue';
  if (days <= 7) return 'soon';
  return 'later';
}

function formatDueLabel(dueAt) {
  if (!dueAt) return '';
  const due = new Date(dueAt);
  const y = due.getFullYear() !== new Date().getFullYear();
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(y ? { year: 'numeric' } : {}) });
}

/**
 * Knowledge object card for dashboard grid view.
 * Memoised: give it only stable props (strings, booleans, stable callbacks).
 * Only the title is a link; it stretches over the card, and the checkbox and linked chips sit above it (A7).
 */
function DashboardObjectCard({
  obj,
  to,
  selected,
  onToggleSelect,
  selectionMode = false,
  animationDelay = 0,
  compact = false,
  objectIndex = 0,
  runPromptSuffix = '',
  setSize,
  posInSet,
}) {
  const typeLabel = formatObjectTypeLabel(obj.type);
  const summary = obj.snippet || obj.summary;
  const status = obj.status && obj.status !== 'active' ? obj.status : null;
  const due = obj.due_at ? dueState(obj.due_at) : null;
  const rowRef = useRowVisibility(obj.id);
  const prefetch = usePrefetchObject();

  return (
    <article
      ref={rowRef}
      role={posInSet ? 'listitem' : undefined}
      aria-setsize={posInSet ? setSize : undefined}
      aria-posinset={posInSet}
      className={`object-card-wrapper${compact ? ' object-card-wrapper--compact' : ''}`}
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <div
        className={`object-card${selected ? ' object-card--selected' : ''}`}
        data-type={obj.type || 'note'}
        data-status={obj.status || 'active'}
        data-object-index={objectIndex}
      >
        <div className="object-card-accent" aria-hidden="true" />

        <div className="object-card-cover-wrap">
          {obj.cover_url ? (
            <span className="object-card-cover" style={{ backgroundImage: `url(${obj.cover_url})` }} aria-hidden="true" />
          ) : (
            <span className="object-card-cover-fallback" aria-hidden="true">
              <TypeMark type={obj.type} size="lg" className="object-card-cover-fallback-icon" />
            </span>
          )}
          <div className="object-card-topbar">
            <span className="object-card-type-pill" title={typeLabel}>
              <TypeMark type={obj.type} size="sm" />
              <span className="object-card-type-label">{typeLabel}</span>
            </span>
            {status && <Badge tone={status === 'draft' ? 'warning' : 'neutral'}>{status}</Badge>}
          </div>
        </div>

        <label className={`object-card-checkbox${selectionMode ? ' is-visible' : ''}`}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(obj.id)}
            aria-label={`Select ${obj.title}`}
          />
        </label>

        <div className="object-card-body">
          <h3 className="object-card-title">
            {obj.is_pinned && (
              <>
                <Pin size={16} aria-hidden="true" className="object-card-pin" />
                <span className="ui-visually-hidden">Pinned</span>
              </>
            )}
            <Link to={to} className="object-card-link" {...prefetch(obj.id)}>{obj.title}</Link>
          </h3>

          {summary && <p className="object-card-summary">{summary}</p>}

          <LinkedBar objectId={obj.id} runPromptSuffix={runPromptSuffix} compact={compact} />

          <footer className="object-card-footer">
            <div className="object-card-meta-group">
              <time dateTime={obj.updated_at}>{formatRelativeTime(obj.updated_at)}</time>
              <span className="object-card-version" title={`Version ${obj.current_version}`}>
                v{obj.current_version}
              </span>
            </div>
            {due && (
              <span className="object-card-due">
                {due === 'overdue' && <Badge tone="danger" icon={AlertCircle}>Overdue</Badge>}
                {due === 'soon' && <Badge tone="warning" icon={Clock}>Due soon</Badge>}
                <span>Due {formatDueLabel(obj.due_at)}</span>
              </span>
            )}
          </footer>
        </div>
      </div>
    </article>
  );
}

export default memo(DashboardObjectCard);
